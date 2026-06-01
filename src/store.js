import { spawn } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_TEAM_ID, STORE_VERSION } from "./config.js";
import { normalizeUsageEvent, normalizeNodeState } from "./usage.js";

export function createEmptyStore() {
  return {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    events: [],
    nodes: {}
  };
}

export async function loadStore(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyStore(),
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      nodes: parsed.nodes && typeof parsed.nodes === "object" ? parsed.nodes : {}
    };
  } catch (error) {
    if (error.code === "ENOENT") return createEmptyStore();
    throw error;
  }
}

export async function saveStore(filePath, store) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const next = {
    ...store,
    version: STORE_VERSION,
    updatedAt: new Date().toISOString()
  };
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

function normalizeStore(parsed) {
  return {
    ...createEmptyStore(),
    ...parsed,
    events: Array.isArray(parsed?.events) ? parsed.events : [],
    nodes: parsed?.nodes && typeof parsed.nodes === "object" ? parsed.nodes : {}
  };
}

function appendUsageEventsToStore(store, inputEvents) {
  const events = Array.isArray(inputEvents) ? inputEvents : [inputEvents];
  const normalized = events.map(normalizeUsageEvent);
  const existingById = new Map(store.events.map((event, index) => [event.id, index]));

  for (const event of normalized) {
    const existingIndex = existingById.get(event.id);
    if (existingIndex === undefined) {
      existingById.set(event.id, store.events.length);
      store.events.push(event);
    } else {
      store.events[existingIndex] = event;
    }
    const node = store.nodes[event.nodeId] || {};
    store.nodes[event.nodeId] = normalizeNodeState({
      ...node,
      nodeId: event.nodeId,
      userName: event.userName || node.userName || event.nodeId,
      teamId: event.teamId || node.teamId || DEFAULT_TEAM_ID,
      providers: Array.from(new Set([...(node.providers || []), event.provider])),
      lastSeenAt: new Date().toISOString()
    });
  }

  return { accepted: normalized.length, events: normalized };
}

function upsertNodeHeartbeatInStore(store, inputNode) {
  const node = normalizeNodeState({
    ...(store.nodes[inputNode.nodeId] || {}),
    ...inputNode,
    lastSeenAt: new Date().toISOString()
  });
  store.nodes[node.nodeId] = node;
  return node;
}

export async function appendUsageEvents(filePath, inputEvents) {
  const store = await loadStore(filePath);
  const result = appendUsageEventsToStore(store, inputEvents);
  await saveStore(filePath, store);
  return result;
}

export async function upsertNodeHeartbeat(filePath, inputNode) {
  const store = await loadStore(filePath);
  const node = upsertNodeHeartbeatInStore(store, inputNode);
  await saveStore(filePath, store);
  return node;
}

function sqliteConfig(env, filePath) {
  return {
    dbPath: env.SQLITE_PATH || env.SQLITE_DB_PATH || filePath.replace(/\.json$/, ".sqlite"),
    storeId: env.SQLITE_STORE_ID || env.DEFAULT_TEAM_ID || DEFAULT_TEAM_ID,
    binary: env.SQLITE_BIN || "sqlite3"
  };
}

function escapeSqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

async function runSQLite({ binary, dbPath }, sql) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [dbPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`sqlite3 exited ${code}: ${stderr.trim()}`));
      }
    });
    child.stdin.end(sql);
  });
}

async function ensureSQLiteStore(config) {
  await runSQLite(config, `
create table if not exists usage_stores (
  id text primary key,
  data text not null,
  updated_at text not null
);
`);
}

export function createStoreBackend({
  env = process.env,
  filePath
} = {}) {
  const backend = env.STORE_BACKEND || env.USAGE_STORE_BACKEND || (
    env.SQLITE_PATH || env.SQLITE_DB_PATH ? "sqlite" : "file"
  );

  if (backend === "sqlite") {
    const config = sqliteConfig(env, filePath);
    let writeQueue = Promise.resolve();

    async function load() {
      await ensureSQLiteStore(config);
      const output = await runSQLite(config, `
.mode tabs
select data from usage_stores where id = '${escapeSqlLiteral(config.storeId)}' limit 1;
`);
      const raw = output.trim();
      if (!raw) return createEmptyStore();
      return normalizeStore(JSON.parse(raw));
    }

    async function save(store) {
      const next = {
        ...store,
        version: STORE_VERSION,
        updatedAt: new Date().toISOString()
      };
      const tmpPath = `${config.dbPath}.${process.pid}.${Date.now()}.json`;
      await writeFile(tmpPath, JSON.stringify(next), "utf8");
      try {
        await ensureSQLiteStore(config);
        await runSQLite(config, `
insert into usage_stores (id, data, updated_at)
values (
  '${escapeSqlLiteral(config.storeId)}',
  cast(readfile('${escapeSqlLiteral(tmpPath)}') as text),
  '${escapeSqlLiteral(next.updatedAt)}'
)
on conflict(id) do update set
  data = excluded.data,
  updated_at = excluded.updated_at;
`);
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    }

    function mutate(operation) {
      const next = writeQueue.then(operation, operation);
      writeQueue = next.catch(() => {});
      return next;
    }

    return {
      name: "sqlite",
      location: `${config.dbPath}:${config.storeId}`,
      load,
      appendUsageEvents: (inputEvents) => mutate(async () => {
        const store = await load();
        const result = appendUsageEventsToStore(store, inputEvents);
        await save(store);
        return result;
      }),
      upsertNodeHeartbeat: (inputNode) => mutate(async () => {
        const store = await load();
        const node = upsertNodeHeartbeatInStore(store, inputNode);
        await save(store);
        return node;
      })
    };
  }

  if (backend === "file") {
    return {
      name: "file",
      location: filePath,
      load: () => loadStore(filePath),
      appendUsageEvents: (inputEvents) => appendUsageEvents(filePath, inputEvents),
      upsertNodeHeartbeat: (inputNode) => upsertNodeHeartbeat(filePath, inputNode)
    };
  }

  throw new Error(`Unsupported STORE_BACKEND: ${backend}`);
}

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { parseDurationToMinutes } from "./quota.js";
import { normalizeUsageEvent } from "./usage.js";

const USAGE_KEY_PATTERNS = {
  inputTokens: [
    /^input_tokens$/,
    /^inputTokens$/,
    /^prompt_tokens$/,
    /^promptTokens$/,
    /^input_token_count$/,
    /^inputTokenCount$/
  ],
  outputTokens: [
    /^output_tokens$/,
    /^outputTokens$/,
    /^completion_tokens$/,
    /^completionTokens$/,
    /^output_token_count$/,
    /^outputTokenCount$/
  ],
  cacheReadTokens: [/^cache_read_input_tokens$/, /^cached_input_tokens$/, /^cacheReadTokens$/],
  cacheWriteTokens: [/^cache_creation_input_tokens$/, /^cache_write_input_tokens$/, /^cacheWriteTokens$/],
  totalTokens: [/^total_tokens$/, /^totalTokens$/, /^total_token_count$/, /^totalTokenCount$/]
};

function expandHome(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

async function exists(inputPath) {
  try {
    await stat(inputPath);
    return true;
  } catch {
    return false;
  }
}

async function collectJsonlFiles(rootDir, maxDepth = 8) {
  const files = [];
  const root = expandHome(rootDir);
  if (!root || !(await exists(root))) return files;

  async function walk(current, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(nextPath);
      }
    }
  }

  await walk(root, 0);
  return files;
}

function valueForPatterns(object, patterns) {
  for (const [key, value] of Object.entries(object)) {
    if (patterns.some((pattern) => pattern.test(key))) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
  }
  return 0;
}

function scoreUsageObject(object) {
  let score = 0;
  for (const patterns of Object.values(USAGE_KEY_PATTERNS)) {
    if (valueForPatterns(object, patterns) > 0) score += 1;
  }
  return score;
}

function findBestUsageObject(value) {
  let best = null;
  function visit(node, keyHint = "") {
    if (!node || typeof node !== "object") return;
    if (!Array.isArray(node)) {
      let score = scoreUsageObject(node);
      if (score > 0 && /last[_-]?token[_-]?usage|last[_-]?usage/i.test(keyHint)) score += 10;
      if (score > 0 && /total[_-]?token[_-]?usage|cumulative/i.test(keyHint)) score -= 2;
      if (score > 0 && (!best || score > best.score)) {
        best = { score, object: node };
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (child && typeof child === "object") visit(child, key);
    }
  }
  visit(value);
  return best?.object || null;
}

function findFirstStringByKey(value, keys) {
  let found = null;
  function visit(node) {
    if (found || !node || typeof node !== "object") return;
    if (!Array.isArray(node)) {
      for (const [key, item] of Object.entries(node)) {
        if (keys.includes(key) && typeof item === "string" && item.trim()) {
          found = item.trim();
          return;
        }
      }
    }
    for (const child of Object.values(node)) visit(child);
  }
  visit(value);
  return found;
}

function findTimestamp(value) {
  const raw = findFirstStringByKey(value, ["timestamp", "time", "created_at", "createdAt", "started_at"]);
  if (raw && Number.isFinite(new Date(raw).getTime())) return new Date(raw);
  return null;
}

function extractUsageFromJson(value) {
  const usage = findBestUsageObject(value);
  if (!usage) return null;

  const inputTokens = valueForPatterns(usage, USAGE_KEY_PATTERNS.inputTokens);
  const outputTokens = valueForPatterns(usage, USAGE_KEY_PATTERNS.outputTokens);
  const cacheReadTokens = valueForPatterns(usage, USAGE_KEY_PATTERNS.cacheReadTokens);
  const cacheWriteTokens = valueForPatterns(usage, USAGE_KEY_PATTERNS.cacheWriteTokens);
  const totalTokens =
    valueForPatterns(usage, USAGE_KEY_PATTERNS.totalTokens) ||
    inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

  if (totalTokens <= 0) return null;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    model: findFirstStringByKey(value, ["model", "model_slug", "modelSlug", "model_id", "modelId"]) || "unknown",
    timestamp: findTimestamp(value)
  };
}

async function parseJsonlUsage(filePath, provider, fallbackTimestamp) {
  const results = [];
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("token")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const usage = extractUsageFromJson(parsed);
      if (!usage) continue;
      results.push({
        provider,
        model: usage.model,
        timestamp: (usage.timestamp || fallbackTimestamp || new Date()).toISOString(),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        totalTokens: usage.totalTokens,
        requestCount: 1,
        source: "local-log",
        metadata: {
          file: filePath
        }
      });
    } catch {
      // Ignore malformed JSONL rows. Local agent must be best-effort.
    }
  }

  return results;
}

async function scanFiles({ files, provider, since }) {
  const events = [];
  for (const filePath of files) {
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || fileStat.mtime < since) continue;
    const parsed = await parseJsonlUsage(filePath, provider, fileStat.mtime);
    events.push(...parsed.filter((event) => new Date(event.timestamp) >= since));
  }
  return events;
}

function aggregateEvents(rawEvents, context) {
  const buckets = new Map();
  for (const event of rawEvents) {
    const day = event.timestamp.slice(0, 10);
    const key = [event.provider, event.model, day, event.source].join("|");
    const existing = buckets.get(key) || {
      ...event,
      timestamp: `${day}T12:00:00.000Z`,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      requestCount: 0,
      metadata: {
        scannedFiles: new Set()
      }
    };
    existing.inputTokens += event.inputTokens || 0;
    existing.outputTokens += event.outputTokens || 0;
    existing.cacheReadTokens += event.cacheReadTokens || 0;
    existing.cacheWriteTokens += event.cacheWriteTokens || 0;
    existing.totalTokens += event.totalTokens || 0;
    existing.requestCount += event.requestCount || 1;
    if (event.metadata?.file) existing.metadata.scannedFiles.add(event.metadata.file);
    buckets.set(key, existing);
  }

  return Array.from(buckets.values()).map((event) =>
    normalizeUsageEvent({
      ...event,
      ...context,
      id: crypto.createHash("sha256").update([
        "local-daily-summary",
        context.teamId,
        context.nodeId,
        context.credentialId || `${event.provider}:default`,
        event.provider,
        event.model,
        event.source,
        event.timestamp.slice(0, 10)
      ].join("|")).digest("hex").slice(0, 24),
      metadata: {
        scannedFileCount: event.metadata.scannedFiles.size
      }
    })
  );
}

export async function scanLocalUsage(options = {}) {
  const sinceDays = Number(options.sinceDays || 30);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const codexHome = expandHome(options.codexHome || process.env.CODEX_HOME || "~/.codex");
  const claudeCandidates = [
    options.claudeHome,
    process.env.CLAUDE_CONFIG_DIR,
    "~/.config/claude",
    "~/.claude"
  ].filter(Boolean).map(expandHome);

  const codexFiles = [
    ...(await collectJsonlFiles(path.join(codexHome, "sessions"))),
    ...(await collectJsonlFiles(path.join(codexHome, "archived_sessions")))
  ];

  const claudeFiles = [];
  for (const claudeHome of claudeCandidates) {
    claudeFiles.push(...(await collectJsonlFiles(path.join(claudeHome, "projects"))));
  }

  const rawEvents = [
    ...(await scanFiles({ files: codexFiles, provider: "codex", since })),
    ...(await scanFiles({ files: claudeFiles, provider: "claude", since }))
  ];

  const context = {
    nodeId: options.nodeId || os.hostname(),
    userName: options.userName || os.userInfo().username || os.hostname(),
    teamId: options.teamId || "default",
    credentialId: options.credentialId,
    keyAlias: options.keyAlias
  };

  return {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    files: {
      codex: codexFiles.length,
      claude: claudeFiles.length
    },
    events: aggregateEvents(rawEvents, context)
  };
}

export const internals = {
  extractUsageFromJson,
  aggregateEvents,
  collectJsonlFiles,
  parseDurationToMinutes
};

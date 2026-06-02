import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { DEFAULT_HOST, DEFAULT_PORT } from "../src/config.js";
import { aggregateStore } from "../src/aggregation.js";
import { createStoreBackend } from "../src/store.js";
import { selectRecentUsageEvents } from "../src/usage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const storePath = process.env.USAGE_STORE || path.join(rootDir, "data", "usage-store.json");
const host = process.env.HOST || DEFAULT_HOST;
const port = Number(process.env.PORT || DEFAULT_PORT);
const store = createStoreBackend({ filePath: storePath });
const ingestToken = process.env.TEAM_INGEST_TOKEN || process.env.TEAM_TOKEN || "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(`${body}\n`);
}

function sendError(res, statusCode, message, details = undefined) {
  sendJson(res, statusCode, { error: message, details });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      throw new Error("request body exceeds 2MB");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function withCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization,x-team-token");
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : "";
}

function requireIngestToken(req, res) {
  if (!ingestToken) return true;
  const supplied = req.headers["x-team-token"] || bearerToken(req);
  if (supplied === ingestToken) return true;
  sendError(res, 401, "invalid team token");
  return false;
}

async function serveStatic(req, res, url) {
  const rawPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    sendError(res, 403, "forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendError(res, 404, "not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") sendError(res, 404, "not found");
    else throw error;
  }
}

async function route(req, res) {
  withCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true, store: store.name, location: store.location });
    return;
  }

  if (url.pathname === "/api/summary" && req.method === "GET") {
    const currentStore = await store.load();
    const summary = aggregateStore(currentStore, {
      teamId: url.searchParams.get("teamId") || null,
      windowDays: Number(url.searchParams.get("windowDays") || 30)
    });
    sendJson(res, 200, summary);
    return;
  }

  if (url.pathname === "/api/events" && req.method === "GET") {
    const currentStore = await store.load();
    const selected = selectRecentUsageEvents(currentStore.events, {
      limit: url.searchParams.get("limit") || 200,
      teamId: url.searchParams.get("teamId") || null
    });
    sendJson(res, 200, {
      events: selected.events,
      total: selected.total
    });
    return;
  }

  if (url.pathname === "/api/usage-events" && req.method === "POST") {
    if (!requireIngestToken(req, res)) return;
    const body = await readBody(req);
    const result = await store.appendUsageEvents(body.events || body);
    sendJson(res, 202, result);
    return;
  }

  if (url.pathname === "/api/node-heartbeat" && req.method === "POST") {
    if (!requireIngestToken(req, res)) return;
    const body = await readBody(req);
    const node = await store.upsertNodeHeartbeat(body);
    sendJson(res, 202, { node });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendError(res, 404, "api route not found");
    return;
  }

  await serveStatic(req, res, url);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error);
    sendError(res, 500, "internal server error", error.message);
  });
});

server.listen(port, host, () => {
  console.log(`LLM usage monitor listening on http://${host}:${port}`);
  console.log(`Store: ${store.name} ${store.location}`);
});

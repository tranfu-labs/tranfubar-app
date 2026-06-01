import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendUsageEvents, createStoreBackend, loadStore, upsertNodeHeartbeat } from "../src/store.js";

test("appendUsageEvents upserts events by stable id", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "usage-store-"));
  const filePath = path.join(dir, "usage-store.json");
  await mkdir(dir, { recursive: true });

  try {
    await appendUsageEvents(filePath, {
      id: "daily-node-a-codex",
      nodeId: "node-a",
      userName: "Alice",
      provider: "codex",
      model: "gpt-codex",
      timestamp: "2026-05-29T12:00:00.000Z",
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120
    });
    await appendUsageEvents(filePath, {
      id: "daily-node-a-codex",
      nodeId: "node-a",
      userName: "Alice",
      provider: "codex",
      model: "gpt-codex",
      timestamp: "2026-05-29T12:00:00.000Z",
      inputTokens: 200,
      outputTokens: 40,
      totalTokens: 240
    });

    const store = await loadStore(filePath);
    assert.equal(store.events.length, 1);
    assert.equal(store.events[0].totalTokens, 240);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("upsertNodeHeartbeat preserves percent-only quota windows", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "usage-store-"));
  const filePath = path.join(dir, "usage-store.json");

  try {
    const node = await upsertNodeHeartbeat(filePath, {
      nodeId: "node-heartbeat",
      userName: "Alice",
      teamId: "ai-native",
      providers: ["codex"],
      credentials: [{
        credentialId: "node-heartbeat:codex",
        keyAlias: "Codex",
        provider: "codex",
        planName: "Pro",
        quotaWindows: [{
          id: "primary",
          label: "5 小时",
          durationMinutes: 300,
          usagePercent: 0.03,
          remainingPercent: 0.97,
          resetAt: "2026-05-29T14:58:00+08:00"
        }]
      }]
    });

    assert.equal(node.credentials[0].planName, "Pro");
    assert.equal(node.credentials[0].quotaWindows.length, 1);
    assert.equal(node.credentials[0].quotaWindows[0].remainingPercent, 0.97);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sqlite store backend persists heartbeat and events", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "usage-store-sqlite-"));
  const dbPath = path.join(dir, "usage.sqlite");

  try {
    const backend = createStoreBackend({
      filePath: path.join(dir, "unused.json"),
      env: {
        STORE_BACKEND: "sqlite",
        SQLITE_PATH: dbPath,
        SQLITE_STORE_ID: "tranfu-ai"
      }
    });

    await backend.upsertNodeHeartbeat({
      nodeId: "node-sqlite",
      userName: "SQLite User",
      teamId: "tranfu-ai",
      providers: ["codex"]
    });
    await backend.appendUsageEvents({
      id: "sqlite-event",
      nodeId: "node-sqlite",
      userName: "SQLite User",
      teamId: "tranfu-ai",
      provider: "codex",
      model: "gpt-codex",
      timestamp: "2026-05-29T12:00:00.000Z",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150
    });

    const store = await backend.load();
    assert.equal(backend.name, "sqlite");
    assert.equal(store.nodes["node-sqlite"].userName, "SQLite User");
    assert.equal(store.events.length, 1);
    assert.equal(store.events[0].totalTokens, 150);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

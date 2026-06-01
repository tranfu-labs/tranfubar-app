import test from "node:test";
import assert from "node:assert/strict";
import { internals } from "../src/local-scanner.js";

test("extractUsageFromJson handles nested Codex-like token events", () => {
  const usage = internals.extractUsageFromJson({
    timestamp: "2026-05-29T08:00:00.000Z",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: 5000,
          output_tokens: 1000,
          total_tokens: 6000
        },
        last_token_usage: {
          input_tokens: 1200,
          output_tokens: 300,
          total_tokens: 1500
        }
      }
    },
    model: "gpt-5-codex"
  });

  assert.equal(usage.inputTokens, 1200);
  assert.equal(usage.outputTokens, 300);
  assert.equal(usage.totalTokens, 1500);
  assert.equal(usage.model, "gpt-5-codex");
});

test("aggregateEvents groups raw local events by provider, model and day", () => {
  const events = internals.aggregateEvents([
    {
      provider: "codex",
      model: "gpt-5-codex",
      source: "local-log",
      timestamp: "2026-05-29T01:00:00.000Z",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      requestCount: 1,
      metadata: { file: "/tmp/a.jsonl" }
    },
    {
      provider: "codex",
      model: "gpt-5-codex",
      source: "local-log",
      timestamp: "2026-05-29T02:00:00.000Z",
      inputTokens: 200,
      outputTokens: 70,
      totalTokens: 270,
      requestCount: 2,
      metadata: { file: "/tmp/b.jsonl" }
    }
  ], {
    nodeId: "node-a",
    userName: "Alice",
    teamId: "ai-native"
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].totalTokens, 420);
  assert.equal(events[0].requestCount, 3);
  assert.equal(events[0].metadata.scannedFileCount, 2);
  assert.equal(events[0].id.length, 24);
});

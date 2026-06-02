import test from "node:test";
import assert from "node:assert/strict";
import { selectRecentUsageEvents } from "../src/usage.js";

test("selectRecentUsageEvents sorts by event timestamp before limiting", () => {
  const selected = selectRecentUsageEvents([
    {
      id: "old-claude",
      teamId: "tranfu-ai",
      provider: "claude",
      keyAlias: "Claude",
      model: "claude-opus-4-7",
      timestamp: "2026-05-22T12:00:00.000Z"
    },
    {
      id: "latest-codex",
      teamId: "tranfu-ai",
      provider: "codex",
      keyAlias: "Codex",
      model: "gpt-5.5",
      timestamp: "2026-06-02T12:00:00.000Z"
    },
    {
      id: "middle-codex",
      teamId: "tranfu-ai",
      provider: "codex",
      keyAlias: "Codex",
      model: "gpt-5.5",
      timestamp: "2026-06-01T12:00:00.000Z"
    }
  ], { limit: 2 });

  assert.equal(selected.total, 3);
  assert.deepEqual(selected.events.map((event) => event.id), ["latest-codex", "middle-codex"]);
});

test("selectRecentUsageEvents filters by teamId", () => {
  const selected = selectRecentUsageEvents([
    {
      id: "tranfu-event",
      teamId: "tranfu-ai",
      provider: "codex",
      keyAlias: "Codex",
      model: "gpt-5.5",
      timestamp: "2026-06-02T12:00:00.000Z"
    },
    {
      id: "other-event",
      teamId: "other",
      provider: "claude",
      keyAlias: "Claude",
      model: "claude-opus-4-7",
      timestamp: "2026-06-03T12:00:00.000Z"
    }
  ], { teamId: "tranfu-ai" });

  assert.equal(selected.total, 1);
  assert.equal(selected.events[0].id, "tranfu-event");
});

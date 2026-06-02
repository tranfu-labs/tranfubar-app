import test from "node:test";
import assert from "node:assert/strict";
import { aggregateStore } from "../src/aggregation.js";
import { normalizeNodeState, normalizeUsageEvent } from "../src/usage.js";

test("aggregateStore returns team totals, users, providers and quota alerts", () => {
  const now = new Date("2026-05-29T10:00:00.000Z");
  const node = normalizeNodeState({
    nodeId: "node-a",
    userName: "Alice",
    teamId: "ai-native",
    providers: ["codex"],
    credentials: [{
      credentialId: "codex-main",
      keyAlias: "codex-pro",
      provider: "codex",
      quotaWindows: [{
        id: "5h",
        label: "5 小时",
        durationMinutes: 300,
        limitTokens: 1000,
        resetAt: "2026-05-29T12:00:00.000Z",
        alertRemainingPercent: 0.15
      }]
    }],
    quotaLimits: {
      dailyTokens: 1000,
      monthlyUsd: 10
    },
    alertThresholds: {
      tokensPercent: 0.8,
      spendPercent: 0.8,
      staleMinutes: 9999
    },
    lastSeenAt: now.toISOString()
  });

  const store = {
    events: [
      normalizeUsageEvent({
        nodeId: "node-a",
        userName: "Alice",
        teamId: "ai-native",
        provider: "codex",
        credentialId: "codex-main",
        keyAlias: "codex-pro",
        model: "gpt-codex",
        timestamp: now.toISOString(),
        inputTokens: 700,
        outputTokens: 200,
        costUsd: 1.5,
        requestCount: 4,
        resetAt: "2026-05-29T12:00:00.000Z"
      })
    ],
    nodes: {
      "node-a": node
    }
  };

  const summary = aggregateStore(store, { now, teamId: "ai-native", windowDays: 7 });

  assert.equal(summary.totals.totalTokens, 900);
  assert.equal(summary.todayTotals.totalTokens, 900);
  assert.equal(summary.users.length, 1);
  assert.equal(summary.providers[0].provider, "codex");
  assert.equal(summary.users[0].dailyTokenUtilization, 0.9);
  assert.equal(summary.users[0].credentials[0].keyAlias, "codex-pro");
  assert.equal(Math.round(summary.users[0].credentials[0].quotaWindows[0].remainingPercent * 100), 10);
  assert.ok(summary.alerts.some((alert) => alert.type === "daily-token-quota"));
  assert.ok(summary.alerts.some((alert) => alert.type === "quota-window-remaining"));
  assert.ok(summary.alerts.some((alert) => alert.type === "reset-reminder"));
  assert.equal(summary.agentization.activeNodes, 1);
});

test("aggregateStore keeps inactive known nodes in the user list", () => {
  const now = new Date("2026-05-29T10:00:00.000Z");
  const store = {
    events: [],
    nodes: {
      "node-b": normalizeNodeState({
        nodeId: "node-b",
        userName: "Bob",
        teamId: "ai-native",
        lastSeenAt: now.toISOString()
      })
    }
  };

  const summary = aggregateStore(store, { now, teamId: "ai-native", windowDays: 7 });

  assert.equal(summary.users.length, 1);
  assert.equal(summary.users[0].userName, "Bob");
  assert.equal(summary.totals.totalTokens, 0);
});

test("aggregateStore exposes heartbeat-only plan and quota percentages", () => {
  const now = new Date("2026-05-29T10:00:00.000Z");
  const store = {
    events: [],
    nodes: {
      "node-c": normalizeNodeState({
        nodeId: "node-c",
        userName: "Cora",
        teamId: "ai-native",
        providers: ["codex", "claude"],
        credentials: [{
          credentialId: "node-c:codex",
          keyAlias: "Codex",
          provider: "codex",
          planName: "Pro",
          quotaWindows: [{
            id: "primary",
            label: "5 小时",
            durationMinutes: 300,
            usagePercent: 0.03,
            remainingPercent: 0.97,
            resetAt: "2026-05-29T14:58:00.000Z"
          }, {
            id: "secondary",
            label: "1 周",
            durationMinutes: 10080,
            usagePercent: 0.01,
            remainingPercent: 0.99,
            resetAt: "2026-06-05T00:00:00.000Z"
          }]
        }],
        lastSeenAt: now.toISOString()
      })
    }
  };

  const summary = aggregateStore(store, { now, teamId: "ai-native", windowDays: 7 });
  const credential = summary.users[0].credentials[0];

  assert.equal(summary.users.length, 1);
  assert.equal(credential.planName, "Pro");
  assert.equal(credential.quotaWindows.length, 2);
  assert.equal(Math.round(credential.quotaWindows[0].remainingPercent * 100), 97);
  assert.equal(summary.providers.length, 2);
  assert.equal(summary.users[0].quotaWindowUtilization, 0.03);
  assert.equal(summary.agentization.activeNodes, 1);
});

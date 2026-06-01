#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveStore } from "../src/store.js";
import { normalizeNodeState, normalizeUsageEvent } from "../src/usage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const storePath = process.env.USAGE_STORE || path.join(rootDir, "data", "usage-store.json");

const users = [
  { nodeId: "macbook-alice", userName: "Alice", providers: ["codex", "claude"], dailyTokens: 220000, monthlyUsd: 180 },
  { nodeId: "thinkpad-bob", userName: "Bob", providers: ["codex"], dailyTokens: 160000, monthlyUsd: 120 },
  { nodeId: "imac-chen", userName: "Chen", providers: ["claude"], dailyTokens: 260000, monthlyUsd: 260 },
  { nodeId: "mac-mini-devops", userName: "DevOps", providers: ["codex", "claude"], dailyTokens: 320000, monthlyUsd: 500 }
];

const models = {
  codex: ["gpt-5-codex", "gpt-5.1-codex-mini"],
  claude: ["claude-sonnet", "claude-opus"]
};

function randomBetween(min, max, seed) {
  const value = Math.sin(seed) * 10000;
  return Math.floor((value - Math.floor(value)) * (max - min + 1)) + min;
}

const now = new Date();
const events = [];

for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
  const date = new Date(now);
  date.setUTCDate(now.getUTCDate() - dayOffset);
  if (dayOffset === 0) {
    date.setTime(now.getTime() - 60 * 60 * 1000);
  } else {
    date.setUTCHours(10, 0, 0, 0);
  }

  users.forEach((user, userIndex) => {
    user.providers.forEach((provider, providerIndex) => {
      const active = randomBetween(0, 10, dayOffset * 19 + userIndex * 7 + providerIndex) > (userIndex === 1 ? 3 : 1);
      if (!active) return;
      const inputTokens = randomBetween(8000, 90000, dayOffset * 31 + userIndex * 11 + providerIndex);
      const outputTokens = randomBetween(2000, 30000, dayOffset * 37 + userIndex * 13 + providerIndex);
      const costUsd = Math.round((inputTokens * 0.000002 + outputTokens * 0.000008) * 100) / 100;
      const modelList = models[provider] || ["unknown"];
      const credentialId = `${user.nodeId}:${provider}:primary`;
      events.push(normalizeUsageEvent({
        nodeId: user.nodeId,
        userName: user.userName,
        teamId: "ai-native",
        provider,
        credentialId,
        keyAlias: `${provider}-primary`,
        model: modelList[(dayOffset + userIndex + providerIndex) % modelList.length],
        source: "demo-seed",
        timestamp: date.toISOString(),
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd,
        requestCount: randomBetween(3, 24, dayOffset * 41 + userIndex),
        resetAt: dayOffset === 0 ? new Date(now.getTime() + (userIndex + 2) * 60 * 60 * 1000).toISOString() : null
      }));
    });
  });
}

const nodes = Object.fromEntries(users.map((user, index) => [
  user.nodeId,
  normalizeNodeState({
    nodeId: user.nodeId,
    userName: user.userName,
    teamId: "ai-native",
    providers: user.providers,
    credentials: user.providers.map((provider, providerIndex) => ({
      credentialId: `${user.nodeId}:${provider}:primary`,
      keyAlias: `${provider}-primary`,
      provider,
      quotaWindows: [
        {
          id: "5h",
          label: "5 小时",
          durationMinutes: 5 * 60,
          limitTokens: 3000000,
          resetAt: new Date(now.getTime() + (providerIndex + 2) * 60 * 60 * 1000).toISOString()
        },
        {
          id: "1w",
          label: "1 周",
          durationMinutes: 7 * 24 * 60,
          limitTokens: 8800000,
          resetAt: new Date(now.getTime() + (7 - index) * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString()
        }
      ]
    })),
    quotaLimits: {
      dailyTokens: user.dailyTokens,
      monthlyUsd: user.monthlyUsd
    },
    alertThresholds: {
      tokensPercent: index === 1 ? 0.72 : 0.8,
      spendPercent: 0.85
    },
    lastSeenAt: new Date(now.getTime() - index * 42 * 60 * 1000).toISOString()
  })
]));

await saveStore(storePath, {
  version: 1,
  updatedAt: new Date().toISOString(),
  events,
  nodes
});

console.log(`Seeded ${events.length} events into ${storePath}`);

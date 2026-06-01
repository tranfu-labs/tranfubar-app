export const DEFAULT_PORT = 4317;
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_TEAM_ID = process.env.DEFAULT_TEAM_ID || "default";

export const DEFAULT_ALERT_THRESHOLDS = {
  tokensPercent: 0.8,
  spendPercent: 0.85,
  staleMinutes: 120,
  resetReminderMinutes: 12 * 60
};

export const DEFAULT_QUOTA_LIMITS = {
  dailyTokens: 200000,
  weeklyTokens: 1000000,
  monthlyUsd: 0
};

export const SUPPORTED_PROVIDERS = [
  "codex",
  "claude",
  "openai",
  "anthropic",
  "cursor",
  "gemini",
  "copilot",
  "openrouter",
  "other"
];

export const STORE_VERSION = 1;

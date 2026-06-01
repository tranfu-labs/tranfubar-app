import crypto from "node:crypto";
import os from "node:os";
import {
  DEFAULT_ALERT_THRESHOLDS,
  DEFAULT_QUOTA_LIMITS,
  DEFAULT_TEAM_ID,
  SUPPORTED_PROVIDERS
} from "./config.js";
import { normalizeCredential } from "./quota.js";
import { isValidDate } from "./time.js";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizedProvider(value) {
  const provider = String(value || "other").toLowerCase();
  return SUPPORTED_PROVIDERS.includes(provider) ? provider : "other";
}

export function normalizeUsageEvent(input) {
  if (!input || typeof input !== "object") {
    throw new Error("usage event must be an object");
  }

  const nodeId = String(input.nodeId || os.hostname()).trim();
  if (!nodeId) throw new Error("usage event requires nodeId");

  const timestamp = isValidDate(input.timestamp) ? new Date(input.timestamp) : new Date();
  const inputTokens = numberOrZero(input.inputTokens ?? input.promptTokens);
  const outputTokens = numberOrZero(input.outputTokens ?? input.completionTokens);
  const cacheReadTokens = numberOrZero(input.cacheReadTokens);
  const cacheWriteTokens = numberOrZero(input.cacheWriteTokens);
  const totalTokens = numberOrZero(input.totalTokens) || inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

  if (totalTokens <= 0 && numberOrZero(input.requestCount) <= 0) {
    throw new Error("usage event requires tokens or requestCount");
  }

  const provider = normalizedProvider(input.provider);
  const model = String(input.model || "unknown").trim() || "unknown";
  const source = String(input.source || "manual").trim() || "manual";
  const credentialId = String(input.credentialId || input.keyId || `${provider}:default`).trim();
  const keyAlias = String(input.keyAlias || input.keyName || credentialId).trim();
  const idSource = [
    nodeId,
    credentialId,
    provider,
    model,
    source,
    timestamp.toISOString(),
    inputTokens,
    outputTokens,
    totalTokens,
    numberOrZero(input.requestCount)
  ].join("|");

  return {
    id: input.id || crypto.createHash("sha256").update(idSource).digest("hex").slice(0, 24),
    nodeId,
    userName: String(input.userName || input.user || nodeId).trim() || nodeId,
    teamId: String(input.teamId || DEFAULT_TEAM_ID).trim() || DEFAULT_TEAM_ID,
    provider,
    model,
    credentialId,
    keyAlias,
    source,
    timestamp: timestamp.toISOString(),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    costUsd: numberOrNull(input.costUsd),
    requestCount: numberOrZero(input.requestCount) || 1,
    resetAt: isValidDate(input.resetAt) ? new Date(input.resetAt).toISOString() : null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

export function normalizeNodeState(input) {
  if (!input || typeof input !== "object") {
    throw new Error("node state must be an object");
  }

  const nodeId = String(input.nodeId || os.hostname()).trim();
  if (!nodeId) throw new Error("node state requires nodeId");

  return {
    nodeId,
    userName: String(input.userName || input.user || nodeId).trim() || nodeId,
    teamId: String(input.teamId || DEFAULT_TEAM_ID).trim() || DEFAULT_TEAM_ID,
    hostName: String(input.hostName || os.hostname()).trim() || os.hostname(),
    role: String(input.role || "member").trim() || "member",
    providers: Array.isArray(input.providers) ? input.providers.map(normalizedProvider) : [],
    credentials: Array.isArray(input.credentials) ? input.credentials.map(normalizeCredential) : [],
    quotaLimits: {
      ...DEFAULT_QUOTA_LIMITS,
      ...(input.quotaLimits && typeof input.quotaLimits === "object" ? input.quotaLimits : {})
    },
    alertThresholds: {
      ...DEFAULT_ALERT_THRESHOLDS,
      ...(input.alertThresholds && typeof input.alertThresholds === "object" ? input.alertThresholds : {})
    },
    lastSeenAt: isValidDate(input.lastSeenAt) ? new Date(input.lastSeenAt).toISOString() : new Date().toISOString()
  };
}

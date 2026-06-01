import { isValidDate } from "./time.js";

export function parseDurationToMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  const raw = String(value || "").trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)(m|h|d|w)$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return Math.round(amount);
  if (unit === "h") return Math.round(amount * 60);
  if (unit === "d") return Math.round(amount * 24 * 60);
  if (unit === "w") return Math.round(amount * 7 * 24 * 60);
  return 0;
}

export function formatDurationLabel(durationMinutes) {
  if (!durationMinutes) return "自定义";
  if (durationMinutes % (7 * 24 * 60) === 0) return `${durationMinutes / (7 * 24 * 60)} 周`;
  if (durationMinutes % (24 * 60) === 0) return `${durationMinutes / (24 * 60)} 天`;
  if (durationMinutes % 60 === 0) return `${durationMinutes / 60} 小时`;
  return `${durationMinutes} 分钟`;
}

function positiveNumberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizedPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const ratio = number > 1 ? number / 100 : number;
  return Math.max(0, Math.min(1, ratio));
}

export function normalizeQuotaWindow(input, index = 0) {
  const durationMinutes = positiveNumberOrZero(input.durationMinutes) || parseDurationToMinutes(input.duration);
  const label = String(input.label || formatDurationLabel(durationMinutes)).trim();
  const resetAt = isValidDate(input.resetAt) ? new Date(input.resetAt).toISOString() : null;

  return {
    id: String(input.id || input.windowId || label || `window-${index}`).trim() || `window-${index}`,
    label,
    durationMinutes,
    limitTokens: positiveNumberOrZero(input.limitTokens ?? input.tokens),
    limitUsd: positiveNumberOrNull(input.limitUsd ?? input.usd),
    usagePercent: normalizedPercent(input.usagePercent ?? input.usedPercent),
    remainingPercent: normalizedPercent(input.remainingPercent),
    usedTokens: positiveNumberOrZero(input.usedTokens),
    usedUsd: positiveNumberOrNull(input.usedUsd),
    resetAt,
    alertRemainingPercent: positiveNumberOrNull(input.alertRemainingPercent) ?? 0.15
  };
}

export function normalizeCredential(input, index = 0) {
  const provider = String(input.provider || "other").toLowerCase();
  const credentialId = String(input.credentialId || input.id || `${provider}:default`).trim();
  const keyAlias = String(input.keyAlias || input.alias || credentialId).trim();
  const quotaWindows = Array.isArray(input.quotaWindows)
    ? input.quotaWindows
      .map(normalizeQuotaWindow)
      .filter((window) => (
        window.limitTokens > 0 ||
        window.limitUsd > 0 ||
        window.usagePercent !== null ||
        window.remainingPercent !== null
      ))
    : [];

  return {
    credentialId: credentialId || `credential-${index}`,
    keyAlias: keyAlias || credentialId || `credential-${index}`,
    provider,
    planName: String(input.planName || input.plan || "").trim() || null,
    quotaWindows
  };
}

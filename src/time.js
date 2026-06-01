export function toIsoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isValidDate(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

export function minutesUntil(value, now = new Date()) {
  return Math.round((new Date(value).getTime() - now.getTime()) / 60000);
}

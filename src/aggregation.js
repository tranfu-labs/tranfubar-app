import { DEFAULT_ALERT_THRESHOLDS, DEFAULT_QUOTA_LIMITS } from "./config.js";
import { addDays, minutesUntil, startOfUtcDay, toIsoDate } from "./time.js";

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value, precision = 2) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function emptyTotals() {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    knownCostUsd: 0,
    requestCount: 0
  };
}

function addEventToTotals(totals, event) {
  totals.totalTokens += event.totalTokens || 0;
  totals.inputTokens += event.inputTokens || 0;
  totals.outputTokens += event.outputTokens || 0;
  totals.cacheTokens += (event.cacheReadTokens || 0) + (event.cacheWriteTokens || 0);
  totals.knownCostUsd += event.costUsd || 0;
  totals.requestCount += event.requestCount || 0;
}

function getNode(nodes, nodeId) {
  return nodes[nodeId] || {
    nodeId,
    userName: nodeId,
    teamId: "default",
    quotaLimits: DEFAULT_QUOTA_LIMITS,
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
    providers: [],
    lastSeenAt: null
  };
}

function utilizationPercent(value, limit) {
  if (!limit || limit <= 0) return null;
  return Math.min(1, value / limit);
}

function eventCredentialId(event) {
  return event.credentialId || `${event.provider}:default`;
}

function eventKeyAlias(event) {
  return event.keyAlias || eventCredentialId(event);
}

export function aggregateStore(store, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const teamId = options.teamId || null;
  const windowDays = Number(options.windowDays || 30);
  const since = addDays(startOfUtcDay(now), -windowDays + 1);
  const today = toIsoDate(now);

  const nodes = store.nodes || {};
  const allEvents = Array.isArray(store.events) ? store.events : [];
  const events = allEvents.filter((event) => {
    if (teamId && event.teamId !== teamId) return false;
    return new Date(event.timestamp) >= since;
  });

  const totals = emptyTotals();
  const todayTotals = emptyTotals();
  const byUser = new Map();
  const byProvider = new Map();
  const byModel = new Map();
  const daily = new Map();
  const activeDaysByNode = new Map();
  const resetCandidates = new Map();

  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = toIsoDate(addDays(startOfUtcDay(now), -offset));
    daily.set(date, { date, totalTokens: 0, knownCostUsd: 0, requestCount: 0 });
  }

  for (const event of events) {
    const date = toIsoDate(event.timestamp);
    const node = getNode(nodes, event.nodeId);
    addEventToTotals(totals, event);
    if (date === today) addEventToTotals(todayTotals, event);

    if (!byUser.has(event.nodeId)) {
      byUser.set(event.nodeId, {
        nodeId: event.nodeId,
        userName: event.userName || node.userName,
        teamId: event.teamId || node.teamId,
        providers: new Set(),
        models: new Set(),
        activeDays: new Set(),
        totals: emptyTotals(),
        todayTotals: emptyTotals(),
        lastSeenAt: node.lastSeenAt
      });
    }
    const userBucket = byUser.get(event.nodeId);
    userBucket.providers.add(event.provider);
    userBucket.models.add(event.model);
    userBucket.activeDays.add(date);
    addEventToTotals(userBucket.totals, event);
    if (date === today) addEventToTotals(userBucket.todayTotals, event);

    const activeDays = activeDaysByNode.get(event.nodeId) || new Set();
    activeDays.add(date);
    activeDaysByNode.set(event.nodeId, activeDays);

    if (!byProvider.has(event.provider)) {
      byProvider.set(event.provider, {
        provider: event.provider,
        nodes: new Set(),
        models: new Set(),
        totals: emptyTotals()
      });
    }
    const providerBucket = byProvider.get(event.provider);
    providerBucket.nodes.add(event.nodeId);
    providerBucket.models.add(event.model);
    addEventToTotals(providerBucket.totals, event);

    const modelKey = `${event.provider}:${event.model}`;
    if (!byModel.has(modelKey)) {
      byModel.set(modelKey, {
        provider: event.provider,
        model: event.model,
        totals: emptyTotals()
      });
    }
    addEventToTotals(byModel.get(modelKey).totals, event);

    if (daily.has(date)) {
      const day = daily.get(date);
      day.totalTokens += event.totalTokens || 0;
      day.knownCostUsd += event.costUsd || 0;
      day.requestCount += event.requestCount || 0;
    }

    if (event.resetAt) {
      const key = `${event.nodeId}:${event.provider}`;
      const current = resetCandidates.get(key);
      if (!current || new Date(event.resetAt) < new Date(current.resetAt)) {
        resetCandidates.set(key, {
          nodeId: event.nodeId,
          userName: event.userName || node.userName,
          provider: event.provider,
          resetAt: event.resetAt,
          minutesUntilReset: minutesUntil(event.resetAt, now)
        });
      }
    }
  }

  const teamNodes = Object.values(nodes).filter((node) => !teamId || node.teamId === teamId);
  const knownNodeIds = new Set([...teamNodes.map((node) => node.nodeId), ...events.map((event) => event.nodeId)]);
  const activeNodeIds = new Set(events.map((event) => event.nodeId));

  const users = Array.from(knownNodeIds).map((nodeId) => {
    const node = getNode(nodes, nodeId);
    const bucket = byUser.get(nodeId) || {
      nodeId,
      userName: node.userName,
      teamId: node.teamId,
      providers: new Set(node.providers || []),
      models: new Set(),
      activeDays: new Set(),
      totals: emptyTotals(),
      todayTotals: emptyTotals(),
      lastSeenAt: node.lastSeenAt
    };
    const dailyTokenLimit = node.quotaLimits?.dailyTokens || DEFAULT_QUOTA_LIMITS.dailyTokens;
    const monthlySpendLimit = node.quotaLimits?.monthlyUsd || DEFAULT_QUOTA_LIMITS.monthlyUsd;
    return {
      nodeId,
      userName: bucket.userName,
      teamId: bucket.teamId,
      providers: Array.from(bucket.providers).sort(),
      models: Array.from(bucket.models).sort(),
      activeDays: bucket.activeDays.size,
      lastSeenAt: bucket.lastSeenAt || node.lastSeenAt,
      totals: compactTotals(bucket.totals),
      todayTotals: compactTotals(bucket.todayTotals),
      credentials: buildCredentialSummaries({
        node,
        nodeEvents: events.filter((event) => event.nodeId === nodeId),
        now
      }),
      dailyTokenUtilization: utilizationPercent(bucket.todayTotals.totalTokens, dailyTokenLimit),
      monthlySpendUtilization: utilizationPercent(bucket.totals.knownCostUsd, monthlySpendLimit)
    };
  }).sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);

  const alerts = buildAlerts({
    users,
    nodes,
    resetCandidates: Array.from(resetCandidates.values()),
    now
  });

  return {
    generatedAt: now.toISOString(),
    windowDays,
    teamId: teamId || "all",
    totals: compactTotals(totals),
    todayTotals: compactTotals(todayTotals),
    users,
    providers: Array.from(byProvider.values())
      .map((bucket) => ({
        provider: bucket.provider,
        nodes: bucket.nodes.size,
        models: Array.from(bucket.models).sort(),
        totals: compactTotals(bucket.totals)
      }))
      .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens),
    models: Array.from(byModel.values())
      .map((bucket) => ({
        provider: bucket.provider,
        model: bucket.model,
        totals: compactTotals(bucket.totals)
      }))
      .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens)
      .slice(0, 12),
    daily: Array.from(daily.values()).map((day) => ({
      ...day,
      knownCostUsd: round(day.knownCostUsd)
    })),
    alerts,
    agentization: calculateAgentization({
      totalNodes: knownNodeIds.size,
      activeNodes: calculateActiveNodeCount({ knownNodeIds, activeNodeIds, nodes, now }),
      activeDaysByNode,
      providers: byProvider.size,
      totals,
      windowDays
    })
  };
}

function compactTotals(totals) {
  return {
    totalTokens: Math.round(totals.totalTokens),
    inputTokens: Math.round(totals.inputTokens),
    outputTokens: Math.round(totals.outputTokens),
    cacheTokens: Math.round(totals.cacheTokens),
    knownCostUsd: round(totals.knownCostUsd),
    requestCount: Math.round(totals.requestCount)
  };
}

function buildCredentialSummaries({ node, nodeEvents, now }) {
  const definitions = new Map();

  for (const credential of node.credentials || []) {
    definitions.set(credential.credentialId, {
      credentialId: credential.credentialId,
        keyAlias: credential.keyAlias,
        provider: credential.provider,
        planName: credential.planName || null,
        quotaWindows: credential.quotaWindows || []
      });
  }

  for (const event of nodeEvents) {
    const credentialId = eventCredentialId(event);
    if (!definitions.has(credentialId)) {
      definitions.set(credentialId, {
        credentialId,
        keyAlias: eventKeyAlias(event),
        provider: event.provider,
        planName: null,
        quotaWindows: []
      });
    }
  }

  return Array.from(definitions.values()).map((credential) => {
    const relevantEvents = nodeEvents.filter((event) => {
      if (eventCredentialId(event) !== credential.credentialId) return false;
      if (credential.provider && credential.provider !== "other" && event.provider !== credential.provider) return false;
      return true;
    });
    const totals = emptyTotals();
    for (const event of relevantEvents) addEventToTotals(totals, event);

    return {
      credentialId: credential.credentialId,
      keyAlias: credential.keyAlias,
      provider: credential.provider,
      planName: credential.planName || null,
      totals: compactTotals(totals),
      quotaWindows: (credential.quotaWindows || []).map((window) => calculateQuotaWindow(window, relevantEvents, now))
    };
  }).sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);
}

function calculateQuotaWindow(window, events, now) {
  const durationMs = (window.durationMinutes || 0) * 60 * 1000;
  const resetAt = window.resetAt ? new Date(window.resetAt) : null;
  const hasFutureReset = resetAt && resetAt.getTime() > now.getTime();
  const windowStart = durationMs > 0
    ? new Date((hasFutureReset ? resetAt.getTime() : now.getTime()) - durationMs)
    : null;

  const totals = emptyTotals();
  for (const event of events) {
    const timestamp = new Date(event.timestamp);
    if (windowStart && timestamp < windowStart) continue;
    if (timestamp > now) continue;
    addEventToTotals(totals, event);
  }

  const derivedUsagePercent = window.limitTokens > 0 ? Math.min(1, totals.totalTokens / window.limitTokens) : null;
  const usagePercent = derivedUsagePercent ?? window.usagePercent ?? (
    window.remainingPercent === null || window.remainingPercent === undefined ? null : Math.max(0, 1 - window.remainingPercent)
  );
  const remainingPercent = usagePercent === null ? window.remainingPercent ?? null : Math.max(0, 1 - usagePercent);

  return {
    ...window,
    windowStart: windowStart ? windowStart.toISOString() : null,
    usedTokens: Math.round(totals.totalTokens || window.usedTokens || 0),
    usedUsd: round(totals.knownCostUsd || window.usedUsd || 0),
    usagePercent,
    remainingPercent,
    resetAt: resetAt ? resetAt.toISOString() : null,
    minutesUntilReset: resetAt ? minutesUntil(resetAt, now) : null
  };
}

function calculateActiveNodeCount({ knownNodeIds, activeNodeIds, nodes, now }) {
  const active = new Set(activeNodeIds);
  for (const nodeId of knownNodeIds) {
    const node = nodes[nodeId];
    if (!node?.lastSeenAt) continue;
    const ageMs = now.getTime() - new Date(node.lastSeenAt).getTime();
    if (ageMs >= 0 && ageMs <= DEFAULT_ALERT_THRESHOLDS.staleMinutes * 60 * 1000) {
      active.add(nodeId);
    }
  }
  return active.size;
}

function buildAlerts({ users, nodes, resetCandidates, now }) {
  const alerts = [];

  for (const user of users) {
    const node = getNode(nodes, user.nodeId);
    const thresholds = {
      ...DEFAULT_ALERT_THRESHOLDS,
      ...(node.alertThresholds || {})
    };

    if (user.dailyTokenUtilization !== null && user.dailyTokenUtilization >= thresholds.tokensPercent) {
      alerts.push({
        level: user.dailyTokenUtilization >= 1 ? "critical" : "warning",
        type: "daily-token-quota",
        title: `${user.userName} 今日 Token 接近额度`,
        detail: `${Math.round(user.dailyTokenUtilization * 100)}% daily token quota used`,
        nodeId: user.nodeId
      });
    }

    if (user.monthlySpendUtilization !== null && user.monthlySpendUtilization >= thresholds.spendPercent) {
      alerts.push({
        level: user.monthlySpendUtilization >= 1 ? "critical" : "warning",
        type: "monthly-spend-quota",
        title: `${user.userName} 月度成本接近预算`,
        detail: `${Math.round(user.monthlySpendUtilization * 100)}% monthly budget used`,
        nodeId: user.nodeId
      });
    }

    if (user.lastSeenAt) {
      const staleMinutes = Math.round((now.getTime() - new Date(user.lastSeenAt).getTime()) / 60000);
      if (staleMinutes > thresholds.staleMinutes) {
        alerts.push({
          level: "info",
          type: "stale-node",
          title: `${user.userName} 节点未更新`,
          detail: `${staleMinutes} minutes since last heartbeat`,
          nodeId: user.nodeId
        });
      }
    }

    for (const credential of user.credentials || []) {
      for (const window of credential.quotaWindows || []) {
        if (window.remainingPercent === null) continue;
        if (window.remainingPercent <= window.alertRemainingPercent) {
          alerts.push({
            level: window.remainingPercent <= 0 ? "critical" : "warning",
            type: "quota-window-remaining",
            title: `${user.userName} 的 ${credential.keyAlias} 剩余额度偏低`,
            detail: `${window.label} remaining ${Math.round(window.remainingPercent * 100)}%`,
            nodeId: user.nodeId,
            provider: credential.provider,
            credentialId: credential.credentialId,
            resetAt: window.resetAt
          });
        }
        if (window.minutesUntilReset >= 0 && window.minutesUntilReset <= thresholds.resetReminderMinutes) {
          alerts.push({
            level: "info",
            type: "reset-reminder",
            title: `${user.userName} 的 ${credential.keyAlias} 即将重置`,
            detail: `${window.minutesUntilReset} minutes until reset`,
            nodeId: user.nodeId,
            provider: credential.provider,
            credentialId: credential.credentialId,
            resetAt: window.resetAt
          });
        }
      }
    }
  }

  for (const reset of resetCandidates) {
    const node = getNode(nodes, reset.nodeId);
    const thresholds = {
      ...DEFAULT_ALERT_THRESHOLDS,
      ...(node.alertThresholds || {})
    };
    if (reset.minutesUntilReset >= 0 && reset.minutesUntilReset <= thresholds.resetReminderMinutes) {
      alerts.push({
        level: "info",
        type: "reset-reminder",
        title: `${reset.userName} 的 ${reset.provider} 即将重置`,
        detail: `${reset.minutesUntilReset} minutes until reset`,
        nodeId: reset.nodeId,
        provider: reset.provider,
        resetAt: reset.resetAt
      });
    }
  }

  return alerts;
}

function calculateAgentization({ totalNodes, activeNodes, activeDaysByNode, providers, totals, windowDays }) {
  const activeDayCounts = Array.from(activeDaysByNode.values()).map((days) => days.size);
  const activeRatio = totalNodes > 0 ? activeNodes / totalNodes : 0;
  const consistency = activeDayCounts.length > 0 ? sum(activeDayCounts) / (activeDayCounts.length * windowDays) : 0;
  const providerBreadth = Math.min(1, providers / 4);
  const intensity = Math.min(1, Math.log10((totals.totalTokens || 0) / Math.max(activeNodes, 1) + 1) / 6);
  const score = Math.round((activeRatio * 0.35 + consistency * 0.25 + providerBreadth * 0.15 + intensity * 0.25) * 100);

  let level = "起步";
  if (score >= 75) level = "AI 原生";
  else if (score >= 55) level = "规模化使用";
  else if (score >= 35) level = "局部落地";

  return {
    score,
    level,
    activeNodeRatio: round(activeRatio, 3),
    consistency: round(consistency, 3),
    providerBreadth: round(providerBreadth, 3),
    intensity: round(intensity, 3),
    activeNodes,
    totalNodes
  };
}

const state = {
  summary: null,
  events: [],
  view: "team",
  selectedNodeId: null
};

const els = {
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  generatedAt: document.querySelector("#generatedAt"),
  refreshButton: document.querySelector("#refreshButton"),
  windowSelect: document.querySelector("#windowSelect"),
  teamSelect: document.querySelector("#teamSelect"),
  totalTokens: document.querySelector("#totalTokens"),
  totalRequests: document.querySelector("#totalRequests"),
  todayTokens: document.querySelector("#todayTokens"),
  todayCost: document.querySelector("#todayCost"),
  knownCost: document.querySelector("#knownCost"),
  agentScore: document.querySelector("#agentScore"),
  agentLevel: document.querySelector("#agentLevel"),
  scoreRing: document.querySelector("#scoreRing"),
  activeNodes: document.querySelector("#activeNodes"),
  dailyChart: document.querySelector("#dailyChart"),
  trendSummary: document.querySelector("#trendSummary"),
  alerts: document.querySelector("#alerts"),
  alertCount: document.querySelector("#alertCount"),
  usersTable: document.querySelector("#usersTable"),
  userCount: document.querySelector("#userCount"),
  providers: document.querySelector("#providers"),
  providerCount: document.querySelector("#providerCount"),
  personList: document.querySelector("#personList"),
  personalCount: document.querySelector("#personalCount"),
  personTitle: document.querySelector("#personTitle"),
  personStatus: document.querySelector("#personStatus"),
  personDetail: document.querySelector("#personDetail"),
  eventsTable: document.querySelector("#eventsTable"),
  eventTotal: document.querySelector("#eventTotal")
};

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(Number(value || 0)));
}

function formatCompact(value) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatResetTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

function percent(value) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}

function setStatus(kind, text) {
  els.statusDot.classList.toggle("is-ok", kind === "ok");
  els.statusDot.classList.toggle("is-error", kind === "error");
  els.statusText.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function progressClass(value) {
  if (value === null || value === undefined) return "";
  if (value >= 1) return "is-critical";
  if (value >= 0.8) return "is-warning";
  return "";
}

function renderProgress(value) {
  const safe = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, value));
  return `
    <div class="progress" title="${percent(value)}">
      <div class="progress-fill ${progressClass(value)}" style="width:${safe * 100}%"></div>
    </div>
  `;
}

function renderPills(items) {
  if (!items || items.length === 0) return '<span class="muted">-</span>';
  return `<div class="pill-row">${items.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderQuotaWindows(credentials) {
  const rows = [];
  for (const credential of credentials || []) {
    for (const window of credential.quotaWindows || []) {
      rows.push({
        ...window,
        keyAlias: credential.keyAlias,
        provider: credential.provider,
        planName: credential.planName
      });
    }
  }
  if (rows.length === 0) {
    return '<div class="empty">未配置额度窗口</div>';
  }
  return `
    <div class="quota-list">
      ${rows.map((window) => {
        const remaining = window.remainingPercent === null ? "-" : `${Math.round(window.remainingPercent * 100)}%`;
        const used = `${formatCompact(window.usedTokens)} / ${formatCompact(window.limitTokens)}`;
        return `
          <div class="quota-item">
            <div class="quota-row">
              <span>${escapeHtml(window.label)}</span>
              <strong>${remaining}</strong>
              <span>${formatResetTime(window.resetAt)}</span>
            </div>
            <div class="quota-meta">
              <span>${escapeHtml([window.keyAlias, window.planName].filter(Boolean).join(" · "))}</span>
              <span>${used} tokens</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function loadData() {
  setStatus("loading", "更新中");
  const params = new URLSearchParams();
  params.set("windowDays", els.windowSelect.value);
  if (els.teamSelect.value) params.set("teamId", els.teamSelect.value);

  const [summaryRes, eventsRes] = await Promise.all([
    fetch(`/api/summary?${params.toString()}`),
    fetch("/api/events?limit=200")
  ]);

  if (!summaryRes.ok) throw new Error(`summary ${summaryRes.status}`);
  if (!eventsRes.ok) throw new Error(`events ${eventsRes.status}`);

  state.summary = await summaryRes.json();
  const eventsPayload = await eventsRes.json();
  state.events = eventsPayload.events || [];
  setStatus("ok", "已连接");
  render();
}

function render() {
  renderTeam();
  renderPersonal();
  renderEvents();
}

function renderTeam() {
  const summary = state.summary;
  if (!summary) return;

  els.generatedAt.textContent = `更新时间 ${formatDateTime(summary.generatedAt)}`;
  els.totalTokens.textContent = formatCompact(summary.totals.totalTokens);
  els.totalRequests.textContent = `${formatNumber(summary.totals.requestCount)} requests`;
  els.todayTokens.textContent = formatCompact(summary.todayTotals.totalTokens);
  els.todayCost.textContent = `known ${formatUsd(summary.todayTotals.knownCostUsd)}`;
  els.knownCost.textContent = formatUsd(summary.totals.knownCostUsd);
  els.agentScore.textContent = summary.agentization.score;
  els.agentLevel.textContent = summary.agentization.level;
  els.scoreRing.style.setProperty("--score", `${summary.agentization.score}%`);
  els.activeNodes.textContent = `${summary.agentization.activeNodes} / ${summary.agentization.totalNodes} nodes`;

  renderDailyChart(summary.daily);
  renderAlerts(summary.alerts);
  renderUsers(summary.users);
  renderProviders(summary.providers, summary.totals.totalTokens);
}

function renderDailyChart(days) {
  if (!days || days.length === 0 || days.every((day) => Number(day.totalTokens || 0) === 0)) {
    els.trendSummary.textContent = "0 天";
    els.dailyChart.innerHTML = '<div class="empty chart-empty">暂无数据</div>';
    return;
  }
  const max = Math.max(...days.map((day) => day.totalTokens), 1);
  els.trendSummary.textContent = `${days.length} 天`;
  els.dailyChart.innerHTML = days.map((day) => {
    const height = Math.max(2, (day.totalTokens / max) * 100);
    const label = `${day.date} ${formatNumber(day.totalTokens)} tokens`;
    return `<div class="bar" style="height:${height}%" data-label="${escapeHtml(label)}"></div>`;
  }).join("");
}

function renderAlerts(alerts) {
  els.alertCount.textContent = alerts.length;
  if (alerts.length === 0) {
    els.alerts.innerHTML = '<div class="empty">暂无告警</div>';
    return;
  }
  els.alerts.innerHTML = alerts.slice(0, 8).map((alert) => `
    <div class="alert-item is-${escapeHtml(alert.level)}">
      <strong>${escapeHtml(alert.title)}</strong>
      <span class="muted">${escapeHtml(alert.detail)}</span>
    </div>
  `).join("");
}

function renderUsers(users) {
  els.userCount.textContent = users.length;
  if (users.length === 0) {
    els.usersTable.innerHTML = '<tr><td colspan="5"><div class="empty">暂无成员数据</div></td></tr>';
    return;
  }

  els.usersTable.innerHTML = users.map((user) => {
    const quotaValue = user.quotaWindowUtilization ?? user.dailyTokenUtilization;
    return `
      <tr>
        <td>
          <div class="member-cell">
            <strong>${escapeHtml(user.userName)}</strong>
            <small>${escapeHtml(user.nodeId)} · ${formatDateTime(user.lastSeenAt)}</small>
          </div>
        </td>
        <td>
          ${renderProgress(quotaValue)}
          <small class="muted">${percent(quotaValue)}</small>
        </td>
        <td>${formatNumber(user.totals.totalTokens)}</td>
        <td>${formatNumber(user.totals.requestCount)}</td>
        <td>${renderPills(user.providers)}</td>
      </tr>
    `;
  }).join("");
}

function renderProviders(providers, totalTokens) {
  els.providerCount.textContent = providers.length;
  if (providers.length === 0) {
    els.providers.innerHTML = '<div class="empty">暂无供应商数据</div>';
    return;
  }

  els.providers.innerHTML = providers.map((provider) => {
    const share = totalTokens > 0 ? provider.totals.totalTokens / totalTokens : 0;
    return `
      <div class="provider-item">
        <strong>${escapeHtml(provider.provider)}</strong>
        <span class="muted">${formatNumber(provider.totals.totalTokens)} tokens · ${provider.nodes} nodes</span>
        <div class="provider-meter"><span style="width:${Math.max(3, share * 100)}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderPersonal() {
  const users = state.summary?.users || [];
  els.personalCount.textContent = users.length;
  if (users.length === 0) {
    els.personList.innerHTML = '<div class="empty">暂无成员</div>';
    els.personDetail.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }

  if (!state.selectedNodeId || !users.some((user) => user.nodeId === state.selectedNodeId)) {
    state.selectedNodeId = users[0].nodeId;
  }
  const selected = users.find((user) => user.nodeId === state.selectedNodeId);

  els.personList.innerHTML = users.map((user) => `
    <button class="person-item ${user.nodeId === state.selectedNodeId ? "is-active" : ""}" type="button" data-node-id="${escapeHtml(user.nodeId)}">
      <strong>${escapeHtml(user.userName)}</strong>
      <span class="muted">${formatCompact(user.totals.totalTokens)} tokens · ${user.activeDays} active days</span>
    </button>
  `).join("");

  els.personTitle.textContent = selected.userName;
  els.personStatus.textContent = `${selected.providers.length} providers`;
  const quotaValue = selected.quotaWindowUtilization ?? selected.dailyTokenUtilization;
  els.personDetail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-block">
        <strong>${formatNumber(selected.todayTotals.totalTokens)}</strong>
        <span class="muted">今日 Token</span>
      </div>
      <div class="detail-block">
        <strong>${formatUsd(selected.totals.knownCostUsd)}</strong>
        <span class="muted">窗口成本</span>
      </div>
      <div class="detail-block">
        <strong>${selected.activeDays}</strong>
        <span class="muted">活跃天数</span>
      </div>
    </div>
    <div class="detail-block">
      <strong>剩余用量</strong>
      ${renderQuotaWindows(selected.credentials)}
    </div>
    <div class="detail-block">
      <strong>今日额度占用</strong>
      ${renderProgress(quotaValue)}
      <span class="muted">${percent(quotaValue)}</span>
    </div>
    <div class="detail-block">
      <strong>模型</strong>
      ${renderPills(selected.models)}
    </div>
    <div class="detail-block">
      <strong>供应商</strong>
      ${renderPills(selected.providers)}
    </div>
  `;

  document.querySelectorAll(".person-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedNodeId = button.dataset.nodeId;
      renderPersonal();
    });
  });
}

function renderEvents() {
  els.eventTotal.textContent = state.events.length;
  if (state.events.length === 0) {
    els.eventsTable.innerHTML = '<tr><td colspan="7"><div class="empty">暂无事件</div></td></tr>';
    return;
  }
  els.eventsTable.innerHTML = state.events.map((event) => `
    <tr>
      <td>${formatDateTime(event.timestamp)}</td>
      <td>${escapeHtml(event.userName || event.nodeId)}</td>
      <td>${escapeHtml(event.keyAlias || event.credentialId || "-")}</td>
      <td>${escapeHtml(event.provider)}</td>
      <td>${escapeHtml(event.model)}</td>
      <td>${formatNumber(event.totalTokens)}</td>
      <td>${escapeHtml(event.source)}</td>
    </tr>
  `).join("");
}

document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `${state.view}View`));
  });
});

els.refreshButton.addEventListener("click", () => {
  loadData().catch((error) => {
    console.error(error);
    setStatus("error", "连接失败");
  });
});

els.windowSelect.addEventListener("change", () => loadData().catch(() => setStatus("error", "连接失败")));
els.teamSelect.addEventListener("change", () => loadData().catch(() => setStatus("error", "连接失败")));

loadData().catch((error) => {
  console.error(error);
  setStatus("error", "连接失败");
});

setInterval(() => {
  loadData().catch(() => setStatus("error", "连接失败"));
}, 30000);

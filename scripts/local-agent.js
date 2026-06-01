#!/usr/bin/env node
import os from "node:os";
import { parseDurationToMinutes, formatDurationLabel } from "../src/quota.js";
import { scanLocalUsage } from "../src/local-scanner.js";

function parseArgs(argv) {
  const args = {
    interval: 0,
    once: false,
    print: false,
    server: "",
    sinceDays: 30,
    nodeId: os.hostname(),
    userName: os.userInfo().username,
    teamId: "default",
    codexHome: "",
    claudeHome: "",
    credentialId: "",
    keyAlias: "",
    teamToken: process.env.TEAM_INGEST_TOKEN || process.env.TEAM_TOKEN || "",
    quotaWindows: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--once") args.once = true;
    else if (arg === "--print") args.print = true;
    else if (arg === "--server") {
      args.server = next;
      index += 1;
    } else if (arg === "--interval") {
      args.interval = Number(next);
      index += 1;
    } else if (arg === "--since-days") {
      args.sinceDays = Number(next);
      index += 1;
    } else if (arg === "--node-id") {
      args.nodeId = next;
      index += 1;
    } else if (arg === "--user") {
      args.userName = next;
      index += 1;
    } else if (arg === "--team-id") {
      args.teamId = next;
      index += 1;
    } else if (arg === "--codex-home") {
      args.codexHome = next;
      index += 1;
    } else if (arg === "--claude-home") {
      args.claudeHome = next;
      index += 1;
    } else if (arg === "--credential-id") {
      args.credentialId = next;
      index += 1;
    } else if (arg === "--key-alias") {
      args.keyAlias = next;
      index += 1;
    } else if (arg === "--team-token") {
      args.teamToken = next;
      index += 1;
    } else if (arg === "--quota-window") {
      args.quotaWindows.push(parseQuotaWindow(next, args.quotaWindows.length));
      index += 1;
    }
    else if (arg === "--help" || arg === "-h") args.help = true;
  }

  return args;
}

function parseQuotaWindow(value, index) {
  const [duration, limitTokens, resetAt, label] = String(value || "").split(",");
  const durationMinutes = parseDurationToMinutes(duration);
  if (!durationMinutes || !Number(limitTokens)) {
    throw new Error(`invalid --quota-window: ${value}. Expected: duration,limitTokens,resetAt[,label]`);
  }
  return {
    id: `window-${index + 1}`,
    label: label || formatDurationLabel(durationMinutes),
    durationMinutes,
    limitTokens: Number(limitTokens),
    resetAt: resetAt || null
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/local-agent.js --once --print
  node scripts/local-agent.js --once --server http://127.0.0.1:4317 --user Alice
  node scripts/local-agent.js --server http://127.0.0.1:4317 --interval 60 --team-id tranfu-ai

Options:
  --server <url>        Team monitor server URL
  --interval <seconds>  Continuous scan interval
  --once                Run once and exit
  --print               Print scan result JSON
  --since-days <days>   Rolling scan window, default 30
  --node-id <id>        Node ID, default hostname
  --user <name>         User display name
  --team-id <id>        Team ID, default default
  --team-token <token>  Team ingest token, or set TEAM_INGEST_TOKEN
  --credential-id <id>  Local account/key asset ID, never the raw API key
  --key-alias <name>    Display alias for the monitored key/account
  --quota-window <spec> Repeated quota window: 5h,500000,2026-05-29T14:58:00+08:00
  --codex-home <path>   Override Codex home
  --claude-home <path>  Override Claude config home`);
}

async function postJson(url, payload, teamToken = "") {
  const headers = { "content-type": "application/json" };
  if (teamToken) headers["x-team-token"] = teamToken;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function runOnce(args) {
  const result = await scanLocalUsage(args);
  if (args.print || !args.server) {
    console.log(JSON.stringify(result, null, 2));
  }

  if (args.server) {
    const base = args.server.replace(/\/$/, "");
    await postJson(`${base}/api/node-heartbeat`, {
      nodeId: args.nodeId,
      userName: args.userName,
      teamId: args.teamId,
      providers: Array.from(new Set(result.events.map((event) => event.provider))),
      credentials: buildCredentials(args, result.events)
    }, args.teamToken);
    if (result.events.length > 0) {
      const response = await postJson(`${base}/api/usage-events`, { events: result.events }, args.teamToken);
      console.log(`reported ${response.accepted} usage events to ${base}`);
    } else {
      console.log(`no usage events found since ${result.since}`);
    }
  }
}

function buildCredentials(args, events) {
  if (!args.credentialId && !args.keyAlias && args.quotaWindows.length === 0) return [];
  const providers = Array.from(new Set(events.map((event) => event.provider)));
  const provider = providers.length === 1 ? providers[0] : "other";
  return [{
    credentialId: args.credentialId || `${provider}:default`,
    keyAlias: args.keyAlias || args.credentialId || `${provider}:default`,
    provider,
    quotaWindows: args.quotaWindows
  }];
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.once && !args.interval) args.once = true;

await runOnce(args);

if (!args.once && args.interval > 0) {
  setInterval(() => {
    runOnce(args).catch((error) => {
      console.error(error.message);
    });
  }, args.interval * 1000);
}

# TranFu AI 算力监控

团队级 AI 算力资产与 Token 消耗监控 MVP。当前版本包含团队聚合 API / Web 看板，以及基于 CodexBar 改造的 macOS 个人端方案。

## 设计边界

- 不采集、不保存 API Key。
- 个人端只上报汇总后的使用事件或额度窗口：节点、成员、供应商、模型、Token、套餐、百分比、重置时间。
- 第一版只启用和上报 Codex / Claude。
- 本地采集参考 CodexBar 的思路：优先读取本机已有登录态和本地日志，不要求团队成员提交真实 API Key。
- 团队端以节点上报为主，正式部署使用 SQLite 存储。

## 运行

```bash
npm run dev
```

默认服务地址：

```text
http://127.0.0.1:4317
```

默认不带演示数据。需要本地演示时再执行：

```bash
npm run seed
```

## 产品拆分

### 个人版：TranFuBar

安装在团队成员自己的 Mac 上，负责本地看板、额度提醒和团队上报。个人端不采集、不上传真实 API Key、Cookie、对话内容或源码内容。

个人端需要成员填写：

- 团队服务地址，例如 `https://tranfubar-app.tranfu.com`。
- 团队 ID，例如 `tranfu-ai`。
- 成员名称，例如 `Alice`。
- 节点名称，默认可用本机名称。
- 团队 Token，用于上报校验。
- 刷新频率，默认跟随 CodexBar。

### 团队版：TranFu Usage Team

部署在服务器或官网子路径，接收每台 TranFuBar 的上报，展示团队汇总、成员明细、供应商拆分、额度告警和 Agent 化程度。

团队版上线前需要准备：

- 域名和 HTTPS 证书。
- 一台可运行 Node.js 20+ 的服务器。
- 一个部署账号或容器运行环境。
- 数据存储。测试期可继续使用 JSON 文件，正式期使用 SQLite。
- 统一的 `teamId`。
- 团队 Token，用于保护上报写入接口。

部署文档见 [docs/deployment-tranfubar-team.md](docs/deployment-tranfubar-team.md)。

## 本地个人端采集

第一版推荐使用 `CodexBar/` 下改造后的 macOS 菜单栏应用：

1. 安装并启动个人端应用。
2. 打开设置，进入“团队上报”。
3. 填写团队服务地址，例如 `http://127.0.0.1:4317`。
4. 填写团队 ID 和成员名称。
5. 开启“启用团队监控上报”。

个人端默认刷新周期与 CodexBar 一致：5 分钟。用户可以在设置里的刷新频率中调整。每次刷新后，应用会把 Codex / Claude 的套餐、额度窗口百分比和重置时间上报到 `/api/node-heartbeat`。

内部 unsigned 测试包构建命令：

```bash
cd CodexBar
CODEXBAR_SIGNING=adhoc ./Scripts/package_app.sh release
```

构建环境需要完整 Xcode / Swift 6.2 工具链，不能只安装旧版 Command Line Tools。

命令行采集器保留为调试和服务器环境备用路径。

只扫描并打印本机 Codex/Claude 汇总数据：

```bash
npm run scan
```

扫描并上报到团队服务：

```bash
node scripts/local-agent.js --once --server http://127.0.0.1:4317 --user "Alice"
```

持续运行，每 60 秒扫描并上报：

```bash
node scripts/local-agent.js --server http://127.0.0.1:4317 --interval 60 --user "Alice"
```

监控某个“对应 KEY/账号资产”时，不传真实 API Key，只传本地定义的资产 ID 和展示别名：

```bash
node scripts/local-agent.js \
  --server http://127.0.0.1:4317 \
  --interval 60 \
  --user "Alice" \
  --team-id "tranfu-ai" \
  --team-token "$TEAM_INGEST_TOKEN" \
  --credential-id "alice-codex-pro" \
  --key-alias "Alice Codex Pro" \
  --quota-window "5h,500000,2026-05-29T14:58:00+08:00" \
  --quota-window "1w,5000000,2026-06-05T00:00:00+08:00"
```

`--quota-window` 格式是：

```text
duration,limitTokens,resetAt[,label]
```

示例：

- `5h,500000,2026-05-29T14:58:00+08:00`
- `1w,5000000,2026-06-05T00:00:00+08:00`

看板会计算每个窗口的 `usedTokens / limitTokens`、`usagePercent`、`remainingPercent` 和重置时间，用于展示类似“5 小时 97% 14:58 / 1 周 99% 6月5日”的剩余额度视图。

可选参数：

- `--node-id <id>`：本机节点 ID，默认使用主机名。
- `--team-id <id>`：团队 ID，默认 `default`。
- `--team-token <token>`：团队上报 Token，也可以通过 `TEAM_INGEST_TOKEN` 环境变量传入。
- `--credential-id <id>`：本地定义的 KEY/账号资产 ID，不要填真实 API Key。
- `--key-alias <name>`：看板展示名。
- `--quota-window <spec>`：额度窗口，可重复传。
- `--since-days <n>`：扫描最近 N 天，默认 30。
- `--codex-home <path>`：覆盖 Codex 目录，默认 `$CODEX_HOME` 或 `~/.codex`。
- `--claude-home <path>`：覆盖 Claude 目录，默认 `$CLAUDE_CONFIG_DIR`、`~/.config/claude`、`~/.claude`。

## API

### `POST /api/usage-events`

支持单条或数组上报。

```json
{
  "nodeId": "macbook-pro-01",
  "userName": "Alice",
  "teamId": "tranfu-ai",
  "provider": "codex",
  "model": "gpt-5-codex",
  "source": "local-log",
  "timestamp": "2026-05-29T03:00:00.000Z",
  "inputTokens": 12000,
  "outputTokens": 3000,
  "totalTokens": 15000,
  "costUsd": null,
  "requestCount": 8,
  "resetAt": "2026-05-29T08:00:00.000Z"
}
```

### `POST /api/node-heartbeat`

上报节点身份、套餐与额度窗口。个人端不会上传 API Key、Cookie 或对话内容。

```json
{
  "nodeId": "macbook-pro-01",
  "userName": "Alice",
  "teamId": "tranfu-ai",
  "hostName": "Alice-MacBook-Pro",
  "role": "member",
  "providers": ["codex", "claude"],
  "credentials": [
    {
      "credentialId": "Alice-MacBook-Pro:claude",
      "keyAlias": "Claude",
      "provider": "claude",
      "planName": "Pro",
      "quotaWindows": [
        {
          "id": "primary",
          "label": "5 小时",
          "durationMinutes": 300,
          "usagePercent": 0.03,
          "remainingPercent": 0.97,
          "resetAt": "2026-05-29T14:58:00+08:00"
        },
        {
          "id": "secondary",
          "label": "1 周",
          "durationMinutes": 10080,
          "usagePercent": 0.01,
          "remainingPercent": 0.99,
          "resetAt": "2026-06-05T00:00:00+08:00"
        }
      ]
    }
  ]
}
```

### `GET /api/summary`

返回团队聚合视图、个人排行、供应商拆分、时间序列、告警和 Agent 化程度评估。

## 后续工程化方向

- 将 `data/usage-store.json` 替换为数据库。
- 引入节点签名或团队 token，防止伪造上报。
- 将 macOS 个人端做签名和 notarization。
- 接入 OpenAI/Anthropic Admin API，补齐组织级账单视角。

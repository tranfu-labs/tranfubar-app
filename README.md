# TranFuBar App

TranFuBar App 是 TranFu 内部使用的 AI 算力与 Token 用量监控系统。它由两部分组成：

- TranFuBar macOS 个人端：安装在团队成员自己的 Mac 上，查看 Codex / Claude 的本地用量、套餐、额度窗口和重置时间。
- TranFuBar Team 团队端：部署在服务器上，接收个人端上报，展示团队、成员、供应商和节点维度的汇总数据。

当前版本只覆盖 Codex 和 Claude。系统不采集、不保存、不上传真实 API Key、Cookie、对话内容或源码内容；个人端只上报汇总后的用量与额度信息。

## 适合解决什么问题

- 团队里每个人的 Codex / Claude 使用情况不可见。
- 不清楚哪些成员已经高频使用 AI Agent，哪些成员还没有形成习惯。
- 订阅额度快用完时缺少提前提醒。
- 团队想先用轻量方式评估 AI 原生组织的运行程度。

## 当前能力

- 个人端本地看板：展示 Codex / Claude 的套餐、今日用量、近 30 天用量、额度百分比和重置时间。
- 团队端汇总看板：展示团队总览、成员明细、供应商拆分、节点活跃情况和告警。
- 团队上报：个人端按刷新周期把汇总数据上报到团队服务。
- SQLite 存储：服务端默认使用 SQLite，适合第一阶段内部部署。
- 无演示数据：没有真实上报前，页面显示暂无数据。

## 仓库内容

```text
public/                         # 团队端网页
server/                         # 团队端 Node 服务
scripts/                        # 本地采集和辅助脚本
docs/deployment-tranfubar-team.md # 部署文档
public/downloads/               # macOS 内测安装包
```

macOS 个人端内测安装包：

[下载 TranFuBar macOS 内测安装包](https://github.com/tranfu-labs/tranfubar-app/releases/latest/download/TranFuBar-unsigned-test-arm64.zip)

这是 unsigned 测试包，首次打开时 macOS 可能会拦截，按下面的个人使用步骤处理即可。

## 个人如何使用 TranFuBar

### 1. 安装

1. 从产品页或点击上面的“下载 TranFuBar macOS 内测安装包”下载安装包。
2. 解压后得到 `TranFuBar.app`。
3. 建议把 `TranFuBar.app` 移到“应用程序”目录。
4. 第一次打开时，因为当前是 unsigned 内测包，macOS 可能会拦截。
5. 如果被拦截，右键点击 `TranFuBar.app`，选择“打开”，再确认打开。

### 2. 确认本机已经在使用 Codex / Claude

TranFuBar 读取的是本机已有的 Codex / Claude 使用数据。成员需要先在本机正常使用过 Codex 或 Claude，应用里才会逐步显示本地用量。

不需要在 TranFuBar 里填写 Codex Key、Claude Key、Cookie 或账号密码。

### 3. 查看个人用量

打开 TranFuBar 后，点击电脑顶部菜单栏里的 TranFuBar 图标，可以看到：

- Codex / Claude 当前账号或套餐信息。
- 5 小时、每周等额度窗口的剩余百分比。
- 下次重置时间。
- 今日费用和 Token 用量。
- 近 30 天费用和 Token 用量。
- 常用模型。

如果某个工具暂时没有数据，通常说明本机还没有对应日志、未登录、或者最近没有使用记录。

### 4. 配置团队上报

点击 TranFuBar 菜单底部的“设置”，找到“团队上报”，填写：

```text
团队服务地址：https://tranfubar-app.tranfu.com
团队 ID：tranfu-ai
成员名称：自己的中文名或英文名
团队 Token：由团队管理员提供
```

然后开启“启用团队监控上报”。

节点名称默认使用本机名称，不需要手动填写。团队端会用它区分不同电脑，例如办公电脑、备用电脑或测试机。

### 5. 刷新和上报频率

个人端默认刷新周期沿用 CodexBar 的逻辑，当前为 5 分钟。每次刷新后，如果团队上报已开启，会把 Codex / Claude 的汇总信息上报到团队服务。

上报内容包括：

- 成员名称
- 本机节点
- 供应商：Codex / Claude
- 套餐名称
- Token 用量汇总
- 额度窗口百分比
- 重置时间

不上报的内容包括：

- API Key
- Cookie
- 对话内容
- 源码内容
- 本机文件内容

### 6. 常见问题

如果打开后没有数据：

- 先确认本机是否已经正常使用过 Codex / Claude。
- 在 TranFuBar 里点击“刷新”。
- 等待一个刷新周期后再看团队端。
- 如果团队端仍然没有数据，检查“团队服务地址”“团队 ID”“团队 Token”是否填写正确。

如果 macOS 提示无法打开：

- 这是 unsigned 内测包的正常现象。
- 右键点击 App，选择“打开”，再确认即可。

如果个人端能看到数据，但团队端没有：

- 先确认“启用团队监控上报”已经打开。
- 确认团队服务地址可以在浏览器访问。
- 确认团队 Token 和服务端配置一致。

## 团队端本地运行

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:4317
```

默认不带演示数据。需要本地演示时再执行：

```bash
npm run seed
```

生产启动：

```bash
npm run start
```

部署文档见：

```text
docs/deployment-tranfubar-team.md
```

## 服务端环境变量

生产环境建议使用：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=4317
DEFAULT_TEAM_ID=tranfu-ai

STORE_BACKEND=sqlite
SQLITE_PATH=/var/lib/tranfubar-app/usage.sqlite
SQLITE_STORE_ID=tranfu-ai

TEAM_INGEST_TOKEN=<团队上报 token>
```

没有真实上报前，数据库为空，页面显示“暂无数据”。

## 命令行采集器

macOS 个人端是推荐使用方式。命令行采集器保留给调试和服务器环境。

只扫描本机 Codex / Claude 汇总数据：

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

带团队配置的示例：

```bash
node scripts/local-agent.js \
  --server https://tranfubar-app.tranfu.com \
  --team-id "tranfu-ai" \
  --team-token "$TEAM_INGEST_TOKEN" \
  --user "Alice" \
  --credential-id "alice-codex-pro" \
  --key-alias "Alice Codex Pro"
```

## 主要接口

### `POST /api/node-heartbeat`

个人端上报节点身份、套餐与额度窗口。不会上传 API Key、Cookie 或对话内容。

### `POST /api/usage-events`

命令行采集器或后续工具上报用量事件。

### `GET /api/summary`

团队看板读取聚合数据。

## 部署

第一阶段推荐部署方式：

- 阿里云服务器
- Node.js 20+
- SQLite
- systemd 自动重启和开机自启
- Caddy 反向代理 HTTPS

完整步骤见：

```text
docs/deployment-tranfubar-team.md
```

## 后续计划

- macOS 应用签名和 notarization。
- 更细的成员与团队权限。
- 更完整的 Claude 数据兼容。
- 更多 provider 扩展。
- 组织级账单 API 接入。

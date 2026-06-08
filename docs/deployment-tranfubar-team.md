# TranFuBar 团队版部署文档

面向开发部署执行。当前版本使用 SQLite 存储，Caddy 反向代理由服务器侧已有配置处理。

## 目标

- 产品域名：`https://tranfubar-app.tranfu.com/`
- 团队 ID：`tranfu-ai`
- 团队名称：`TranFu`
- 服务端：阿里云服务器
- 数据存储：SQLite
- 上报安全：启用团队 Token，仅保护写入接口

## 1. 代码发布建议

建议把当前项目发布到 GitHub 私有仓库，开发从 GitHub 拉取部署。

推荐仓库：

```text
tranfu-labs/tranfubar-app
```

也可以使用个人或公司已有组织，例如：

```text
<你的 GitHub 组织>/tranfubar-app
```

推荐分支策略：

```text
main：可部署版本
deploy/prod：可选，生产部署分支
tag：v0.1.0、v0.1.1 ...
```

服务器部署目录：

```text
/opt/tranfubar-app
```

首次拉取：

```bash
sudo mkdir -p /opt/tranfubar-app
sudo chown -R $USER:$USER /opt/tranfubar-app
git clone <GitHub 仓库地址> /opt/tranfubar-app
cd /opt/tranfubar-app
npm install --omit=dev
```

后续更新：

```bash
cd /opt/tranfubar-app
git pull --ff-only
npm install --omit=dev
sudo systemctl restart tranfubar-app
```

## 2. DNS

在阿里云 DNS 为 `tranfubar-app.tranfu.com` 添加解析：

```text
类型：A
主机记录：tranfubar-app
记录值：<阿里云服务器公网 IP>
TTL：默认
```

等待解析生效：

```bash
dig tranfubar-app.tranfu.com +short
```

## 3. 服务器环境

建议使用 Ubuntu 22.04/24.04。

### Docker Compose 部署

如果服务器已有 Docker 和 Docker Compose，可以直接使用仓库里的 `Dockerfile` 和 `docker-compose.yml`，不需要在宿主机安装 Node.js 或 SQLite。

准备环境变量：

```bash
cp .env.example .env
openssl rand -hex 32
nano .env
```

把 `.env` 里的 `TEAM_INGEST_TOKEN` 改成上一步生成的 token。默认只绑定宿主机 `127.0.0.1:4317`，适合由 Caddy/Nginx 反向代理；如果需要直接开放端口，可以把 `TRANFUBAR_BIND` 改成 `0.0.0.0`。

启动：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f tranfubar-app
```

检查健康状态：

```bash
curl http://127.0.0.1:4317/healthz
```

数据会保存在 Docker named volume `tranfubar-data` 中，容器内路径为：

```text
/data/usage.sqlite
```

更新：

```bash
git pull --ff-only
docker compose up -d --build
```

### systemd 部署

安装 Node.js 20+ 和 SQLite：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git sqlite3
node -v
npm -v
sqlite3 --version
```

## 4. 数据目录

创建数据目录：

```bash
sudo mkdir -p /var/lib/tranfubar-app
sudo chown -R $USER:$USER /var/lib/tranfubar-app
```

SQLite 文件路径：

```text
/var/lib/tranfubar-app/usage.sqlite
```

没有真实上报前，数据库为空，页面显示“暂无数据”。

## 5. 环境变量

创建环境变量文件：

```bash
sudo mkdir -p /etc/tranfubar-app
sudo nano /etc/tranfubar-app/env
```

写入：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=4317
DEFAULT_TEAM_ID=tranfu-ai

STORE_BACKEND=sqlite
SQLITE_PATH=/var/lib/tranfubar-app/usage.sqlite
SQLITE_STORE_ID=tranfu-ai

TEAM_INGEST_TOKEN=<生成一个团队上报 token>
```

生成团队 Token：

```bash
openssl rand -hex 32
```

设置权限：

```bash
sudo chmod 600 /etc/tranfubar-app/env
```

## 6. systemd 自动重启与开机自启

创建服务：

```bash
sudo nano /etc/systemd/system/tranfubar-app.service
```

内容：

```ini
[Unit]
Description=TranFuBar App Usage Monitor
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/tranfubar-app
EnvironmentFile=/etc/tranfubar-app/env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
StandardOutput=append:/var/log/tranfubar-app.log
StandardError=append:/var/log/tranfubar-app.error.log

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tranfubar-app
sudo systemctl status tranfubar-app
```

查看日志：

```bash
tail -f /var/log/tranfubar-app.log
tail -f /var/log/tranfubar-app.error.log
journalctl -u tranfubar-app -f
```

## 7. Caddy

服务器已配置 Caddy 的话，只需要让 Caddy 转发到：

```text
127.0.0.1:4317
```

参考 Caddyfile：

```caddy
tranfubar-app.tranfu.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:4317

    tls {
        dns alidns {
            access_key_id {env.ALICLOUD_ACCESS_KEY}
            access_key_secret {env.ALICLOUD_SECRET_KEY}
        }
    }
}
```

仓库内也有可复制的示例文件：

```text
deploy/Caddyfile.example
```

注意：`dns alidns` 需要 Caddy 带 `dns.providers.alidns` 模块。可以先检查：

```bash
caddy list-modules | grep dns.providers.alidns
```

如果 Caddy 是 systemd 启动，确保 `ALICLOUD_ACCESS_KEY` 和 `ALICLOUD_SECRET_KEY` 已经注入到 Caddy 服务环境里。

推荐用独立环境变量文件：

```bash
sudo nano /etc/caddy/alidns.env
```

写入：

```bash
ALICLOUD_ACCESS_KEY=<阿里云 AccessKey ID>
ALICLOUD_SECRET_KEY=<阿里云 AccessKey Secret>
```

设置权限并挂到 Caddy 服务：

```bash
sudo chmod 600 /etc/caddy/alidns.env
sudo systemctl edit caddy
```

写入：

```ini
[Service]
EnvironmentFile=/etc/caddy/alidns.env
```

然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart caddy
```

重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

确保阿里云安全组开放：

```text
80/tcp
443/tcp
```

## 8. 验证

健康检查：

```bash
curl http://127.0.0.1:4317/healthz
```

预期返回：

```json
{
  "ok": true,
  "store": "sqlite"
}
```

浏览器访问：

```text
https://tranfubar-app.tranfu.com/
```

没有真实上报时，页面应显示 0 和“暂无数据”。

写入接口验证：

```bash
source /etc/tranfubar-app/env

curl -X POST https://tranfubar-app.tranfu.com/api/node-heartbeat \
  -H 'content-type: application/json' \
  -H "x-team-token: $TEAM_INGEST_TOKEN" \
  -d '{
    "nodeId":"deploy-check",
    "userName":"Deploy Check",
    "teamId":"tranfu-ai",
    "providers":["codex"],
    "credentials":[]
  }'
```

再打开页面，应能看到 `Deploy Check` 这个节点。

清理测试节点：

```bash
sqlite3 /var/lib/tranfubar-app/usage.sqlite
```

进入 SQLite 后执行：

```sql
select data from usage_stores where id = 'tranfu-ai';
```

测试数据也可以在正式上报前直接删除整个库文件重新初始化：

```bash
sudo systemctl stop tranfubar-app
rm /var/lib/tranfubar-app/usage.sqlite
sudo systemctl start tranfubar-app
```

## 9. TranFuBar 个人端填写

每个成员安装 TranFuBar 后，打开设置里的“团队上报”：

```text
启用团队监控上报：开启
团队服务地址：https://tranfubar-app.tranfu.com
团队 ID：tranfu-ai
成员名称：成员真实姓名或常用名
团队 Token：填写 TEAM_INGEST_TOKEN
```

个人端只上报 Codex / Claude 的套餐、额度窗口、百分比、重置时间和节点信息；不会上传 API Key、Cookie、对话内容或源码内容。

## 10. 备份

SQLite 备份：

```bash
mkdir -p /var/backups/tranfubar-app
sqlite3 /var/lib/tranfubar-app/usage.sqlite ".backup '/var/backups/tranfubar-app/usage-$(date +%F-%H%M%S).sqlite'"
```

建议加每日 cron：

```bash
sudo crontab -e
```

加入：

```cron
30 2 * * * sqlite3 /var/lib/tranfubar-app/usage.sqlite ".backup '/var/backups/tranfubar-app/usage-$(date +\%F).sqlite'"
```

## 11. 发布检查清单

- GitHub 仓库已创建，服务器能拉取代码。
- DNS 解析到服务器公网 IP。
- Caddy 已代理到 `127.0.0.1:4317`。
- 服务器安装了 Node.js、npm、sqlite3。
- `/etc/tranfubar-app/env` 已配置。
- `TEAM_INGEST_TOKEN` 已生成。
- `systemctl status tranfubar-app` 为 running。
- `/var/log/tranfubar-app.log` 和 `/var/log/tranfubar-app.error.log` 可写入。
- `https://tranfubar-app.tranfu.com/` 可访问。
- TranFuBar 个人端能成功上报 heartbeat。

## 12. 当前仍需确认

- GitHub 仓库地址。
- 阿里云服务器公网 IP。
- 服务器部署账号。
- 团队 Token 最终值，由开发在服务器生成即可。

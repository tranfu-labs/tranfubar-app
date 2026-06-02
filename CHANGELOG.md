# TranFuBar App 版本记录

## v0.1.4-internal - 2026-06-02

本版本修复 Token 趋势面板被告警列表撑高的问题。

### 主要更新

- 团队看板的左右两列改为独立布局。
- 告警列表较长时，不再撑高左侧 Token 趋势面板。
- Token 趋势图和成员用量之间保持正常间距。

### 使用说明

- 服务器需要拉取最新 `main` 并重启服务。
- 本版本不要求团队成员重新安装 macOS 客户端。

## v0.1.3-internal - 2026-06-02

本版本修复事件列表排序和日汇总时间显示。

### 主要更新

- 事件列表改为按事件时间倒序显示，不再按写入顺序显示。
- 团队筛选会同步影响事件列表。
- `tranfubar-local-daily` 日汇总事件只显示日期，不再显示容易误解的汇总时间。

### 使用说明

- 服务器需要拉取最新 `main` 并重启服务。
- 本版本不要求团队成员重新安装 macOS 客户端。

## v0.1.2-internal - 2026-06-02

本版本优化官网和团队看板的品牌图标、分享预览和版本记录展示。

### 主要更新

- 官网页面增加版本更新记录模块。
- 使用 TranFu 官方品牌资源替换页面侧边栏图标。
- 补齐网页分享所需的标题、描述、预览图、favicon、touch icon 和 manifest。
- 修正静态资源返回类型，确保 PNG、ICO、manifest 和下载包能被浏览器和 IM 客户端正确识别。

### 使用说明

- 服务器需要拉取最新 `main` 并重启服务。
- 本版本不要求团队成员重新安装 macOS 客户端。

## v0.1.1-internal - 2026-06-02

本版本修复团队看板接入后没有用量数据的问题。

### 主要更新

- 个人端 TranFuBar 增加每日 Token 用量上报。
- 团队端可以展示今日 Token、Token 趋势、每个人当天用量。
- 团队端在只有接入心跳、暂时没有 Token 事件时，也会显示供应商和当前额度占用。
- 更新 macOS 内测安装包。

### 使用说明

- 服务器需要拉取最新 `main` 并重启服务。
- 团队成员需要重新下载安装新版 TranFuBar。
- 成员安装后等待一个刷新周期，通常约 5 分钟，团队看板会开始出现今日用量和趋势数据。

### 下载

[下载 TranFuBar macOS 内测安装包](https://github.com/tranfu-labs/tranfubar-app/releases/download/v0.1.1-internal/TranFuBar-unsigned-test-arm64.zip)

## v0.1.0-internal - 2026-06-02

第一个内部测试版本。

### 主要更新

- 提供 TranFuBar macOS 个人端内测包。
- 支持 Codex / Claude 本地套餐、额度窗口、剩余额度和重置时间展示。
- 支持团队上报配置：团队服务地址、团队 ID、成员名称、团队 Token。
- 提供团队端 Web 看板。
- 支持 SQLite 存储。
- 提供部署文档和本地运行说明。

### 已知限制

- macOS 安装包暂未签名和公证，首次打开会有安全提醒。
- 团队看板第一版主要展示接入状态和额度窗口，完整 Token 趋势在 v0.1.1 中补齐。

### 下载

[下载 TranFuBar macOS 内测安装包](https://github.com/tranfu-labs/tranfubar-app/releases/download/v0.1.0-internal/TranFuBar-unsigned-test-arm64.zip)

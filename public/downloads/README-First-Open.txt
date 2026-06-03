TranFuBar 内测包首次打开说明

当前包是 unsigned 内测包。第一次从浏览器下载后，macOS 可能提示无法验证开发者，导致双击 TranFuBar.app 打不开。

推荐方式：
1. 解压后保持 TranFuBar.app 和 Open-First.command 在同一个文件夹。
2. 双击 Open-First.command。
3. 系统提示时选择打开。
4. 脚本会解除当前文件夹内 TranFuBar.app 的下载隔离标记并启动应用。

手动方式：
xattr -dr com.apple.quarantine "/path/to/TranFuBar.app"
open "/path/to/TranFuBar.app"

根治方式是后续发布 Developer ID 签名并公证的正式包。

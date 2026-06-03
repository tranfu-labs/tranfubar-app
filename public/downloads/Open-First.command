#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
APP_PATH="$SCRIPT_DIR/TranFuBar.app"

echo "TranFuBar 内测包首次启动助手"
echo

if [[ ! -d "$APP_PATH" ]]; then
  echo "没有在当前文件夹找到 TranFuBar.app。"
  echo "请确认 Open-First.command 和 TranFuBar.app 在同一个文件夹。"
  echo
  read -k 1 "REPLY?按任意键关闭窗口..."
  exit 1
fi

xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
open "$APP_PATH"

echo "已尝试启动 TranFuBar。"
echo "如果顶部菜单栏没有出现图标，请到系统设置 > 隐私与安全性里选择仍要打开。"
echo
read -k 1 "REPLY?按任意键关闭窗口..."

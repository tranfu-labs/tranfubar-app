#!/usr/bin/env bash
set -euo pipefail

URL="${TRANFUBAR_ZIP_URL:-https://github.com/tranfu-labs/tranfubar-app/releases/latest/download/TranFuBar-unsigned-test-arm64.zip}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ZIP="$TMP_DIR/TranFuBar.zip"
curl -L --fail --progress-bar "$URL" -o "$ZIP"
ditto -x -k "$ZIP" "$TMP_DIR/unpacked"

APP_SRC="$TMP_DIR/unpacked/TranFuBar.app"
if [[ ! -d "$APP_SRC" ]]; then
  echo "未找到 TranFuBar.app，安装包可能不完整。" >&2
  exit 1
fi

INSTALL_DIR="${TRANFUBAR_INSTALL_DIR:-$HOME/Applications}"
mkdir -p "$INSTALL_DIR"

APP_DEST="$INSTALL_DIR/TranFuBar.app"
osascript -e 'tell application id "com.tranfu.tranfubar" to quit' >/dev/null 2>&1 || true
rm -rf "$APP_DEST"
ditto "$APP_SRC" "$APP_DEST"
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true
open "$APP_DEST"

echo "TranFuBar 已安装到 $APP_DEST 并尝试启动。"
echo "如果系统仍提示拦截，请到 系统设置 > 隐私与安全性 中选择仍要打开。"

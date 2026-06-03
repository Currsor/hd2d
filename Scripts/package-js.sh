#!/usr/bin/env bash
# package-js.sh — 打包前将 JavaScript/ 复制到 Content/JavaScript/
# 在 UE 打包 (Cook) 前手动运行，或配置为 Project Settings → Packaging → Pre-Build Steps
#
# 原因: 开发时 Content/JavaScript 是软链接 → ../JavaScript/
#       打包时 UE 不跟随软链接，需要实际文件在 Content/JavaScript/ 目录中
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$PROJECT_DIR/JavaScript"
DST="$PROJECT_DIR/Content/JavaScript"

if [ ! -d "$SRC" ]; then
    echo "[package-js] 错误: JavaScript/ 目录不存在，请先编译 TypeScript: cd TypeScript && npx tsc"
    exit 1
fi

# 如果是软链接，删掉；如果是目录，清空
if [ -L "$DST" ] || [ -d "$DST" ]; then
    rm -rf "$DST"
fi

# 复制
cp -a "$SRC" "$DST"
echo "[package-js] JavaScript/ → Content/JavaScript/ 复制完成 ($(du -sh "$DST" | cut -f1))"

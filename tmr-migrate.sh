#!/usr/bin/env bash
# tmr-migrate.sh — 将 HD_2D 单仓库拆分为 TMR 三仓库并推送到 GitHub
#
# 用法: ./tmr-migrate.sh
#
# 前提:
#   1. GitHub 上已创建三个空仓库:
#      https://github.com/Currsor/hd2d
#      https://github.com/Currsor/hd2d-content
#      https://github.com/Currsor/hd2d-plugins
#   2. SSH key 已配置或使用 HTTPS + token
#   3. 当前在 HD_2D 项目根目录

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${GREEN}===${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[X]${NC} $*"; exit 1; }

# ── 自动检测 ──
BRANCH=$(git rev-parse --abbrev-ref HEAD)
ROOT_DIR=$(pwd)

# 检测用 SSH 还是 HTTPS
GIT_HOST=""
if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated\|Hi "; then
    GIT_HOST="git@github.com:"
    say "检测到 SSH 可用"
else
    GIT_HOST="https://github.com/"
    say "使用 HTTPS（推送时需输入用户名和 token）"
fi

HD2D_URL="${GIT_HOST}Currsor/hd2d.git"
CONTENT_URL="${GIT_HOST}Currsor/hd2d-content.git"
PLUGINS_URL="${GIT_HOST}Currsor/hd2d-plugins.git"

# ── 检查前提 ──
if [ ! -f "HD_2D.uproject" ]; then
    err "请在 HD_2D 项目根目录运行此脚本"
fi

echo ""
echo -e "${GREEN}━━━ TMR 迁移脚本 ━━━${NC}"
echo ""
say "当前分支: $BRANCH"
say "传输协议: $GIT_HOST"
echo ""
warn "确认以下仓库已创建:"
echo "  $HD2D_URL"
echo "  $CONTENT_URL"
echo "  $PLUGINS_URL"
echo ""
read -p "继续? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    say "已取消"
    exit 0
fi

# ── 步骤 1: 提交当前未完成的改动 ──
say "步骤 1/5: 提交当前根仓库的未提交改动..."
rm -f .git/index.lock 2>/dev/null || true
git add -A
if git diff --cached --quiet 2>/dev/null; then
    say "  无待提交改动，跳过"
else
    git commit -m "chore: TMR 迁移前的最终提交"
    say "  已提交"
fi

# ── 步骤 2: 拆分 Content 仓库 ──
say "步骤 2/5: 创建 hd2d-content 仓库..."
if [ -f "Content/.git/HEAD" ]; then
    warn "  Content/.git 已存在，跳过创建（如需重做请先 rm -rf Content/.git）"
else
    cd "$ROOT_DIR/Content"
    git init
    git checkout -b "$BRANCH"
    git add -A
    git commit -m "Initial: hd2d-content 从 HD_2D 拆分
包含蓝图资产、JS 编译产物、动画、纹理、音频、关卡等"
    say "  Content 仓库已创建，commit: $(git rev-parse --short HEAD)"
    cd "$ROOT_DIR"
fi

# ── 步骤 3: 拆分 Plugins 仓库 ──
say "步骤 3/5: 创建 hd2d-plugins 仓库..."
if [ -f "Plugins/.git/HEAD" ]; then
    warn "  Plugins/.git 已存在，跳过创建（如需重做请先 rm -rf Plugins/.git）"
else
    cd "$ROOT_DIR/Plugins"
    git init
    git checkout -b "$BRANCH"
    git add -A
    git commit -m "Initial: hd2d-plugins 从 HD_2D 拆分
包含 Puerts、PaperZD、LogViewerPro — V8 预编译库不在仓库中"
    say "  Plugins 仓库已创建，commit: $(git rev-parse --short HEAD)"
    cd "$ROOT_DIR"
fi

# ── 步骤 4: 从根仓库移除 Content 和 Plugins ──
say "步骤 4/5: 从根仓库移除 Content/ 和 Plugins/ 的追踪..."
cd "$ROOT_DIR"

# 停止追踪（如果还在追踪的话）
git rm --cached -r Content/ 2>/dev/null || true
git rm --cached -r Plugins/ 2>/dev/null || true

# 确保 .gitignore 包含排除规则
if ! grep -q "TMR 多仓库管理" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# === TMR 多仓库管理 ===" >> .gitignore
    echo "# Content/ 和 Plugins/ 由独立仓库管理" >> .gitignore
    echo "Content/" >> .gitignore
    echo "Plugins/" >> .gitignore
fi

git add .gitignore .tmr.manifest

if git diff --cached --quiet 2>/dev/null; then
    say "  无新改动，跳过提交"
else
    git commit -m "chore: 迁移到 TMR — Content 和 Plugins 拆分到独立仓库
- Content/ → hd2d-content.git
- Plugins/ → hd2d-plugins.git
由 .tmr.manifest 管理三仓库关系。"
    say "  根仓库已更新"
fi

# ── 步骤 5: 推送所有仓库 ──
say "步骤 5/5: 推送到 GitHub..."

push_repo() {
    local dir="$1"
    local url="$2"
    local name="$3"
    cd "$ROOT_DIR/$dir"
    git remote remove origin 2>/dev/null || true
    git remote add origin "$url"
    say "  推送 $name ($(git rev-parse --short HEAD)) ..."
    git push -u origin "$BRANCH" --force 2>&1 && say "  $name ✓" || warn "  $name 推送失败: 请检查仓库是否存在及权限"
    cd "$ROOT_DIR"
}

push_repo "."    "$HD2D_URL"    "hd2d"
push_repo "Content" "$CONTENT_URL" "hd2d-content"
push_repo "Plugins" "$PLUGINS_URL" "hd2d-plugins"

# ── 完成 ──
echo ""
say "━━━ 迁移完成 ━━━"
echo ""
echo "仓库状态:"
echo "  hd2d:           ${HD2D_URL}  (根仓库，不含 Content/ 和 Plugins/)"
echo "  hd2d-content:   ${CONTENT_URL}  (Content/)"
echo "  hd2d-plugins:   ${PLUGINS_URL}  (Plugins/)"
echo ""
say "下一步:"
echo "  1. 在 UGit 中用 .tmr.manifest 测试克隆多仓库"
echo "  2. 新机器: git clone ${HD2D_URL} HD_2D && cd HD_2D && ./setup.sh"

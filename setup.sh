#!/usr/bin/env bash
# setup.sh — 一键初始化 HD_2D 项目
# 替代 README 中所有手动步骤：Git submodule → V8 下载 → 项目生成
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
UPLUGIN_DIR="$PROJECT_DIR/Plugins/Puerts"
V8_VERSION="v8_9.4.146.24"
V8_ARCHIVE="v8_bin_9_4_146_24.tgz"
V8_URL="$V8_URL_BASE/$V8_ARCHIVE"
V8_TARGET_DIR="$UPLUGIN_DIR/ThirdParty/$V8_VERSION"

# ── 颜色输出 ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
say()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
err()  { echo -e "${RED}[setup]${NC} $*"; exit 1; }

# ── 平台检测 ──
detect_platform() {
    case "$(uname -s)" in
        Darwin)
            ARCH="$(uname -m)"
            if [ "$ARCH" = "arm64" ]; then
                PLATFORM="macOS_arm64"
            else
                PLATFORM="macOS"
            fi
            ;;
        Linux)    PLATFORM="Linux" ;;
        MINGW*|MSYS*|CYGWIN*) PLATFORM="Win64" ;;
        *)        err "不支持的操作系统: $(uname -s)" ;;
    esac
    say "检测平台: $PLATFORM ($ARCH)"
}

# ── 步骤 1: Git Submodule ──
step_submodules() {
    say "步骤 1/3: 更新 Git Submodule..."
    if [ -f "$PROJECT_DIR/.gitmodules" ]; then
        (cd "$PROJECT_DIR" && git submodule update --init --recursive) || warn "Submodule 更新失败（如无 submodule 可忽略）"
    else
        say "  无 submodule，跳过"
    fi
}

# ── 步骤 2: 下载 V8 引擎 ──
step_v8() {
    say "步骤 2/3: V8 引擎 ($V8_VERSION)"

    # 已有则跳过
    if [ -f "$V8_TARGET_DIR/Lib/$PLATFORM/libwee8.a" ] || \
       [ -f "$V8_TARGET_DIR/Lib/$PLATFORM/wee8.lib" ] || \
       [ -f "$V8_TARGET_DIR/Lib/$PLATFORM/libwee8.dylib" ]; then
        say "  V8 已安装，跳过下载"
        return
    fi

    say "  下载 $V8_ARCHIVE ..."
    mkdir -p "$UPLUGIN_DIR/ThirdParty"

    local TMP_DIR
    TMP_DIR="$(mktemp -d)"
    trap "rm -rf $TMP_DIR" EXIT

    local DL_PATH="$TMP_DIR/$V8_ARCHIVE"
    if command -v curl &>/dev/null; then
        curl -L --progress-bar -o "$DL_PATH" "$V8_URL"
    elif command -v wget &>/dev/null; then
        wget -q --show-progress -O "$DL_PATH" "$V8_URL"
    else
        err "需要 curl 或 wget 来下载 V8"
    fi

    # 解压 tgz
    say "  解压到 $V8_TARGET_DIR ..."
    tar -xzf "$DL_PATH" -C "$TMP_DIR"

    # Puerts 希望目录名精确为 v8_9.4.146.24（注意点号）
    if [ -d "$TMP_DIR/v8_9_4_146_24" ] && [ ! -d "$TMP_DIR/$V8_VERSION" ]; then
        mv "$TMP_DIR/v8_9_4_146_24" "$TMP_DIR/$V8_VERSION"
    fi
    if [ -d "$TMP_DIR/$V8_VERSION" ]; then
        rm -rf "$V8_TARGET_DIR"
        mv "$TMP_DIR/$V8_VERSION" "$V8_TARGET_DIR"
    else
        err "解压后未找到 $V8_VERSION 目录，请检查压缩包结构"
    fi

    # 验证
    if [ -d "$V8_TARGET_DIR/Lib/$PLATFORM" ]; then
        say "  V8 安装完成 ✓"
    else
        err "V8 库文件未找到于 $V8_TARGET_DIR/Lib/$PLATFORM/"
    fi
}

# ── 步骤 3: 生成 IDE 项目 ──
step_generate() {
    say "步骤 3/3: 生成 IDE 项目文件..."

    local UE_ENGINE="${UE_ENGINE_ROOT:-}"
    if [ -z "$UE_ENGINE" ]; then
        # 尝试常见路径
        for candidate in \
            "/Users/Shared/Epic Games/UE_5.4" \
            "/Users/Shared/Epic Games/UE_5.5" \
            "/Program Files/Epic Games/UE_5.4" \
            "C:/Program Files/Epic Games/UE_5.4"; do
            if [ -d "$candidate/Engine/Build" ]; then
                UE_ENGINE="$candidate"
                break
            fi
        done
    fi

    if [ -z "$UE_ENGINE" ]; then
        warn "未找到 UE 引擎，跳过项目生成。请设置 UE_ENGINE_ROOT 环境变量后手动运行："
        warn "  <Engine>/Build/BatchFiles/<平台>/GenerateProjectFiles.sh HD_2D.uproject -Game -Engine"
        return
    fi

    say "  使用引擎: $UE_ENGINE"

    case "$(uname -s)" in
        Darwin)
            "$UE_ENGINE/Engine/Build/BatchFiles/Mac/GenerateProjectFiles.sh" \
                "$PROJECT_DIR/HD_2D.uproject" -Game -Engine
            ;;
        Linux)
            "$UE_ENGINE/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh" \
                "$PROJECT_DIR/HD_2D.uproject" -Game -Engine
            ;;
        MINGW*|MSYS*|CYGWIN*)
            "$UE_ENGINE/Engine/Build/BatchFiles/GenerateProjectFiles.bat" \
                "$PROJECT_DIR/HD_2D.uproject" -Game -Engine
            ;;
    esac

    say "项目生成完成 ✓"
}

# ── 主流程 ──
main() {
    echo ""
    say "━━━ HD_2D 项目初始化 ━━━"
    echo ""

    detect_platform
    step_submodules
    step_v8
    step_generate

    echo ""
    say "━━━ 初始化完成 ━━━"
    echo ""
    say "下一步:"
    echo "  1. 打开生成的 .xcproj / .sln 编译 Editor 目标"
    echo "  2. cd TypeScript && npm install   (可选，VSCode 类型提示)"
    echo "  3. 运行 ue-py-init 配置 Python 远程执行"
    echo ""
}

main "$@"

# setup.ps1 — HD_2D 项目一键初始化 (Windows PowerShell)
# 替代 README 中所有手动步骤：Git submodule → V8 下载 → 项目生成
#
# 用法: 在项目根目录右键 → "Open in Terminal"，然后运行:
#   .\setup.ps1
#
# 首次运行可能需要允许脚本执行:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

param(
    [string]$UE_ENGINE_ROOT = ""  # 可选：手动指定引擎路径
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # 加速 Invoke-WebRequest

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir  = (Get-Item $ScriptDir).Parent.FullName
$PluginDir   = "$ProjectDir\Plugins\Puerts"
$V8Version   = "v8_9.4.146.24"
$V8Url       = "https://github.com/puerts/backend-v8/releases/download/V8_9_4_146_24_240430/v8_bin_9_4_146_24.tgz"
$V8TargetDir = "$PluginDir\ThirdParty\$V8Version"

# ── 输出辅助 ──
function Say  { Write-Host "[setup] $args" -ForegroundColor Green }
function Warn { Write-Host "[setup] $args" -ForegroundColor Yellow }
function Err  { Write-Host "[setup] $args" -ForegroundColor Red; exit 1 }
function Step { Write-Host "`n─── $args ───" -ForegroundColor Cyan }

# ── 步骤 1: Git Submodule ──
function Invoke-Submodules {
    Step "步骤 1/3: Git Submodule"
    if (-not (Test-Path "$ProjectDir\.gitmodules")) {
        Say "无 submodule，跳过"
        return
    }
    try {
        Push-Location $ProjectDir
        git submodule update --init --recursive
        Pop-Location
        Say "Submodule 更新完成"
    } catch {
        Pop-Location
        Warn "Submodule 更新失败: $_ (如无 submodule 可忽略)"
    }
}

# ── 步骤 2: V8 引擎 ──
function Invoke-V8Download {
    Step "步骤 2/3: V8 引擎 ($V8Version)"

    # 已有则跳过
    $libPath = "$V8TargetDir\Lib\Win64\wee8.lib"
    if (Test-Path $libPath) {
        Say "V8 已安装于 $V8TargetDir，跳过下载"
        return
    }

    # 创建目标目录
    $null = New-Item -ItemType Directory -Force -Path "$PluginDir\ThirdParty"

    # 下载
    $tmpDir  = Join-Path $env:TEMP "hd2d_setup_$(Get-Random)"
    $dlPath  = "$tmpDir\v8_bin_9_4_146_24.tgz"
    $null = New-Item -ItemType Directory -Force -Path $tmpDir

    Say "下载 V8 预编译库 (~50MB)..."
    Say "源: $V8Url"
    try {
        Invoke-WebRequest -Uri $V8Url -OutFile $dlPath -UseBasicParsing
    } catch {
        Err "下载失败: $_`n请检查网络连接或手动下载: $V8Url"
    }

    # 解压 (Windows 10 1803+ 内置 tar)
    Say "解压到 $tmpDir ..."
    $extractDir = "$tmpDir\extracted"
    $null = New-Item -ItemType Directory -Force -Path $extractDir
    tar -xzf $dlPath -C $extractDir
    if ($LASTEXITCODE -ne 0) {
        Err "解压失败 (tar 退出码 $LASTEXITCODE)"
    }

    # Puerts 期望目录名为 v8_9.4.146.24（注意有点号）
    # 压缩包内可能是 v8_9_4_146_24（下划线）
    $extractedName = Get-ChildItem $extractDir -Directory | Select-Object -First 1
    if (-not $extractedName) {
        Err "解压后未找到任何目录，请检查压缩包结构"
    }
    $extractedPath = $extractedName.FullName

    if ((Split-Path -Leaf $extractedPath) -ne $V8Version) {
        Say "重命名: $(Split-Path -Leaf $extractedPath) → $V8Version"
    }

    # 移到目标位置
    if (Test-Path $V8TargetDir) {
        Remove-Item -Recurse -Force $V8TargetDir
    }
    Move-Item -Path $extractedPath -Destination $V8TargetDir

    # 清理
    Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

    # 验证
    if (Test-Path $libPath) {
        Say "V8 安装完成 ✓ ($V8TargetDir)"
    } else {
        Err "V8 库文件未找到于 $V8TargetDir\Lib\Win64\ — 请检查压缩包结构"
    }
}

# ── 步骤 3: 生成 Visual Studio 项目 ──
function Invoke-GenerateProject {
    Step "步骤 3/3: 生成 Visual Studio 项目"

    $engineRoot = $UE_ENGINE_ROOT
    if (-not $engineRoot) {
        # 尝试从注册表读取
        try {
            $regPath = "HKLM:\SOFTWARE\EpicGames\Unreal Engine"
            $installs = Get-ItemProperty -Path $regPath -ErrorAction Stop
            if ($installs.PSObject.Properties.Name -contains "5.4") {
                $engineRoot = $installs."5.4"
            }
        } catch {}

        # 尝试常见路径
        if (-not $engineRoot) {
            $candidates = @(
                "C:\Program Files\Epic Games\UE_5.4",
                "C:\Program Files\Epic Games\UE_5.5",
                "D:\Epic Games\UE_5.4",
                "$env:LOCALAPPDATA\Epic Games\UE_5.4"
            )
            foreach ($c in $candidates) {
                if (Test-Path "$c\Engine\Build\Build.bat") {
                    $engineRoot = $c
                    break
                }
            }
        }
    }

    if (-not $engineRoot -or -not (Test-Path "$engineRoot\Engine\Build\Build.bat")) {
        Warn "未找到 UE 引擎。跳过项目生成。"
        Warn "请手动运行:"
        Warn '  "<引擎>\Engine\Build\BatchFiles\GenerateProjectFiles.bat" "%CD%\HD_2D.uproject" -Game -Engine'
        Warn "或重新运行并指定路径:"
        Warn '  .\setup.ps1 -UE_ENGINE_ROOT "C:\Program Files\Epic Games\UE_5.4"'
        return
    }

    Say "引擎路径: $engineRoot"

    $genBat = "$engineRoot\Engine\Build\BatchFiles\GenerateProjectFiles.bat"
    $uproject = "$ProjectDir\HD_2D.uproject"

    Say "运行 GenerateProjectFiles..."
    & $genBat $uproject -Game -Engine

    if ($LASTEXITCODE -eq 0) {
        Say "项目生成完成 ✓"
        Say "解决方案: $ProjectDir\HD_2D.sln"
    } else {
        Warn "项目生成退出码 $LASTEXITCODE，请检查引擎路径"
    }
}

# ── 主流程 ──
function Main {
    Write-Host ""
    Write-Host "━━━ HD_2D 项目初始化 ━━━" -ForegroundColor Magenta
    Write-Host ""

    Invoke-Submodules
    Invoke-V8Download
    Invoke-GenerateProject

    Write-Host ""
    Write-Host "━━━ 初始化完成 ━━━" -ForegroundColor Magenta
    Write-Host ""
    Say "下一步:"
    Write-Host "  1. 打开 HD_2D.sln 编译 Editor 目标 (Development Editor | Win64)"
    Write-Host "  2. cd TypeScript; npm install   (可选，VSCode 类型提示)"
    Write-Host "  3. 启动 UE Editor 后运行 ue-py-init 配置 Python 远程执行"
    Write-Host ""

    # ue-py-config.json 的引擎路径提示
    if ($engineRoot) {
        Say "检测到引擎路径: $engineRoot"
        Say "ue-py-config.json 中已配置（若需修改请编辑该文件）"
    }
}

Main

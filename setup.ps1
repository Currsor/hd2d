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
$ProjectDir  = $ScriptDir
$PluginDir   = "$ProjectDir\Plugins\Puerts"
$V8Version   = "v8_9.4.146.24"

$V8DownloadUrl = "https://github.com/puerts/backend-v8/releases/download/V8_9.4.146.24__251225/v8_bin_9.4.146.24.tar.gz"

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
    $dlPath  = "$tmpDir\v8_bin_9.4.146.24.tar.gz"
    $null = New-Item -ItemType Directory -Force -Path $tmpDir

    Say "下载 V8 预编译库 (~360MB)..."
    Say "源: $V8DownloadUrl"
    
    try {
        Download-File -Uri $V8DownloadUrl -OutFile $dlPath -MaxRetries 3
        Say "下载完成"
    } catch {
        Warn "自动下载失败，请手动下载:"
        Warn "  $V8DownloadUrl"
        Warn "下载后解压到: $V8TargetDir"
        Warn "确保解压后包含: Lib\Win64\wee8.lib"
        Err "手动操作完成后重新运行此脚本即可跳过下载步骤"
    }

    # 解压
    Say "解压到 $tmpDir ..."
    $extractDir = "$tmpDir\extracted"
    $null = New-Item -ItemType Directory -Force -Path $extractDir

    $extractSuccess = $false
    
    # 方式1：使用 Windows 内置 tar
    try {
        Say "尝试使用 Windows 内置 tar 解压..."
        tar -xzf $dlPath -C $extractDir
        if ($LASTEXITCODE -eq 0) {
            $extractSuccess = $true
            Say "tar 解压成功"
        }
    } catch {
        Warn "Windows tar 解压失败: $_"
    }

    # 查找解压后的目录
    $extractedName = Get-ChildItem $extractDir -Directory | Select-Object -First 1
    if (-not $extractedName) {
        # 尝试在子目录中查找
        $extractedName = Get-ChildItem $extractDir -Recurse -Directory | Where-Object {
            $_.Name -like "*v8*" -or $_.Name -like "*V8*"
        } | Select-Object -First 1
    }
    
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
        Warn "V8 库文件未找到于 $V8TargetDir\Lib\Win64\"
        Warn "请检查压缩包结构，可能存在路径差异"
        Warn "手动修正后重新运行即可跳过此步骤"
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
            } elseif ($installs.PSObject.Properties.Name -contains "5.5") {
                $engineRoot = $installs."5.5"
            }
        } catch {}

        # 尝试常见路径
        if (-not $engineRoot) {
            $candidates = @(
                "C:\Program Files\Epic Games\UE_5.4",
                "C:\Program Files\Epic Games\UE_5.5",
                "D:\Epic Games\UE_5.4",
                "D:\Epic Games\UE_5.5",
                "$env:LOCALAPPDATA\Epic Games\UE_5.4",
                "$env:LOCALAPPDATA\Epic Games\UE_5.5"
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

    if (-not (Test-Path $uproject)) {
        Warn "未找到项目文件: $uproject"
        return
    }

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
}

Main
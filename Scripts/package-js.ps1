# package-js.ps1 — 打包前将 JavaScript/ 复制到 Content/JavaScript/
# Windows 版本，在 UE 打包前运行
#
# 用法: 在项目根目录 PowerShell 中运行
#   .\Scripts\package-js.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item $ScriptDir).Parent.FullName

$Src = Join-Path $ProjectDir "JavaScript"
$Dst = Join-Path $ProjectDir "Content\JavaScript"

if (-not (Test-Path $Src)) {
    Write-Host "[package-js] 错误: JavaScript\ 目录不存在，请先编译 TypeScript: cd TypeScript; npx tsc" -ForegroundColor Red
    exit 1
}

# 删除旧的（软链接或目录）
if (Test-Path $Dst) {
    Remove-Item -Recurse -Force $Dst -ErrorAction SilentlyContinue
}

# 复制
Copy-Item -Path $Src -Destination $Dst -Recurse
$size = (Get-ChildItem $Dst -Recurse | Measure-Object -Property Length -Sum).Sum
Write-Host "[package-js] JavaScript\ → Content\JavaScript\ 复制完成 ($([math]::Round($size/1MB, 1)) MB)" -ForegroundColor Green

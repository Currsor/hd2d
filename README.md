# HD_2D

A 2D game project built with Unreal Engine 5.4, featuring PaperZD, EnhancedInput, and Puerts (TypeScript/JavaScript scripting).

## 环境要求

- **Unreal Engine 5.4**
- **Node.js 18+**（用于 TypeScript 编译）
- **Xcode 15+**（仅 macOS）
- **Visual Studio 2022+**（仅 Windows）

## 首次克隆后初始化

### UGit + TMR（推荐）

项目使用 TMR 管理三个仓库（详见 [TMR.md](TMR.md)）。在 UGit 中选择「克隆多仓」，输入 manifest 仓库地址即可自动拉取全部仓库。

### 手动克隆

```bash
# 1. 克隆根仓库
git clone git@git.woa.com:your-group/hd2d.git HD_2D
cd HD_2D

# 2. 克隆子仓库（或通过 UGit TMR 自动同步）
git clone git@git.woa.com:your-group/hd2d-content.git Content
git clone git@git.woa.com:your-group/hd2d-plugins.git Plugins
```

克隆后在项目根目录运行一条命令完成初始化（submodule、V8 下载、项目生成）：

**macOS / Linux:**

```bash
./setup.sh
```

**Windows (PowerShell):**

```powershell
.\setup.ps1
```

> 首次运行 PowerShell 脚本需要先授权：`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
>
> 如引擎安装在非标准路径，可手动指定：`.\setup.ps1 -UE_ENGINE_ROOT "D:\Epic Games\UE_5.4"`

脚本会自动完成以下操作：

1. 更新 Git Submodule
2. 从 GitHub Releases 下载 V8 预编译库（~50MB，包含全部平台），解压到 `Plugins/Puerts/ThirdParty/v8_9.4.146.24/`
3. 生成 IDE 项目文件（Xcode `.xcworkspace` 或 Visual Studio `.sln`）

完成后：

```bash
# 4. 编译 Editor 目标（也可直接用 IDE 打开生成的项目文件编译）
# macOS:
/Path/To/UE_5.4/Engine/Build/BatchFiles/Mac/Build.sh \
  HD_2DEditor Mac Development -Project="$(pwd)/HD_2D.uproject"

# Windows:
"\Path\To\UE_5.4\Engine\Build\BatchFiles\Build.bat" ^
  HD_2DEditor Win64 Development "%CD%\HD_2D.uproject" -WaitMutex -FromMsBuild

# 5. 安装 TypeScript 依赖（可选，用于 VSCode 类型提示）
cd TypeScript && npm install
```

## V8 手动安装（备选）

如果自动化脚本无法使用（网络限制等），可手动下载 V8：

| 步骤 | 命令 |
|---|---|
| 下载 | 从 [puerts/backend-v8 Releases](https://github.com/puerts/backend-v8/releases/tag/V8_9_4_146_24_240430) 下载 `v8_bin_9_4_146_24.tgz` |
| 解压 | `cd Plugins/Puerts/ThirdParty && tar -xzf /path/to/v8_bin_9_4_146_24.tgz && mv v8_9_4_146_24 v8_9.4.146.24` |
| 验证 | `ls ThirdParty/v8_9.4.146.24/Lib/` 应包含各平台子目录 |

> `v8/` 和 `v8_*/` 目录已在 `.gitignore` 中，不会提交到 Git。

## 项目结构

```
HD_2D/
├── Source/HD_2D/              # C++ 游戏代码
│   ├── GameInstance/           # 游戏实例 + Puerts 引导
│   ├── RoleManagement/         # 角色管理子系统（状态机）
│   └── Character/              # CharacterBase、PlayerController、InputDataAsset
├── Content/JavaScript/         # JS 游戏逻辑（编译产物）
│   ├── MainGame.js             # 入口（启动 EventBus、注册 Logic、注入 Bridge）
│   ├── Mixin/                  # EventBus、DIContainer、LogicManager、BFL_JSLogic 桥接
│   ├── Logic/                  # 实体逻辑类（Currsor、Hero、Monster、Cube）
│   ├── Ability/                # 战斗能力系统（ComboAttack、Dash）
│   ├── Anim/                   # 动画状态同步引擎 + ABP Mixin
│   ├── RoleManagement/         # TS 侧角色管理桥接层
│   └── Config/                 # 集中注册（RegisterLogics、RegisterRoles）
├── Plugins/
│   ├── Puerts/                 # V8 JS 引擎集成
│   │   └── ThirdParty/v8_9.4.146.24/  # V8 预编译库
│   ├── PaperZD_5.4/            # 2D 角色动画
│   └── LogViewerPro/           # 编辑器日志查看器
├── TypeScript/                 # TypeScript 源码
├── Scripts/                    # 工具脚本
│   ├── setup.sh / setup.ps1    # 一键初始化
│   ├── ue_python.py            # UE Python 远程执行
│   └── knowledge/              # UE Python 知识库
├── setup.sh                    # macOS/Linux 初始化入口
├── setup.ps1                   # Windows 初始化入口
├── ue-py-config.json           # UE Python 配置
└── CLAUDE.md                   # Claude Code 项目指南
```

## Puerts 脚本开发

脚本入口为 `Content/JavaScript/MainGame.js`。调试模式下，通过 `UCurrsorGameInstance::bDebugMode` 启用 V8 调试器（默认端口 8080），配合 Chrome DevTools 连接调试。

JS 文件是 TypeScript 编译产物（`*.js` + `*.js.map`）。编辑前先检查 `TypeScript/` 目录是否存在对应的 `.ts` 源文件。

## Claude Code 自动化

本项目配置了 Claude Code 自动化工具：

| 工具 | 用途 | 触发方式 |
|---|---|---|
| `init` | 生成 / 更新 CLAUDE.md 架构文档 | "初始化项目文档" |
| `claude-md-check` | 检查 CLAUDE.md 是否过时 | "检查架构文档" |
| `ue-py-init` | 配置 UE Python 远程执行环境 | "初始化 ue-py" |
| `ue-py-run` | 在 UE Editor 内执行 Python | "在编辑器里运行..." |
| `ue-py-extend` | Python API 不足时写 C++ 扩展 | "帮我打通 XX 模块" |
| `ue-py-evolve` | 将踩坑经验沉淀到知识库 | "沉淀这些经验" |

## 常见问题

### 编译报错：`ld: symbol(s) not found for architecture arm64`

确保 V8 预编译库是 **arm64 架构**版本，不是 x86_64。运行 `file Plugins/Puerts/ThirdParty/v8_9.4.146.24/Lib/macOS_arm64/libwee8.a` 确认。

### 编译报错：`v8.h file not found`

确保 V8 解压路径与 `JsEnv.Build.cs` 中的 `UseV8Version` 匹配。路径应为 `Plugins/Puerts/ThirdParty/v8_9.4.146.24/`。

### macOS 上 dylib 被 Gatekeeper 拦截

```bash
xattr -r -d com.apple.quarantine Plugins/Puerts/ThirdParty/*.dylib
```

### Windows: PowerShell 脚本无法运行

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

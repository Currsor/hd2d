# HD_2D

A 2D side-scroller action game built with Unreal Engine 5.4, featuring PaperZD, EnhancedInput, and Puerts (TypeScript/JavaScript scripting).

## 仓库结构

| 仓库 | 内容 | 地址 |
|---|---|---|
| `hd2d-manifest` | 项目文档、初始化脚本、TMR 清单 | [Currsor/hd2d-manifest](https://github.com/Currsor/hd2d-manifest) |
| `hd2d` | C++ 源码 + TypeScript + JS 编译产物 | [Currsor/hd2d](https://github.com/Currsor/hd2d) |
| `hd2d-content` | 蓝图资产、动画、纹理、关卡 | [Currsor/hd2d-content](https://github.com/Currsor/hd2d-content) |
| `hd2d-plugins` | 第三方插件 (14MB, 不含 V8) | [Currsor/hd2d-plugins](https://github.com/Currsor/hd2d-plugins) |

`Content/JavaScript/` 通过软链接指向 `JavaScript/`，JS 编译产物在 hd2d 仓库内管理，打包时通过脚本复制。

## 环境要求

- **Unreal Engine 5.4**
- **Node.js 18+**（用于 TypeScript 编译）
- **Xcode 15+**（仅 macOS）
- **Visual Studio 2022+**（仅 Windows）

## 首次克隆后初始化

```bash
git clone git@github.com:Currsor/hd2d-manifest.git HD_2D
cd HD_2D
./setup.sh
```

Windows：

```powershell
git clone git@github.com:Currsor/hd2d-manifest.git HD_2D
cd HD_2D
.\setup.ps1
```

脚本自动完成：克隆三个子仓库 → 下载 V8 → 编译 TypeScript → 创建 Content/JavaScript 软链接 → 生成 IDE 项目。

## 日常开发

```bash
# TypeScript 编译（自动 watch 模式）
cd TypeScript && npx tsc --watch

# 提交代码（hd2d 仓库）
cd HD_2D && git add -A && git commit -m "feat: ..." && git push

# 提交资产（hd2d-content 仓库）
cd HD_2D/Content && git add -A && git commit -m "feat: ..." && git push

# 提交插件变更（极低频）
cd HD_2D/Plugins && git add -A && git commit -m "chore: ..." && git push
```

## 打包

打包前运行复制脚本，确保 JS 文件进入 `Content/JavaScript/`（打包时 UE 不跟随软链接）：

```bash
# macOS / Linux
./Scripts/package-js.sh

# Windows
.\Scripts\package-js.ps1
```

也可以设为 UE 项目的 Pre-Build Step（`Project Settings → Packaging → Advanced → Pre-Build Steps`）。

打包后恢复软链接：

```bash
# macOS / Linux
rm -rf Content/JavaScript && ln -s ../JavaScript Content/JavaScript

# Windows
cmd /c "rmdir Content\JavaScript && mklink /J Content\JavaScript ..\JavaScript"
```

## 项目结构

```
HD_2D/
├── HD_2D.uproject
├── Source/HD_2D/              # C++ 游戏代码
│   ├── Character/              # CharacterBase、PlayerController、InputDataAsset
│   ├── GameInstance/           # 游戏实例 + Puerts 引导
│   └── RoleManagement/         # 角色管理子系统（状态机）
├── TypeScript/Scripts/         # TypeScript 源码
│   ├── Bridge/                 # SubsystemBridge 基类
│   ├── Mixin/                  # EventBus、DIContainer、LogicManager、GameObjectBase
│   ├── Logic/                  # 实体逻辑类
│   ├── Ability/                # 战斗能力系统（ComboAttack、Dash）
│   ├── Anim/                   # 动画状态同步引擎
│   ├── RoleManagement/         # TS 角色管理桥接层
│   └── Config/                 # 集中注册（RegisterLogics、RegisterRoles）
├── JavaScript/                 # TS 编译产物（hd2d 仓库管理）
├── Content/                    # 蓝图资产（hd2d-content 仓库管理）
│   ├── Blueprints/
│   ├── Assets/
│   ├── Maps/
│   └── JavaScript → 软链接 → ../JavaScript/
├── Plugins/                    # 第三方插件（hd2d-plugins 仓库管理）
├── Scripts/                    # 工具脚本
│   ├── ue_python.py            # UE Python 远程执行
│   ├── package-js.sh / .ps1    # 打包前 JS 复制
│   └── knowledge/              # UE Python 知识库
├── setup.sh / setup.ps1        # 一键初始化
└── ue-py-config.json           # UE Python 配置
```

## V8 手动安装（备选）

| 步骤 | 命令 |
|---|---|
| 下载 | [puerts/backend-v8 Releases](https://github.com/puerts/backend-v8/releases/tag/V8_9_4_146_24_240430) → `v8_bin_9_4_146_24.tgz` |
| 解压 | `cd Plugins/Puerts/ThirdParty && tar -xzf v8.tgz && mv v8_9_4_146_24 v8_9.4.146.24` |
| 验证 | `ls v8_9.4.146.24/Lib/` 应包含各平台子目录 |

## Puerts 脚本开发

TS 源码在 `TypeScript/Scripts/`，编译输出到 `JavaScript/`。V8 调试器通过 `UCurrsorGameInstance::bDebugMode` 启用（端口 8080，Chrome DevTools 连接）。

## Claude Code 自动化

| 工具 | 用途 |
|---|---|
| `contract-check` | 检查 C++ / TS / Blueprint 三层契约一致性 |
| `ue-py-init` | 配置 UE Python 远程执行环境 |
| `ue-py-run` | 在 UE Editor 内执行 Python |
| `ue-py-extend` | Python API 不足时写 C++ 扩展 |
| `ue-py-evolve` | 将踩坑经验沉淀到知识库 |
| `claude-md-check` | 检查 CLAUDE.md 是否过时 |

## 常见问题

### 编译报错：`ld: symbol(s) not found for architecture arm64`

确保 V8 是 arm64 版本：`file Plugins/Puerts/ThirdParty/v8_9.4.146.24/Lib/macOS_arm64/libwee8.a`

### 编译报错：`v8.h file not found`

V8 路径应为 `Plugins/Puerts/ThirdParty/v8_9.4.146.24/`，与 `JsEnv.Build.cs` 中 `UseV8Version` 一致。

### macOS 上 dylib 被 Gatekeeper 拦截

```bash
xattr -r -d com.apple.quarantine Plugins/Puerts/ThirdParty/*.dylib
```

### Windows: PowerShell 脚本无法运行

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

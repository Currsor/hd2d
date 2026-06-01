# TMR 多仓库管理

HD_2D 使用 TMR（Tencent Multiple Repository Management）管理三个 Git 仓库。清单文件为项目根目录的 `.tmr.manifest`。

## 仓库划分

```
HD_2D/                          ← TMR 工作区
│
├── .tmr.manifest               ← TMR 清单（在 hd2d 仓库中）
│
├── [hd2d]                      ← Git 仓库: hd2d.git
│   ├── HD_2D.uproject          项目入口
│   ├── Source/                 C++ 源码
│   ├── TypeScript/             TS 游戏逻辑
│   ├── Config/                 项目配置（非内容）
│   ├── Scripts/                工具脚本（ue_python.py, 知识库）
│   ├── setup.sh / setup.ps1    一键初始化
│   └── CLAUDE.md / README.md   项目文档
│
├── Content/     ← Git 仓库: hd2d-content.git
│   ├── Blueprints/             蓝图资产
│   ├── JavaScript/             JS 编译产物
│   ├── Maps/                   关卡
│   └── ...                     动画、纹理、音频等
│
└── Plugins/     ← Git 仓库: hd2d-plugins.git
    ├── Puerts/                 V8 JS 引擎集成
    ├── LogViewerPro/           编辑器日志查看器
    └── Marketplace/
        └── PaperZD_5.4/        2D 动画系统
```

## 分工与权限

| 仓库 | 谁主要维护 | 变更频率 | 仓库大小 |
|---|---|---|---|
| `hd2d` | 程序员 | 高频（每天） | < 10 MB |
| `hd2d-content` | 策划 / 美术 | 中频 | 26 MB → 持续增长 |
| `hd2d-plugins` | 程序员 | 极低（升级插件时） | 极小（不含 V8） |

## 初始化（新机器首次配置）

### 方式一：UGit 客户端（推荐）

1. 打开 UGit，选择「克隆多仓」
2. 输入 manifest 仓库地址 `git@git.woa.com:your-group/hd2d.git`，分支 `main`
3. UGit 自动读取 `.tmr.manifest` 并拉取全部三个仓库
4. 运行 `./setup.sh` 下载 V8 引擎库

### 方式二：命令行

```bash
# 1. 克隆根仓库
git clone git@git.woa.com:your-group/hd2d.git HD_2D
cd HD_2D

# 2. 使用 TMR 同步子仓库（或手动 clone）
# 在 UGit 中右键 → TMR → 同步
# 或手动：
git clone git@git.woa.com:your-group/hd2d-content.git Content
git clone git@git.woa.com:your-group/hd2d-plugins.git Plugins

# 3. 下载 V8
./setup.sh    # macOS/Linux
.\setup.ps1   # Windows
```

## 日常操作

### 程序员

```bash
# 日常提交：hd2d 和 hd2d-content 都可能有改动
cd HD_2D           # hd2d 仓库
git add -A && git commit -m "feat: ..."

cd Content          # hd2d-content 仓库
git add -A && git commit -m "feat: 更新 Currsor 动画蓝图"

# 在 UGit 中可以一次性看到三个仓库的改动状态
```

### 策划 / 美术

```
只需要关注 Content/ 目录，UGit 会显示 hd2d-content 仓库的变更。
不需要了解 Source/ 或 TypeScript/ 的代码。
不需要安装 UE 编译环境 — 用编译好的 Editor 即可。
```

## 迁移（从单仓库拆分）

如果当前还在单仓库，执行以下步骤完成拆分：

```bash
# === 前提：在 Git 服务器上创建好三个空仓库 ===
# git@git.woa.com:your-group/hd2d.git
# git@git.woa.com:your-group/hd2d-content.git
# git@git.woa.com:your-group/hd2d-plugins.git

# === 1. 拆分 Content ===
cd HD_2D/Content
git init
git add -A
git commit -m "Initial: hd2d-content 从 hd2d 拆分"
git remote add origin git@git.woa.com:your-group/hd2d-content.git
git push -u origin main

# === 2. 拆分 Plugins ===
cd HD_2D/Plugins
git init
git add -A
git commit -m "Initial: hd2d-plugins 从 hd2d 拆分"
git remote add origin git@git.woa.com:your-group/hd2d-plugins.git
git push -u origin main

# === 3. 清理根仓库 ===
cd HD_2D
git rm --cached -r Content/     # 停止追踪，保留本地文件
git rm --cached -r Plugins/      # 停止追踪，保留本地文件
# .gitignore 中已添加 Content/ 和 Plugins/

git add -A
git commit -m "chore: 迁移到 TMR，Content 和 Plugins 拆分到独立仓库"
git push
```

迁移后，`Content/` 和 `Plugins/` 各自拥有独立的 Git 历史和 `.git` 目录，根仓库不再追踪它们。UGit + TMR 负责把它们作为一个整体工作区管理。

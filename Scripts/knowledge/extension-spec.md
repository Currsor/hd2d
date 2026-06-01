# Editor 能力扩展工程规范（extension-spec）

> Phase 0→5 完整流程定义。通用知识见 knowledge-base。

---

## 约束

| 约束 | 说明 |
|------|------|
| 两层实现 | 先纯 Python，不行再写 UFUNCTION |
| 引擎最小化修改 | 简单（≤1 文件、≤20 行）可自行实施；复杂需人工确认 |
| 验证必须真实执行 | 禁止预测或编造结果 |

---

## 基础概念：两面四维度

任何模块都有两面：

- **资产面** — Agent 能否完整读写该模块的持久化数据
- **控制面** — Agent 能否触发并观测该模块在 Editor 中的所有操作

本质原则：**人在编辑器里能做的，Agent 都要能做并知道结果。**

每面各有两个维度，共四个。Phase 1 读完源码后正式评估。

### 资产面

#### DA：数据访问难度——读写持久化数据需要多少基础设施？

| 层级 | 判据 | 典型 |
|---|---|---|
| **DA0** | 反射 API 能直接读写 | `get/set_editor_property`、`export_text`+`import_text` |
| **DA1** | 需要绕过 protected 或手拼 struct 字符串 | 薄 C++ 封装（create / append / set-by-name） |
| **DA2** | 类型错误会 silent fail，需要 schema 查询 | 类型安全 setter + validator |

升级信号：
- DA0 → DA1：反射 API 无法直接表达目标操作，需要手动构造中间表示
- DA1 → DA2：手动构造时类型错误不报错而是静默产生错误结果

#### DV：数据可见度——Agent 能看到多少持久化状态的真相？

评估的不是"引擎底层有没有额外数据"（几乎所有系统都不是 DV0 如果那样定义），而是"Agent 通过反射 + 已有扩展 API 实际能读到什么程度"。

| 层级 | 判据 | 典型 |
|---|---|---|
| **DV0** | 可用通道覆盖完整，属性读写能完全控制资产状态 | CurveTable、DataTable（有 JSON 通道）、GameplayTag |
| **DV1** | 大部分可控，有已知盲区需额外处理 | BehaviorTree（SelfActor 注入、Children 顺序）、GAS（属性计算值） |
| **DV2** | 可控范围只是子集，存在反射碰不到的关键状态 | Blueprint 图编辑（PureState、编译字节码）、Material（shader 编译、Expression 连接链） |

升级信号：
- DV0 → DV1：发现存在反射能读到但需要额外处理才能正确使用的状态
- DV1 → DV2：发现存在反射根本碰不到但影响行为的关键状态

### 控制面

#### CA：操作可达性——触发一个 Editor 操作需要多少基础设施？

| 层级 | 判据 | 典型 |
|---|---|---|
| **CA0** | 已有 Python API 一行调用即可触发 | `EditorLevelLibrary.editor_play_simulate()`、`EditorAssetLibrary.save_asset()` |
| **CA1** | 需要拼 Editor Command 或手动注入 UI 隐含上下文 | 右键菜单操作需要先设置选中对象、触发 Slate 事件需要构造参数 |
| **CA2** | 操作只有 UI 入口，完全没有程序化调用方式 | 某些 Editor Utility Widget 按钮、特定面板的拖拽操作 |

升级信号：
- CA0 → CA1：API 存在但调用前需要手动构造 UI 层隐含的前置状态
- CA1 → CA2：找不到可包装的程序化入口，操作深度绑定 UI 交互

#### CO：结果可观测性——Agent 能否知道操作的结果？

| 层级 | 判据 | 典型 |
|---|---|---|
| **CO0** | 操作有同步返回值或状态可立即查询 | 编译返回 success/fail、PIE 运行状态有 API 查询 |
| **CO1** | 结果可获取但需要轮询或延迟读取 | 异步编译需要等回调/轮询状态、热重载后需要重新查询 |
| **CO2** | 结果只有视觉反馈，没有程序化接口可读 | Debug 高亮只在 Viewport 渲染、Profiler 数据只在面板显示 |

升级信号：
- CO0 → CO1：操作结果存在但不是立即可用，需要等待或主动查询
- CO1 → CO2：操作完成后的状态变化没有程序化接口可读

### 工作量矩阵

**资产面（DA × DV）**：

| | DV0（完整） | DV1（有盲区） | DV2（只是子集） |
|---|---|---|---|
| **DA0** | 最轻——纯 Python | Python + 白名单处理 | 需要先搞清楚盲区再决定 |
| **DA1** | 薄 C++ 封装 | C++ 封装 + 验证逻辑 | C++ 封装 + 盲区暴露 |
| **DA2** | schema 查询 + validator | 全套工具链 | 最重——可能需要引擎修改 |

**控制面（CA × CO）**：

| | CO0（同步可观测） | CO1（需轮询/延迟） | CO2（不可观测） |
|---|---|---|---|
| **CA0** | 最轻——调用即可 | 调用 + 等待/轮询逻辑 | 能触发但不知道结果，需要补观测通道 |
| **CA1** | 需要上下文注入 | 上下文注入 + 等待逻辑 | 上下文注入 + 补观测通道 |
| **CA2** | 需要补操作入口 | 补入口 + 补等待 | 最重——操作和观测都要从零补 |

整体工作量由四个维度中最高的层级决定上限。

**防止过度工程**：X2 不代表必须补到 X0。判断标准是用例数——项目中有多少场景需要这个能力？用例数 = 0 就不做，很少就低优处理。方案再优雅，没人用就是浪费。

---

## Phase 0: 了解现状 + 汇报

目标：搞清楚"已经有什么"和"还缺什么"，向用户汇报后再进 Phase 1。

### 第一步：了解现状

读已有文档——knowledge-base、modules/ 下的模块文档、已有 UFUNCTION 列表。判断覆盖程度：

- 完全覆盖 → 只补文档
- 部分覆盖 → 只补缺失
- 无覆盖 → 完整补全

如果全新模块没有已有文档，标"无覆盖"，不卡住。

### 第二步：识别两面

基于已有文档（或直觉），初步识别资产面和控制面各涉及什么。不需要完整，Phase 1 读源码时补全。

作用：提醒自己后续读源码时 Runtime 和 Editor 模块都要看。

### 第三步：向用户汇报

**必须汇报后才能进 Phase 1。**

汇报内容：

```
## 模块探索汇报

目标模块：<名称>
覆盖判断：完全 / 部分 / 无覆盖

已读文件：
  • knowledge-base.md              §<相关小节>
  • modules/<module>.md            ← 已有文档（如存在）
  • <其他相关文档>

已有认知：
  • 核心 UCLASS / USTRUCT（带 header 文件名）
  • 已有 UFUNCTION（数量 + 名称）
  • 已知坑 / 注意事项

两面初步识别：
  • 资产面涉及：<这个模块管理什么持久化数据>
  • 控制面涉及：<这个模块在 Editor 中提供什么操作>

主要不确定 / 需要 Phase 1 读源码澄清的点（≤3 条）：
  • ...
```

---

## Phase 1: 读源码 + 信息完整性审计

**产出**：`_workdocs/<module>-audit.md`（和 modules/ 同级）。

### 为什么要写

extend 跑几个小时。Phase 1 建立的系统理解到后面会被大量测试输出挤掉。把思考落盘，后续随时可重新加载。这不是最终交付物，是你的外部记忆。

### 怎么读

资产面和控制面的代码都要看：

- Runtime 模块里的类定义、Serialize、PostLoad → 资产面
- Editor 模块里的操作逻辑 → 控制面

### 资产面核心问题

**如果你把反射能读到的所有 UPROPERTY 全部读出来，写回一个空对象，得到的东西和原来完全等价吗？**

这个问题拆开来看：

1. **这个类的 Serialize() 里写了什么？** 和 UPROPERTY 列表对比。多出来的部分就是"文件里有但反射看不到"的状态。这些状态重要吗？影响行为吗？

2. **加载之后发生了什么？** 看 PostLoad()、PostEditChange()。有没有"文件里没有但加载后凭空出现"的数据？

3. **反射枚举出来的属性，和这个对象在编辑器里的全部可观测行为，之间有没有 gap？** 两个节点属性完全一样但行为不同——那区别一定藏在反射看不到的地方。

4. **这个系统的"结构"存在哪里？** 节点之间的关系是显式的（一个 connections 数组）还是隐式的（分散在各节点的指针字段里）？

### 控制面核心问题

**人在编辑器里对这个模块做的每个操作，Agent 有没有程序化的入口可以触发？触发后能否知道结果？**

具体：
- 这个模块在 Editor 中注册了哪些操作（菜单项、按钮、快捷键、Commandlet）？
- 哪些操作有 Python/C++ API 入口，哪些只有 UI？
- 操作结果是同步返回的，还是异步的，还是只有视觉反馈？
- **操作的前置条件是什么？** 有些操作需要特定状态才能执行（选中对象、PIE 在跑、资产已加载）。不满足前置条件时 API 可能静默失败或抛莫名异常。
- **操作的副作用是什么？** 触发一个操作后除了主要结果还会改变什么？（compile 后 CDO 更新、save 后触发 source control checkout、某些操作会 dirty 关联资产）

### 写什么进 workdoc

没有固定模板。有发现就记录：

- **核心类和职责** — 给后续步骤做参考
- **属性全景（资产面）** — UPROPERTY、Serialize() 额外写的、PostLoad 注入的。三者差集 = 盲区
- **操作清单（控制面）** — Editor 中能做什么、Agent 能不能触发、能不能观测结果
- **可观测性标记** — 重要属性/状态标注 Agent 怎么读到它
- **影响链** — 改 X 会联动什么
- **关注清单** — Phase 2 实测中需要重点验证的点
- **自由笔记** — "这个地方反直觉"、"这个可能有坑"

### 正式四维度评估

读完源码后在 workdoc 中输出四维度评估（定义见 §基础概念）：

```
## <模块名> 能力评估

| 面 | 维度 | 评分 | 理由 |
|---|---|---|---|
| 资产 | DA（数据访问难度） | DA? | ... |
| 资产 | DV（数据可见度） | DV? | ... |
| 控制 | CA（操作可达性） | CA? | ... |
| 控制 | CO（结果可观测性） | CO? | ... |

整体工作量上限：?（哪个维度是瓶颈）
```

### 经验参考（不是 checklist）

**资产面常见盲区**——不看源码就不知道它存在的隐藏状态：
- 自定义 Serialize 写入的非 UPROPERTY 二进制数据（动画压缩轨道、Niagara 字节码、DataTable 行数据）
- PostLoad 注入的状态（BB 的 SelfActor、BlendSpace 的插值网格）
- private enum/flag 决定行为但反射不暴露（蓝图 Cast 节点的 PureState）
- 数组顺序即执行顺序（BT Children、Material pin）
- 编译产物和源码分离（Blueprint 字节码、Material shader）
- 指针链拓扑不在单个节点属性里（Material Expression 连接、Blueprint Pin LinkedTo）



**容易忽略的更深层维度**：

- **跨对象约束**：一个对象的有效状态可能取决于它引用的其他对象。问自己：如果我只复刻了这一个对象，它引用的东西还成立吗？
- **派生状态**：有些字段从别的字段算出来。改了源字段后派生字段会不会自动更新？
- **Serialize 的条件分支**：可能有版本迁移逻辑、条件跳过。我看到的是唯一路径还是多条分支？
- **非持久化但影响行为的状态**：完全不序列化，每次启动时重新生成。不知道它存在就不知道需要触发什么来重建。

你的目标系统可能有不在这个列表里的新模式。上面的思考方式能帮你发现它们。


---

## Phase 2: 实际验证

**前置**：Editor 运行中 + Python Remote Execution 就绪。开始前重读 `_workdocs/<module>-audit.md`。

### 做什么

验证 Agent 对目标系统的实际控制能力——资产面和控制面都要验。

**资产面**：逐属性验证读写 + 审计中标记的盲区。**控制面**：逐操作验证能否触发 + 结果能否观测。

两面不是分开做的——属性验证时自然会碰到需要触发编译、保存等控制面操作，控制面验证时也会发现新的属性行为。

资产面基本动作：

```
对每个核心类：
  枚举全部属性（反射）
  逐属性验证 read/write：
    get_editor_property → 若报 protected 则 get_property_value_unchecked
    set_editor_property → 若报 protected 则 set_property_value_from_string
    Enum 无 Python 绑定：字符串读写
  对审计中标记的盲区：
    构造测试验证"这个信息是否影响行为"+"Agent 能否读取/控制它"
  create → save → reload → 验证持久化
```

控制面基本动作：

```
对 Phase 1 识别的每个 Editor 操作：
  尝试通过 Python 触发 → 成功？静默失败？报错？
  触发后结果能否查到 → 同步返回值？需要轮询？只有视觉反馈？
  标记：能触发+能观测 / 能触发+不能观测 / 不能触发
```

### 盲区验证

对审计中每个"可能看不到"的点，构造实验确认：
- 怀疑 PostLoad 会注入状态 → 创建空资产 save/reload 观察变化
- 怀疑某个 private flag 影响行为 → 在编辑器中手动创建两个不同状态的对象，看 Python 层能否区分
- 怀疑连接信息读不出来 → 创建已连接的节点，验证连接能否通过 Python 遍历和重建
- 怀疑数组顺序敏感 → 交换顺序后验证行为变化

无法观测或控制 → 标记 Phase 3 必须补。

### 复刻验证（可选）

对复杂系统，推荐做一次"选一个真实资产 → 用当前 API 复刻 → 对比"。这能快速暴露遗漏的维度。

对比手段按可用性选择：
- 首选：`FObjectWriter(bDoDelta=false)` 二进制全量序列化对比（需要先暴露为 UFUNCTION）
- 备选：UE Editor 内置 Diff（Edit → Diff）
- 最低：编辑器内人工对比

diff 中发现的非预期差异就是盲区。预期差异（GUID、时间戳）加白名单。

### 更新 workdoc

Phase 2 过程中发现新信息随时更新 workdoc。这份文档是活的。

### Phase 2 的产出

- 更新后的 `_workdocs/<module>-audit.md`（可观测性标记从"未知"变为"已验证"）
- 验证脚本（保存到 `verification/test_<module>.py`）——后续 Phase 5 复审和引擎升级回归都用它
- Phase 3 待补清单（如果有缺口）——资产面（反射碰不到的属性）和控制面（不可触发或不可观测的操作）分开列

验证脚本格式：assert 风格，一个能力一个 check。不依赖 pytest（要在 UE Python 环境直接跑）：

```python
passed = 0; failed = 0

def check(name, condition, detail=''):
    global passed, failed
    if condition:
        passed += 1; print(f'PASS: {name}')
    else:
        failed += 1; print(f'FAIL: {name} -- {detail}')

# ... 逐能力验证 ...

check('read Track.DisplayName',
      track.get_editor_property('DisplayName') != '',
      'DisplayName is empty')

print(f'\nTotal: {passed + failed}, PASSED: {passed}, FAILED: {failed}')
if failed > 0:
    raise SystemExit(1)
```

**硬性要求**：所有结果来自 Editor 实际执行。禁止预测或编造。

---

## Phase 3: 补基础设施

仅当 Phase 2 发现缺口时进入。资产面缺口（属性读不到/写不了）和控制面缺口（操作触发不了/结果观测不到）都走同一条路径。

**选择路径（按优先级）**：直接用已有 API → 改一行源头解决 → 写 UFUNCTION（包装属性访问或 Editor 内部操作） → 标不可。

**"标不可"判据**：需修改引擎核心架构且收益不足以支撑侵入成本时才标。必须写明原因和替代方案。Phase 5 复审会验证。

**UFUNCTION 规范**：
- 位置：项目插件中，按功能模块组织（一个模块一个 Library）
- 继承 `UBlueprintFunctionLibrary`
- 编译后自动反射到 Python / Blueprint / Remote Control API

**引擎修改注释规范**：修改引擎代码时必须用注释包裹改动行，方便引擎升级时识别。例：
```cpp
// [Project-Extended] begin (author): reason
...
// [Project-Extended] end
```

**写完后**：关 Editor → 编译 → 重启 → 确认 Remote Execution → 重新验证改动点（不需从头跑全部 Phase 2）。

**更新 workdoc**：对应条目可观测性标记从"不可读"改为"可读/可写"。

---

## Phase 4: 输出能力文档

### 质量原则

**"下一个 Agent 没有这段信息会踩坑还是重复探索？"** 会→写，不会→删。

### 内容方向

能力文档是**消费者视角**——给未来 Agent 用。从 workdoc 中提炼经验证的结论，不照搬过程记录。

应该覆盖的方向：

| 方向 | 判断标准 |
|------|---------|
| **能做什么** | 能力表格（状态 + 方式），让 Agent 快速判断一件事能不能做、怎么做 |
| **怎么做** | 关键操作的代码示例或调用模式 |
| **什么坑** | 实测踩过的陷阱、反直觉行为、容易犯的错。包括反射层盲区——哪些信息看起来完整实际上缺失，避免下一个 Agent 产生"diff 绿了 = 完全一致"的假设 |
| **改了影响什么** | 修改某个属性/资产后的联动影响 |
| **扩展了什么** | 写了哪些 UFUNCTION、改了哪些引擎代码、为什么原生不够用 |
| **覆盖范围** | 本模块未覆盖的邻近资产用 ❌ 显式占位 |

不是每个方向都必须有大段内容。简单模块可能只需要能力表格 + 几个坑。

### 格式约定

- 文件头：`> 验证日期：YYYY-MM-DD | UFUNCTION：<库名>`
- 能力表格状态标记：✅ 原生 / ✅ 扩展 / ✅ 引擎扩展 / ❌ 不可 / ❌ 未扩展

能力表格示例（DataTable 模块片段）：

```
| 能力 | 状态 | 方式 |
|------|------|------|
| 创建 DataTable 资产 | ✅ 原生 | `AssetTools.create_asset(name, path, DataTable, DataTableFactory())` |
| 通过 JSON 填充行 | ✅ 原生 | `dt.fill_data_table_from_json_string(json_str)` |
| 添加单行 | ✅ 扩展 | `IGDataTableLibrary.add_row(dt, row_name, json_str)` |
| 删除单行 | ✅ 扩展 | `IGDataTableLibrary.remove_row(dt, row_name)` |
| 运行时热更新行数据 | ❌ 未扩展 | PIE 中 DataTable 是只读副本 |
| 从 CSV 重新导入 | ❌ 未扩展 | 仅 Editor UI 入口 |
```

能力表格应覆盖资产面和控制面。控制面示例（BehaviorTree 模块片段）：

```
| 能力 | 状态 | 方式 |
|------|------|------|
| 触发 BT 编译 | ✅ 原生 | `compile_blueprint(bt)` 同步返回 success/fail |
| 一致性校验 | ✅ 扩展 | `IGBehaviorTreeLibrary.validate_behavior_tree()` 返回 issues 数组 |
| 查询 PIE debug 执行节点 | ❌ 未扩展 | 只有 Viewport 高亮，无 API |
```

### 不要写什么

- ❌ 当前任务的具体样本资产名
- ❌ 当时任务的统计表
- ❌ 一次性脚本路径
- ❌ 过程叙事（"以下已通过 XXX 端到端验证"）

**判据**：删掉后下一个 Agent 会不会走弯路？不会→删。

---

## Phase 5: 独立复审（subagent）

主 Agent 完成 Phase 4 后必须 spawn 独立复审 Agent。

### 输入

复审 Agent 拿到：
- 最终能力文档（Phase 4 产出）
- 验证脚本
- `_workdocs/<module>-audit.md`（验证"声称的盲区是否确实如此"）

### 推荐三视角

| # | 视角 | 核心任务 |
|---|---|---|
| 1 | **真实业务场景** | 扮演"接到业务需求的 Agent"，用新 API 从零完成一个业务任务（构造资产 + 触发相关 Editor 操作）。禁止字符串拼装回退 |
| 2 | **代码质量 + 回归** | C++ 质量审查 + 跑所有验证脚本 + 统计每个 UFUNCTION 的实际调用点 |
| 3 | **文档可继承** | 假装新 Agent 只读文档不读源码，从零完成一个小任务 |

### 硬性要求

- 结论建立在实际执行上（贴命令 + 输出）
- 静态分析是补充，不是替代
- 不修改 C++ / 不重启 Editor
- 任务污染 grep 必跑

### 打回机制

```
交付 → spawn 复审（×3 视角）
  全 PASS → 完成
  不通过 → 问题清单 → 主 Agent 修正 → 新复审（不继承上下文）→ 最多 3 轮
```

### 职责

1. 对每个 ❌ 能力实际尝试是否真做不到
2. 对照 Phase 4 方向表确认无遗漏
3. 验证脚本全部 PASS 且幂等
4. 零引用 UFUNCTION 列为疑似 over-design

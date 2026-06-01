# UE Python 通用知识库

> 验证日期：（init 自动填写） | 状态：初始模板

Agent 每次会话开始时读一遍本文件，避免重复踩坑。

---

## §1 反射命名规则

UE 的 Python 绑定自动将 C++ 命名转换为 snake_case：

| C++ | Python |
|-----|--------|
| `GetActorLocation()` | `get_actor_location()` |
| `SetActorRotation()` | `set_actor_rotation()` |
| `bIsHidden` | `is_hidden`（去 b 前缀）|
| `UStaticMeshComponent` | `unreal.StaticMeshComponent`（去 U/A 前缀）|

## §2 资产路径格式

```python
# 正确
asset = unreal.load_asset('/Game/Characters/BP_Player')

# 引用 Blueprint 生成的类需要加 _C 后缀
bp_class = unreal.load_class(None, '/Game/Characters/BP_Player.BP_Player_C')

# 错误：不要用文件系统路径
# asset = unreal.load_asset('Content/Characters/BP_Player.uasset')  ❌
```

## §3 Subsystem 获取方式

```python
# Editor Subsystem（编辑器态）
subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

# 注意：不是 unreal.EditorActorSubsystem()，不要实例化
```

## §4 常用操作模式

```python
# 查询场景中所有 Actor
import unreal
subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
actors = subsystem.get_all_level_actors()
for a in actors:
    print(f"{a.get_actor_label()} at {a.get_actor_location()}")
```

```python
# 修改资产属性
import unreal
asset = unreal.load_asset('/Game/Data/DT_Weapons')
asset.set_editor_property('some_property', new_value)
```

```python
# 启动 PIE
import unreal
subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
subsystem.editor_play_simulate()
```

## §5 已知陷阱

> 随着使用逐渐积累。由 evolve 流程维护。

## §6 能力扩展路径

当 Python API 做不到时，按优先级选择：

1. **直接用已有 API**（换个角度可能就能做到）
2. **改一行引擎代码**（加 UPROPERTY 标记、改访问权限）
3. **写 UFUNCTION Library**（`UBlueprintFunctionLibrary` 子类，编译后自动暴露到 Python）
4. **标记不可做**（确实无法实现，记录原因）

## §7 连接验证

```bash
python scripts/ue_python.py "import unreal; print('OK')"
```

Exit code 0 = 连接正常。Exit code 2 = Editor 未运行或 Remote Execution 未开启。
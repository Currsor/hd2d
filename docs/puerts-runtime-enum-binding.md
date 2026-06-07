# Puerts 运行时枚举绑定策略

## 问题

在 TypeScript 中使用 `ue.d.ts` 声明的 UE C++ 枚举时，编译器会识别类型，但运行时 Puerts 可能不会自动生成对应的 `UE.E...` 枚举对象。

这会导致运行时访问枚举成员时出现 `undefined` 或 `TypeError`，例如：

- `UE.EComboTrigger` 未定义
- `UE.EMovementMode` 运行时不可用

## 方案

统一使用运行时加载 + 回退常量的模式。

1. 先尝试使用 `loadUEEnum(fullPath)` 加载实际枚举类型。
2. 使用 `getUEEnumValue(enumType, memberName, fallback)` 获取枚举成员数值。
3. 如果运行时枚举对象不存在，则回退到与 C++ 枚举一致的数值常量。

## 代码示例

```ts
import { getUEEnumValue, loadUEEnum } from "../Bridge/SubsystemBridge";

const EComboTriggerEnum = loadUEEnum("/Script/YourModule.EComboTrigger");
const EComboTriggerValues = {
  OnInput: getUEEnumValue(EComboTriggerEnum, "OnInput", 0),
  OnHit: getUEEnumValue(EComboTriggerEnum, "OnHit", 1),
};
```

## 推荐用法

- 所有运行时依赖 C++ 枚举值的代码，优先使用 `getUEEnumValue` 获取成员。
- 不要仅依赖 `UE.E...` 在运行时直接可用。
- 将枚举路径写成完整的 UE 类型路径，例如 `/Script/Engine.EMovementMode` 或 `/Script/YourModule.EComboTrigger`。

## 当前实现位置

- `TypeScript/Scripts/Bridge/SubsystemBridge.ts`
  - `loadUEEnum(fullPath)`
  - `getUEEnumValue(enumType, memberName, fallback)`

- `TypeScript/Scripts/Ability/GenericComboFSM.ts`
  - 已升级为运行时加载 `EComboTrigger`。

- `TypeScript/Scripts/Anim/AnimStateSync.ts`
  - 已升级为运行时加载 `EMovementMode`。

## 设计要点

- `ue.d.ts` 仅用于静态类型检查。
- 运行时枚举绑定必须兼容 Puerts 的实际导出行为。
- 这种模式可避免枚举未暴露导致的运行时崩溃，同时保留 C++ 枚举语义。

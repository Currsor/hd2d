# 角色动作系统：Jump / Dash / Attack

## 总览

三种动作共享同一套输入→拦截→执行的链路，核心原则：**C++ 负责物理和输入转发，TS 负责逻辑和状态。**

```
EnhancedInput → C++ 动作入口 → 查 IsCombatBlocked → 发蓝图事件 → TS 处理 → 物理/动画
```

## 输入映射

| InputAction | 按键 | 绑定 |
|---|---|---|
| `IA_Jump` | Space | `CharacterBase::Jump()` |
| `IA_Dash` | L-Shift | `CharacterBase::Dash()` |
| `IA_Attack` | J / LMB | `CharacterBase::Attack()` |
| `IA_Move` | WASD | `CharacterBase::Move()` |

## C++ 层：统一拦截

### IsCombatBlocked

```cpp
static bool IsCombatBlocked(AActor* Owner, FName ActionTag)
{
    auto* Comp = Owner->GetComponentByClass(UComboAttackComponent::StaticClass());
    return Comp && Cast<UComboAttackComponent>(Comp)->HasActiveTag(ActionTag);
}
```

`Action.Combat.Attacking` 这个 GameplayTag 统一阻挡 Move / Jump / Dash。Tag 由 TS 在 FSM `onEnterState` 时设置，`onExitCombo` 时清除。

### 拦截策略

| 动作 | IsCombatBlocked 时 | IsCombatBlocked 否 |
|---|---|---|
| `Move()` | `return`（直接忽略） | 正常移动 |
| `Jump()` | `OnJumpTriggered()`，`return`（发 TS 不跳） | `Super::Jump()` + `OnJumpTriggered()` |
| `Dash()` | `OnDashTriggered()`，`return`（发 TS 不冲） | 物理冲刺 + `OnDashTriggered()` |
| `Attack()` | 无拦截（C++ 不拦 Attack） | `OnAttackTriggered()` |

**关键设计**：拦了也发事件——TS 收到事件后在 cancel 窗口内可以打断攻击，窗口外则缓冲输入。

## Jump 流程

### 普通跳跃

```
Space → C++ Jump()
  → IsCombatBlocked 否
  → 土狼时间窗口检查
  → Super::Jump()（物理起跳）
  → OnJumpTriggered()
  → 蓝图 EmitEventByOwner("OnJump")
  → CurrsorLogic.onJump()
    → tryCancel: idx=-1 → 直接 true
    → beginAction("Jump")
    → emit OnJump（通知 ABP）
```

### 跳跃打断攻击（cancel 窗口内）

```
Space → C++ Jump() → IsCombatBlocked 是 → OnJumpTriggered() → return
  → TS onJump() → tryCancel("Action.Cancel.Jump")
    → cancelWindow=true + CanCancel=true
    → exitCombo() → RemoveActiveTag
    → beginAction("Jump")
    → LaunchCharacter(Vec, jumpZ=CharacterMovement.JumpZVelocity) → 起跳
```

**Cancel 条件**：动画帧在 CancelOpen ~ CancelClose 之间 + CancelTags 含 `Action.Cancel.Jump`。

### 跳跃打断攻击（窗口外）→ 缓冲

```
tryCancel → cancelWindow=false → bufferInput("Action.Cancel.Jump") → 跳跃不执行
```

等待 cancel 窗口打开后消费缓冲。

## Dash 流程

### 普通冲刺

```
Shift → C++ Dash() → IsCombatBlocked 否
  → DashAbility.tryDash() → 物理冲刺 → 冷却
  → OnDashTriggered()
  → TS onDash → tryCancel: idx=-1 → true → dashAbility.tryDash()
  → emit OnDashStarted（通知 ABP）
```

### 冲刺打断攻击（cancel 窗口内）

```
Shift → C++ Dash() → IsCombatBlocked 是 → OnDashTriggered() → return
  → TS onDash() → tryCancel("Action.Cancel.Dash")
    → cancelWindow=true + CanCancel=true
    → exitCombo() → RemoveActiveTag
    → dashAbility.tryDash() → 物理冲刺
```

## Attack 流程

### 开始攻击

```
J/LMB → C++ Attack() → OnAttackTriggered()
  → 蓝图 EmitEventByOwner("OnAttack")
  → CurrsorLogic.onAttack()
    → comboFSM.tryAttack()
      → Idle + canAct → enterState(0)
        → AddActiveTag("Action.Combat.Attacking")
        → emit OnComboStateEnter("State_0", anim)
        → ABP: JumpToNode("EnterAttack1")
        → 动画播放, AN 驱动窗口
```

### 连击推进（combo 窗口内再按攻击）

```
J/LMB → tryAttack()
  → cancelWindow/comboWindow 开
  → inputMap 查 FromIndex → 下一段
  → enterState(N+1) → 新的 OnComboStateEnter → JumpToNode("EnterAttackN+1")
```

### 攻击被缓冲（非窗口内）

```
tryAttack() → 窗口不满足 → bufferInput("Attack")
→ 窗口打开时自动消费
```

## 动画通知三窗口

| AN 名称 | 触发 | 作用 |
|---|---|---|
| `AN_HitStart` | 前摇结束 | ActivateHit → 碰撞盒生效 |
| `AN_HitEnd` | 判定结束 | DeactivateHit → 碰撞盒失效 |
| `AN_ComboOpen` | 后摇开始 | 接受连击输入 |
| `AN_ComboClose` | 后摇结束 | 连击超时→回 Idle |
| `AN_CancelOpen` | 可打断开始 | 接受 Jump/Dash 打断 |
| `AN_CancelClose` | 收招前 | 不可再打断 |

通知路径：`PaperZD 动画触发 → ABP ReceiveNotify_AN_xxx → EmitEventByOwner → TS CurrsorLogic → FSM`

## GameplayTag 体系

| Tag | 用途 | 位置 |
|---|---|---|
| `Action.Combat.Attacking` | 攻击中锁 Move/Jump/Dash | C++ IsCombatBlocked |
| `Action.Cancel.Jump` | 允许跳跃打断当前攻击段 | FComboStateConfig.CancelTags |
| `Action.Cancel.Dash` | 允许冲刺打断当前攻击段 | FComboStateConfig.CancelTags |

## 关键文件

| 文件 | 职责 |
|---|---|
| `Source/HD_2D/Character/CharacterBase.cpp` | Move/Jump/Dash/Attack C++ 入口 |
| `Source/HD_2D/Combat/ComboAttackComponent.cpp` | AddActiveTag/RemoveActiveTag/HasActiveTag |
| `TypeScript/Scripts/Ability/GenericComboFSM.ts` | 连击状态机 + 缓冲队列 |
| `TypeScript/Scripts/Logic/CurrsorLogic.ts` | 输入接线 + 碰撞伤害 + 跳跃执行 |
| `TypeScript/Scripts/Logic/ABP_CurrsorAnimLogic.ts` | ABP 动画跳转 + 落地检测 |
| `TypeScript/Scripts/Ability/DashAbility.ts` | 冲刺能力 |
| `Config/DefaultGameplayTags.ini` | GameplayTag 注册 |

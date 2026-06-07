# 泛用连击攻击系统 (最终实现)

## 架构总览

```
C++                                   TS                                    蓝图
────────────────                      ──────────────────────                 ──────
UComboAttackComponent                  GenericComboFSM                       BP_Currsor
  ComboStates[] (AttackAnimation,        Transitions → Map<From,To>          挂 Component + 填表
   Damage, HitboxHalfSize,               O(1) 查找
   HitboxOffset, Knockback,                                                  动画序列 (3 个)
   CancelTags)                          输入缓冲队列 (0.5s TTL × 3)         AS_Attack1/2/3
                                                                               各 6 个 AN:
  Transitions[] (FromIndex→ToIndex)     activeTags 管理动作占有                AN_HitStart/End
  ActivateHit / DeactivateHit                                                  AN_ComboOpen/Close
  CanCancel (GameplayTag)              moveLock:                               AN_CancelOpen/Close
                                          beginAction("Dash") → bAttackLocked
  HandleNotify (NotifyForwardList)        endAction → unlock                  ABP_Currsor
                                                                               EnterIdle
CharacterBase                            onEnterState:                        EnterAttack1/2/3
  Move() 检查 bAttackLocked               emit OnComboStateEnter              EnterDash
  AttackCollision (常开)                                                       EnterJump
  OnAnimNotify → HandleNotify           onExitCombo:                           无连线, 纯 JumpToNode
                                          emit OnComboStateExit
```

## 数据流

```
1. 攻击: 按J → C++ Attack() → 蓝图 OnAttackTriggered → EmitEventByOwner("OnAttack")
   → CurrsorLogic.onAttack() → FSM.tryAttack() → enterState(0)
   → emitGlobal(OnComboStateEnter, "State_0", anim)
   → ABP_CurrsorAnimLogic 收到 → JumpToNode("EnterAttack1")
   → 动画播放, AN_HitStart 触发 → CharacterBase::OnAnimNotify → HandleNotify
   → ComboAttackComponent.ActivateHit(0) → bHitActive=true
   → AttackCollision.OnOverlap → ApplyDamage + LaunchCharacter

2. 连击: 窗口内再按J → FSM.tryAttack() → enterState(1)
   → emitGlobal(OnComboStateEnter, "State_1", anim)
   → ABP → JumpToNode("EnterAttack2")

3. 打断: 攻击中按Shift → FSM.tryCancel("Action.Cancel.Dash")
   → CanCancel(idx, "Action.Cancel.Dash") → HasTag(CancelTags) → true
   → exitCombo() → emitGlobal(OnComboStateExit)
   → ABP 收到 → JumpToNode("EnterDash")
   → Dash 开始, bAttackLocked 重置

4. 连击结束: 窗口超时 / 最后一段打完
   → exitCombo() → cooldown 0.3s → Idle
```

## 关键映射

| TS StateId | PaperZD 节点 |
|---|---|
| `State_0` | `EnterAttack1` |
| `State_1` | `EnterAttack2` |
| `State_2` | `EnterAttack3` |
| Exit/Dash | `EnterDash` |
| Exit/Idle | 自动回落 (动画播完) |

## ABP 节点说明

所有 PaperZD 状态节点**不连线**, 通过 `JumpToNode` 跳转：
- `EnterIdle` — 默认待机, 角色进入时自然停留
- `EnterAttack1/2/3` — 攻击节点, 动画播完后停在最后一帧 (等待下一次 JumpToNode)
- `EnterDash` — 冲刺节点
- `EnterJump` — 跳跃节点

## 蓝图配置清单

```
BP_Currsor:
  UComboAttackComponent:
    ComboStates: 3 行 (AttackAnimation, Damage, Hitbox, CancelTags)
    Transitions:  5 行 (FromIndex→ToIndex, Trigger)
    NotifyForwardList: [AN_HitStart, AN_HitEnd, AN_ComboOpen, ...]

  AttackCollision (C++ 自动创建, 常开)

动画序列 (AS_Attack1/2/3):
  每个 6 个 AN: HitStart, HitEnd, ComboOpen, ComboClose, CancelOpen, CancelClose

ABP_Currsor:
  EnterIdle, EnterAttack1, EnterAttack2, EnterAttack3, EnterDash, EnterJump
  所有节点不连线

GameplayTags (Config/DefaultGameplayTags.ini):
  Action.Cancel.Jump
  Action.Cancel.Dash
```

## C++ 层

- `ComboAttackComponent`: ActivateHit, DeactivateHit, CanCancel, HandleNotify, PostEditChangeProperty
- `CharacterBase`: AttackCollision (常开 Overlap Pawn), Move() 检查 bAttackLocked, OnAnimNotify 转发

## TS 层

- `GenericComboFSM`: 索引 Map, 缓冲队列, activeTags
- `CurrsorLogic`: PlayAnimationOverride → ABP JumpToNode, OnComponentBeginOverlap
- `ABP_CurrsorAnimLogic`: OnComboStateEnter → JumpToNode, OnComboStateExit → 清锁
- `GameplayTags.ts`: 从 generated 导入, runtime helper
- `RoleTypes.ts`: loadUEEnum/getUEEnumValue 运行时绑定

## Enum 运行时绑定

所有 C++ 枚举通过 `loadUEEnum/getUEEnumValue` 加载:
- `EComboTrigger` → GenericComboFSM
- `EMovementMode` → AnimStateSync
- `ERoleSwitchState` / `ERoleSwitchFailReason` → RoleTypes

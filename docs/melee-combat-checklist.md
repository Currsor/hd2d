# 泛用连击攻击实现清单 (最终版)

## Phase 1: C++ ✓
- [x] `ComboAttackComponent.h/.cpp`: ActivateHit/DeactivateHit/CanCancel/HandleNotify, PostEditChangeProperty
- [x] `CharacterBase.h/.cpp`: AttackCollision (常开 Overlap Pawn), Move() bAttackLocked, OnAnimNotify
- [x] `HD_2D.Build.cs`: +GameplayTags

## Phase 2: TS ✓
- [x] `GenericComboFSM.ts`: Map<From,To> 索引, 缓冲队列, activeTags, tryAttack/tryCancel
- [x] `CurrsorLogic.ts`: OnComponentBeginOverlap, beginAction/endAction, cancel 逻辑
- [x] `ABP_CurrsorAnimLogic.ts`: OnComboStateEnter → JumpToNode, OnComboStateExit → StopOverride + Unlock
- [x] `GameplayTags.ts`: generated 导入 + runtime helper
- [x] `RoleTypes.ts`: loadUEEnum/getUEEnumValue
- [x] `EventTypes.ts`: OnCancelWindowOpen/Close, OnComboStateEnter/Exit, OnLanded
- [x] `SubsystemBridge.ts`: loadUEEnum/getUEEnumValue helpers

## Phase 3: 蓝图 ✓
- [x] UComboAttackComponent: ComboStates (3行), Transitions (5行), NotifyForwardList (6项)
- [x] ABP: EnterIdle, EnterAttack1/2/3, EnterDash, EnterJump (全部不连线)
- [x] AS_Attack1/2/3: 各 6 个 AN
- [x] GameplayTags: Action.Cancel.Jump, Action.Cancel.Dash

## 已测试 ✓
- [x] A1→A2→A3 三连击
- [x] 攻击中 Dash 打断 (cancel window + JumpToNode EnterDash)
- [x] 攻击中禁止 WASD 移动 (bAttackLocked)
- [x] 碰撞命中 ApplyDamage + LaunchCharacter
- [x] 攻击后自动回 Idle

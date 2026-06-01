/**
 * 事件类型常量定义
 * 所有事件名称统一在此定义，避免字符串硬编码
 */

export const EventTypes = {

    // ========== 生命周期事件 ==========

    /** 每帧更新 */
    OnTick: "OnTick",

    /** Actor 生成完成 */
    OnActorSpawned: "OnActorSpawned",

    /** Actor 即将销毁 */
    OnActorDestroying: "OnActorDestroying",

    // ========== UI 事件 ==========

    /** UI 初始化完成 */
    OnUIInitialized: "OnUIInitialized",

    /** UI 即将关闭 */
    OnUIClosing: "OnUIClosing",

    // ========== 关卡事件 ==========

    /** 关卡切换开始 */
    OnLevelChanging: "OnLevelChanging",

    /** 关卡切换完成 */
    OnLevelChanged: "OnLevelChanged",

    // ========== 游戏逻辑事件（可按需扩展） ==========

    /** 碰撞事件 */
    OnCollision: "OnCollision",

    /** 伤害事件 */
    OnDamage: "OnDamage",

    // ========== 角色系统事件 ==========

    /** 角色切换开始 */
    OnRoleSwitchStarted: "OnRoleSwitchStarted",

    /** 角色切换成功 */
    OnRoleSwitchCompleted: "OnRoleSwitchCompleted",

    /** 角色切换失败 */
    OnRoleSwitchFailed: "OnRoleSwitchFailed",

    /** 当前激活角色变更 */
    OnActiveRoleChanged: "OnActiveRoleChanged",

    /** 角色注册完成 */
    OnRoleRegistered: "OnRoleRegistered",

    /** 角色注销完成 */
    OnRoleUnregistered: "OnRoleUnregistered",

    // ========== 输入动作事件 ==========

    /** 跳跃输入触发（由 C++ ACharacterBase::Jump() → 蓝图 OnJumpTriggered → EmitEventByOwner 发出） */
    OnJump: "OnJump",

    /** 冲刺输入触发（由 C++ ACharacterBase::Dash() → 蓝图 OnDashTriggered → EmitEventByOwner 发出） */
    OnDash: "OnDash",

    /** 冲刺确认开始（由 CurrsorLogic 在 tryDash 成功后发出，用于驱动动画等表现层） */
    OnDashStarted: "OnDashStarted",

    // ========== 攻击/连击事件 ==========

    /** 攻击输入触发（由 C++ Attack() → 蓝图 OnAttackTriggered → EmitEventByOwner 发出） */
    OnAttack: "OnAttack",

    /** 连击某段攻击开始（由 CurrsorLogic 发出，payload: comboIndex，驱动动画播放） */
    OnComboAttackStart: "OnComboAttackStart",

    /** 连击整套结束（由 CurrsorLogic 发出，payload: totalHits） */
    OnComboEnd: "OnComboEnd",

    // ========== 攻击动画通知回传事件（由蓝图动画通知 → EmitEvent 发出） ==========

    /** 攻击判定开始（蓝图 AN_AttackX_HitStart 触发） */
    OnAttackHitStart: "OnAttackHitStart",

    /** 攻击判定结束（蓝图 AN_AttackX_HitEnd 触发） */
    OnAttackHitEnd: "OnAttackHitEnd",

    /** 连击窗口开启（蓝图 AN_AttackX_ComboWindowOpen 触发） */
    OnComboWindowOpen: "OnComboWindowOpen",

    /** 连击窗口关闭（蓝图 AN_AttackX_ComboWindowClose 触发） */
    OnComboWindowClose: "OnComboWindowClose",

} as const;

/** 事件类型的类型（用于类型检查） */
export type EventType = typeof EventTypes[keyof typeof EventTypes];

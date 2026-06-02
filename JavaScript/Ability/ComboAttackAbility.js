"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComboAttackAbility = exports.ComboState = exports.AttackSubPhase = exports.DEFAULT_COMBO_ATTACK_CONFIG = void 0;
/** 默认攻击配置 */
exports.DEFAULT_COMBO_ATTACK_CONFIG = Object.freeze({
    maxComboCount: 3,
    comboWindowDuration: 0.5,
    attackCooldown: 0.3,
    allowInputBuffering: true,
});
// ======================== 攻击阶段枚举 ========================
/**
 * 每段攻击内部的子阶段
 *
 * Startup（前摇）→ Active（判定期）→ Recovery（后摇/窗口期）
 */
var AttackSubPhase;
(function (AttackSubPhase) {
    /** 无攻击 */
    AttackSubPhase["None"] = "None";
    /** 前摇：攻击动画起手，不可取消，不产生伤害 */
    AttackSubPhase["Startup"] = "Startup";
    /** 判定期：攻击判定生效，碰撞检测激活 */
    AttackSubPhase["Active"] = "Active";
    /** 后摇/窗口期：攻击判定结束，等待连击输入 */
    AttackSubPhase["Recovery"] = "Recovery";
})(AttackSubPhase || (exports.AttackSubPhase = AttackSubPhase = {}));
/**
 * 连击状态机整体状态
 */
var ComboState;
(function (ComboState) {
    /** 空闲，可以攻击 */
    ComboState["Idle"] = "Idle";
    /** 攻击进行中（内部由 AttackSubPhase 细分） */
    ComboState["Attacking"] = "Attacking";
    /** 全局冷却中（整套连击结束后） */
    ComboState["Cooldown"] = "Cooldown";
})(ComboState || (exports.ComboState = ComboState = {}));
// ======================== ComboAttackAbility 核心类 ========================
/**
 * 三段连击能力模块（组合模式）
 *
 * 设计理念：
 *   独立于任何角色逻辑类，通过组合（Composition）而非继承来使用。
 *   状态机由 TS 驱动，动画通知由蓝图侧通过事件回传给 TS。
 *
 * 状态机流程：
 * ```
 *   Idle → [攻击输入] → Attack1(Startup→Active→Recovery)
 *     → [窗口期内攻击输入] → Attack2(Startup→Active→Recovery)
 *     → [窗口期内攻击输入] → Attack3(Startup→Active→Recovery)
 *     → Cooldown → Idle
 * ```
 *
 * 与蓝图的交互：
 *   - TS → 蓝图：通过事件通知播放对应段的攻击动画
 *   - 蓝图 → TS：通过动画通知（AN_）回传 HitStart/HitEnd/ComboWindow 等时机
 *
 * 使用方式：
 * ```ts
 * // 1. 在角色逻辑类中创建实例
 * private comboAttack = new ComboAttackAbility(
 *     () => this.getOwnerAs<UE.Character>(),
 *     { maxComboCount: 3 },  // 可选：覆盖默认配置
 *     {
 *         onAttackStart: (idx) => this.emitGlobal("OnComboAttackStart", idx),
 *         onHitStart: (idx) => this.enableHitDetection(idx),
 *         onHitEnd: (idx) => this.disableHitDetection(idx),
 *     }
 * );
 *
 * // 2. 在攻击输入事件中触发
 * this.comboAttack.tryAttack();
 *
 * // 3. 在每帧更新中调用 tick
 * this.comboAttack.tick(deltaTime);
 *
 * // 4. 蓝图动画通知回传时调用
 * this.comboAttack.notifyHitStart();
 * this.comboAttack.notifyHitEnd();
 * this.comboAttack.notifyComboWindowOpen();
 * this.comboAttack.notifyComboWindowClose();
 * ```
 */
class ComboAttackAbility {
    // ---- 配置 ----
    config;
    callbacks;
    // ---- 角色引用获取器（延迟求值） ----
    getCharacter;
    // ---- 运行时状态 ----
    /** 整体状态 */
    comboState = ComboState.Idle;
    /** 当前攻击段内的子阶段 */
    subPhase = AttackSubPhase.None;
    /** 当前连击段数（1-based，0 表示未攻击） */
    currentComboIndex = 0;
    /** 连击窗口是否开启 */
    comboWindowOpen = false;
    /** 连击窗口已经过的时间 */
    comboWindowElapsed = 0;
    /** 是否有缓存的攻击输入 */
    inputBuffered = false;
    /** 全局冷却剩余时间 */
    cooldownRemaining = 0;
    /** 日志标签 */
    logTag;
    /**
     * 构造连击能力实例
     *
     * @param getCharacter 获取角色引用的函数（延迟求值）
     * @param configOverride 可选的配置覆盖
     * @param callbacks 可选的生命周期回调
     * @param logTag 日志标签（默认 "ComboAttack"）
     */
    constructor(getCharacter, configOverride, callbacks, logTag) {
        this.getCharacter = getCharacter;
        this.config = { ...exports.DEFAULT_COMBO_ATTACK_CONFIG, ...configOverride };
        this.callbacks = callbacks ?? {};
        this.logTag = logTag ?? "ComboAttack";
    }
    // ======================== 公开 API ========================
    /**
     * 尝试执行攻击
     * 根据当前状态决定是开始第一段攻击、推进到下一段、还是缓存输入
     *
     * @returns 是否成功触发或缓存了攻击
     */
    tryAttack() {
        // 冷却中，拒绝
        if (this.comboState === ComboState.Cooldown) {
            console.log(`[${this.logTag}] 冷却中 (剩余 ${this.cooldownRemaining.toFixed(2)}s)，忽略攻击请求`);
            return false;
        }
        const character = this.getCharacter();
        if (!character) {
            console.warn(`[${this.logTag}] 角色引用无效，无法攻击`);
            return false;
        }
        // 空闲状态 → 开始第一段攻击
        if (this.comboState === ComboState.Idle) {
            this.startAttack(1);
            return true;
        }
        // 攻击中
        if (this.comboState === ComboState.Attacking) {
            // Recovery 阶段且窗口开启 → 推进到下一段
            if (this.subPhase === AttackSubPhase.Recovery && this.comboWindowOpen) {
                const nextIndex = this.currentComboIndex + 1;
                if (nextIndex <= this.config.maxComboCount) {
                    this.startAttack(nextIndex);
                    return true;
                }
                // 已经是最后一段，不可继续
                console.log(`[${this.logTag}] 已达最大连击段数 ${this.config.maxComboCount}，忽略`);
                return false;
            }
            // Active 或 Startup 阶段 → 缓存输入
            if (this.config.allowInputBuffering &&
                (this.subPhase === AttackSubPhase.Active || this.subPhase === AttackSubPhase.Startup)) {
                this.inputBuffered = true;
                console.log(`[${this.logTag}] 攻击输入已缓存（当前阶段: ${this.subPhase}）`);
                return true;
            }
            console.log(`[${this.logTag}] 当前阶段 ${this.subPhase} 不接受攻击输入`);
            return false;
        }
        return false;
    }
    /**
     * 每帧更新（必须在角色逻辑的 handleActiveInput 或 OnTick 中调用）
     *
     * @param deltaTime 帧间隔时间（秒）
     */
    tick(deltaTime) {
        switch (this.comboState) {
            case ComboState.Attacking:
                this.tickAttacking(deltaTime);
                break;
            case ComboState.Cooldown:
                this.cooldownRemaining -= deltaTime;
                if (this.cooldownRemaining <= 0) {
                    this.cooldownRemaining = 0;
                    this.comboState = ComboState.Idle;
                    console.log(`[${this.logTag}] 冷却结束，可以再次攻击`);
                    this.callbacks.onCooldownEnd?.();
                }
                break;
            case ComboState.Idle:
                // 无需处理
                break;
        }
    }
    // ======================== 蓝图动画通知回传 API ========================
    /**
     * 动画通知：攻击判定开始（由蓝图 AN_AttackX_HitStart 触发）
     * 进入 Active 子阶段，开启碰撞检测
     */
    notifyHitStart() {
        if (this.comboState !== ComboState.Attacking)
            return;
        if (this.subPhase !== AttackSubPhase.Startup) {
            console.warn(`[${this.logTag}] notifyHitStart 在非 Startup 阶段调用 (当前: ${this.subPhase})，忽略`);
            return;
        }
        this.subPhase = AttackSubPhase.Active;
        console.log(`[${this.logTag}] 第${this.currentComboIndex}段 → Active（判定开始）`);
        this.callbacks.onHitStart?.(this.currentComboIndex);
    }
    /**
     * 动画通知：攻击判定结束（由蓝图 AN_AttackX_HitEnd 触发）
     * 进入 Recovery 子阶段，关闭碰撞检测
     */
    notifyHitEnd() {
        if (this.comboState !== ComboState.Attacking)
            return;
        if (this.subPhase !== AttackSubPhase.Active) {
            console.warn(`[${this.logTag}] notifyHitEnd 在非 Active 阶段调用 (当前: ${this.subPhase})，忽略`);
            return;
        }
        this.subPhase = AttackSubPhase.Recovery;
        console.log(`[${this.logTag}] 第${this.currentComboIndex}段 → Recovery（判定结束）`);
        this.callbacks.onHitEnd?.(this.currentComboIndex);
        // 如果是最后一段，直接结束连击（不开窗口）
        if (this.currentComboIndex >= this.config.maxComboCount) {
            this.endCombo();
            return;
        }
    }
    /**
     * 动画通知：连击窗口开启（由蓝图 AN_AttackX_ComboWindowOpen 触发）
     * 开始接受下一段攻击输入
     */
    notifyComboWindowOpen() {
        if (this.comboState !== ComboState.Attacking)
            return;
        if (this.subPhase !== AttackSubPhase.Recovery) {
            console.warn(`[${this.logTag}] notifyComboWindowOpen 在非 Recovery 阶段调用 (当前: ${this.subPhase})，忽略`);
            return;
        }
        this.comboWindowOpen = true;
        this.comboWindowElapsed = 0;
        console.log(`[${this.logTag}] 第${this.currentComboIndex}段 连击窗口开启`);
        this.callbacks.onComboWindowOpen?.(this.currentComboIndex);
        // 检查是否有缓存的输入
        if (this.inputBuffered) {
            this.inputBuffered = false;
            const nextIndex = this.currentComboIndex + 1;
            if (nextIndex <= this.config.maxComboCount) {
                console.log(`[${this.logTag}] 消费缓存输入 → 第${nextIndex}段攻击`);
                this.startAttack(nextIndex);
            }
        }
    }
    /**
     * 动画通知：连击窗口关闭（由蓝图 AN_AttackX_ComboWindowClose 触发）
     * 如果窗口期内没有输入，结束连击回到 Idle
     */
    notifyComboWindowClose() {
        if (this.comboState !== ComboState.Attacking)
            return;
        if (!this.comboWindowOpen)
            return;
        console.log(`[${this.logTag}] 第${this.currentComboIndex}段 连击窗口关闭（动画通知）`);
        this.callbacks.onComboWindowClose?.(this.currentComboIndex);
        this.endCombo();
    }
    /**
     * 强制结束攻击（用于角色切换、被打断、死亡等场景）
     */
    forceEnd() {
        if (this.comboState === ComboState.Attacking) {
            // 如果在判定期，先关闭碰撞
            if (this.subPhase === AttackSubPhase.Active) {
                this.callbacks.onHitEnd?.(this.currentComboIndex);
            }
            this.resetAttackState();
            this.comboState = ComboState.Idle;
            console.log(`[${this.logTag}] 攻击被强制结束`);
        }
    }
    /**
     * 完全重置状态（用于对象池复用）
     */
    reset() {
        if (this.comboState === ComboState.Attacking && this.subPhase === AttackSubPhase.Active) {
            this.callbacks.onHitEnd?.(this.currentComboIndex);
        }
        this.resetAttackState();
        this.comboState = ComboState.Idle;
        this.cooldownRemaining = 0;
    }
    /**
     * 运行时修改攻击配置（如 Buff 增加连击段数）
     */
    updateConfig(configOverride) {
        Object.assign(this.config, configOverride);
    }
    // ======================== 状态查询 ========================
    /** 当前连击整体状态 */
    get state() { return this.comboState; }
    /** 当前攻击子阶段 */
    get currentSubPhase() { return this.subPhase; }
    /** 当前连击段数（1-based，0 表示未攻击） */
    get comboIndex() { return this.currentComboIndex; }
    /** 是否正在攻击 */
    get isAttacking() { return this.comboState === ComboState.Attacking; }
    /** 是否在冷却中 */
    get isCoolingDown() { return this.comboState === ComboState.Cooldown; }
    /** 是否可以攻击（空闲状态） */
    get canAttack() { return this.comboState === ComboState.Idle; }
    /** 连击窗口是否开启 */
    get isComboWindowOpen() { return this.comboWindowOpen; }
    /** 冷却剩余时间（秒） */
    get cooldownLeft() { return this.cooldownRemaining; }
    /** 冷却进度（0~1，1 表示冷却完成） */
    get cooldownProgress() {
        if (this.config.attackCooldown <= 0)
            return 1;
        return 1 - (this.cooldownRemaining / this.config.attackCooldown);
    }
    // ======================== 内部方法 ========================
    /**
     * 开始指定段数的攻击
     */
    startAttack(comboIndex) {
        // 重置子状态
        this.comboWindowOpen = false;
        this.comboWindowElapsed = 0;
        this.inputBuffered = false;
        // 设置状态
        this.comboState = ComboState.Attacking;
        this.subPhase = AttackSubPhase.Startup;
        this.currentComboIndex = comboIndex;
        console.log(`[${this.logTag}] 第${comboIndex}段攻击开始! (Startup)`);
        // 触发回调（通知外部播放对应段的攻击动画）
        this.callbacks.onAttackStart?.(comboIndex);
    }
    /**
     * 攻击中的每帧更新
     * 主要处理连击窗口的超时计时
     */
    tickAttacking(deltaTime) {
        // 仅在 Recovery 阶段且窗口开启时计时
        if (this.subPhase === AttackSubPhase.Recovery && this.comboWindowOpen) {
            this.comboWindowElapsed += deltaTime;
            if (this.comboWindowElapsed >= this.config.comboWindowDuration) {
                console.log(`[${this.logTag}] 第${this.currentComboIndex}段 连击窗口超时 (${this.config.comboWindowDuration}s)`);
                this.callbacks.onComboWindowClose?.(this.currentComboIndex);
                this.endCombo();
            }
        }
    }
    /**
     * 结束整套连击，进入冷却
     */
    endCombo() {
        const totalHits = this.currentComboIndex;
        this.resetAttackState();
        if (this.config.attackCooldown > 0) {
            this.comboState = ComboState.Cooldown;
            this.cooldownRemaining = this.config.attackCooldown;
            console.log(`[${this.logTag}] 连击结束 (共${totalHits}段)! 进入冷却 ${this.config.attackCooldown}s`);
        }
        else {
            this.comboState = ComboState.Idle;
            console.log(`[${this.logTag}] 连击结束 (共${totalHits}段)!`);
        }
        this.callbacks.onComboEnd?.(totalHits);
    }
    /**
     * 重置攻击相关的运行时状态
     */
    resetAttackState() {
        this.subPhase = AttackSubPhase.None;
        this.currentComboIndex = 0;
        this.comboWindowOpen = false;
        this.comboWindowElapsed = 0;
        this.inputBuffered = false;
    }
}
exports.ComboAttackAbility = ComboAttackAbility;
//# sourceMappingURL=ComboAttackAbility.js.map
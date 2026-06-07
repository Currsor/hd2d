"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericComboFSM = void 0;
const SubsystemBridge_1 = require("../Bridge/SubsystemBridge");
const EventBus_1 = require("../Mixin/EventBus");
const EventContext_1 = require("../Mixin/EventContext");
const EventTypes_1 = require("../Config/EventTypes");
const BUFFER_TTL_MS = 500;
const MAX_BUFFER_SIZE = 3;
const STATE_TIMEOUT_MS = 2000; // 攻击状态超时（未收到 AN）自动退出
const EComboTriggerPath = "/Script/HD_2D.EComboTrigger";
const EComboTrigger = (() => {
    const enumType = (0, SubsystemBridge_1.loadUEEnum)(EComboTriggerPath);
    return {
        OnInput: (0, SubsystemBridge_1.getUEEnumValue)(enumType, "OnInput", 0),
        OnTimeout: (0, SubsystemBridge_1.getUEEnumValue)(enumType, "OnTimeout", 1),
    };
})();
class GenericComboFSM {
    component;
    callbacks;
    currentIdx = -1;
    buffer = [];
    cancelWindowOpen = false;
    comboWindowOpen = false;
    cooldownRemaining = 0;
    activeTags = new Set();
    lastNotifyTime = 0; // 上一次收到 AN 的时间戳
    inputMap = new Map();
    timeoutMap = new Map();
    /** DashAttack 连击入口状态索引（-1 = 禁用） */
    dashEntryIndex = -1;
    /** 窗口期内 Attack 已预注册，等待 AN_NextAttack 执行过渡 */
    nextAttackPending = false;
    constructor(comp, cb, dashEntryIndex) {
        this.component = comp;
        this.callbacks = cb;
        this.dashEntryIndex = typeof dashEntryIndex === "number" && dashEntryIndex >= 0 ? dashEntryIndex : -1;
        if (comp) {
            this.buildMaps();
            console.log(`[ComboFSM] init: states=${comp.ComboStates?.Num?.() ?? 0} transitions=${comp.Transitions?.Num?.() ?? 0} dashEntry=${this.dashEntryIndex}`);
        }
        else
            console.log(`[ComboFSM] init: ❌ no component`);
    }
    // ===== 输入 =====
    tryAttack(now) {
        if (this.cooldownRemaining > 0) {
            console.log(`[ComboFSM] tryAttack blocked: cooldown=${this.cooldownRemaining.toFixed(2)}`);
            return false;
        }
        if (this.currentIdx === -1 && this.canAct()) {
            console.log(`[ComboFSM] enterState 0`);
            this.enterState(0);
            return true;
        }
        if (this.currentIdx >= 0 && (this.cancelWindowOpen || this.comboWindowOpen)) {
            // Attack 统一延迟到 AN_NextAttack 才执行过渡（cancel/combo 窗口都不再立即切）
            this.nextAttackPending = true;
            console.log(`[ComboFSM] tryAttack: nextAttackPending=true (cancel=${this.cancelWindowOpen} combo=${this.comboWindowOpen}, defer to AN_NextAttack)`);
            return true;
        }
        console.log(`[ComboFSM] tryAttack buffered (idx=${this.currentIdx} canAct=${this.canAct()} cancel=${this.cancelWindowOpen} combo=${this.comboWindowOpen})`);
        this.bufferInput("Attack", now);
        return false;
    }
    tryCancel(action, now) {
        if (this.currentIdx < 0) {
            console.log(`[ComboFSM] tryCancel ${action}: already idle (idx=-1)`);
            return true;
        }
        const canCancel = this.component?.CanCancel(this.currentIdx, action);
        console.log(`[ComboFSM] tryCancel ${action}: idx=${this.currentIdx} cancelWindow=${this.cancelWindowOpen} canCancel=${canCancel}`);
        if (!this.cancelWindowOpen || !canCancel) {
            this.bufferInput(action, now);
            return false;
        }
        this.exitCombo();
        this.clearBufferedAction("Attack");
        return true;
    }
    /**
     * 冲刺中按攻击 → DashAttack 入口
     * 进入 dashEntryIndex 指定的连击状态，后续连击走现有 transition
     *
     * @returns 是否成功进入 DashAttack 状态
     */
    tryDashAttack(now, direction) {
        if (this.dashEntryIndex < 0) {
            console.log(`[ComboFSM] tryDashAttack blocked: dashEntry disabled`);
            return false;
        }
        if (this.cooldownRemaining > 0) {
            console.log(`[ComboFSM] tryDashAttack blocked: cooldown=${this.cooldownRemaining.toFixed(2)}`);
            return false;
        }
        if (this.currentIdx !== -1 || !this.canAct()) {
            console.log(`[ComboFSM] tryDashAttack blocked: idx=${this.currentIdx} canAct=${this.canAct()}`);
            return false;
        }
        console.log(`[ComboFSM] tryDashAttack → enterState ${this.dashEntryIndex} dir=(${direction.X.toFixed(2)},${direction.Y.toFixed(2)})`);
        this.callbacks.onDashAttackStart?.(direction);
        this.enterState(this.dashEntryIndex);
        return true;
    }
    /** DashAttack 入口是否可用 */
    get dashEntryAvailable() { return this.dashEntryIndex >= 0 && this.canAttack(); }
    // ===== 动画通知 =====
    onHitStart() { if (this.currentIdx >= 0)
        this.component?.ActivateHit(this.currentIdx); }
    onHitEnd() { this.component?.DeactivateHit(); }
    onComboWindowOpen(_now) {
        if (this.currentIdx < 0)
            return;
        this.comboWindowOpen = true;
        // 不再立即 consumeBuffered — Attack 输入统一由 AN_NextAttack 处理
    }
    onComboWindowClose(_now) {
        if (this.currentIdx < 0)
            return;
        this.comboWindowOpen = false;
        // 不再立即执行超时回退 — AN_NextAttack 统一处理过渡/退出
    }
    onCancelOpen() {
        if (this.currentIdx < 0) {
            console.log("[ComboFSM] onCancelOpen skipped: idx<0");
            return;
        }
        console.log("[ComboFSM] onCancelOpen fired");
        this.cancelWindowOpen = true;
        this.consumeBufferAction(a => a !== "Attack");
    }
    onCancelClose(_now) {
        if (this.currentIdx < 0)
            return;
        this.cancelWindowOpen = false;
        this.consumeBufferAction(a => a !== "Attack");
    }
    /**
     * AN_NextAttack 动画通知回调
     * 如果有预注册的 Attack 输入 → 执行过渡到下一段
     * 如果没有 → 执行超时回退
     */
    onNextAttack() {
        if (this.currentIdx < 0)
            return;
        if (this.nextAttackPending) {
            this.nextAttackPending = false;
            const next = this.inputMap.get(this.currentIdx);
            console.log(`[ComboFSM] onNextAttack: pending consumed, next=${next}`);
            if (next !== undefined) {
                if (next === -1) {
                    this.exitCombo();
                }
                else if (this.isValidStateIndex(next)) {
                    this.enterState(next);
                }
                else {
                    console.error(`[ComboFSM] onNextAttack invalid next state ${next}, exiting combo`);
                    this.exitCombo();
                }
            }
            else {
                this.exitCombo();
            }
        }
        else {
            // 无预注册 Attack → 超时回退
            const fallback = this.timeoutMap.get(this.currentIdx);
            console.log(`[ComboFSM] onNextAttack: no pending input, fallback=${fallback}`);
            if (fallback !== undefined) {
                if (fallback === -1) {
                    this.exitCombo();
                }
                else if (this.isValidStateIndex(fallback)) {
                    this.enterState(fallback);
                }
                else {
                    console.error(`[ComboFSM] onNextAttack invalid fallback state ${fallback}, exiting combo`);
                    this.exitCombo();
                }
            }
            else {
                this.exitCombo();
            }
        }
    }
    // ===== 动作占有 =====
    beginAction(tag) { this.activeTags.add(tag); }
    endAction(_tag, _now) {
        this.activeTags.delete(_tag);
        if (this.activeTags.size === 0 && this.currentIdx === -1 && this.cooldownRemaining <= 0) {
            this.consumeBuffered("Attack");
        }
    }
    // ===== 状态查询 =====
    isAttacking() { return this.currentIdx >= 0; }
    isInCancelWindow() { return this.cancelWindowOpen; }
    canAttack() { return this.currentIdx === -1 && this.cooldownRemaining <= 0 && this.canAct(); }
    // ===== 生命周期 =====
    tick(dt, now) {
        if (this.cooldownRemaining > 0) {
            this.cooldownRemaining -= dt;
            if (this.cooldownRemaining < 0)
                this.cooldownRemaining = 0;
        }
        // 攻击状态超时保护
        if (this.currentIdx >= 0 && Date.now() - this.lastNotifyTime > STATE_TIMEOUT_MS) {
            console.log("[ComboFSM] state timeout, forceEnd");
            this.forceEnd();
        }
        this.buffer = this.buffer.filter(b => now - b.timestamp < BUFFER_TTL_MS);
    }
    forceEnd() { this.component?.DeactivateHit(); this.currentIdx = -1; this.cancelWindowOpen = false; }
    reset() { this.forceEnd(); this.cooldownRemaining = 0; this.buffer = []; this.activeTags.clear(); this.nextAttackPending = false; }
    refreshConfig() { if (this.component) {
        this.inputMap.clear();
        this.timeoutMap.clear();
        this.buildMaps();
    } }
    // ===== 内部 =====
    buildMaps() {
        if (!this.component)
            return;
        const stateCount = this.stateCount();
        if (stateCount <= 0) {
            console.warn(`[ComboFSM] buildMaps skipped: invalid ComboStates count=${stateCount}`);
            return;
        }
        for (const t of this.component.Transitions) {
            const from = t.FromIndex;
            const to = t.ToIndex;
            if (typeof from !== "number" || typeof to !== "number") {
                continue;
            }
            if (!this.isValidStateIndex(from)) {
                console.warn(`[ComboFSM] skip transition with invalid from index: ${from}`);
                continue;
            }
            if (t.Trigger === EComboTrigger.OnInput) {
                if (to === -1 || this.isValidStateIndex(to)) {
                    this.inputMap.set(from, to);
                }
                else {
                    console.warn(`[ComboFSM] skip invalid input transition: from=${from} to=${to}`);
                }
            }
            else if (t.Trigger === EComboTrigger.OnTimeout) {
                if (to === -1 || this.isValidStateIndex(to)) {
                    this.timeoutMap.set(from, to);
                }
                else {
                    console.warn(`[ComboFSM] skip invalid timeout transition: from=${from} to=${to}`);
                }
            }
        }
    }
    canAct() { for (const t of this.activeTags) {
        if (t !== "Idle")
            return false;
    } return true; }
    isTerminalState(idx) {
        return !this.inputMap.has(idx) && !this.timeoutMap.has(idx);
    }
    stateCount() {
        const count = this.component?.ComboStates?.Num?.();
        return typeof count === "number" ? count : 0;
    }
    isValidStateIndex(idx) {
        return typeof idx === "number" && idx >= 0 && idx < this.stateCount();
    }
    bufferInput(action, now) {
        const ex = this.buffer.findIndex(b => b.action === action);
        if (ex >= 0) {
            this.buffer[ex].timestamp = now;
            return;
        }
        if (this.buffer.length >= MAX_BUFFER_SIZE)
            this.buffer.shift();
        this.buffer.push({ action, timestamp: now });
    }
    consumeBuffered(action) {
        const idx = this.buffer.findIndex(b => b.action === action);
        if (idx >= 0) {
            this.buffer.splice(idx, 1);
            if (this.currentIdx === -1) {
                this.enterState(0);
            }
            else if (action === "Attack" && this.comboWindowOpen) {
                const next = this.inputMap.get(this.currentIdx);
                console.log(`[ComboFSM] consumeBuffered Attack in combo window, next=${next}`);
                if (next !== undefined) {
                    if (next === -1) {
                        this.exitCombo();
                    }
                    else if (this.isValidStateIndex(next)) {
                        this.enterState(next);
                    }
                    else {
                        console.error(`[ComboFSM] consumeBuffered invalid next state ${next}, exiting combo`);
                        this.exitCombo();
                    }
                }
            }
        }
    }
    consumeBufferAction(pred) {
        for (let i = 0; i < this.buffer.length; i++) {
            if (pred(this.buffer[i].action) && this.component?.CanCancel(this.currentIdx, this.buffer[i].action)) {
                this.buffer.splice(i, 1);
                this.exitCombo();
                return;
            }
        }
    }
    clearBufferedAction(action) {
        this.buffer = this.buffer.filter(b => b.action !== action);
    }
    enterState(idx) {
        if (!this.isValidStateIndex(idx)) {
            console.error(`[ComboFSM] enterState invalid state index: ${idx}`);
            this.exitCombo();
            return;
        }
        this.currentIdx = idx;
        this.cancelWindowOpen = false;
        this.nextAttackPending = false;
        this.lastNotifyTime = Date.now();
        const seg = this.component?.ComboStates?.Get(idx);
        const stateId = `State_${idx}`; // 用 idx 作为 StateId，确保有效值
        this.callbacks.onEnterState(stateId, seg?.AttackAnimation);
        try {
            EventBus_1.EventBus.getInstance().emitScoped(EventTypes_1.EventTypes.OnComboStateEnter, -1, EventContext_1.GLOBAL_SCOPE, [stateId, seg?.AttackAnimation]);
        }
        catch (e) {
            console.warn(`[ComboFSM] emit OnComboStateEnter failed: ${e}`);
        }
    }
    exitCombo() {
        const prev = this.currentIdx;
        this.currentIdx = -1;
        this.cancelWindowOpen = false;
        this.nextAttackPending = false;
        this.cooldownRemaining = 0.3;
        try {
            EventBus_1.EventBus.getInstance().emitScoped(EventTypes_1.EventTypes.OnComboStateExit, -1, EventContext_1.GLOBAL_SCOPE, [prev]);
        }
        catch (e) {
            console.warn(`[ComboFSM] emit OnComboStateExit failed: ${e}`);
        }
        this.callbacks.onExitCombo();
    }
}
exports.GenericComboFSM = GenericComboFSM;
//# sourceMappingURL=GenericComboFSM.js.map
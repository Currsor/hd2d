/**
 * GenericComboFSM — 泛用连击状态机
 *
 * 碰撞数据通过 Component.ActivateHit/DeactivateHit 管理，不通过回调传参。
 * Transitions 在构造时转为 Map<FromIndex, ToIndex>，O(1) 查找。
 */
import * as UE from "ue";
import { getUEEnumValue, loadUEEnum } from "../Bridge/SubsystemBridge";
import { EventBus } from "../Mixin/EventBus";
import { GLOBAL_SCOPE } from "../Mixin/EventContext";
import { EventTypes } from "../Config/EventTypes";

const BUFFER_TTL_MS = 500;
const MAX_BUFFER_SIZE = 3;

type ActionName = string;

interface QueuedAction { action: ActionName; timestamp: number; }
const EComboTriggerPath = "/Script/HD_2D.EComboTrigger";
const EComboTrigger = (() => {
    const enumType = loadUEEnum(EComboTriggerPath);
    return {
        OnInput: getUEEnumValue(enumType, "OnInput", 0),
        OnTimeout: getUEEnumValue(enumType, "OnTimeout", 1),
    } as const;
})();

export interface ComboFSMCallbacks {
    onEnterState: (stateId: string, anim: any) => void;
    onExitCombo: () => void;
}

export class GenericComboFSM {
    private component: any;
    private callbacks: ComboFSMCallbacks;

    private currentIdx: number = -1;
    private buffer: QueuedAction[] = [];
    private cancelWindowOpen: boolean = false;
    private comboWindowOpen: boolean = false;
    private cooldownRemaining: number = 0;
    private activeTags: Set<string> = new Set();

    private inputMap: Map<number, number> = new Map();
    private timeoutMap: Map<number, number> = new Map();

    constructor(comp: any, cb: ComboFSMCallbacks) {
        this.component = comp;
        this.callbacks = cb;
        if (comp) { this.buildMaps(); console.log(`[ComboFSM] init: states=${comp.ComboStates?.Num?.() ?? 0} transitions=${comp.Transitions?.Num?.() ?? 0}`); }
        else console.log(`[ComboFSM] init: ❌ no component`);
    }

    // ===== 输入 =====

    tryAttack(now: number): boolean {
        if (this.cooldownRemaining > 0) { console.log(`[ComboFSM] tryAttack blocked: cooldown=${this.cooldownRemaining.toFixed(2)}`); return false; }
        if (this.currentIdx === -1 && this.canAct()) { console.log(`[ComboFSM] enterState 0`); this.enterState(0); return true; }
        if (this.currentIdx >= 0 && (this.cancelWindowOpen || this.comboWindowOpen)) {
            const next = this.inputMap.get(this.currentIdx);
            console.log(`[ComboFSM] combo window, next=${next} cancel=${this.cancelWindowOpen} combo=${this.comboWindowOpen}`);
            if (next !== undefined) {
                if (next === -1) {
                    this.exitCombo();
                } else if (this.isValidStateIndex(next)) {
                    this.enterState(next);
                } else {
                    console.error(`[ComboFSM] tryAttack invalid next state ${next}, exiting combo`);
                    this.exitCombo();
                }
                return true;
            }

            if (this.isTerminalState(this.currentIdx)) {
                console.log(`[ComboFSM] tryAttack at terminal state ${this.currentIdx}, exiting combo`);
                this.exitCombo();
                if (this.canAttack()) {
                    this.enterState(0);
                    return true;
                }
                return false;
            }
        }
        console.log(`[ComboFSM] tryAttack buffered (idx=${this.currentIdx} canAct=${this.canAct()} cancel=${this.cancelWindowOpen} combo=${this.comboWindowOpen})`);
        this.bufferInput("Attack", now);
        return false;
    }

    tryCancel(action: ActionName, now: number): boolean {
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

    // ===== 动画通知 =====

    onHitStart(): void { if (this.currentIdx >= 0) this.component?.ActivateHit(this.currentIdx); }
    onHitEnd(): void { this.component?.DeactivateHit(); }

    onComboWindowOpen(_now: number): void {
        if (this.currentIdx < 0) return;
        this.comboWindowOpen = true;
        this.consumeBuffered("Attack");
    }

    onComboWindowClose(_now: number): void {
        if (this.currentIdx < 0) return;
        this.comboWindowOpen = false;
        const fallback = this.timeoutMap.get(this.currentIdx);
        if (fallback !== undefined) {
            if (fallback === -1) {
                this.exitCombo();
            } else if (this.isValidStateIndex(fallback)) {
                this.enterState(fallback);
            } else {
                console.error(`[ComboFSM] onComboWindowClose invalid fallback state ${fallback}, exiting combo`);
                this.exitCombo();
            }
        } else {
            this.exitCombo();
        }
    }

    onCancelOpen(): void {
        if (this.currentIdx < 0) return;
        this.cancelWindowOpen = true;
        this.consumeBufferAction(a => a !== "Attack");
    }

    onCancelClose(_now: number): void {
        if (this.currentIdx < 0) return;
        this.cancelWindowOpen = false;
        this.consumeBufferAction(a => a !== "Attack");
    }

    // ===== 动作占有 =====

    beginAction(tag: string): void { this.activeTags.add(tag); }

    endAction(_tag: string, _now: number): void {
        this.activeTags.delete(_tag);
        if (this.activeTags.size === 0 && this.currentIdx === -1 && this.cooldownRemaining <= 0) {
            this.consumeBuffered("Attack");
        }
    }

    // ===== 状态查询 =====

    isAttacking(): boolean { return this.currentIdx >= 0; }
    isInCancelWindow(): boolean { return this.cancelWindowOpen; }
    canAttack(): boolean { return this.currentIdx === -1 && this.cooldownRemaining <= 0 && this.canAct(); }

    // ===== 生命周期 =====

    tick(dt: number, now: number): void {
        if (this.cooldownRemaining > 0) { this.cooldownRemaining -= dt; if (this.cooldownRemaining < 0) this.cooldownRemaining = 0; }
        this.buffer = this.buffer.filter(b => now - b.timestamp < BUFFER_TTL_MS);
    }

    forceEnd(): void { this.component?.DeactivateHit(); this.currentIdx = -1; this.cancelWindowOpen = false; }
    reset(): void { this.forceEnd(); this.cooldownRemaining = 0; this.buffer = []; this.activeTags.clear(); }

    refreshConfig(): void { if (this.component) { this.inputMap.clear(); this.timeoutMap.clear(); this.buildMaps(); } }

    // ===== 内部 =====

    private buildMaps(): void {
        if (!this.component) return;

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
                } else {
                    console.warn(`[ComboFSM] skip invalid input transition: from=${from} to=${to}`);
                }
            } else if (t.Trigger === EComboTrigger.OnTimeout) {
                if (to === -1 || this.isValidStateIndex(to)) {
                    this.timeoutMap.set(from, to);
                } else {
                    console.warn(`[ComboFSM] skip invalid timeout transition: from=${from} to=${to}`);
                }
            }
        }
    }

    private canAct(): boolean { for (const t of this.activeTags) { if (t !== "Idle") return false; } return true; }

    private isTerminalState(idx: number): boolean {
        return !this.inputMap.has(idx) && !this.timeoutMap.has(idx);
    }

    private stateCount(): number {
        const count = this.component?.ComboStates?.Num?.();
        return typeof count === "number" ? count : 0;
    }

    private isValidStateIndex(idx: number): boolean {
        return typeof idx === "number" && idx >= 0 && idx < this.stateCount();
    }

    private bufferInput(action: ActionName, now: number): void {
        const ex = this.buffer.findIndex(b => b.action === action);
        if (ex >= 0) { this.buffer[ex].timestamp = now; return; }
        if (this.buffer.length >= MAX_BUFFER_SIZE) this.buffer.shift();
        this.buffer.push({ action, timestamp: now });
    }

    private consumeBuffered(action: ActionName): void {
        const idx = this.buffer.findIndex(b => b.action === action);
        if (idx >= 0) {
            this.buffer.splice(idx, 1);
            if (this.currentIdx === -1) {
                this.enterState(0);
            } else if (action === "Attack" && this.comboWindowOpen) {
                const next = this.inputMap.get(this.currentIdx);
                console.log(`[ComboFSM] consumeBuffered Attack in combo window, next=${next}`);
                if (next !== undefined) {
                    if (next === -1) {
                        this.exitCombo();
                    } else if (this.isValidStateIndex(next)) {
                        this.enterState(next);
                    } else {
                        console.error(`[ComboFSM] consumeBuffered invalid next state ${next}, exiting combo`);
                        this.exitCombo();
                    }
                }
            }
        }
    }

    private consumeBufferAction(pred: (a: ActionName) => boolean): void {
        for (let i = 0; i < this.buffer.length; i++) {
            if (pred(this.buffer[i].action) && this.component?.CanCancel(this.currentIdx, this.buffer[i].action)) {
                this.buffer.splice(i, 1);
                this.exitCombo();
                return;
            }
        }
    }

    private clearBufferedAction(action: ActionName): void {
        this.buffer = this.buffer.filter(b => b.action !== action);
    }

    private enterState(idx: number): void {
        if (!this.isValidStateIndex(idx)) {
            console.error(`[ComboFSM] enterState invalid state index: ${idx}`);
            this.exitCombo();
            return;
        }

        this.currentIdx = idx;
        this.cancelWindowOpen = false;
        const seg = (this.component?.ComboStates?.Get(idx) as any);
        const stateId = `State_${idx}`; // 用 idx 作为 StateId，确保有效值
        this.callbacks.onEnterState(stateId, seg?.AttackAnimation);

        try {
            EventBus.getInstance().emitScoped(EventTypes.OnComboStateEnter, -1, GLOBAL_SCOPE, [stateId, seg?.AttackAnimation]);
        } catch (e) {
            console.warn(`[ComboFSM] emit OnComboStateEnter failed: ${e}`);
        }
    }

    private exitCombo(): void {
        const prev = this.currentIdx;
        this.currentIdx = -1;
        this.cancelWindowOpen = false;
        this.cooldownRemaining = 0.3;

        try {
            EventBus.getInstance().emitScoped(EventTypes.OnComboStateExit, -1, GLOBAL_SCOPE, [prev]);
        } catch (e) {
            console.warn(`[ComboFSM] emit OnComboStateExit failed: ${e}`);
        }

        this.callbacks.onExitCombo();
    }
}
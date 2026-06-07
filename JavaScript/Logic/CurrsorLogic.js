"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrsorLogic = void 0;
const UE = __importStar(require("ue"));
const CharacterBaseLogic_1 = require("./CharacterBaseLogic");
const EventTypes_1 = require("../Config/EventTypes");
const EventContext_1 = require("../Mixin/EventContext");
const DashAbility_1 = require("../Ability/DashAbility");
const GenericComboFSM_1 = require("../Ability/GenericComboFSM");
const GameplayTags_1 = require("../Config/GameplayTags");
class CurrsorLogic extends CharacterBaseLogic_1.CharacterBaseLogic {
    dashAbility;
    comboFSM;
    currentOverrideAction = null;
    lastAnimInstance = null;
    Init(owner) {
        super.Init(owner);
        this.roleId = "Currsor";
        this.dashAbility = new DashAbility_1.DashAbility(() => this.getOwnerAs(), undefined, {
            onDashStart: (_dir) => { this.comboFSM.beginAction("Dash"); },
            onDashEnd: () => { this.comboFSM.endAction("Dash", Date.now()); },
        }, "CurrsorDash");
        const actor = this.getOwnerAs();
        const character = actor;
        const loadUEType = globalThis.puerts?.loadUEType;
        const ComboType = loadUEType?.("/Script/HD_2D.ComboAttackComponent");
        const cls = ComboType?.StaticClass?.();
        const comboComp = cls ? actor?.GetComponentByClass(cls) : null;
        console.log(`[CurrsorLogic] ComboComponent: ${comboComp ? '✓' : '❌ null'} (cls=${!!cls})`);
        console.log(`[CurrsorLogic] ComboComponent NotifyForwardList: ${JSON.stringify(comboComp?.NotifyForwardList ?? [])}`);
        this.comboFSM = new GenericComboFSM_1.GenericComboFSM(comboComp, {
            onEnterState: (_stateId, anim) => {
                console.log(`[CurrsorLogic] onEnterState anim=${anim ? 'ok' : 'null'}`);
                const seq = anim?.LoadSynchronous?.() ?? anim;
                console.log(`[CurrsorLogic] seq=${!!seq}, char=${!!character}`);
                if (character && seq) {
                    const zdChar = character;
                    let inst = zdChar.GetAnimInstance?.() ?? zdChar.AnimInstance;
                    if (!inst) {
                        const comp = zdChar.GetComponentByClass?.(UE.PaperZDAnimationComponent?.StaticClass?.())
                            ?? zdChar.AnimationComponent
                            ?? zdChar.GetAnimationComponent?.();
                        inst = comp?.GetAnimInstance?.() ?? comp?.AnimInstance;
                    }
                    console.log(`[CurrsorLogic] inst=${!!inst}, seq=${!!seq}`);
                    if (inst) {
                        this.lastAnimInstance = inst;
                        const playActionClass = UE.PaperZDPlaySlotOverrideAction;
                        console.log(`[CurrsorLogic] playActionClass=${!!playActionClass}`);
                        if (playActionClass && typeof playActionClass.PlayAnimationOverrideWithCallbacks === "function") {
                            try {
                                const action = playActionClass.PlayAnimationOverrideWithCallbacks(inst, seq, character, "DefaultSlot");
                                this.currentOverrideAction = action ?? null;
                            }
                            catch (e) {
                                console.warn(`[CurrsorLogic] PlayAnimationOverrideWithCallbacks failed: ${e}`);
                                this.currentOverrideAction = null;
                            }
                        }
                        else {
                            const refFactory = globalThis.$ref ?? globalThis.puerts?.$ref;
                            const duration = typeof refFactory === "function" ? refFactory(0) : 0;
                            // 优先使用可取消的 PlaySlotOverride；如果不可用，
                            // 不在 TS 侧直接播放不可取消的蒙太奇，改由 ABP 在 OnComboStateEnter 时播放（事件会携带动画资源）。
                            console.log(`[CurrsorLogic] delegate animation playback to ABP via OnComboStateEnter`);
                            this.currentOverrideAction = null;
                        }
                    }
                    else {
                        console.warn(`[CurrsorLogic] 无法获取 PaperZD AnimInstance，动画未播放`);
                        this.lastAnimInstance = null;
                    }
                }
            },
            onExitCombo: () => {
                console.log(`[CurrsorLogic] combo exit`);
                try {
                    if (this.currentOverrideAction && this.currentOverrideAction.OnCancelled && typeof this.currentOverrideAction.OnCancelled.Broadcast === "function") {
                        this.currentOverrideAction.OnCancelled.Broadcast();
                    }
                    else if (this.currentOverrideAction && typeof this.currentOverrideAction.OnAnimationOverrideEnd === "function") {
                        this.currentOverrideAction.OnAnimationOverrideEnd(false);
                    }
                }
                catch (e) {
                    console.warn(`[CurrsorLogic] cancel override action failed: ${e}`);
                }
                this.currentOverrideAction = null;
                this.lastAnimInstance = null;
            },
        });
        // 碰撞伤害
        character?.AttackCollision?.OnComponentBeginOverlap.Add((_overlapped, otherActor, _otherComp, _bodyIdx, _bSweep, _result) => {
            const comp = comboComp;
            if (!comp?.bHitActive)
                return;
            const dir = character.Orientation.X > 0 ? 1 : -1;
            UE.GameplayStatics.ApplyDamage(otherActor, comp.ActiveDamage, null, character, null);
            const knockVec = new UE.Vector(dir * comp.ActiveKnockback, 200, 0);
            otherActor.LaunchCharacter(knockVec, true, true);
        });
        console.log(`[CurrsorLogic] Currsor init: ${owner.GetName()}`);
    }
    // ======================== 事件订阅 ========================
    OnSetup() {
        super.OnSetup();
        const A = EventContext_1.ScopeFilter.ANY;
        this.subscribeScoped(EventTypes_1.EventTypes.OnAttack, this.onAttack.bind(this), { filter: A });
        this.subscribeScoped(EventTypes_1.EventTypes.OnDash, this.onDash.bind(this), { filter: A });
        this.subscribeScoped(EventTypes_1.EventTypes.OnJump, this.onJump.bind(this), { filter: A });
        const S = EventContext_1.ScopeFilter.SELF_AND_GLOBAL;
        this.subscribeScoped(EventTypes_1.EventTypes.OnAttackHitStart, () => this.comboFSM.onHitStart(), { filter: S });
        this.subscribeScoped(EventTypes_1.EventTypes.OnAttackHitEnd, () => this.comboFSM.onHitEnd(), { filter: S });
        this.subscribeScoped(EventTypes_1.EventTypes.OnComboWindowOpen, () => this.comboFSM.onComboWindowOpen(Date.now()), { filter: S });
        this.subscribeScoped(EventTypes_1.EventTypes.OnComboWindowClose, () => this.comboFSM.onComboWindowClose(Date.now()), { filter: S });
        this.subscribeScoped(EventTypes_1.EventTypes.OnCancelWindowOpen, () => this.comboFSM.onCancelOpen(), { filter: S });
        this.subscribeScoped(EventTypes_1.EventTypes.OnCancelWindowClose, () => this.comboFSM.onCancelClose(Date.now()), { filter: S });
        this.subscribeScoped(EventTypes_1.EventTypes.OnLanded, this.onLanded.bind(this), { filter: EventContext_1.ScopeFilter.ANY });
    }
    // ======================== 输入 ========================
    onAttack() {
        if (!this.isActive)
            return;
        const result = this.comboFSM.tryAttack(Date.now());
        console.log(`[CurrsorLogic] attack try=${result} canAttack=${this.comboFSM.canAttack()} attacking=${this.comboFSM.isAttacking()}`);
    }
    onDash() {
        if (!this.isActive) {
            console.log(`[CurrsorLogic] dash skip (inactive)`);
            return;
        }
        const cancel = this.comboFSM.tryCancel(GameplayTags_1.GameplayTags.Action.Cancel.Dash, Date.now());
        console.log(`[CurrsorLogic] dash cancel=${cancel}`);
        if (cancel) {
            const ok = this.dashAbility.tryDash();
            console.log(`[CurrsorLogic] dash try=${ok}`);
            if (ok) {
                this.emitGlobal(EventTypes_1.EventTypes.OnDashStarted, "");
                try {
                    if (this.lastAnimInstance && typeof this.lastAnimInstance.JumpToNode === "function") {
                        this.lastAnimInstance.JumpToNode("EnterDash");
                        // Retry in next tick in case override/playback re-applies immediately
                        try {
                            const timerFn = () => {
                                try {
                                    this.lastAnimInstance?.JumpToNode("EnterDash");
                                }
                                catch (e) { /* swallow */ }
                            };
                            if (typeof globalThis.setTimeout === "function")
                                globalThis.setTimeout(timerFn, 0);
                        }
                        catch (e) { /* ignore */ }
                    }
                }
                catch (e) {
                    console.warn(`[CurrsorLogic] force JumpToNode EnterDash failed: ${e}`);
                }
            }
        }
    }
    onJump() {
        if (!this.isActive)
            return;
        if (this.comboFSM.tryCancel(GameplayTags_1.GameplayTags.Action.Cancel.Jump, Date.now())) {
            this.comboFSM.beginAction("Jump");
        }
    }
    onLanded() {
        if (!this.isActive)
            return;
        console.log(`[CurrsorLogic] landed, ending Jump action`);
        this.comboFSM.endAction("Jump", Date.now());
    }
    // ======================== 生命周期 ========================
    handleActiveInput(deltaTime) {
        const now = Date.now();
        this.dashAbility.tick(deltaTime);
        this.comboFSM.tick(deltaTime, now);
    }
    handleBackgroundProcess(deltaTime) {
        this.dashAbility.forceEnd();
        this.comboFSM.forceEnd();
        this.dashAbility.tick(deltaTime);
        this.comboFSM.tick(deltaTime, Date.now());
    }
    OnActive() { super.OnActive(); console.log(`[CurrsorLogic] active`); }
    OnInactive() {
        super.OnInactive();
        this.dashAbility.forceEnd();
        this.comboFSM.forceEnd();
    }
    OnReset() {
        super.OnReset();
        this.dashAbility?.reset();
        this.comboFSM?.reset();
    }
    Destroy() {
        this.dashAbility?.forceEnd();
        this.comboFSM?.forceEnd();
        console.log(`[CurrsorLogic] destroy`);
        super.Destroy();
    }
}
exports.CurrsorLogic = CurrsorLogic;
//# sourceMappingURL=CurrsorLogic.js.map
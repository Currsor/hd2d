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
    comboComp = null;
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
        this.comboComp = comboComp;
        console.log(`[CurrsorLogic] ComboComponent: ${comboComp ? '✓' : '❌ null'} (cls=${!!cls})`);
        console.log(`[CurrsorLogic] ComboComponent NotifyForwardList: ${JSON.stringify(comboComp?.NotifyForwardList ?? [])}`);
        this.comboFSM = new GenericComboFSM_1.GenericComboFSM(comboComp, {
            onEnterState: (_stateId, _anim) => { },
            onExitCombo: () => { },
            onExecuteBufferedAction: (action) => {
                this.emitGlobal(EventTypes_1.EventTypes.OnComboStateExit, "");
                if (action === GameplayTags_1.GameplayTags.Action.Cancel.Jump) {
                    const char = this.getOwnerAs();
                    const jumpZ = char?.CharacterMovement?.JumpZVelocity ?? 600;
                    this.comboComp?.RemoveActiveTag("Action.Combat.Attacking");
                    this.comboFSM.beginAction("Jump");
                    if (char?.CharacterMovement?.IsMovingOnGround?.()) {
                        char?.LaunchCharacter({ X: 0, Y: 0, Z: jumpZ }, false, true);
                    }
                }
                else if (action === GameplayTags_1.GameplayTags.Action.Cancel.Dash) {
                    const ok = this.dashAbility.tryDash();
                    if (ok)
                        this.emitGlobal(EventTypes_1.EventTypes.OnDashStarted, "");
                }
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
        // 动画通知回调 (C++ OnAnimNotify → HandleNotify → OnCombatNotify)
        comboComp?.OnCombatNotify?.Add?.((notifyName) => {
            const now = Date.now();
            switch (notifyName) {
                case "AN_HitStart":
                    this.comboFSM.onHitStart();
                    break;
                case "AN_HitEnd":
                    this.comboFSM.onHitEnd();
                    break;
                case "AN_ComboOpen":
                    this.comboFSM.onComboWindowOpen(now);
                    break;
                case "AN_ComboClose":
                    this.comboFSM.onComboWindowClose(now);
                    break;
                case "AN_CancelOpen":
                    this.comboFSM.onCancelOpen();
                    break;
                case "AN_CancelClose":
                    this.comboFSM.onCancelClose(now);
                    break;
            }
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
        this.subscribeScoped(EventTypes_1.EventTypes.OnCancelWindowOpen, () => { console.log("[CurrsorLogic] CancelWindowOpen received"); this.comboFSM.onCancelOpen(); }, { filter: S });
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
            if (ok)
                this.emitGlobal(EventTypes_1.EventTypes.OnDashStarted, "");
        }
    }
    onJump() {
        if (!this.isActive)
            return;
        if (this.comboFSM.tryCancel(GameplayTags_1.GameplayTags.Action.Cancel.Jump, Date.now())) {
            const char = this.getOwnerAs();
            const jumpZ = char?.CharacterMovement?.JumpZVelocity ?? 600;
            this.comboComp?.RemoveActiveTag("Action.Combat.Attacking");
            this.comboFSM.beginAction("Jump");
            if (char?.CharacterMovement?.IsMovingOnGround?.()) {
                char?.LaunchCharacter({ X: 0, Y: 0, Z: jumpZ }, false, true);
            }
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
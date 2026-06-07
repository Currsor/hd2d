import * as UE from "ue";
import { CharacterBaseLogic } from "./CharacterBaseLogic";
import { EventTypes } from "../Config/EventTypes";
import { ScopeFilter } from "../Mixin/EventContext";
import { DashAbility } from "../Ability/DashAbility";
import { GenericComboFSM } from "../Ability/GenericComboFSM";
import { GameplayTags } from "../Config/GameplayTags";

export class CurrsorLogic extends CharacterBaseLogic {

    private dashAbility!: DashAbility;
    private comboFSM!: GenericComboFSM;
    private comboComp: any = null;

    Init(owner: UE.Object): void {
        super.Init(owner);
        this.roleId = "Currsor";

        this.dashAbility = new DashAbility(
            () => this.getOwnerAs<UE.CharacterBase>(),
            undefined,
            {
                onDashStart: (_dir) => { this.comboFSM.beginAction("Dash"); },
                onDashEnd: () => { this.comboFSM.endAction("Dash", Date.now()); },
            },
            "CurrsorDash",
        );

        const actor = this.getOwnerAs<UE.Actor>();
        const character = actor as UE.CharacterBase;

        const loadUEType = (globalThis as any).puerts?.loadUEType;
        const ComboType = loadUEType?.("/Script/HD_2D.ComboAttackComponent");
        const cls = ComboType?.StaticClass?.();
        const comboComp: any = cls ? actor?.GetComponentByClass(cls) : null;
        this.comboComp = comboComp;
        console.log(`[CurrsorLogic] ComboComponent: ${comboComp ? '✓' : '❌ null'} (cls=${!!cls})`);
        console.log(`[CurrsorLogic] ComboComponent NotifyForwardList: ${JSON.stringify(comboComp?.NotifyForwardList ?? [])}`);

        this.comboFSM = new GenericComboFSM(comboComp, {
            onEnterState: (_stateId, _anim) => {},
            onExitCombo: () => {},
            onExecuteBufferedAction: (action: string) => {
                this.emitGlobal(EventTypes.OnComboStateExit, "");
                if (action === GameplayTags.Action.Cancel.Jump) {
                    const char = this.getOwnerAs<UE.CharacterBase>();
                    const jumpZ = (char as any)?.CharacterMovement?.JumpZVelocity ?? 600;
                    this.comboComp?.RemoveActiveTag("Action.Combat.Attacking");
                    this.comboFSM.beginAction("Jump");
                    if ((char as any)?.CharacterMovement?.IsMovingOnGround?.()) { char?.LaunchCharacter({X:0, Y:0, Z:jumpZ} as any, false, true); }
                } else if (action === GameplayTags.Action.Cancel.Dash) {
                    const ok = this.dashAbility.tryDash();
                    if (ok) this.emitGlobal(EventTypes.OnDashStarted, "");
                }
            },
        });

        // 碰撞伤害
        character?.AttackCollision?.OnComponentBeginOverlap.Add(
            (_overlapped: UE.PrimitiveComponent | null, otherActor: UE.Actor | null, _otherComp: UE.PrimitiveComponent | null,
             _bodyIdx: number, _bSweep: boolean, _result: UE.HitResult) => {
                const comp = comboComp as any;
                if (!comp?.bHitActive) return;
                const dir = character.Orientation.X > 0 ? 1 : -1;
                UE.GameplayStatics.ApplyDamage(otherActor, comp.ActiveDamage, null, character, null);
                const knockVec = new UE.Vector(dir * comp.ActiveKnockback, 200, 0);
                (otherActor as UE.Character).LaunchCharacter(knockVec, true, true);
            }
        );

        // 动画通知回调 (C++ OnAnimNotify → HandleNotify → OnCombatNotify)
        comboComp?.OnCombatNotify?.Add?.((notifyName: string) => {
            const now = Date.now();
            switch (notifyName) {
                case "AN_HitStart":     this.comboFSM.onHitStart(); break;
                case "AN_HitEnd":       this.comboFSM.onHitEnd(); break;
                case "AN_ComboOpen":    this.comboFSM.onComboWindowOpen(now); break;
                case "AN_ComboClose":   this.comboFSM.onComboWindowClose(now); break;
                case "AN_CancelOpen":   this.comboFSM.onCancelOpen(); break;
                case "AN_CancelClose":  this.comboFSM.onCancelClose(now); break;
            }
        });

        console.log(`[CurrsorLogic] Currsor init: ${owner.GetName()}`);
    }

    // ======================== 事件订阅 ========================

    protected OnSetup(): void {
        super.OnSetup();

        const A = ScopeFilter.ANY;
        this.subscribeScoped(EventTypes.OnAttack, this.onAttack.bind(this), { filter: A });
        this.subscribeScoped(EventTypes.OnDash, this.onDash.bind(this), { filter: A });
        this.subscribeScoped(EventTypes.OnJump, this.onJump.bind(this), { filter: A });

        const S = ScopeFilter.SELF_AND_GLOBAL;
        this.subscribeScoped(EventTypes.OnAttackHitStart, () => this.comboFSM.onHitStart(), { filter: S });
        this.subscribeScoped(EventTypes.OnAttackHitEnd, () => this.comboFSM.onHitEnd(), { filter: S });
        this.subscribeScoped(EventTypes.OnComboWindowOpen, () => this.comboFSM.onComboWindowOpen(Date.now()), { filter: S });
        this.subscribeScoped(EventTypes.OnComboWindowClose, () => this.comboFSM.onComboWindowClose(Date.now()), { filter: S });
        this.subscribeScoped(EventTypes.OnCancelWindowOpen, () => { console.log("[CurrsorLogic] CancelWindowOpen received"); this.comboFSM.onCancelOpen(); }, { filter: S });
        this.subscribeScoped(EventTypes.OnCancelWindowClose, () => this.comboFSM.onCancelClose(Date.now()), { filter: S });
        this.subscribeScoped(EventTypes.OnLanded, this.onLanded.bind(this), { filter: ScopeFilter.ANY });
    }

    // ======================== 输入 ========================

    private onAttack(): void {
        if (!this.isActive) return;
        const result = this.comboFSM.tryAttack(Date.now());
        console.log(`[CurrsorLogic] attack try=${result} canAttack=${this.comboFSM.canAttack()} attacking=${this.comboFSM.isAttacking()}`);
    }

    private onDash(): void {
        if (!this.isActive) { console.log(`[CurrsorLogic] dash skip (inactive)`); return; }
        const cancel = this.comboFSM.tryCancel(GameplayTags.Action.Cancel.Dash, Date.now());
        console.log(`[CurrsorLogic] dash cancel=${cancel}`);
        if (cancel) {
            const ok = this.dashAbility.tryDash();
            console.log(`[CurrsorLogic] dash try=${ok}`);
            if (ok) this.emitGlobal(EventTypes.OnDashStarted, "");
        }
    }

    private onJump(): void {
        if (!this.isActive) return;
        if (this.comboFSM.tryCancel(GameplayTags.Action.Cancel.Jump, Date.now())) {
            const char = this.getOwnerAs<UE.CharacterBase>();
            const jumpZ = (char as any)?.CharacterMovement?.JumpZVelocity ?? 600;
            this.comboComp?.RemoveActiveTag("Action.Combat.Attacking");
            this.comboFSM.beginAction("Jump");
            if ((char as any)?.CharacterMovement?.IsMovingOnGround?.()) { char?.LaunchCharacter({X:0, Y:0, Z:jumpZ} as any, false, true); }
        }
    }

    private onLanded(): void {
        if (!this.isActive) return;
        console.log(`[CurrsorLogic] landed, ending Jump action`);
        this.comboFSM.endAction("Jump", Date.now());
    }



    // ======================== 生命周期 ========================

    protected handleActiveInput(deltaTime: number): void {
        const now = Date.now();
        this.dashAbility.tick(deltaTime);
        this.comboFSM.tick(deltaTime, now);
    }

    protected handleBackgroundProcess(deltaTime: number): void {
        this.dashAbility.forceEnd();
        this.comboFSM.forceEnd();
        this.dashAbility.tick(deltaTime);
        this.comboFSM.tick(deltaTime, Date.now());
    }

    protected OnActive(): void { super.OnActive(); console.log(`[CurrsorLogic] active`); }

    protected OnInactive(): void {
        super.OnInactive();
        this.dashAbility.forceEnd();
        this.comboFSM.forceEnd();
    }

    protected OnReset(): void {
        super.OnReset();
        this.dashAbility?.reset();
        this.comboFSM?.reset();
    }

    Destroy(): void {
        this.dashAbility?.forceEnd();
        this.comboFSM?.forceEnd();
        console.log(`[CurrsorLogic] destroy`);
        super.Destroy();
    }
}

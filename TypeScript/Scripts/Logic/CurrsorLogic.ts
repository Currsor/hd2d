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
    private currentOverrideAction: any = null;
    private lastAnimInstance: any = null;

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
        console.log(`[CurrsorLogic] ComboComponent: ${comboComp ? '✓' : '❌ null'} (cls=${!!cls})`);
        console.log(`[CurrsorLogic] ComboComponent NotifyForwardList: ${JSON.stringify(comboComp?.NotifyForwardList ?? [])}`);

        this.comboFSM = new GenericComboFSM(comboComp, {
            onEnterState: (_stateId, anim) => {
                console.log(`[CurrsorLogic] onEnterState anim=${anim ? 'ok' : 'null'}`);
                const seq = (anim as any)?.LoadSynchronous?.() ?? (anim as any);
                console.log(`[CurrsorLogic] seq=${!!seq}, char=${!!character}`);
                if (character && seq) {
                    const zdChar = character as any;
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
                        const playActionClass = (UE as any).PaperZDPlaySlotOverrideAction;
                        console.log(`[CurrsorLogic] playActionClass=${!!playActionClass}`);
                        if (playActionClass && typeof playActionClass.PlayAnimationOverrideWithCallbacks === "function") {
                            try {
                                const action = playActionClass.PlayAnimationOverrideWithCallbacks(inst, seq, character, "DefaultSlot");
                                this.currentOverrideAction = action ?? null;
                            } catch (e) {
                                console.warn(`[CurrsorLogic] PlayAnimationOverrideWithCallbacks failed: ${e}`);
                                this.currentOverrideAction = null;
                            }
                        } else {
                            const refFactory = (globalThis as any).$ref ?? (globalThis as any).puerts?.$ref;
                            const duration = typeof refFactory === "function" ? refFactory(0) : 0;

                            // 优先使用可取消的 PlaySlotOverride；如果不可用，
                            // 不在 TS 侧直接播放不可取消的蒙太奇，改由 ABP 在 OnComboStateEnter 时播放（事件会携带动画资源）。
                            console.log(`[CurrsorLogic] delegate animation playback to ABP via OnComboStateEnter`);
                            this.currentOverrideAction = null;
                        }
                    } else {
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
                    } else if (this.currentOverrideAction && typeof this.currentOverrideAction.OnAnimationOverrideEnd === "function") {
                        this.currentOverrideAction.OnAnimationOverrideEnd(false);
                    }
                } catch (e) {
                    console.warn(`[CurrsorLogic] cancel override action failed: ${e}`);
                }
                this.currentOverrideAction = null;
                this.lastAnimInstance = null;
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
        this.subscribeScoped(EventTypes.OnCancelWindowOpen, () => this.comboFSM.onCancelOpen(), { filter: S });
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
            if (ok) {
                this.emitGlobal(EventTypes.OnDashStarted, "");
                try {
                        if (this.lastAnimInstance && typeof this.lastAnimInstance.JumpToNode === "function") {
                            this.lastAnimInstance.JumpToNode("EnterDash");
                            // Retry in next tick in case override/playback re-applies immediately
                            try {
                                const timerFn = () => {
                                    try { this.lastAnimInstance?.JumpToNode("EnterDash"); } catch (e) { /* swallow */ }
                                };
                                if (typeof (globalThis as any).setTimeout === "function") (globalThis as any).setTimeout(timerFn, 0);
                            } catch (e) { /* ignore */ }
                        }
                } catch (e) {
                    console.warn(`[CurrsorLogic] force JumpToNode EnterDash failed: ${e}`);
                }
            }
        }
    }

    private onJump(): void {
        if (!this.isActive) return;
        if (this.comboFSM.tryCancel(GameplayTags.Action.Cancel.Jump, Date.now())) {
            this.comboFSM.beginAction("Jump");
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

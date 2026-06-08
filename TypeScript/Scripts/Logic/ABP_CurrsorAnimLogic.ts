/**
 * ==========================================
 *   ABP_Currsor 动画蓝图状态同步逻辑
 * ==========================================
 * 
 * 使用现有 Mixin 逻辑分发架构（BFL_JSLogic → LogicManager → EventBus）
 * 实现动画蓝图变量的自动同步。
 * 
 * 蓝图侧使用流程：
 *   1. ABP_Currsor 的 OnInit 中调用：
 *      InitializeLogic(Self, "ABP_CurrsorAnim")
 *      → 返回 logicId，保存到蓝图变量中
 * 
 *   2. ABP_Currsor 的 OnTick 中调用：
 *      EmitEventByOwner(Self, "OnTick", DeltaTime)
 *      → TS 侧自动计算状态并写回 ShouldMove 等变量
 * 
 * 注入路径：无需 blueprint.mixin，完全通过蓝图函数库 BFL_JSLogic 驱动
 */
import * as UE from "ue";
import { GameObjectBase } from "../Mixin/GameObjectBase";
import { EventBus } from "../Mixin/EventBus";
import { GLOBAL_SCOPE } from "../Mixin/EventContext";
import { EventTypes } from "../Config/EventTypes";
import { ScopeFilter } from "../Mixin/EventContext";
import { computeAnimState, AnimState } from "../Anim/AnimStateSync";

// 引入蓝图生成的类型
type ABP_Currsor_C = UE.Game.Blueprints.Player.Currsor.Anim.ABP_Currsor.ABP_Currsor_C;

export class ABP_CurrsorAnimLogic extends GameObjectBase {

    /** 缓存的角色引用（从动画蓝图实例的 Currsor 属性获取） */
    private character: UE.CharacterBase | null = null;

    /** 标记角色引用是否已成功解析 */
    private characterResolved: boolean = false;

    /** 缓存最后一次有效的朝向值（停止移动时保持最后朝向） */
    private getComboComp(): any {
        if (!this.character) return null;
        const loadUEType = (globalThis as any).puerts?.loadUEType;
        const ComboType = loadUEType?.("/Script/HD_2D.ComboAttackComponent");
        const cls = ComboType?.StaticClass?.();
        return cls ? this.character?.GetComponentByClass(cls) : null;
    }

    private lastOrientationX: number = 1;

    /** 前一帧角色是否着地 */
    private wasOnGround: boolean = true;

    /** 动画驱动的攻击锁（为 true 时禁止移动写回） */
    private attackLocked: boolean = false;
    private playingOverrideAction: any = null;

    Init(owner: UE.Object): void {
        super.Init(owner);
        console.log(`[ABP_CurrsorAnimLogic] 动画逻辑初始化: ${owner.GetName()}`);

        // 尝试立即解析角色引用
        this.tryResolveCharacter();
    }

    /**
     * 声明事件订阅
     */
    protected OnSetup(): void {
        // 订阅 OnTick 事件（接收自身实例级 + 全局 OnTick）
        this.subscribeScoped(EventTypes.OnTick, this.onAnimTick.bind(this), {
            filter: ScopeFilter.SELF_AND_GLOBAL,
        });

        // 订阅 OnJump 事件（玩家主动触发 IA_Jump 时由蓝图转发）
        // 使用 ANY 过滤器：因为事件由 BP_Currsor（角色蓝图）发出，
        // 其 scope 是 CurrsorLogic 的 logicId，与本实例（ABP_CurrsorAnim）的 logicId 不同，
        // 所以需要 ANY 才能跨实例接收
        this.subscribeScoped(EventTypes.OnJump, this.onJump.bind(this), {
            filter: ScopeFilter.ANY,
        });

        // 订阅 OnDashStarted 事件（CurrsorLogic 在 tryDash 成功后发出）
        // 只有冲刺真正执行（非 CD 中）才会触发动画
        // 使用 ANY 过滤器：因为事件由 CurrsorLogic 发出，scope 与本实例不同
        this.subscribeScoped(EventTypes.OnDashStarted, this.onDash.bind(this), {
            filter: ScopeFilter.ANY,
        });

        // 订阅连击攻击开始事件（CurrsorLogic 在 comboAttack.onAttackStart 回调中发出）
        // payload: comboIndex (1/2/3)
        this.subscribeScoped(EventTypes.OnComboAttackStart, this.onComboAttackStart.bind(this), {
            filter: ScopeFilter.ANY,
        });

        // 订阅连击结束事件（CurrsorLogic 在 comboAttack.onComboEnd 回调中发出）
        this.subscribeScoped(EventTypes.OnComboEnd, this.onComboEnd.bind(this), {
            filter: ScopeFilter.ANY,
        });

        // 订阅动画驱动的 ComboState 进入/退出（由 FSM 或 ABP 发出），用于在动画期间锁定移动
        this.subscribeScoped(EventTypes.OnComboStateEnter, (stateId?: string, anim?: any) => {
            console.log(`[ABP_CurrsorAnimLogic] ComboStateEnter stateId=${stateId} anim=${!!anim}`);
            this.attackLocked = true;
            this.getComboComp()?.AddActiveTag("Action.Combat.Attacking");

            // 先把底层 PaperZD 状态机切回 Idle，避免被 Slot Override 覆盖期间
            // 底层仍停留在 EnterDash / EnterWalk 等节点，Slot 结束后"露出"残余动画。
            // 典型场景：Dash 中按攻击 → DashAttack（Slot Override），底层状态机仍在 EnterDash；
            // DashAttack → A2（FSM 内部 enterState 不发 Exit，只发 Enter），A2 结束 StopOverride
            // 时底层仍是 EnterDash，导致瞬间露出 Dash 没播完的画面。
            try {
                const animInst = this.getAnimInstance();
                animInst?.JumpToNode("EnterIdle");
            } catch (e) {
                console.warn(`[ABP_CurrsorAnimLogic] ComboStateEnter pre-jump EnterIdle failed: ${e}`);
            }

            // 如果事件携带 anim 资源，优先使用可取消的 PlaySlotOverride 播放
            if (anim) {
                try {
                    const animInst = this.getAnimInstance();
                    if (animInst) {
                        const playActionClass = (UE as any).PaperZDPlaySlotOverrideAction;
                        if (playActionClass && typeof playActionClass.PlayAnimationOverrideWithCallbacks === "function") {
                            try {
                                const ownerObj = this.getOwnerAs<UE.Object>();
                                const action = playActionClass.PlayAnimationOverrideWithCallbacks(animInst, anim, ownerObj, "DefaultSlot");
                                this.playingOverrideAction = action ?? null;
                                console.log(`[ABP_CurrsorAnimLogic] PlayComboAnim action=${!!this.playingOverrideAction}`);
                                return;
                            } catch (e) {
                                console.warn(`[ABP_CurrsorAnimLogic] PlayAnimationOverrideWithCallbacks failed: ${e}`);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[ABP_CurrsorAnimLogic] Play combo anim failed: ${e}`);
                }
            }
            if (stateId) {
                try {
                    const animInst = this.getAnimInstance();
                    if (!animInst) return;
                    // State_N → EnterAttack(N+1)，即 State_0 → EnterAttack1
                    const match = stateId.match(/State_(\d+)/);
                    if (match) {
                        const nodeName = `EnterAttack${parseInt(match[1]) + 1}`;
                        console.log(`[ABP_CurrsorAnimLogic] JumpToNode ${nodeName} (from ${stateId})`);
                        animInst.JumpToNode(nodeName);
                    }
                } catch (e) {
                    console.warn(`[ABP_CurrsorAnimLogic] JumpToNode failed: ${e}`);
                }
            }
        }, { filter: ScopeFilter.ANY });

        // 当连击结束时，清掉 Slot 覆盖 + 解锁移动
        this.subscribeScoped(EventTypes.OnComboStateExit, (_prevIdx?: number) => {
            console.log(`[ABP_CurrsorAnimLogic] ComboStateExit prevIdx=${_prevIdx}`);
            try {
                const animInst = this.getAnimInstance();
                if (animInst) {
                    (animInst as any)?.StopAnimationOverride?.("DefaultSlot");
                    if (this.playingOverrideAction) {
                        try {
                            const act: any = this.playingOverrideAction;
                            if (typeof act.Cancel === "function") act.Cancel();
                            else if (typeof act.CancelAction === "function") act.CancelAction();
                        } catch (e) { /* ignore */ }
                    }
                    // 攻击节点（尤其 EnterAttack4 = DashAttack）可能没配置"动画播完→Idle"过渡，
                    // 强制跳回 Idle 节点，避免状态机停在攻击最后一帧。
                    try {
                        animInst.JumpToNode("EnterIdle");
                        console.log(`[ABP_CurrsorAnimLogic] ComboStateExit JumpToNode("EnterIdle") ok`);
                    } catch (e) {
                        console.warn(`[ABP_CurrsorAnimLogic] ComboStateExit JumpToNode("EnterIdle") failed: ${e}`);
                    }
                }
            } catch (e) {
                console.warn(`[ABP_CurrsorAnimLogic] ComboStateExit cleanup failed: ${e}`);
            }
            this.playingOverrideAction = null;
            this.attackLocked = false;
            this.getComboComp()?.RemoveActiveTag("Action.Combat.Attacking");
        }, { filter: ScopeFilter.ANY });
    }

    /**
     * 对象池复用时重置状态
     */
    protected OnReset(): void {
        this.character = null;
        this.characterResolved = false;
        this.lastOrientationX = 1;
        this.wasOnGround = true;
        this.attackLocked = false;
    }

    // ======================== 核心逻辑 ========================

    /**
     * 每帧动画状态同步
     * @param deltaTime 帧间隔时间（秒）—— 由 EmitEvent/EmitEventByOwner 传入
     */
    private onAnimTick(deltaTime: number): void {
        const animInst = this.getAnimInstance();
        if (!animInst) return;

        // 延迟解析角色引用（OnInit 时角色可能尚未就绪）
        if (!this.characterResolved) {
            this.tryResolveCharacter();
            if (!this.characterResolved) return;
        }

        // 运行时有效性检查
        if (!this.isCharacterValid()) {
            console.warn("[ABP_CurrsorAnimLogic] 角色引用失效，重新尝试解析");
            this.characterResolved = false;
            this.character = null;
            return;
        }

        // 计算动画状态
        const state = computeAnimState(this.character!);

        if (!this.wasOnGround && state.isOnGround) {
            EventBus.getInstance().emitScoped(EventTypes.OnLanded, -1, GLOBAL_SCOPE, []);
            console.log(`[ABP_CurrsorAnimLogic] OnLanded emitted`);
        }
        this.wasOnGround = state.isOnGround;

        // 写回动画蓝图变量
        this.applyStateToAnimInstance(animInst, state);
    }

    /**
     * 跳跃输入触发回调
     * 仅在玩家主动按下 IA_Jump 时执行，通过 JumpToNode 切换到跳跃动画节点
     */
    private onJump(): void {
        const animInst = this.getAnimInstance();
        if (!animInst) return;

        try {
            animInst.JumpToNode("EnterJump");
        } catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] JumpToNode("EnterJump") 异常: ${e}`);
        }
    }

    /**
     * 冲刺输入触发回调
     * 在玩家按下 IA_Dash 时执行，通过 JumpToNode 切换到冲刺动画节点
     */
    private onDash(): void {
        const animInst = this.getAnimInstance();
        if (!animInst) return;

        try {
            console.log(`[ABP_CurrsorAnimLogic] onDash JumpToNode EnterDash`);
            animInst.JumpToNode("EnterDash");
        } catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] JumpToNode("EnterDash") 异常: ${e}`);
        }
    }

    /**
     * 连击攻击开始回调
     * 根据 comboIndex 跳转到对应的攻击动画节点
     * 
     * 蓝图侧 PaperZD 状态机中需要创建以下节点：
     *   - EnterAttack1：第1段攻击动画
     *   - EnterAttack2：第2段攻击动画
     *   - EnterAttack3：第3段攻击动画
     * 
     * @param comboIndex 连击段数（1/2/3）
     */
    private onComboAttackStart(comboIndex: number): void {
        const animInst = this.getAnimInstance();
        if (!animInst) return;

        const nodeName = `EnterAttack${comboIndex}`;
        try {
            animInst.JumpToNode(nodeName);
            console.log(`[ABP_CurrsorAnimLogic] 跳转到攻击动画节点: ${nodeName}`);
        } catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] JumpToNode("${nodeName}") 异常: ${e}`);
        }
    }

    /**
     * 连击结束回调
     * 可在此处理攻击结束后的动画过渡（如回到 Idle）
     * 
     * @param totalHits 本次连击总段数
     */
    private onComboEnd(totalHits: number): void {
        console.log(`[ABP_CurrsorAnimLogic] 连击结束，共 ${totalHits} 段`);
        // 攻击结束后动画会自然过渡回 Idle（通过 PaperZD 状态机的条件转换）
        // 如果需要强制跳转，可以在此调用 JumpToNode("EnterIdle")
    }

    // ======================== 角色解析 ========================

    /**
     * 尝试从动画蓝图实例上解析角色引用。
     * 
     * ABP_Currsor_C 有一个 `Currsor` 属性（BP_Currsor_C 类型），
     * 它继承自 CharacterBase，可直接用于运动状态计算。
     */
    private tryResolveCharacter(): void {
        const animInst = this.getAnimInstance();
        if (!animInst) return;

        try {
            // 方式1：从 ABP_Currsor_C 的 Currsor 属性获取角色引用
            const currsorRef = animInst.Currsor;
            if (currsorRef) {
                const character = currsorRef as unknown as UE.CharacterBase;
                // 验证是否具备 CharacterBase 的标志性属性
                if (character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                    this.character = character;
                    this.characterResolved = true;
                    console.log("[ABP_CurrsorAnimLogic] 角色引用解析成功（通过 Currsor 属性）");
                    return;
                }
            }

            // 方式2：通过 PaperZDAnimInstance 的 GetPaperCharacter() 获取
            const paperChar = animInst.GetPaperCharacter();
            if (paperChar) {
                const character = paperChar as unknown as UE.CharacterBase;
                if (character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                    this.character = character;
                    this.characterResolved = true;
                    console.log("[ABP_CurrsorAnimLogic] 角色引用解析成功（通过 GetPaperCharacter）");
                    return;
                }
            }

            // 方式3：通过 GetOwningActor() 获取
            const owningActor = animInst.GetOwningActor();
            if (owningActor) {
                const character = owningActor as unknown as UE.CharacterBase;
                if (character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                    this.character = character;
                    this.characterResolved = true;
                    console.log("[ABP_CurrsorAnimLogic] 角色引用解析成功（通过 GetOwningActor）");
                    return;
                }
            }
        } catch (e) {
            // 角色尚未就绪，静默失败，下一帧继续尝试
        }
    }

    // ======================== 变量写回 ========================

    /**
     * 将计算后的状态写回动画蓝图实例的变量。
     * 
     * 写回策略：安全检查字段存在性后赋值，不存在的字段静默跳过。
     * 如果后续 ABP_Currsor_C 新增了更多动画变量，在此扩展即可。
     */
    private applyStateToAnimInstance(animInst: ABP_Currsor_C, state: AnimState): void {
        try {
            // ShouldMove —— 驱动 Idle ↔ Walk 状态机过渡
            if ("ShouldMove" in animInst) {
                animInst.ShouldMove = this.attackLocked ? false : state.shouldMove;
            }

            // bIsFalling —— 角色是否在下落
            if ("bIsFalling" in animInst) {
                animInst.bIsFalling = state.isFalling;
            }

            // bIsJumpingUp —— 角色是否正在上升跳跃（空中 + Z 速度 > 0）
            if ("bIsJumpingUp" in animInst) {
                animInst.bIsJumpingUp = state.isJumpingUp;
            }

            // bIsFallingDown —— 角色是否正在下落（空中 + Z 速度 <= 0）
            if ("bIsFallingDown" in animInst) {
                animInst.bIsFallingDown = state.isFallingDown;
            }

            // Orientation —— 身体朝向（仅保留左右 X 分量，Y 固定为 0）
            if ("Orientation" in animInst) {
                // 仅当存在有效的左右朝向时才更新缓存；
                // 纯 Y 轴移动（orientation.x === 0）时保持最后朝向不变
                if (state.orientation.x !== 0) {
                    this.lastOrientationX = state.orientation.x;
                }
                animInst.Orientation.X = this.lastOrientationX;
                animInst.Orientation.Y = 0;
            }
        } catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] 写回变量异常: ${e}`);
        }
    }

    // ======================== 工具方法 ========================

    /**
     * 获取强类型的动画蓝图实例（owner 即 ABP_Currsor_C）
     */
    private getAnimInstance(): ABP_Currsor_C | null {
        return this.getOwnerAs<ABP_Currsor_C>();
    }

    /**
     * 检查角色引用运行时是否仍然有效
     */
    private isCharacterValid(): boolean {
        if (!this.character) return false;
        try {
            // 尝试访问 UObject 基类方法，已销毁的对象会抛异常
            this.character.GetName();
            return true;
        } catch {
            return false;
        }
    }
}

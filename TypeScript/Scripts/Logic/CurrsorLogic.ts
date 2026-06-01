import * as UE from "ue";
import { CharacterBaseLogic } from "./CharacterBaseLogic";
import { EventTypes } from "../Config/EventTypes";
import { ScopeFilter } from "../Mixin/EventContext";
import { DashAbility } from "../Ability/DashAbility";
import { ComboAttackAbility } from "../Ability/ComboAttackAbility";

/**
 * Currsor 角色专属逻辑类
 * 
 * 继承 CharacterBaseLogic，可覆写以下方法来自定义行为：
 * - handleActiveInput(deltaTime)  : 激活状态下的每帧输入处理
 * - handleBackgroundProcess(deltaTime) : 非激活状态下的后台逻辑
 * - OnActive()   : 角色被激活时回调
 * - OnInactive() : 角色被取消激活时回调
 * 
 * 使用方式：
 * 1. 在 RegisterLogics.ts 中注册: logicManager.registerLogicClass("CurrsorLogic", CurrsorLogic)
 * 2. 在 BP_Currsor 蓝图的 BeginPlay 中调用: InitializeLogic(self, "CurrsorLogic")
 * 3. 在 BP_Currsor 蓝图的 EventTick 中调用: EmitEvent("OnTick", deltaTime)
 * 4. 在 BP_Currsor 蓝图的 EndPlay 中调用: DestroyLogic(logicId)
 */
export class CurrsorLogic extends CharacterBaseLogic {

    // ======================== 能力模块 ========================

    /** 冲刺能力（组合模式，独立可复用模块） */
    private dashAbility!: DashAbility;

    /** 三段连击能力（组合模式，独立可复用模块） */
    private comboAttack!: ComboAttackAbility;

    Init(owner: UE.Object): void {
        super.Init(owner);
        this.roleId = "Currsor";

        // 初始化冲刺能力
        this.dashAbility = new DashAbility(
            () => this.getOwnerAs<UE.CharacterBase>(),
            // 可在此覆盖默认配置，例如: { dashSpeed: 1500, dashCooldown: 1.0 }
            undefined,
            // 生命周期回调（可选）
            {
                onDashStart: (_dir) => {
                    // 可在此触发冲刺特效、音效等
                },
                onDashEnd: () => {
                    // 可在此清理冲刺特效等
                },
            },
            "CurrsorDash",  // 日志标签
        );

        // 初始化三段连击能力
        this.comboAttack = new ComboAttackAbility(
            () => this.getOwnerAs<UE.Character>(),
            // 可在此覆盖默认配置
            // { maxComboCount: 3, comboWindowDuration: 0.5, attackCooldown: 0.3 }
            undefined,
            // 生命周期回调
            {
                onAttackStart: (comboIndex) => {
                    // 通知动画层播放对应段的攻击动画
                    this.emitGlobal(EventTypes.OnComboAttackStart, comboIndex);
                },
                onHitStart: (comboIndex) => {
                    // TODO: 开启伤害碰撞检测
                    console.log(`[CurrsorLogic] 第${comboIndex}段攻击判定开始`);
                },
                onHitEnd: (comboIndex) => {
                    // TODO: 关闭伤害碰撞检测
                    console.log(`[CurrsorLogic] 第${comboIndex}段攻击判定结束`);
                },
                onComboEnd: (totalHits) => {
                    this.emitGlobal(EventTypes.OnComboEnd, totalHits);
                },
            },
            "CurrsorCombo",  // 日志标签
        );

        console.log(`[CurrsorLogic] Currsor 角色逻辑初始化: ${owner.GetName()}`);
    }

    /**
     * 声明事件订阅
     * 除了父类的 OnTick 和 OnActiveRoleChanged，订阅 Currsor 专属事件
     */
    protected OnSetup(): void {
        super.OnSetup();

        // 订阅冲刺事件（由 C++ Dash() → 蓝图 OnDashTriggered → EmitEventByOwner 发出）
        this.subscribeScoped(EventTypes.OnDash, this.onDash.bind(this), {
            filter: ScopeFilter.ANY,
        });

        // 订阅攻击输入事件（由 C++ Attack() → 蓝图 OnAttackTriggered → EmitEventByOwner 发出）
        this.subscribeScoped(EventTypes.OnAttack, this.onAttack.bind(this), {
            filter: ScopeFilter.ANY,
        });

        // 订阅蓝图动画通知回传事件（由 PaperZD 动画通知 → EmitEvent 发出）
        this.subscribeScoped(EventTypes.OnAttackHitStart, this.onAttackHitStart.bind(this), {
            filter: ScopeFilter.ANY,
        });
        this.subscribeScoped(EventTypes.OnAttackHitEnd, this.onAttackHitEnd.bind(this), {
            filter: ScopeFilter.ANY,
        });
        this.subscribeScoped(EventTypes.OnComboWindowOpen, this.onComboWindowOpen.bind(this), {
            filter: ScopeFilter.ANY,
        });
        this.subscribeScoped(EventTypes.OnComboWindowClose, this.onComboWindowClose.bind(this), {
            filter: ScopeFilter.ANY,
        });
    }

    /**
     * 对象池复用时重置状态
     */
    protected OnReset(): void {
        super.OnReset();
        this.dashAbility?.reset();
        this.comboAttack?.reset();
    }

    // ======================== 事件回调 ========================

    /**
     * 冲刺输入触发回调
     * 仅在 tryDash 成功时发出 OnDashStarted 事件，驱动动画等表现层
     */
    private onDash(): void {
        if (!this.isActive) return;
        // 攻击中不允许冲刺（可根据需求调整）
        if (this.comboAttack.isAttacking) return;
        const success = this.dashAbility.tryDash();
        if (success) {
            this.emitGlobal(EventTypes.OnDashStarted, "");
        }
    }

    /**
     * 攻击输入触发回调
     */
    private onAttack(): void {
        if (!this.isActive) return;
        // 冲刺中不允许攻击（可根据需求调整）
        if (this.dashAbility.isDashing) return;
        this.comboAttack.tryAttack();
    }

    /**
     * 蓝图动画通知回传：攻击判定开始
     */
    private onAttackHitStart(): void {
        this.comboAttack.notifyHitStart();
    }

    /**
     * 蓝图动画通知回传：攻击判定结束
     */
    private onAttackHitEnd(): void {
        this.comboAttack.notifyHitEnd();
    }

    /**
     * 蓝图动画通知回传：连击窗口开启
     */
    private onComboWindowOpen(): void {
        this.comboAttack.notifyComboWindowOpen();
    }

    /**
     * 蓝图动画通知回传：连击窗口关闭
     */
    private onComboWindowClose(): void {
        this.comboAttack.notifyComboWindowClose();
    }

    // ======================== 生命周期回调 ========================

    /**
     * 激活状态下的每帧输入处理
     * @param deltaTime 帧间隔时间（秒）
     */
    protected handleActiveInput(deltaTime: number): void {
        const character = this.getOwnerAs<UE.Actor>();
        if (!character) return;

        // 更新冲刺能力
        this.dashAbility.tick(deltaTime);
        // 更新连击能力
        this.comboAttack.tick(deltaTime);
    }

    /**
     * 非激活状态下的后台逻辑
     * @param deltaTime 帧间隔时间（秒）
     */
    protected handleBackgroundProcess(deltaTime: number): void {
        // 非激活时强制结束冲刺和攻击
        this.dashAbility.forceEnd();
        this.comboAttack.forceEnd();
        // 后台继续更新冷却
        this.dashAbility.tick(deltaTime);
        this.comboAttack.tick(deltaTime);
    }

    /**
     * 角色被激活时回调
     */
    protected OnActive(): void {
        super.OnActive();
        console.log(`[CurrsorLogic] Currsor 角色激活`);
    }

    /**
     * 角色被取消激活时回调
     */
    protected OnInactive(): void {
        super.OnInactive();
        console.log(`[CurrsorLogic] Currsor 角色非激活`);
        // 切换角色时强制结束冲刺和攻击
        this.dashAbility.forceEnd();
        this.comboAttack.forceEnd();
    }

    Destroy(): void {
        // 销毁前确保恢复角色状态
        this.dashAbility?.forceEnd();
        this.comboAttack?.forceEnd();
        console.log(`[CurrsorLogic] Currsor 角色逻辑销毁`);
        super.Destroy();
    }
}

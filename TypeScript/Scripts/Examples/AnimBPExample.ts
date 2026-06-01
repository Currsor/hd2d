/**
 * 动画蓝图实例级事件使用示例
 * 展示如何在动画蓝图中安全地发送和接收实例级事件
 * 确保每个角色的动画更新只影响自身，不会串扰到其他实例
 */
import * as UE from "ue";
import { GameObjectBase } from "../Mixin/GameObjectBase";
import { EventTypes } from "../Config/EventTypes";
import { ScopeFilter } from "../Mixin/EventContext";
import { EventBus } from "../Mixin/EventBus";

/**
 * 示例：动画蓝图逻辑类
 * 
 * 蓝图侧使用流程：
 * 1. 在动画蓝图的 Event Graph 中：
 *    - Initialize Animation 事件 → 调用 InitializeLogic(self, "AnimBPExample")
 *    - Event Blueprint Update Animation → 调用 EmitEventToInstance(LogicId, "OnAnimTick", DeltaTime)
 *    - 或使用 EmitEventByOwner(self, "OnAnimTick", DeltaTime) 自动定位实例
 * 
 * 2. 状态机和过渡规则仍然在蓝图中完成（蓝图职责不变）
 * 
 * 3. TS 侧通过实例级事件接收"是谁在更新"，并执行对应逻辑
 */
export class AnimBPExample extends GameObjectBase {

    /** 角色当前速度 */
    private speed: number = 0;
    /** 角色是否在地面 */
    private isGrounded: boolean = true;

    protected OnSetup(): void {
        // ===== 方式1: 仅接收自身实例的事件（推荐）=====
        // 只有当蓝图侧用 EmitEventToInstance(myLogicId, "OnAnimTick", ...) 发送时才会触发
        this.subscribeScoped(
            "OnAnimTick",
            this.onAnimUpdate.bind(this),
            { filter: ScopeFilter.SELF }
        );

        // ===== 方式2: 接收自身 + 全局事件 =====
        // 既接收自身实例的 OnDamage，也接收全局广播的 OnDamage
        this.subscribeScoped(
            EventTypes.OnDamage,
            this.onDamage.bind(this),
            { filter: ScopeFilter.SELF_AND_GLOBAL }
        );

        // ===== 方式3: 接收所有事件（监控/日志用途）=====
        // this.subscribeScoped(EventTypes.OnTick, this.onGlobalTick.bind(this), {
        //     filter: ScopeFilter.ANY,
        // });

        // 为本实例设置动画更新节流：约 30fps
        EventBus.getInstance().setScopedThrottle("OnAnimTick", this.logicId, 33);
    }

    /**
     * 动画更新回调（仅收到自身实例的事件）
     * 逻辑层可以确信：这个回调一定是"我自己"触发的
     */
    private onAnimUpdate(deltaTime: number): void {
        const owner = this.getOwnerAs<UE.Actor>();
        if (!owner) return;

        // 从 owner 读取当前速度、是否在地面等状态
        // 这里仅示意，实际需要根据你的角色蓝图属性来获取
        // this.speed = owner.GetVelocity().Size();

        // 可以安全地设置动画参数，因为确定是本角色在更新
        console.log(`[AnimBPExample] logicId=${this.logicId} 动画更新: dt=${deltaTime}, speed=${this.speed}`);
    }

    /**
     * 伤害回调（接收自身+全局）
     */
    private onDamage(payload: any): void {
        console.log(`[AnimBPExample] logicId=${this.logicId} 收到伤害事件`);
        // 播放受伤动画
    }

    /**
     * 也可以主动发送实例级事件给自己关联的其他逻辑
     */
    private notifyAnimState(state: string): void {
        this.emitAsInstance("OnAnimStateChanged", state);
    }

    protected OnReset(): void {
        this.speed = 0;
        this.isGrounded = true;
    }

    Destroy(): void {
        console.log(`[AnimBPExample] 动画逻辑销毁: logicId=${this.logicId}`);
        super.Destroy();
    }
}

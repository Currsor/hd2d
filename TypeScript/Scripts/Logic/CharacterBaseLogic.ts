import * as UE from "ue";
import { GameObjectBase } from "../Mixin/GameObjectBase";
import { RoleEventTypes } from "../RoleManagement/RoleEventTypes";
import { IRoleChangedPayload } from "../RoleManagement/RoleTypes";
import { EventTypes } from "../Config/EventTypes";
import { ScopeFilter } from "../Mixin/EventContext";

/**
 * 角色基础逻辑类
 * 实现多角色切换的容器模式
 * 所有具体角色逻辑应继承此类
 */
export class CharacterBaseLogic extends GameObjectBase {
    /** 当前是否为活跃角色 */
    protected isActive: boolean = false;

    /** 本角色的 RoleId（由子类或注册时设置） */
    protected roleId: string = "";

    Init(owner: UE.Object): void {
        super.Init(owner);
        console.log(`[CharacterBaseLogic] 角色逻辑初始化: ${owner.GetName()}`);

        // 从所有者获取角色 ID（假设所有者有 RoleId 属性）
        const character = this.getOwnerAs<UE.Actor>();
        if (character) {
            // TODO: 从角色蓝图中获取 RoleId
            // this.roleId = character.RoleId ?? "";
        }
    }

    /**
     * 声明事件订阅
     */
    protected OnSetup(): void {
        // 订阅角色切换事件（全局广播，需要收到所有角色切换通知）
        this.subscribeScoped(RoleEventTypes.OnActiveRoleChanged, this.onRoleChanged.bind(this), {
            filter: ScopeFilter.SELF_AND_GLOBAL,
        });

        // 订阅每帧更新（接收自身实例 + 全局 OnTick）
        this.subscribeScoped(EventTypes.OnTick, this.OnTick.bind(this), {
            filter: ScopeFilter.SELF_AND_GLOBAL,
        });
    }

    /**
     * 角色变更事件回调
     */
    private onRoleChanged(payload: IRoleChangedPayload): void {
        const wasActive = this.isActive;
        this.isActive = (payload.newRoleId === this.roleId);

        if (this.isActive && !wasActive) {
            this.OnActive();
        } else if (!this.isActive && wasActive) {
            this.OnInactive();
        }

        console.log(`[CharacterBaseLogic] 角色切换: ${payload.previousRoleId} -> ${payload.newRoleId}, 本角色 ${this.roleId} ${this.isActive ? '激活' : '非激活'}`);
    }

    /**
     * 角色激活回调
     * 子类重写此方法实现激活时的表现逻辑
     */
    protected OnActive(): void {
        console.log(`[CharacterBaseLogic] 角色激活: ${this.getOwnerAs<UE.Actor>()?.GetName()}`);

        // 默认实现：启用渲染和Tick
        const owner = this.getOwnerAs<UE.Actor>();
        if (owner) {
            // 启用渲染
            owner.SetActorHiddenInGame(false);

            // 启用PaperZD动画组件的Tick（如果存在）
            // TODO: PaperZD组件类型需要确认
            // const animComp = owner.GetComponentByClass(UE.PaperZDAnimationComponent.StaticClass());
            // if (animComp) {
            //     animComp.SetComponentTickEnabled(true);
            // }
        }
    }

    /**
     * 角色非激活回调
     * 子类重写此方法实现非激活时的表现逻辑
     */
    protected OnInactive(): void {
        console.log(`[CharacterBaseLogic] 角色非激活: ${this.getOwnerAs<UE.Actor>()?.GetName()}`);

        // 默认实现：隐藏渲染和禁用Tick
        const owner = this.getOwnerAs<UE.Actor>();
        if (owner) {
            // 隐藏渲染
            owner.SetActorHiddenInGame(true);

            // 禁用PaperZD动画组件的Tick（如果存在）
            // TODO: PaperZD组件类型需要确认
            // const animComp = owner.GetComponentByClass(UE.PaperZDAnimationComponent.StaticClass());
            // if (animComp) {
            //     animComp.SetComponentTickEnabled(false);
            // }
        }
    }

    /**
     * 每帧更新回调
     * @param deltaTime 帧间隔时间（秒）
     */
    protected OnTick(deltaTime: number): void {
        if (this.isActive) {
            // 处理玩家控制逻辑（移动缩放、主动施法）
            this.handleActiveInput(deltaTime);
        } else {
            // 处理后台逻辑（如：行秋大招持续时间、属性自动恢复）
            this.handleBackgroundProcess(deltaTime);
        }
    }

    /**
     * 处理活跃状态下的输入和逻辑
     * 子类重写此方法
     */
    protected handleActiveInput(deltaTime: number): void {
        // 默认空实现，子类重写
    }

    /**
     * 处理非活跃状态下的后台逻辑
     * 子类重写此方法
     */
    protected handleBackgroundProcess(deltaTime: number): void {
        // 默认空实现，子类重写
    }

    Destroy(): void {
        console.log(`[CharacterBaseLogic] 角色逻辑销毁: ${this.getOwnerAs<UE.Actor>()?.GetName()}`);
        super.Destroy();
    }
}
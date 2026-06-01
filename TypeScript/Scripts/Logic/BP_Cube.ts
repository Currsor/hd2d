import * as UE from "ue";
import { GameObjectBase } from "../Mixin/GameObjectBase";
import { EventTypes } from "../Config/EventTypes";
import { ScopeFilter } from "../Mixin/EventContext";

export class BP_Cube extends GameObjectBase {

    Init(owner: UE.Object): void {
        super.Init(owner);
        console.log(`[BP_Cube] Cube 逻辑初始化: ${owner.GetName()}`);
    }

    /**
     * 声明事件订阅
     */
    protected OnSetup(): void {
        this.subscribeScoped(EventTypes.OnTick, this.OnTick.bind(this), {
            filter: ScopeFilter.SELF_AND_GLOBAL,
        });
    }

    /**
     * 每帧更新回调（通过事件驱动）
     * @param deltaTime 帧间隔时间（秒）
     */
    private OnTick(deltaTime: number): void {
        const cube = this.getOwnerAs<UE.Game.Test.BP_Cube.BP_Cube_C>();
        if (!cube) return;
        //console.log(`[BP_Cube] Cube 每帧更新: ${deltaTime}`);

    }

    Destroy(): void {
        console.log(`[BP_Cube] Cube 逻辑销毁`);
        super.Destroy();
    }

}

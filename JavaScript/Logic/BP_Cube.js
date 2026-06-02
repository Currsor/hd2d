"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BP_Cube = void 0;
const GameObjectBase_1 = require("../Mixin/GameObjectBase");
const EventTypes_1 = require("../Config/EventTypes");
const EventContext_1 = require("../Mixin/EventContext");
class BP_Cube extends GameObjectBase_1.GameObjectBase {
    Init(owner) {
        super.Init(owner);
        console.log(`[BP_Cube] Cube 逻辑初始化: ${owner.GetName()}`);
    }
    /**
     * 声明事件订阅
     */
    OnSetup() {
        this.subscribeScoped(EventTypes_1.EventTypes.OnTick, this.OnTick.bind(this), {
            filter: EventContext_1.ScopeFilter.SELF_AND_GLOBAL,
        });
    }
    /**
     * 每帧更新回调（通过事件驱动）
     * @param deltaTime 帧间隔时间（秒）
     */
    OnTick(deltaTime) {
        const cube = this.getOwnerAs();
        if (!cube)
            return;
        //console.log(`[BP_Cube] Cube 每帧更新: ${deltaTime}`);
    }
    Destroy() {
        console.log(`[BP_Cube] Cube 逻辑销毁`);
        super.Destroy();
    }
}
exports.BP_Cube = BP_Cube;
//# sourceMappingURL=BP_Cube.js.map
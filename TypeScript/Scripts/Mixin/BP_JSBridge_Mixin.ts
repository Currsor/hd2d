import * as UE from "ue";
import { blueprint } from "puerts";
import { LogicManager } from "./LogicManager";
import { EventBus } from "./EventBus";
import { GLOBAL_SCOPE } from "./EventContext";

/**
 * ==========================================
 *   蓝图函数库 Mixin（唯一的 Mixin 注入点）
 * ==========================================
 * 
 * 方案说明：
 *   在蓝图中创建一个 BlueprintFunctionLibrary（如 BFL_JSLogic），
 *   定义以下蓝图函数，然后由本文件 mixin 注入 TS 实现。
 *   任何蓝图（Actor、UserWidget、Component 等）都可以直接调用函数库中的函数。
 * 
 * 蓝图函数库 BFL_JSLogic 需要定义的函数：
 *   - InitializeLogic(Target: Object, LogicTypeName: String) → Integer (返回LogicId)
 *   - DestroyLogic(LogicId: Integer) → void
 *   - EmitEvent(EventName: String, Payload: String) → void
 *   - EmitEventImmediate(EventName: String, Payload: String) → void
 *   - EmitEventToInstance(LogicId: Integer, EventName: String, Payload: String) → void  [新增：实例级事件]
 *   - EmitEventByOwner(Target: Object, EventName: String, Payload: String) → void  [新增：按Owner发送实例级事件]
 *   - SetEventThrottle(EventName: String, IntervalMs: Integer) → void
 *   - SetEventBatch(EventName: String, WindowMs: Integer) → void
 *   - SetInstanceEventThrottle(LogicId: Integer, EventName: String, IntervalMs: Integer) → void  [新增：实例级节流]
 *   - SetEventDebugMode(Enabled: Boolean) → void  [新增：调试模式]
 * 
 * 注意：函数库中的函数必须是 static 的（蓝图函数库的函数默认就是 static）
 */

/**
 * BFL_JSLogic 的 Mixin 实现类
 * 方法对应蓝图函数库中定义的函数
 * 注意：Mixin 类不需要继承 UE 基类，blueprint.mixin 会自动将方法注入到目标蓝图类中
 */
class BFL_JSLogic_Mixin {

    /**
     * 初始化逻辑
     * 蓝图中任何对象都可以调用此函数来创建对应的 JS 逻辑实例
     * 
     * @param Target 调用方的蓝图对象（self引用，如Actor、UserWidget等）
     * @param LogicTypeName 逻辑类型名称（如 "Hero"、"Monster"、"MainHUD"）
     * @returns 逻辑实例ID（保存到蓝图变量中，后续 Destroy 时使用）
     */
    InitializeLogic(Target: UE.Object, LogicTypeName: string): number {
        const logicManager = LogicManager.getInstance();

        if (!LogicTypeName || LogicTypeName === "") {
            console.warn(`[BFL_JSLogic] ${Target.GetName()} 未设置 LogicTypeName，跳过逻辑初始化`);
            return -1;
        }

        const logicId = logicManager.createLogic(LogicTypeName, Target);
        if (logicId >= 0) {
            console.log(`[BFL_JSLogic] ${Target.GetName()} 初始化逻辑成功: type=${LogicTypeName}, id=${logicId}`);
        } else {
            console.error(`[BFL_JSLogic] ${Target.GetName()} 初始化逻辑失败: type=${LogicTypeName}`);
        }
        return logicId;
    }

    /**
     * 触发事件（全局广播，向后兼容）
     * 如果该事件配置了节流或批处理，会自动应用对应策略
     * 
     * @param EventName 事件名称（如 "OnTick"、"OnDamage"、"OnCollision"）
     * @param Payload JSON 字符串格式的事件数据（蓝图侧传 String 类型）
     */
    EmitEvent(EventName: string, Payload: string): void {
        if (!EventName || EventName === "") {
            console.warn(`[BFL_JSLogic] EmitEvent 收到空事件名，忽略`);
            return;
        }

        const parsedPayload = BFL_JSLogic_Mixin._parsePayload(Payload);
        // 全局广播：使用 emitScoped 替代已废弃的 emit
        EventBus.getInstance().emitScoped(EventName, -1, GLOBAL_SCOPE, [parsedPayload]);
    }

    /**
     * 强制立即触发事件（跳过节流和批处理，全局广播）
     * 用于关键事件必须立即响应的场景
     * 
     * @param EventName 事件名称
     * @param Payload JSON 字符串格式的事件数据
     */
    EmitEventImmediate(EventName: string, Payload: string): void {
        if (!EventName || EventName === "") {
            console.warn(`[BFL_JSLogic] EmitEventImmediate 收到空事件名，忽略`);
            return;
        }

        const parsedPayload = BFL_JSLogic_Mixin._parsePayload(Payload);
        // 使用 emitImmediateScoped 替代已废弃的 emitImmediate
        EventBus.getInstance().emitImmediateScoped(EventName, -1, GLOBAL_SCOPE, [parsedPayload]);
    }

    /**
     * 向指定 logicId 的实例发送实例级事件
     * 只有订阅了该事件且作用域匹配的订阅者会收到
     * 
     * @param LogicId 目标逻辑实例ID（由 InitializeLogic 返回）
     * @param EventName 事件名称
     * @param Payload JSON 字符串格式的事件数据
     */
    EmitEventToInstance(LogicId: number, EventName: string, Payload: string): void {
        if (!EventName || EventName === "") {
            console.warn(`[BFL_JSLogic] EmitEventToInstance 收到空事件名，忽略`);
            return;
        }
        if (LogicId < 0) {
            console.warn(`[BFL_JSLogic] EmitEventToInstance 收到无效 LogicId=${LogicId}，忽略`);
            return;
        }

        const parsedPayload = BFL_JSLogic_Mixin._parsePayload(Payload);
        LogicManager.getInstance().emitToLogic(
            LogicId,
            EventName,
            [parsedPayload],
            { isHighFrequency: EventName === "OnTick" }
        );
    }

    /**
     * 通过 Owner（蓝图对象引用）向其绑定的逻辑实例发送实例级事件
     * 如果该 Owner 没有绑定逻辑实例，会降级为全局广播并输出警告
     * 
     * 典型用法：动画蓝图在 Event Graph 中用 Initialize Logic 后，
     * 后续 Emit Event 改为调用此函数，传入 self 和事件名
     * 
     * @param Target 蓝图对象（self 引用）
     * @param EventName 事件名称
     * @param Payload JSON 字符串格式的事件数据
     */
    EmitEventByOwner(Target: UE.Object, EventName: string, Payload: string): void {
        if (!EventName || EventName === "") {
            console.warn(`[BFL_JSLogic] EmitEventByOwner 收到空事件名，忽略`);
            return;
        }

        const logicId = LogicManager.getInstance().findLogicIdByOwner(Target);
        if (logicId < 0) {
            // 降级为全局广播并警告
            console.warn(`[BFL_JSLogic] EmitEventByOwner: ${Target.GetName()} 未绑定逻辑实例，降级为全局广播`);
            this.EmitEvent(EventName, Payload);
            return;
        }

        const parsedPayload = BFL_JSLogic_Mixin._parsePayload(Payload);
        LogicManager.getInstance().emitToLogic(
            logicId,
            EventName,
            [parsedPayload],
            { isHighFrequency: EventName === "OnTick" }
        );
    }

    /**
     * 配置事件全局级节流（蓝图可调用）
     * 在 IntervalMs 时间窗口内，事件最多触发一次
     * 
     * @param EventName 事件名称
     * @param IntervalMs 最小触发间隔（毫秒），如 33 ≈ 30fps、16 ≈ 60fps
     */
    SetEventThrottle(EventName: string, IntervalMs: number): void {
        EventBus.getInstance().setThrottle(EventName, IntervalMs);
    }

    /**
     * 配置实例级事件节流（蓝图可调用）
     * 仅对指定 LogicId 的实例级事件生效
     * 
     * @param LogicId 目标逻辑实例ID
     * @param EventName 事件名称
     * @param IntervalMs 最小触发间隔（毫秒）
     */
    SetInstanceEventThrottle(LogicId: number, EventName: string, IntervalMs: number): void {
        if (LogicId < 0) {
            console.warn(`[BFL_JSLogic] SetInstanceEventThrottle 收到无效 LogicId=${LogicId}，忽略`);
            return;
        }
        EventBus.getInstance().setScopedThrottle(EventName, LogicId, IntervalMs);
    }

    /**
     * 配置事件批处理（蓝图可调用）
     * 在 WindowMs 时间窗口内累积所有触发，然后一次性将事件数组交给订阅者
     * 
     * @param EventName 事件名称
     * @param WindowMs 批处理窗口时间（毫秒）
     */
    SetEventBatch(EventName: string, WindowMs: number): void {
        EventBus.getInstance().setBatch(EventName, WindowMs);
    }

    /**
     * 设置事件调试模式（蓝图可调用）
     * 开启后会在控制台输出详细的事件分发日志
     * 
     * @param Enabled 是否启用
     */
    SetEventDebugMode(Enabled: boolean): void {
        EventBus.getInstance().setDebugMode(Enabled);
    }

    /**
     * 销毁逻辑
     * 
     * @param LogicId 逻辑实例ID（由 InitializeLogic 返回）
     */
    DestroyLogic(LogicId: number): void {
        if (LogicId >= 0) {
            LogicManager.getInstance().destroyLogic(LogicId);
            console.log(`[BFL_JSLogic] 逻辑已销毁: id=${LogicId}`);
        }
    }

    // ========== 内部工具方法 ==========

    /**
     * 解析 Payload 字符串
     * 尝试 JSON.parse，失败则返回原始字符串
     */
    private static _parsePayload(Payload: string): any {
        if (!Payload || Payload === "") return Payload;
        try {
            return JSON.parse(Payload);
        } catch {
            return Payload;
        }
    }
}

/**
 * 执行 Mixin 注入
 * 将 BFL_JSLogic_Mixin 中的方法注入到蓝图函数库 BFL_JSLogic 中
 * 
 * 路径说明：根据你在 UE 编辑器中创建的蓝图函数库实际路径调整
 */
const BFL_JSLogic_C = blueprint<typeof UE.BlueprintFunctionLibrary>(
    "/Game/Blueprints/System/BFL_JSLogic.BFL_JSLogic_C"
);

if (BFL_JSLogic_C) {
    blueprint.mixin(BFL_JSLogic_C, BFL_JSLogic_Mixin as any);    
    console.log("[BFL_JSLogic] Mixin 注入成功");
} else {
    console.error("[BFL_JSLogic] 未找到蓝图函数库 BFL_JSLogic，请检查路径: /Game/Blueprints/System/BFL_JSLogic");
}

export { BFL_JSLogic_Mixin };

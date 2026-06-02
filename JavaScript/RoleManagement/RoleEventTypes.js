"use strict";
/**
 * 角色系统事件类型常量定义
 *
 * 统一定义角色切换前、切换成功、切换失败、当前角色变更等事件名称。
 * 与 C++ 侧的委托一一对应，由 RoleManager 桥接层自动转发。
 *
 * 使用方式：
 * ```ts
 * import { RoleEventTypes } from "../RoleManagement/RoleEventTypes";
 * import { ScopeFilter } from "../Mixin/EventContext";
 * this.subscribeScoped(RoleEventTypes.OnRoleSwitchCompleted, this.onSwitchDone.bind(this), {
 *     filter: ScopeFilter.SELF_AND_GLOBAL,
 * });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleEventTypes = void 0;
exports.RoleEventTypes = {
    // ==================== 角色切换事件 ====================
    /**
     * 角色切换开始
     * 在切换流程启动时触发，此时已通过前置校验
     * 载荷类型：IRoleSwitchStartedPayload
     */
    OnRoleSwitchStarted: "OnRoleSwitchStarted",
    /**
     * 角色切换成功
     * 新角色已激活、旧角色已解绑后触发
     * 载荷类型：IRoleSwitchEventPayload
     */
    OnRoleSwitchCompleted: "OnRoleSwitchCompleted",
    /**
     * 角色切换失败
     * 切换过程中任何阶段失败时触发（含失败原因和回滚信息）
     * 载荷类型：IRoleSwitchEventPayload
     */
    OnRoleSwitchFailed: "OnRoleSwitchFailed",
    // ==================== 角色状态事件 ====================
    /**
     * 当前激活角色变更
     * 在切换成功后触发，携带新旧角色 ID
     * 载荷类型：IRoleChangedPayload
     */
    OnActiveRoleChanged: "OnActiveRoleChanged",
    // ==================== 角色注册事件（TS 侧扩展） ====================
    /**
     * 角色注册完成
     * 新角色被成功注册到系统时触发
     * 载荷类型：{ roleId: string }
     */
    OnRoleRegistered: "OnRoleRegistered",
    /**
     * 角色注销完成
     * 角色从系统中注销时触发
     * 载荷类型：{ roleId: string }
     */
    OnRoleUnregistered: "OnRoleUnregistered",
};
//# sourceMappingURL=RoleEventTypes.js.map
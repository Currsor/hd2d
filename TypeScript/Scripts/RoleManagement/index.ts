/**
 * 角色管理系统 - 公共 API 导出
 * 
 * 本文件作为角色管理系统的统一入口，导出所有公共类型和接口。
 * 外部模块只需 import 本文件即可访问角色系统能力。
 * 
 * 使用方式：
 * ```ts
 * import { RoleManager, RoleEventTypes, IRoleSwitchResult } from "../RoleManagement";
 * ```
 */

// 核心门面
export { RoleManager } from "./RoleManager";

// 事件类型
export { RoleEventTypes } from "./RoleEventTypes";
export type { RoleEventType } from "./RoleEventTypes";

// 类型定义
export {
    ERoleSwitchState,
    ERoleSwitchFailReason,
} from "./RoleTypes";

export type {
    IRoleDefinition,
    IRoleTransform,
    IRoleSwitchRequest,
    IRoleSwitchResult,
    IRoleChangedPayload,
    IRoleSwitchEventPayload,
    IRoleSwitchStartedPayload,
} from "./RoleTypes";

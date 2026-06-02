"use strict";
/**
 * 角色系统类型定义
 * 定义角色管理系统中 TypeScript 侧使用的所有类型结构
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERoleSwitchFailReason = exports.ERoleSwitchState = void 0;
// ==================== 枚举定义 ====================
/** 角色切换状态（与 C++ ERoleSwitchState 对应） */
var ERoleSwitchState;
(function (ERoleSwitchState) {
    /** 空闲，未在切换 */
    ERoleSwitchState[ERoleSwitchState["Idle"] = 0] = "Idle";
    /** 切换请求已受理，正在执行前置校验 */
    ERoleSwitchState[ERoleSwitchState["Validating"] = 1] = "Validating";
    /** 正在解绑旧角色 */
    ERoleSwitchState[ERoleSwitchState["Unbinding"] = 2] = "Unbinding";
    /** 正在激活新角色 */
    ERoleSwitchState[ERoleSwitchState["Activating"] = 3] = "Activating";
    /** 切换完成 */
    ERoleSwitchState[ERoleSwitchState["Completed"] = 4] = "Completed";
    /** 切换失败，正在回滚 */
    ERoleSwitchState[ERoleSwitchState["RollingBack"] = 5] = "RollingBack";
})(ERoleSwitchState || (exports.ERoleSwitchState = ERoleSwitchState = {}));
/** 角色切换失败原因（与 C++ ERoleSwitchFailReason 对应） */
var ERoleSwitchFailReason;
(function (ERoleSwitchFailReason) {
    /** 无失败 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["None"] = 0] = "None";
    /** 子系统未初始化 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["SubsystemNotReady"] = 1] = "SubsystemNotReady";
    /** 目标角色 ID 不存在 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["TargetNotFound"] = 2] = "TargetNotFound";
    /** 目标角色不可用 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["TargetUnavailable"] = 3] = "TargetUnavailable";
    /** 当前角色不允许切换 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["CurrentNotSwitchable"] = 4] = "CurrentNotSwitchable";
    /** 已有切换流程正在进行 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["SwitchInProgress"] = 5] = "SwitchInProgress";
    /** 目标与当前相同 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["SameAsCurrent"] = 6] = "SameAsCurrent";
    /** 前置校验失败 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["ValidationFailed"] = 7] = "ValidationFailed";
    /** 解绑旧角色失败 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["UnbindFailed"] = 8] = "UnbindFailed";
    /** 激活新角色失败 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["ActivateFailed"] = 9] = "ActivateFailed";
    /** 角色类引用无效 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["InvalidClassReference"] = 10] = "InvalidClassReference";
    /** 角色生成失败 */
    ERoleSwitchFailReason[ERoleSwitchFailReason["SpawnFailed"] = 11] = "SpawnFailed";
    /** 桥接层错误（TS 侧特有） */
    ERoleSwitchFailReason[ERoleSwitchFailReason["BridgeError"] = 100] = "BridgeError";
})(ERoleSwitchFailReason || (exports.ERoleSwitchFailReason = ERoleSwitchFailReason = {}));
//# sourceMappingURL=RoleTypes.js.map
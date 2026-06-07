"use strict";
/**
 * 角色系统类型定义
 * 定义角色管理系统中 TypeScript 侧使用的所有类型结构
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERoleSwitchFailReason = exports.ERoleSwitchState = void 0;
const SubsystemBridge_1 = require("../Bridge/SubsystemBridge");
// ==================== 枚举定义（运行时绑定） ====================
/** 角色切换状态（与 C++ ERoleSwitchState 对应） */
const ERoleSwitchStateEnum = (0, SubsystemBridge_1.loadUEEnum)("/Script/HD_2D.ERoleSwitchState");
exports.ERoleSwitchState = {
    Idle: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchStateEnum, "Idle", 0),
    Validating: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchStateEnum, "Validating", 1),
    Unbinding: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchStateEnum, "Unbinding", 2),
    Activating: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchStateEnum, "Activating", 3),
    Completed: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchStateEnum, "Completed", 4),
    RollingBack: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchStateEnum, "RollingBack", 5),
};
/** 角色切换失败原因（与 C++ ERoleSwitchFailReason 对应） */
const ERoleSwitchFailReasonEnum = (0, SubsystemBridge_1.loadUEEnum)("/Script/HD_2D.ERoleSwitchFailReason");
exports.ERoleSwitchFailReason = {
    None: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "None", 0),
    SubsystemNotReady: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "SubsystemNotReady", 1),
    TargetNotFound: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "TargetNotFound", 2),
    TargetUnavailable: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "TargetUnavailable", 3),
    CurrentNotSwitchable: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "CurrentNotSwitchable", 4),
    SwitchInProgress: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "SwitchInProgress", 5),
    SameAsCurrent: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "SameAsCurrent", 6),
    ValidationFailed: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "ValidationFailed", 7),
    UnbindFailed: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "UnbindFailed", 8),
    ActivateFailed: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "ActivateFailed", 9),
    InvalidClassReference: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "InvalidClassReference", 10),
    SpawnFailed: (0, SubsystemBridge_1.getUEEnumValue)(ERoleSwitchFailReasonEnum, "SpawnFailed", 11),
    BridgeError: 100, // TS 侧特有扩展
};
//# sourceMappingURL=RoleTypes.js.map
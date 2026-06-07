/**
 * 角色系统类型定义
 * 定义角色管理系统中 TypeScript 侧使用的所有类型结构
 */

import { getUEEnumValue, loadUEEnum } from "../Bridge/SubsystemBridge";

// ==================== 枚举定义（运行时绑定） ====================

/** 角色切换状态（与 C++ ERoleSwitchState 对应） */
const ERoleSwitchStateEnum = loadUEEnum("/Script/HD_2D.ERoleSwitchState");
export const ERoleSwitchState = {
    Idle: getUEEnumValue(ERoleSwitchStateEnum, "Idle", 0),
    Validating: getUEEnumValue(ERoleSwitchStateEnum, "Validating", 1),
    Unbinding: getUEEnumValue(ERoleSwitchStateEnum, "Unbinding", 2),
    Activating: getUEEnumValue(ERoleSwitchStateEnum, "Activating", 3),
    Completed: getUEEnumValue(ERoleSwitchStateEnum, "Completed", 4),
    RollingBack: getUEEnumValue(ERoleSwitchStateEnum, "RollingBack", 5),
} as const;
export type ERoleSwitchState = typeof ERoleSwitchState[keyof typeof ERoleSwitchState];

/** 角色切换失败原因（与 C++ ERoleSwitchFailReason 对应） */
const ERoleSwitchFailReasonEnum = loadUEEnum("/Script/HD_2D.ERoleSwitchFailReason");
export const ERoleSwitchFailReason = {
    None: getUEEnumValue(ERoleSwitchFailReasonEnum, "None", 0),
    SubsystemNotReady: getUEEnumValue(ERoleSwitchFailReasonEnum, "SubsystemNotReady", 1),
    TargetNotFound: getUEEnumValue(ERoleSwitchFailReasonEnum, "TargetNotFound", 2),
    TargetUnavailable: getUEEnumValue(ERoleSwitchFailReasonEnum, "TargetUnavailable", 3),
    CurrentNotSwitchable: getUEEnumValue(ERoleSwitchFailReasonEnum, "CurrentNotSwitchable", 4),
    SwitchInProgress: getUEEnumValue(ERoleSwitchFailReasonEnum, "SwitchInProgress", 5),
    SameAsCurrent: getUEEnumValue(ERoleSwitchFailReasonEnum, "SameAsCurrent", 6),
    ValidationFailed: getUEEnumValue(ERoleSwitchFailReasonEnum, "ValidationFailed", 7),
    UnbindFailed: getUEEnumValue(ERoleSwitchFailReasonEnum, "UnbindFailed", 8),
    ActivateFailed: getUEEnumValue(ERoleSwitchFailReasonEnum, "ActivateFailed", 9),
    InvalidClassReference: getUEEnumValue(ERoleSwitchFailReasonEnum, "InvalidClassReference", 10),
    SpawnFailed: getUEEnumValue(ERoleSwitchFailReasonEnum, "SpawnFailed", 11),
    BridgeError: 100,  // TS 侧特有扩展
} as const;
export type ERoleSwitchFailReason = typeof ERoleSwitchFailReason[keyof typeof ERoleSwitchFailReason];

// ==================== 结构定义 ====================

/** 角色定义配置 - 描述一个可切换角色的完整信息 */
export interface IRoleDefinition {
    /** 角色唯一标识符 */
    roleId: string;
    /** 角色显示名称 */
    displayName: string;
    /** 角色蓝图类路径（软引用路径字符串） */
    roleClassPath: string;
    /** 默认生成位置 */
    spawnTransform?: IRoleTransform;
    /** 是否可用 */
    bAvailable?: boolean;
    /** 是否允许被切出 */
    bSwitchable?: boolean;
    /** 能力标签 */
    abilityTags?: string[];
    /** 扩展数据 */
    extensionData?: Record<string, string>;
}

/** 角色位置变换 */
export interface IRoleTransform {
    /** 位置 */
    location?: { x: number; y: number; z: number };
    /** 旋转 */
    rotation?: { pitch: number; yaw: number; roll: number };
    /** 缩放 */
    scale?: { x: number; y: number; z: number };
}

/** 角色切换请求（与 C++ FRoleSwitchRequest 对应） */
export interface IRoleSwitchRequest {
    /** 目标角色 ID */
    targetRoleId: string;
    /** 是否强制切换（跳过前置校验） */
    bForce?: boolean;
    /** 请求附带的自定义数据 */
    requestData?: Record<string, string>;
}

/** 角色切换结果（与 C++ FRoleSwitchResult 对应） */
export interface IRoleSwitchResult {
    /** 是否切换成功 */
    bSuccess: boolean;
    /** 失败原因 */
    failReason: ERoleSwitchFailReason;
    /** 切换前的角色 ID */
    previousRoleId: string;
    /** 切换后的角色 ID */
    newRoleId: string;
    /** 切换耗时（秒） */
    switchDuration: number;
    /** 附加的失败详情 */
    failDetail: string;
}

/** 角色变更事件载荷（对应 C++ OnActiveRoleChanged 委托） */
export interface IRoleChangedPayload {
    /** 切换前的角色 ID */
    previousRoleId: string;
    /** 切换后的角色 ID */
    newRoleId: string;
}

/** 角色切换结果事件载荷 */
export interface IRoleSwitchEventPayload {
    /** 切换结果 */
    result: IRoleSwitchResult;
}

/** 角色切换开始事件载荷 */
export interface IRoleSwitchStartedPayload {
    /** 目标角色 ID */
    targetRoleId: string;
    /** 是否强制切换 */
    force: boolean;
    /** 自定义数据 */
    requestData: Record<string, string>;
}

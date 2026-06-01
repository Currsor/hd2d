/**
 * 角色系统类型定义
 * 定义角色管理系统中 TypeScript 侧使用的所有类型结构
 */

// ==================== 枚举定义 ====================

/** 角色切换状态（与 C++ ERoleSwitchState 对应） */
export enum ERoleSwitchState {
    /** 空闲，未在切换 */
    Idle = 0,
    /** 切换请求已受理，正在执行前置校验 */
    Validating = 1,
    /** 正在解绑旧角色 */
    Unbinding = 2,
    /** 正在激活新角色 */
    Activating = 3,
    /** 切换完成 */
    Completed = 4,
    /** 切换失败，正在回滚 */
    RollingBack = 5,
}

/** 角色切换失败原因（与 C++ ERoleSwitchFailReason 对应） */
export enum ERoleSwitchFailReason {
    /** 无失败 */
    None = 0,
    /** 子系统未初始化 */
    SubsystemNotReady = 1,
    /** 目标角色 ID 不存在 */
    TargetNotFound = 2,
    /** 目标角色不可用 */
    TargetUnavailable = 3,
    /** 当前角色不允许切换 */
    CurrentNotSwitchable = 4,
    /** 已有切换流程正在进行 */
    SwitchInProgress = 5,
    /** 目标与当前相同 */
    SameAsCurrent = 6,
    /** 前置校验失败 */
    ValidationFailed = 7,
    /** 解绑旧角色失败 */
    UnbindFailed = 8,
    /** 激活新角色失败 */
    ActivateFailed = 9,
    /** 角色类引用无效 */
    InvalidClassReference = 10,
    /** 角色生成失败 */
    SpawnFailed = 11,
    /** 桥接层错误（TS 侧特有） */
    BridgeError = 100,
}

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

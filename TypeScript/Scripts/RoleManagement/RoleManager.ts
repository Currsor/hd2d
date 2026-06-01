/**
 * 角色管理门面模块（TypeScript 桥接层）
 * 
 * 统一调用底层 C++ RoleManagementSubsystem 的查询、注册和切换接口。
 * TS 业务层通过本模块访问角色管理能力，避免直接依赖底层细节。
 * 
 * 设计原则：
 * - TS 不维护真实状态，以 C++ Subsystem 为单一事实来源
 * - 所有调用都带有初始化检查和错误保护
 * - 统一参数和返回结构
 */
import * as UE from "ue";
import { $ref, $unref } from "puerts";
import { EventBus } from "../Mixin/EventBus";
import { GLOBAL_SCOPE } from "../Mixin/EventContext";
import { RoleEventTypes } from "./RoleEventTypes";
import {
    ERoleSwitchFailReason,
    ERoleSwitchState,
    IRoleDefinition,
    IRoleSwitchRequest,
    IRoleSwitchResult,
    IRoleChangedPayload,
    IRoleSwitchEventPayload,
    IRoleSwitchStartedPayload,
} from "./RoleTypes";

/** 日志标签 */
const LOG_TAG = "[RoleManager]";

/** 辅助：通过 loadUEType 加载 UE 类型（解决短名查找失败问题） */
function loadType(fullPath: string): any {
    const loadUEType = (globalThis as any).puerts?.loadUEType;
    if (typeof loadUEType === "function") {
        return loadUEType(fullPath);
    }
    return undefined;
}

/** 缓存已加载的 UE 结构体构造函数 */
const _typeCache: Record<string, any> = {};
function getCachedType(fullPath: string): any {
    if (!_typeCache[fullPath]) {
        _typeCache[fullPath] = loadType(fullPath);
    }
    return _typeCache[fullPath];
}

/**
 * 角色管理器（TS 门面）
 * 
 * 单例模式，封装对 C++ URoleManagementSubsystem 的所有操作。
 * 自动将 C++ 事件转发为 EventBus 事件，供其他 TS 模块监听。
 */
export class RoleManager {
    private static instance: RoleManager | null = null;

    /** 底层 C++ Subsystem 引用（缓存） */
    private subsystem: UE.RoleManagementSubsystem | null = null;

    /** 是否已绑定 C++ 委托 */
    private bDelegatesBound: boolean = false;

    /** 是否已尝试过初始化 */
    private bInitAttempted: boolean = false;

    private constructor() {}

    /** 获取单例实例 */
    static getInstance(): RoleManager {
        if (!RoleManager.instance) {
            RoleManager.instance = new RoleManager();
        }
        return RoleManager.instance;
    }

    // ==================== 初始化 ====================

    /**
     * 初始化角色管理器
     * 获取 C++ Subsystem 引用并绑定事件委托
     * @returns 是否初始化成功
     */
    initialize(): boolean {
        try {
            const subsystem = this.getSubsystem();
            if (!subsystem) {
                // 首次调用时 UE 环境可能尚未就绪，标记为待重试，不输出 error 级别
                if (!this.bInitAttempted) {
                    console.log(`${LOG_TAG} Subsystem 暂时不可用，将在首次使用时延迟初始化`);
                    this.bInitAttempted = true;
                }
                return false;
            }

            if (!subsystem.IsInitialized()) {
                console.warn(`${LOG_TAG} Subsystem 尚未初始化，将在首次使用时重试`);
                return false;
            }

            // 绑定 C++ 委托到 TS EventBus
            this.bindDelegates();

            console.log(`${LOG_TAG} 角色管理器初始化成功`);
            this.bInitAttempted = true;
            return true;
        } catch (e) {
            console.warn(`${LOG_TAG} 初始化暂未成功（UE 环境可能尚未就绪）: ${e}`);
            this.bInitAttempted = true;
            return false;
        }
    }

    /**
     * 检查是否已初始化
     * 如果之前初始化失败，会自动重试
     */
    isReady(): boolean {
        const sub = this.getSubsystem();
        if (sub && sub.IsInitialized()) {
            // 如果之前未成功绑定委托，趁此机会补上
            if (!this.bDelegatesBound) {
                this.bindDelegates();
            }
            return true;
        }
        return false;
    }

    // ==================== 角色注册 ====================

    /**
     * 注册一个角色定义
     * @param definition 角色定义
     * @returns 是否注册成功
     */
    registerRole(definition: IRoleDefinition): boolean {
        const sub = this.ensureSubsystem("registerRole");
        if (!sub) return false;

        try {
            // 参数校验
            if (!definition.roleId || definition.roleId.trim() === "") {
                console.error(`${LOG_TAG} registerRole 失败: roleId 为空`);
                return false;
            }

            // 转换为 C++ 结构
            const ueDef = this.toUERoleDefinition(definition);
            if (!ueDef) {
                console.error(`${LOG_TAG} registerRole 失败: 无法创建 UE RoleDefinition 结构体`);
                return false;
            }
            const result = sub.RegisterRole(ueDef);

            if (result) {
                console.log(`${LOG_TAG} 角色注册成功: ${definition.roleId}`);
                // 触发 TS 侧扩展事件
                EventBus.getInstance().emitScoped(RoleEventTypes.OnRoleRegistered, -1, GLOBAL_SCOPE, [{ roleId: definition.roleId }]);
            }
            return result;
        } catch (e) {
            console.error(`${LOG_TAG} registerRole 异常: ${e}`);
            return false;
        }
    }

    /**
     * 注销一个角色定义
     * @param roleId 角色ID
     * @returns 是否注销成功
     */
    unregisterRole(roleId: string): boolean {
        const sub = this.ensureSubsystem("unregisterRole");
        if (!sub) return false;

        try {
            const result = sub.UnregisterRole(roleId);
            if (result) {
                // 触发 TS 侧扩展事件
                EventBus.getInstance().emitScoped(RoleEventTypes.OnRoleUnregistered, -1, GLOBAL_SCOPE, [{ roleId }]);
            }
            return result;
        } catch (e) {
            console.error(`${LOG_TAG} unregisterRole 异常: ${e}`);
            return false;
        }
    }

    /**
     * 检查角色是否已注册
     * @param roleId 角色ID
     */
    isRoleRegistered(roleId: string): boolean {
        const sub = this.getSubsystem();
        if (!sub) return false;
        try {
            return sub.IsRoleRegistered(roleId);
        } catch (e) {
            return false;
        }
    }

    // ==================== 角色查询 ====================

    /**
     * 根据ID获取角色定义
     * @param roleId 角色ID
     * @returns 角色定义，未找到返回 null
     */
    getRoleDefinition(roleId: string): IRoleDefinition | null {
        const sub = this.ensureSubsystem("getRoleDefinition");
        if (!sub) return null;

        try {
            const outDefRef = $ref<UE.RoleDefinition>();
            const found = sub.GetRoleDefinition(roleId, outDefRef);
            if (!found) return null;
            const outDef = $unref(outDefRef);
            return this.fromUERoleDefinition(outDef);
        } catch (e) {
            console.error(`${LOG_TAG} getRoleDefinition 异常: ${e}`);
            return null;
        }
    }

    /**
     * 获取所有已注册的角色ID
     * @returns 角色ID数组
     */
    getAllRoleIds(): string[] {
        const sub = this.ensureSubsystem("getAllRoleIds");
        if (!sub) return [];

        try {
            const ueIds = sub.GetAllRoleIds();
            const result: string[] = [];
            for (let i = 0; i < ueIds.Num(); i++) {
                result.push(ueIds.Get(i).toString());
            }
            return result;
        } catch (e) {
            console.error(`${LOG_TAG} getAllRoleIds 异常: ${e}`);
            return [];
        }
    }

    /**
     * 获取已注册角色数量
     */
    getRegisteredRoleCount(): number {
        const sub = this.getSubsystem();
        if (!sub) return 0;
        try {
            return sub.GetRegisteredRoleCount();
        } catch (e) {
            return 0;
        }
    }

    // ==================== 当前角色状态 ====================

    /**
     * 获取当前激活角色的ID
     * @returns 角色ID，无激活角色时返回空字符串
     */
    getActiveRoleId(): string {
        const sub = this.getSubsystem();
        if (!sub) return "";
        try {
            const id = sub.GetActiveRoleId();
            return id.toString() === "None" ? "" : id.toString();
        } catch (e) {
            return "";
        }
    }

    /**
     * 获取当前激活角色的 Pawn 实例
     * @returns Pawn 引用，无激活角色时返回 null
     */
    getActiveRolePawn(): UE.Pawn | null {
        const sub = this.getSubsystem();
        if (!sub) return null;
        try {
            return sub.GetActiveRolePawn();
        } catch (e) {
            return null;
        }
    }

    /**
     * 当前是否有激活角色
     */
    hasActiveRole(): boolean {
        const sub = this.getSubsystem();
        if (!sub) return false;
        try {
            return sub.HasActiveRole();
        } catch (e) {
            return false;
        }
    }

    // ==================== 角色切换 ====================

    /**
     * 请求切换角色
     * @param request 切换请求
     * @returns 切换结果
     */
    requestSwitchRole(request: IRoleSwitchRequest): IRoleSwitchResult {
        const sub = this.ensureSubsystem("requestSwitchRole");
        if (!sub) {
            return {
                bSuccess: false,
                failReason: ERoleSwitchFailReason.BridgeError,
                previousRoleId: this.getActiveRoleId(),
                newRoleId: "",
                switchDuration: 0,
                failDetail: "无法获取 Subsystem",
            };
        }

        try {
            // 参数校验
            if (!request.targetRoleId || request.targetRoleId.trim() === "") {
                return {
                    bSuccess: false,
                    failReason: ERoleSwitchFailReason.BridgeError,
                    previousRoleId: this.getActiveRoleId(),
                    newRoleId: "",
                    switchDuration: 0,
                    failDetail: "目标角色 ID 为空",
                };
            }

            // 转换为 C++ 结构并调用
            const RoleSwitchRequestType = getCachedType("/Script/HD_2D.RoleSwitchRequest");
            if (!RoleSwitchRequestType) {
                return {
                    bSuccess: false,
                    failReason: ERoleSwitchFailReason.BridgeError,
                    previousRoleId: this.getActiveRoleId(),
                    newRoleId: "",
                    switchDuration: 0,
                    failDetail: "无法加载 RoleSwitchRequest 结构体类型",
                };
            }
            const ueRequest = new RoleSwitchRequestType() as UE.RoleSwitchRequest;
            ueRequest.TargetRoleId = request.targetRoleId;
            ueRequest.bForce = request.bForce ?? false;

            const ueResult = sub.RequestSwitchRole(ueRequest);
            return this.fromUESwitchResult(ueResult);
        } catch (e) {
            console.error(`${LOG_TAG} requestSwitchRole 异常: ${e}`);
            return {
                bSuccess: false,
                failReason: ERoleSwitchFailReason.BridgeError,
                previousRoleId: "",
                newRoleId: "",
                switchDuration: 0,
                failDetail: `桥接调用异常: ${e}`,
            };
        }
    }

    /**
     * 获取当前切换状态
     */
    getSwitchState(): ERoleSwitchState {
        const sub = this.getSubsystem();
        if (!sub) return ERoleSwitchState.Idle;
        try {
            return sub.GetSwitchState() as number as ERoleSwitchState;
        } catch (e) {
            return ERoleSwitchState.Idle;
        }
    }

    /**
     * 当前是否正在执行切换
     */
    isSwitching(): boolean {
        const sub = this.getSubsystem();
        if (!sub) return false;
        try {
            return sub.IsSwitching();
        } catch (e) {
            return false;
        }
    }

    // ==================== 角色可用性控制 ====================

    /**
     * 设置角色是否可用
     * @param roleId 角色ID
     * @param available 是否可用
     */
    setRoleAvailability(roleId: string, available: boolean): boolean {
        const sub = this.ensureSubsystem("setRoleAvailability");
        if (!sub) return false;
        try {
            return sub.SetRoleAvailability(roleId, available);
        } catch (e) {
            console.error(`${LOG_TAG} setRoleAvailability 异常: ${e}`);
            return false;
        }
    }

    /**
     * 设置角色是否可被切出
     * @param roleId 角色ID
     * @param switchable 是否可切换
     */
    setRoleSwitchable(roleId: string, switchable: boolean): boolean {
        const sub = this.ensureSubsystem("setRoleSwitchable");
        if (!sub) return false;
        try {
            return sub.SetRoleSwitchable(roleId, switchable);
        } catch (e) {
            console.error(`${LOG_TAG} setRoleSwitchable 异常: ${e}`);
            return false;
        }
    }

    // ==================== 调试 ====================

    /**
     * 打印当前系统状态（调试用）
     */
    debugPrintStatus(): void {
        const sub = this.getSubsystem();
        if (!sub) {
            console.log(`${LOG_TAG} [调试] Subsystem 不可用`);
            return;
        }
        try {
            sub.DebugPrintStatus();
            // 同时输出 TS 侧状态
            console.log(`${LOG_TAG} [调试] TS 桥接层状态:`);
            console.log(`  - Subsystem 缓存: ${this.subsystem ? "有" : "无"}`);
            console.log(`  - 委托已绑定: ${this.bDelegatesBound}`);
            console.log(`  - 当前激活角色: ${this.getActiveRoleId() || "无"}`);
        } catch (e) {
            console.error(`${LOG_TAG} debugPrintStatus 异常: ${e}`);
        }
    }

    // ==================== 内部方法 ====================

    /**
     * 获取 C++ Subsystem 引用
     * 使用缓存机制避免重复获取
     * 在 UE 环境尚未就绪时安全返回 null（不抛异常）
     * 
     * 注意：Normal Mode（Mixin 模式）下 PuerTS 不会调用 Start()，
     * 因此 argv 中不会有 GameInstance。
     * 这里通过多种回退策略获取 GameInstanceSubsystem。
     */
    private getSubsystem(): UE.RoleManagementSubsystem | null {
        if (this.subsystem) return this.subsystem;

        try {
            let sub: UE.RoleManagementSubsystem | null = null;
            const loadUEType = (globalThis as any).puerts?.loadUEType;

            // ========== 获取 GameInstance ==========
            let gi: UE.GameInstance | null = null;

            try {
                gi = (globalThis as any).puerts?.argv?.getByName?.("GameInstance") ?? null;
                if (gi) console.log(`${LOG_TAG} 通过 puerts.argv 获取 GameInstance 成功`);
            } catch (_) {}

            if (!gi) {
                console.warn(`${LOG_TAG} 无法获取 GameInstance`);
                return null;
            }

            try {
                const subsystemClass = this.getSubsystemClass();
                if (subsystemClass) {
                    // 先尝试直接使用 UE.SubsystemBlueprintLibrary
                    let libType = UE.SubsystemBlueprintLibrary;

                    if (!libType && typeof loadUEType === "function") {
                        libType = loadUEType("/Script/Engine.SubsystemBlueprintLibrary");
                        if (libType) {
                            console.log(`${LOG_TAG} 通过 loadUEType 完整路径加载 SubsystemBlueprintLibrary 成功`);
                        }
                    }

                    if (libType?.GetGameInstanceSubsystem) {
                        sub = libType.GetGameInstanceSubsystem(gi, subsystemClass) as UE.RoleManagementSubsystem;
                        if (sub) {
                            console.log(`${LOG_TAG} 通过 SubsystemBlueprintLibrary 获取 Subsystem 成功`);
                        }
                    } else {
                        console.warn(`${LOG_TAG} SubsystemBlueprintLibrary 不可用`);
                    }
                }
            } catch (e) {
                console.warn(`${LOG_TAG} 获取 Subsystem 异常: ${e}`);
            }

            this.subsystem = sub;
            return sub;
        } catch (e) {
            console.warn(`${LOG_TAG} 获取 Subsystem 异常: ${e}`);
            return null;
        }
    }

    /** Subsystem UClass 缓存 */
    private subsystemClassCache: UE.Class | null = null;

    /**
     * 获取 URoleManagementSubsystem 的 UClass 对象
     * 优先通过反射短名获取，失败则通过完整类路径加载
     */
    private getSubsystemClass(): UE.Class | null {
        if (this.subsystemClassCache) return this.subsystemClassCache;

        try {
            const loadUEType = (globalThis as any).puerts?.loadUEType;
            if (typeof loadUEType === "function") {
                const RoleSubsystemType = loadUEType("/Script/HD_2D.RoleManagementSubsystem");
                if (RoleSubsystemType && typeof RoleSubsystemType.StaticClass === "function") {
                    const cls = RoleSubsystemType.StaticClass();
                    if (cls) {
                        this.subsystemClassCache = cls;
                        console.log(`${LOG_TAG} 通过 loadUEType 完整路径加载 RoleManagementSubsystem UClass 成功`);
                        return cls;
                    }
                }
            }
        } catch (e) { console.warn(`${LOG_TAG} loadUEType 完整路径加载失败: ${e}`); }

        console.warn(`${LOG_TAG} 无法加载 RoleManagementSubsystem UClass（所有方式均失败）`);
        return null;
    }

    /**
     * 确保 Subsystem 可用，不可用时自动尝试延迟初始化
     */
    private ensureSubsystem(caller: string): UE.RoleManagementSubsystem | null {
        let sub = this.getSubsystem();

        // 如果之前初始化失败但现在 UE 环境已就绪，自动重试
        if (sub && !this.bDelegatesBound) {
            this.initialize();
        }

        if (!sub) {
            // 再尝试一次（可能 UE 环境刚刚就绪）
            sub = this.getSubsystem();
            if (sub && !this.bDelegatesBound) {
                this.initialize();
            }
        }

        if (!sub) {
            console.error(`${LOG_TAG} ${caller}: Subsystem 不可用（UE 环境可能尚未就绪）`);
            return null;
        }
        if (!sub.IsInitialized()) {
            console.error(`${LOG_TAG} ${caller}: Subsystem 尚未初始化`);
            return null;
        }
        return sub;
    }

    /**
     * 绑定 C++ 委托到 TS EventBus
     * 将 C++ 侧的角色事件转发为 EventBus 事件
     */
    private bindDelegates(): void {
        if (this.bDelegatesBound) return;
        const sub = this.getSubsystem();
        if (!sub) return;

        const eventBus = EventBus.getInstance();

        try {
            // 切换开始
            sub.OnRoleSwitchStarted.Add((request: any) => {
                const payload: IRoleSwitchStartedPayload = {
                    targetRoleId: request.TargetRoleId?.toString() ?? "",
                    force: request.bForce ?? false,
                    requestData: {}, // TODO: 转换requestData
                };
                eventBus.emitScoped(RoleEventTypes.OnRoleSwitchStarted, -1, GLOBAL_SCOPE, [payload]);
            });

            // 切换成功
            sub.OnRoleSwitchCompleted.Add((result: any) => {
                const payload: IRoleSwitchEventPayload = {
                    result: this.fromUESwitchResult(result),
                };
                eventBus.emitScoped(RoleEventTypes.OnRoleSwitchCompleted, -1, GLOBAL_SCOPE, [payload]);
            });

            // 切换失败
            sub.OnRoleSwitchFailed.Add((result: any) => {
                const payload: IRoleSwitchEventPayload = {
                    result: this.fromUESwitchResult(result),
                };
                eventBus.emitScoped(RoleEventTypes.OnRoleSwitchFailed, -1, GLOBAL_SCOPE, [payload]);
            });

            // 当前角色变更
            sub.OnActiveRoleChanged.Add((previousRoleId: any, newRoleId: any) => {
                const payload: IRoleChangedPayload = {
                    previousRoleId: previousRoleId?.toString() ?? "",
                    newRoleId: newRoleId?.toString() ?? "",
                };
                eventBus.emitScoped(RoleEventTypes.OnActiveRoleChanged, -1, GLOBAL_SCOPE, [payload]);
            });

            this.bDelegatesBound = true;
            console.log(`${LOG_TAG} C++ 委托已绑定到 EventBus`);
        } catch (e) {
            console.error(`${LOG_TAG} 绑定委托异常: ${e}`);
        }
    }

    /**
     * 将 TS IRoleDefinition 转换为 C++ FRoleDefinition
     */
    private toUERoleDefinition(def: IRoleDefinition): UE.RoleDefinition | null {
        try {
            const RoleDefinitionType = getCachedType("/Script/HD_2D.RoleDefinition");
            if (!RoleDefinitionType) {
                console.warn(`${LOG_TAG} 无法加载 RoleDefinition 结构体类型`);
                return null;
            }
            const ueDef = new RoleDefinitionType() as UE.RoleDefinition;
            ueDef.RoleId = def.roleId;
            ueDef.DisplayName = def.displayName;

            if (def.roleClassPath) {
                // 软引用路径通过扩展数据携带，由 C++ 侧自行加载
                try {
                    if (ueDef.ExtensionData) {
                        ueDef.ExtensionData.Add("RoleClassPath", def.roleClassPath);
                    }
                } catch (e) {
                    console.warn(`${LOG_TAG} 设置 ExtensionData 失败: ${e}`);
                }
            }

            ueDef.bAvailable = def.bAvailable ?? true;
            ueDef.bSwitchable = def.bSwitchable ?? true;

            return ueDef;
        } catch (e) {
            console.error(`${LOG_TAG} 创建 RoleDefinition 异常: ${e}`);
            return null;
        }
    }

    /**
     * 将 C++ FRoleDefinition 转换为 TS IRoleDefinition
     */
    private fromUERoleDefinition(ueDef: any): IRoleDefinition {
        return {
            roleId: ueDef.RoleId?.toString() ?? "",
            displayName: ueDef.DisplayName?.toString() ?? "",
            roleClassPath: ueDef.RoleClass?.toString() ?? "",
            bAvailable: ueDef.bAvailable ?? true,
            bSwitchable: ueDef.bSwitchable ?? true,
        };
    }

    /**
     * 将 C++ FRoleSwitchResult 转换为 TS IRoleSwitchResult
     */
    private fromUESwitchResult(ueResult: any): IRoleSwitchResult {
        return {
            bSuccess: ueResult.bSuccess ?? false,
            failReason: (ueResult.FailReason as number) ?? ERoleSwitchFailReason.None,
            previousRoleId: ueResult.PreviousRoleId?.toString() ?? "",
            newRoleId: ueResult.NewRoleId?.toString() ?? "",
            switchDuration: ueResult.SwitchDuration ?? 0,
            failDetail: ueResult.FailDetail ?? "",
        };
    }
}

/**
 * 角色管理门面模块（TypeScript 桥接层）
 *
 * 通过 SubsystemBridge 基类自动获得：
 *   - GameInstance 获取（argv / global / gameplay 三级回退）
 *   - Subsystem UClass 解析
 *   - 延迟初始化与自动重试
 *   - UE 结构体类型缓存
 *
 * 本模块只关心：
 *   - C++ 委托 → EventBus 转发
 *   - TS ↔ C++ 类型转换
 *   - 角色管理领域 API
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
import { SubsystemBridge, getUEType } from "../Bridge/SubsystemBridge";
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

/**
 * 角色管理器（TS 门面）
 *
 * 单例模式，封装对 C++ URoleManagementSubsystem 的所有操作。
 * 自动将 C++ 事件转发为 EventBus 事件，供其他 TS 模块监听。
 */
export class RoleManager extends SubsystemBridge<UE.RoleManagementSubsystem> {
    private static instance: RoleManager | null = null;

    static getInstance(): RoleManager {
        if (!RoleManager.instance) {
            RoleManager.instance = new RoleManager();
        }
        return RoleManager.instance;
    }

    private constructor() {
        super("/Script/HD_2D.RoleManagementSubsystem", "[RoleManager]");
    }

    // ==================== 委托绑定 ====================

    /** @override */
    protected bindDelegates(): void {
        if (this.bDelegatesBound) return;
        const sub = this.getSubsystem();
        if (!sub) return;

        const eventBus = EventBus.getInstance();

        try {
            sub.OnRoleSwitchStarted.Add((request: any) => {
                eventBus.emitScoped(RoleEventTypes.OnRoleSwitchStarted, -1, GLOBAL_SCOPE, [{
                    targetRoleId: request.TargetRoleId?.toString() ?? "",
                    force: request.bForce ?? false,
                    requestData: {},
                } as IRoleSwitchStartedPayload]);
            });

            sub.OnRoleSwitchCompleted.Add((result: any) => {
                eventBus.emitScoped(RoleEventTypes.OnRoleSwitchCompleted, -1, GLOBAL_SCOPE, [{
                    result: this.fromUESwitchResult(result),
                } as IRoleSwitchEventPayload]);
            });

            sub.OnRoleSwitchFailed.Add((result: any) => {
                eventBus.emitScoped(RoleEventTypes.OnRoleSwitchFailed, -1, GLOBAL_SCOPE, [{
                    result: this.fromUESwitchResult(result),
                } as IRoleSwitchEventPayload]);
            });

            sub.OnActiveRoleChanged.Add((previousRoleId: any, newRoleId: any) => {
                eventBus.emitScoped(RoleEventTypes.OnActiveRoleChanged, -1, GLOBAL_SCOPE, [{
                    previousRoleId: previousRoleId?.toString() ?? "",
                    newRoleId: newRoleId?.toString() ?? "",
                } as IRoleChangedPayload]);
            });

            this.bDelegatesBound = true;
            console.log(`${this.logTag} C++ 委托已绑定到 EventBus`);
        } catch (e) {
            console.error(`${this.logTag} 绑定委托异常: ${e}`);
        }
    }

    // ==================== 角色注册 ====================

    registerRole(definition: IRoleDefinition): boolean {
        const sub = this.ensureSubsystem("registerRole");
        if (!sub) return false;

        try {
            if (!definition.roleId || definition.roleId.trim() === "") {
                console.error(`${this.logTag} registerRole 失败: roleId 为空`);
                return false;
            }

            const ueDef = this.toUERoleDefinition(definition);
            if (!ueDef) {
                console.error(`${this.logTag} registerRole 失败: 无法创建 UE RoleDefinition`);
                return false;
            }
            if (sub.RegisterRole(ueDef)) {
                console.log(`${this.logTag} 角色注册成功: ${definition.roleId}`);
                EventBus.getInstance().emitScoped(
                    RoleEventTypes.OnRoleRegistered, -1, GLOBAL_SCOPE, [{ roleId: definition.roleId }]
                );
                return true;
            }
            return false;
        } catch (e) {
            console.error(`${this.logTag} registerRole 异常: ${e}`);
            return false;
        }
    }

    unregisterRole(roleId: string): boolean {
        const sub = this.ensureSubsystem("unregisterRole");
        if (!sub) return false;
        try {
            if (sub.UnregisterRole(roleId)) {
                EventBus.getInstance().emitScoped(
                    RoleEventTypes.OnRoleUnregistered, -1, GLOBAL_SCOPE, [{ roleId }]
                );
                return true;
            }
            return false;
        } catch (e) {
            console.error(`${this.logTag} unregisterRole 异常: ${e}`);
            return false;
        }
    }

    isRoleRegistered(roleId: string): boolean {
        const sub = this.getSubsystem();
        if (!sub) return false;
        try { return sub.IsRoleRegistered(roleId); } catch { return false; }
    }

    // ==================== 角色查询 ====================

    getRoleDefinition(roleId: string): IRoleDefinition | null {
        const sub = this.ensureSubsystem("getRoleDefinition");
        if (!sub) return null;
        try {
            const outDefRef = $ref<UE.RoleDefinition>();
            if (!sub.GetRoleDefinition(roleId, outDefRef)) return null;
            return this.fromUERoleDefinition($unref(outDefRef));
        } catch (e) {
            console.error(`${this.logTag} getRoleDefinition 异常: ${e}`);
            return null;
        }
    }

    getAllRoleIds(): string[] {
        const sub = this.ensureSubsystem("getAllRoleIds");
        if (!sub) return [];
        try {
            const ueIds = sub.GetAllRoleIds();
            const result: string[] = [];
            for (let i = 0; i < ueIds.Num(); i++) result.push(ueIds.Get(i).toString());
            return result;
        } catch (e) {
            console.error(`${this.logTag} getAllRoleIds 异常: ${e}`);
            return [];
        }
    }

    getRegisteredRoleCount(): number {
        const sub = this.getSubsystem();
        if (!sub) return 0;
        try { return sub.GetRegisteredRoleCount(); } catch { return 0; }
    }

    // ==================== 当前角色状态 ====================

    getActiveRoleId(): string {
        const sub = this.getSubsystem();
        if (!sub) return "";
        try {
            const id = sub.GetActiveRoleId();
            return id.toString() === "None" ? "" : id.toString();
        } catch { return ""; }
    }

    getActiveRolePawn(): UE.Pawn | null {
        const sub = this.getSubsystem();
        if (!sub) return null;
        try { return sub.GetActiveRolePawn(); } catch { return null; }
    }

    hasActiveRole(): boolean {
        const sub = this.getSubsystem();
        if (!sub) return false;
        try { return sub.HasActiveRole(); } catch { return false; }
    }

    // ==================== 角色切换 ====================

    requestSwitchRole(request: IRoleSwitchRequest): IRoleSwitchResult {
        const sub = this.ensureSubsystem("requestSwitchRole");
        if (!sub) return this.failResult("无法获取 Subsystem");

        try {
            if (!request.targetRoleId || request.targetRoleId.trim() === "") {
                return this.failResult("目标角色 ID 为空");
            }

            const Type = getUEType("/Script/HD_2D.RoleSwitchRequest");
            if (!Type) return this.failResult("无法加载 RoleSwitchRequest 类型");

            const ueRequest = new Type() as UE.RoleSwitchRequest;
            ueRequest.TargetRoleId = request.targetRoleId;
            ueRequest.bForce = request.bForce ?? false;

            return this.fromUESwitchResult(sub.RequestSwitchRole(ueRequest));
        } catch (e) {
            console.error(`${this.logTag} requestSwitchRole 异常: ${e}`);
            return this.failResult(`桥接调用异常: ${e}`);
        }
    }

    getSwitchState(): ERoleSwitchState {
        const sub = this.getSubsystem();
        if (!sub) return ERoleSwitchState.Idle;
        try { return sub.GetSwitchState() as number as ERoleSwitchState; } catch { return ERoleSwitchState.Idle; }
    }

    isSwitching(): boolean {
        const sub = this.getSubsystem();
        if (!sub) return false;
        try { return sub.IsSwitching(); } catch { return false; }
    }

    // ==================== 角色可用性控制 ====================

    setRoleAvailability(roleId: string, available: boolean): boolean {
        const sub = this.ensureSubsystem("setRoleAvailability");
        if (!sub) return false;
        try { return sub.SetRoleAvailability(roleId, available); } catch (e) {
            console.error(`${this.logTag} setRoleAvailability 异常: ${e}`); return false;
        }
    }

    setRoleSwitchable(roleId: string, switchable: boolean): boolean {
        const sub = this.ensureSubsystem("setRoleSwitchable");
        if (!sub) return false;
        try { return sub.SetRoleSwitchable(roleId, switchable); } catch (e) {
            console.error(`${this.logTag} setRoleSwitchable 异常: ${e}`); return false;
        }
    }

    // ==================== 调试 ====================

    debugPrintStatus(): void {
        const sub = this.getSubsystem();
        if (!sub) {
            console.log(`${this.logTag} [调试] Subsystem 不可用`);
            return;
        }
        try {
            sub.DebugPrintStatus();
            console.log(`${this.logTag} [调试] TS 桥接层状态:`);
            console.log(`  - Subsystem 缓存: ${this.subsystem ? "有" : "无"}`);
            console.log(`  - 委托已绑定: ${this.bDelegatesBound}`);
            console.log(`  - 当前激活角色: ${this.getActiveRoleId() || "无"}`);
        } catch (e) {
            console.error(`${this.logTag} debugPrintStatus 异常: ${e}`);
        }
    }

    // ==================== 类型转换 ====================

    private toUERoleDefinition(def: IRoleDefinition): UE.RoleDefinition | null {
        try {
            const Type = getUEType("/Script/HD_2D.RoleDefinition");
            if (!Type) return null;
            const ueDef = new Type() as UE.RoleDefinition;
            ueDef.RoleId = def.roleId;
            ueDef.DisplayName = def.displayName;
            if (def.roleClassPath) {
                try { ueDef.ExtensionData?.Add("RoleClassPath", def.roleClassPath); } catch {}
            }
            ueDef.bAvailable = def.bAvailable ?? true;
            ueDef.bSwitchable = def.bSwitchable ?? true;
            return ueDef;
        } catch (e) {
            console.error(`${this.logTag} 创建 RoleDefinition 异常: ${e}`);
            return null;
        }
    }

    private fromUERoleDefinition(ueDef: any): IRoleDefinition {
        return {
            roleId: ueDef.RoleId?.toString() ?? "",
            displayName: ueDef.DisplayName?.toString() ?? "",
            roleClassPath: ueDef.RoleClass?.toString() ?? "",
            bAvailable: ueDef.bAvailable ?? true,
            bSwitchable: ueDef.bSwitchable ?? true,
        };
    }

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

    private failResult(detail: string): IRoleSwitchResult {
        return {
            bSuccess: false,
            failReason: ERoleSwitchFailReason.BridgeError,
            previousRoleId: this.getActiveRoleId(),
            newRoleId: "",
            switchDuration: 0,
            failDetail: detail,
        };
    }
}

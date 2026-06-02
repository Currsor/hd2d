"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleManager = void 0;
const puerts_1 = require("puerts");
const EventBus_1 = require("../Mixin/EventBus");
const EventContext_1 = require("../Mixin/EventContext");
const SubsystemBridge_1 = require("../Bridge/SubsystemBridge");
const RoleEventTypes_1 = require("./RoleEventTypes");
const RoleTypes_1 = require("./RoleTypes");
/**
 * 角色管理器（TS 门面）
 *
 * 单例模式，封装对 C++ URoleManagementSubsystem 的所有操作。
 * 自动将 C++ 事件转发为 EventBus 事件，供其他 TS 模块监听。
 */
class RoleManager extends SubsystemBridge_1.SubsystemBridge {
    static instance = null;
    static getInstance() {
        if (!RoleManager.instance) {
            RoleManager.instance = new RoleManager();
        }
        return RoleManager.instance;
    }
    constructor() {
        super("/Script/HD_2D.RoleManagementSubsystem", "[RoleManager]");
    }
    // ==================== 委托绑定 ====================
    /** @override */
    bindDelegates() {
        if (this.bDelegatesBound)
            return;
        const sub = this.getSubsystem();
        if (!sub)
            return;
        const eventBus = EventBus_1.EventBus.getInstance();
        try {
            sub.OnRoleSwitchStarted.Add((request) => {
                eventBus.emitScoped(RoleEventTypes_1.RoleEventTypes.OnRoleSwitchStarted, -1, EventContext_1.GLOBAL_SCOPE, [{
                        targetRoleId: request.TargetRoleId?.toString() ?? "",
                        force: request.bForce ?? false,
                        requestData: {},
                    }]);
            });
            sub.OnRoleSwitchCompleted.Add((result) => {
                eventBus.emitScoped(RoleEventTypes_1.RoleEventTypes.OnRoleSwitchCompleted, -1, EventContext_1.GLOBAL_SCOPE, [{
                        result: this.fromUESwitchResult(result),
                    }]);
            });
            sub.OnRoleSwitchFailed.Add((result) => {
                eventBus.emitScoped(RoleEventTypes_1.RoleEventTypes.OnRoleSwitchFailed, -1, EventContext_1.GLOBAL_SCOPE, [{
                        result: this.fromUESwitchResult(result),
                    }]);
            });
            sub.OnActiveRoleChanged.Add((previousRoleId, newRoleId) => {
                eventBus.emitScoped(RoleEventTypes_1.RoleEventTypes.OnActiveRoleChanged, -1, EventContext_1.GLOBAL_SCOPE, [{
                        previousRoleId: previousRoleId?.toString() ?? "",
                        newRoleId: newRoleId?.toString() ?? "",
                    }]);
            });
            this.bDelegatesBound = true;
            console.log(`${this.logTag} C++ 委托已绑定到 EventBus`);
        }
        catch (e) {
            console.error(`${this.logTag} 绑定委托异常: ${e}`);
        }
    }
    // ==================== 角色注册 ====================
    registerRole(definition) {
        const sub = this.ensureSubsystem("registerRole");
        if (!sub)
            return false;
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
                EventBus_1.EventBus.getInstance().emitScoped(RoleEventTypes_1.RoleEventTypes.OnRoleRegistered, -1, EventContext_1.GLOBAL_SCOPE, [{ roleId: definition.roleId }]);
                return true;
            }
            return false;
        }
        catch (e) {
            console.error(`${this.logTag} registerRole 异常: ${e}`);
            return false;
        }
    }
    unregisterRole(roleId) {
        const sub = this.ensureSubsystem("unregisterRole");
        if (!sub)
            return false;
        try {
            if (sub.UnregisterRole(roleId)) {
                EventBus_1.EventBus.getInstance().emitScoped(RoleEventTypes_1.RoleEventTypes.OnRoleUnregistered, -1, EventContext_1.GLOBAL_SCOPE, [{ roleId }]);
                return true;
            }
            return false;
        }
        catch (e) {
            console.error(`${this.logTag} unregisterRole 异常: ${e}`);
            return false;
        }
    }
    isRoleRegistered(roleId) {
        const sub = this.getSubsystem();
        if (!sub)
            return false;
        try {
            return sub.IsRoleRegistered(roleId);
        }
        catch {
            return false;
        }
    }
    // ==================== 角色查询 ====================
    getRoleDefinition(roleId) {
        const sub = this.ensureSubsystem("getRoleDefinition");
        if (!sub)
            return null;
        try {
            const outDefRef = (0, puerts_1.$ref)();
            if (!sub.GetRoleDefinition(roleId, outDefRef))
                return null;
            return this.fromUERoleDefinition((0, puerts_1.$unref)(outDefRef));
        }
        catch (e) {
            console.error(`${this.logTag} getRoleDefinition 异常: ${e}`);
            return null;
        }
    }
    getAllRoleIds() {
        const sub = this.ensureSubsystem("getAllRoleIds");
        if (!sub)
            return [];
        try {
            const ueIds = sub.GetAllRoleIds();
            const result = [];
            for (let i = 0; i < ueIds.Num(); i++)
                result.push(ueIds.Get(i).toString());
            return result;
        }
        catch (e) {
            console.error(`${this.logTag} getAllRoleIds 异常: ${e}`);
            return [];
        }
    }
    getRegisteredRoleCount() {
        const sub = this.getSubsystem();
        if (!sub)
            return 0;
        try {
            return sub.GetRegisteredRoleCount();
        }
        catch {
            return 0;
        }
    }
    // ==================== 当前角色状态 ====================
    getActiveRoleId() {
        const sub = this.getSubsystem();
        if (!sub)
            return "";
        try {
            const id = sub.GetActiveRoleId();
            return id.toString() === "None" ? "" : id.toString();
        }
        catch {
            return "";
        }
    }
    getActiveRolePawn() {
        const sub = this.getSubsystem();
        if (!sub)
            return null;
        try {
            return sub.GetActiveRolePawn();
        }
        catch {
            return null;
        }
    }
    hasActiveRole() {
        const sub = this.getSubsystem();
        if (!sub)
            return false;
        try {
            return sub.HasActiveRole();
        }
        catch {
            return false;
        }
    }
    // ==================== 角色切换 ====================
    requestSwitchRole(request) {
        const sub = this.ensureSubsystem("requestSwitchRole");
        if (!sub)
            return this.failResult("无法获取 Subsystem");
        try {
            if (!request.targetRoleId || request.targetRoleId.trim() === "") {
                return this.failResult("目标角色 ID 为空");
            }
            const Type = (0, SubsystemBridge_1.getUEType)("/Script/HD_2D.RoleSwitchRequest");
            if (!Type)
                return this.failResult("无法加载 RoleSwitchRequest 类型");
            const ueRequest = new Type();
            ueRequest.TargetRoleId = request.targetRoleId;
            ueRequest.bForce = request.bForce ?? false;
            return this.fromUESwitchResult(sub.RequestSwitchRole(ueRequest));
        }
        catch (e) {
            console.error(`${this.logTag} requestSwitchRole 异常: ${e}`);
            return this.failResult(`桥接调用异常: ${e}`);
        }
    }
    getSwitchState() {
        const sub = this.getSubsystem();
        if (!sub)
            return RoleTypes_1.ERoleSwitchState.Idle;
        try {
            return sub.GetSwitchState();
        }
        catch {
            return RoleTypes_1.ERoleSwitchState.Idle;
        }
    }
    isSwitching() {
        const sub = this.getSubsystem();
        if (!sub)
            return false;
        try {
            return sub.IsSwitching();
        }
        catch {
            return false;
        }
    }
    // ==================== 角色可用性控制 ====================
    setRoleAvailability(roleId, available) {
        const sub = this.ensureSubsystem("setRoleAvailability");
        if (!sub)
            return false;
        try {
            return sub.SetRoleAvailability(roleId, available);
        }
        catch (e) {
            console.error(`${this.logTag} setRoleAvailability 异常: ${e}`);
            return false;
        }
    }
    setRoleSwitchable(roleId, switchable) {
        const sub = this.ensureSubsystem("setRoleSwitchable");
        if (!sub)
            return false;
        try {
            return sub.SetRoleSwitchable(roleId, switchable);
        }
        catch (e) {
            console.error(`${this.logTag} setRoleSwitchable 异常: ${e}`);
            return false;
        }
    }
    // ==================== 调试 ====================
    debugPrintStatus() {
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
        }
        catch (e) {
            console.error(`${this.logTag} debugPrintStatus 异常: ${e}`);
        }
    }
    // ==================== 类型转换 ====================
    toUERoleDefinition(def) {
        try {
            const Type = (0, SubsystemBridge_1.getUEType)("/Script/HD_2D.RoleDefinition");
            if (!Type)
                return null;
            const ueDef = new Type();
            ueDef.RoleId = def.roleId;
            ueDef.DisplayName = def.displayName;
            if (def.roleClassPath) {
                try {
                    ueDef.ExtensionData?.Add("RoleClassPath", def.roleClassPath);
                }
                catch { }
            }
            ueDef.bAvailable = def.bAvailable ?? true;
            ueDef.bSwitchable = def.bSwitchable ?? true;
            return ueDef;
        }
        catch (e) {
            console.error(`${this.logTag} 创建 RoleDefinition 异常: ${e}`);
            return null;
        }
    }
    fromUERoleDefinition(ueDef) {
        return {
            roleId: ueDef.RoleId?.toString() ?? "",
            displayName: ueDef.DisplayName?.toString() ?? "",
            roleClassPath: ueDef.RoleClass?.toString() ?? "",
            bAvailable: ueDef.bAvailable ?? true,
            bSwitchable: ueDef.bSwitchable ?? true,
        };
    }
    fromUESwitchResult(ueResult) {
        return {
            bSuccess: ueResult.bSuccess ?? false,
            failReason: ueResult.FailReason ?? RoleTypes_1.ERoleSwitchFailReason.None,
            previousRoleId: ueResult.PreviousRoleId?.toString() ?? "",
            newRoleId: ueResult.NewRoleId?.toString() ?? "",
            switchDuration: ueResult.SwitchDuration ?? 0,
            failDetail: ueResult.FailDetail ?? "",
        };
    }
    failResult(detail) {
        return {
            bSuccess: false,
            failReason: RoleTypes_1.ERoleSwitchFailReason.BridgeError,
            previousRoleId: this.getActiveRoleId(),
            newRoleId: "",
            switchDuration: 0,
            failDetail: detail,
        };
    }
}
exports.RoleManager = RoleManager;
//# sourceMappingURL=RoleManager.js.map
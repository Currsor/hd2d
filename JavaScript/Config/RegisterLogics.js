"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 逻辑类注册入口
 * 在此文件中注册所有逻辑类型和服务
 */
const LogicManager_1 = require("../Mixin/LogicManager");
const DIContainer_1 = require("../Mixin/DIContainer");
const logicManager = LogicManager_1.LogicManager.getInstance();
const container = DIContainer_1.DIContainer.getInstance();
// ========== 在此注册所有逻辑类型 ==========
const BP_Cube_1 = require("../Logic/BP_Cube");
logicManager.registerLogicClass("BP_Cube", BP_Cube_1.BP_Cube);
// 角色基础逻辑类 - 用于容器模式下的角色管理
const CharacterBaseLogic_1 = require("../Logic/CharacterBaseLogic");
logicManager.registerLogicClass("CharacterBaseLogic", CharacterBaseLogic_1.CharacterBaseLogic);
// Currsor 角色专属逻辑类
const CurrsorLogic_1 = require("../Logic/CurrsorLogic");
logicManager.registerLogicClass("CurrsorLogic", CurrsorLogic_1.CurrsorLogic);
// ABP_Currsor 动画蓝图状态同步逻辑类
const ABP_CurrsorAnimLogic_1 = require("../Logic/ABP_CurrsorAnimLogic");
logicManager.registerLogicClass("ABP_CurrsorAnim", ABP_CurrsorAnimLogic_1.ABP_CurrsorAnimLogic);
// 自定义池配置：怪物频繁生成/销毁，池大，预热5个
// logicManager.registerLogicClass("Monster", Monster, {
//     maxSize: 20,
//     lazyInit: false,
//     prewarmCount: 5,
// });
// UI 逻辑不需要池化
// logicManager.registerLogicClass("MainHUD", MainHUD, {
//     maxSize: 0,  // 0 = 不池化
// ========== 初始化角色管理系统 ==========
// 注意：在模块加载阶段 UE.GameplayStatics 可能尚未就绪，
// initialize() 会安全降级，首次实际使用时自动重试（延迟初始化）
const RoleManager_1 = require("../RoleManagement/RoleManager");
const roleManager = RoleManager_1.RoleManager.getInstance();
roleManager.initialize();
// ========== 注册角色定义 ==========
const RegisterRoles_1 = require("./RegisterRoles");
(0, RegisterRoles_1.registerAllRoles)();
// ========== 在此注册所有服务 ==========
// --- 角色管理系统 TS 包装层 ---
container.register("RoleManager", () => RoleManager_1.RoleManager.getInstance());
// --- TS 层轻量工具服务 ---
// container.register("ConfigReader", () => new ConfigReader());
// --- UE Subsystem 的 TS 包装层 ---
// 将获取 C++ Subsystem 的样板代码封装一次，逻辑类通过 @Inject 或 resolve() 便捷访问
// container.register("InventorySystem", () => {
//     const gi = UE.GameplayStatics.GetGameInstance(globalThis.__world);
//     return UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(
//         gi, UE.BP_InventorySubsystem.StaticClass()
//     ) as UE.BP_InventorySubsystem;
// });
// container.register("SaveSystem", () => {
//     const gi = UE.GameplayStatics.GetGameInstance(globalThis.__world);
//     return UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(
//         gi, UE.BP_SaveSubsystem.StaticClass()
//     ) as UE.BP_SaveSubsystem;
// });
console.log("[RegisterLogics] 所有逻辑类型和服务注册完毕");
//# sourceMappingURL=RegisterLogics.js.map
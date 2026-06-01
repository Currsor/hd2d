/**
 * 逻辑类注册入口
 * 在此文件中注册所有逻辑类型和服务
 */
import { LogicManager } from "../Mixin/LogicManager";
import { DIContainer } from "../Mixin/DIContainer";

const logicManager = LogicManager.getInstance();
const container = DIContainer.getInstance();

// ========== 在此注册所有逻辑类型 ==========
import { BP_Cube } from "../Logic/BP_Cube";
logicManager.registerLogicClass("BP_Cube", BP_Cube);

// 角色基础逻辑类 - 用于容器模式下的角色管理
import { CharacterBaseLogic } from "../Logic/CharacterBaseLogic";
logicManager.registerLogicClass("CharacterBaseLogic", CharacterBaseLogic);

// Currsor 角色专属逻辑类
import { CurrsorLogic } from "../Logic/CurrsorLogic";
logicManager.registerLogicClass("CurrsorLogic", CurrsorLogic);

// ABP_Currsor 动画蓝图状态同步逻辑类
import { ABP_CurrsorAnimLogic } from "../Logic/ABP_CurrsorAnimLogic";
logicManager.registerLogicClass("ABP_CurrsorAnim", ABP_CurrsorAnimLogic);

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
import { RoleManager } from "../RoleManagement/RoleManager";
const roleManager = RoleManager.getInstance();
roleManager.initialize();

// ========== 注册角色定义 ==========
import { registerAllRoles } from "./RegisterRoles";
registerAllRoles();

// ========== 在此注册所有服务 ==========

// --- 角色管理系统 TS 包装层 ---
container.register("RoleManager", () => RoleManager.getInstance());

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

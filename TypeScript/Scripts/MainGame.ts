/**
 * 游戏入口文件
 * 1. 初始化事件总线和依赖注入容器
 * 2. 注册所有逻辑类型和服务
 * 3. 执行蓝图函数库 Mixin 注入
 */

// 第一步：初始化基础设施（EventBus 和 DIContainer 在首次 getInstance 时自动创建）
import "./Mixin/EventBus";
import "./Mixin/DIContainer";

// 第二步：注册所有逻辑类型和服务
import "./Config/RegisterLogics";

// 第三步：执行 BFL_JSLogic 蓝图函数库的 Mixin 注入
import "./Mixin/BP_JSBridge_Mixin";

console.log("[MainGame] 游戏初始化完成");

// 第四步：运行角色管理系统验证（开发阶段）
// import { RoleSystemValidator } from "./RoleManagement/RoleSystemValidator";
// RoleSystemValidator.runAll();
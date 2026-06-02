"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAllRoles = registerAllRoles;
/**
 * 角色注册配置
 *
 * 在此文件中集中定义和注册所有可用角色。
 * 角色的 roleId 必须与 C++ AHDPlayerController 的 OrderedRoleIds 配置中的名称一致。
 *
 * roleClassPath 为角色蓝图的软引用路径（完整路径 + _C 后缀），
 * 由 C++ RoleManagementSubsystem 在切换时 LoadSynchronous 加载。
 *
 * 注意：本文件的 registerAllRoles() 由 RegisterLogics.ts 在 RoleManager 初始化之后调用。
 */
const RoleManager_1 = require("../RoleManagement/RoleManager");
/** 日志标签 */
const LOG_TAG = "[RegisterRoles]";
/**
 * 所有角色定义（集中维护，方便策划调整）
 *
 * 字段说明：
 * - roleId:        唯一标识符，需与蓝图中 AHDPlayerController.OrderedRoleIds 保持一致
 * - displayName:   UI 展示名称
 * - roleClassPath: 蓝图类软引用路径，格式为 /Game/路径/蓝图名.蓝图名_C
 * - bAvailable:    是否默认可用（false = 需要通过游戏逻辑解锁）
 * - bSwitchable:   是否允许被切出（false = 当前角色锁定，不可切换到其他角色）
 */
const ROLE_DEFINITIONS = [
    {
        roleId: "Currsor",
        displayName: "Currsor",
        roleClassPath: "/Game/Blueprints/Player/Currsor/BP_Currsor.BP_Currsor_C",
        bAvailable: true,
        bSwitchable: true,
    }
];
/**
 * 注册所有角色到 RoleManagementSubsystem
 *
 * 遍历 ROLE_DEFINITIONS 逐一调用 RoleManager.registerRole()，
 * 注册结果由 C++ 层持有，TS 层不缓存。
 *
 * @returns 成功注册的角色数量
 */
function registerAllRoles() {
    const roleManager = RoleManager_1.RoleManager.getInstance();
    if (ROLE_DEFINITIONS.length === 0) {
        console.warn(`${LOG_TAG} 角色定义列表为空，请在 ROLE_DEFINITIONS 中添加角色配置`);
        return 0;
    }
    let successCount = 0;
    for (const def of ROLE_DEFINITIONS) {
        if (roleManager.registerRole(def)) {
            successCount++;
        }
        else {
            console.warn(`${LOG_TAG} 角色 '${def.roleId}' 注册失败`);
        }
    }
    console.log(`${LOG_TAG} 角色注册完成: ${successCount}/${ROLE_DEFINITIONS.length}`);
    return successCount;
}
//# sourceMappingURL=RegisterRoles.js.map
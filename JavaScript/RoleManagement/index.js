"use strict";
/**
 * 角色管理系统 - 公共 API 导出
 *
 * 本文件作为角色管理系统的统一入口，导出所有公共类型和接口。
 * 外部模块只需 import 本文件即可访问角色系统能力。
 *
 * 使用方式：
 * ```ts
 * import { RoleManager, RoleEventTypes, IRoleSwitchResult } from "../RoleManagement";
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERoleSwitchFailReason = exports.ERoleSwitchState = exports.RoleEventTypes = exports.RoleManager = void 0;
// 核心门面
var RoleManager_1 = require("./RoleManager");
Object.defineProperty(exports, "RoleManager", { enumerable: true, get: function () { return RoleManager_1.RoleManager; } });
// 事件类型
var RoleEventTypes_1 = require("./RoleEventTypes");
Object.defineProperty(exports, "RoleEventTypes", { enumerable: true, get: function () { return RoleEventTypes_1.RoleEventTypes; } });
// 类型定义
var RoleTypes_1 = require("./RoleTypes");
Object.defineProperty(exports, "ERoleSwitchState", { enumerable: true, get: function () { return RoleTypes_1.ERoleSwitchState; } });
Object.defineProperty(exports, "ERoleSwitchFailReason", { enumerable: true, get: function () { return RoleTypes_1.ERoleSwitchFailReason; } });
//# sourceMappingURL=index.js.map
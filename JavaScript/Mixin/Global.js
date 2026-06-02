"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._G = exports.Global = void 0;
/**
 * 全局对象
 * 存储已注册的逻辑类型表
 */
class Global {
    registeredClasses;
    constructor() {
        this.registeredClasses = new Map();
    }
}
exports.Global = Global;
exports._G = new Global();
//# sourceMappingURL=Global.js.map
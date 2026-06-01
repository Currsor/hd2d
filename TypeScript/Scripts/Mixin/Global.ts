import { GameObjectBase } from "./GameObjectBase";

/**
 * 全局对象
 * 存储已注册的逻辑类型表
 */
export class Global {
    registeredClasses: Map<string, typeof GameObjectBase>;
    constructor() {
        this.registeredClasses = new Map<string, typeof GameObjectBase>();
    }
}

export const _G = new Global();
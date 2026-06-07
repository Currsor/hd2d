"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogicManager = void 0;
const EventBus_1 = require("./EventBus");
const EventContext_1 = require("./EventContext");
const Global_1 = require("./Global");
/** 默认池配置 */
const DEFAULT_POOL_CONFIG = {
    maxSize: 10,
    lazyInit: true,
    prewarmCount: 0,
};
/**
 * 逻辑管理器（单例）
 * 负责管理所有 JS 逻辑实例的创建、销毁和池化复用
 * 维护 逻辑ID → JS逻辑对象 的映射关系
 * 支持 Actor、UserWidget 等所有蓝图对象类型
 * 支持对象池化（Pool）和懒加载（Lazy）以优化内存和性能
 */
class LogicManager {
    static instance = null;
    /** 自增ID计数器 */
    nextId = 1;
    /** 逻辑ID → 逻辑实例 的映射表 */
    logicMap = new Map();
    /** 逻辑ID → 类型名称 的反查映射（回收时分类入池） */
    logicTypeMap = new Map();
    /** 类型名称 → 对象池（存放被回收的实例） */
    pool = new Map();
    /** 类型名称 → 池配置 */
    poolConfigs = new Map();
    constructor() {
        // 向 EventBus 注册实例有效性校验函数
        EventBus_1.EventBus.getInstance().setInstanceValidator((logicId) => {
            return this.isLogicValid(logicId);
        });
    }
    /** 获取单例实例 */
    static getInstance() {
        if (!LogicManager.instance) {
            LogicManager.instance = new LogicManager();
        }
        return LogicManager.instance;
    }
    /**
     * 注册逻辑类型
     * @param typeName 类型名称
     * @param logicClass 对应的 GameObjectBase 子类
     * @param poolConfig 可选的对象池配置
     */
    registerLogicClass(typeName, logicClass, poolConfig) {
        Global_1._G.registeredClasses.set(typeName, logicClass);
        // 合并池配置
        const config = { ...DEFAULT_POOL_CONFIG, ...poolConfig };
        this.poolConfigs.set(typeName, config);
        // 初始化对象池
        if (!this.pool.has(typeName)) {
            this.pool.set(typeName, []);
        }
        // 非懒加载模式且设置了预热数量，立即预创建实例
        if (!config.lazyInit && config.prewarmCount > 0) {
            this.prewarm(typeName, config.prewarmCount);
        }
        console.log(`[LogicManager] 注册逻辑类型: ${typeName} (池容量=${config.maxSize}, 懒加载=${config.lazyInit})`);
    }
    /**
     * 预热对象池（提前创建指定数量的实例放入池中）
     * @param typeName 类型名称
     * @param count 预热数量
     */
    prewarm(typeName, count) {
        const LogicClass = Global_1._G.registeredClasses.get(typeName);
        if (!LogicClass) {
            console.warn(`[LogicManager] 预热失败，未找到逻辑类型: ${typeName}`);
            return;
        }
        const config = this.poolConfigs.get(typeName) || DEFAULT_POOL_CONFIG;
        const poolArr = this.pool.get(typeName) || [];
        const toCreate = Math.min(count, config.maxSize - poolArr.length);
        for (let i = 0; i < toCreate; i++) {
            const instance = new LogicClass();
            poolArr.push(instance);
        }
        this.pool.set(typeName, poolArr);
        console.log(`[LogicManager] 预热对象池: ${typeName}, 创建了 ${toCreate} 个实例`);
    }
    /**
     * 创建逻辑实例（优先从对象池中获取）
     * @param typeName 逻辑类型名称（需先通过 registerLogicClass 注册）
     * @param owner 拥有此逻辑的蓝图对象（Actor、UserWidget 等）
     * @returns 逻辑实例ID，失败返回 -1
     */
    createLogic(typeName, owner) {
        const LogicClass = Global_1._G.registeredClasses.get(typeName);
        if (!LogicClass) {
            console.error(`[LogicManager] 未找到逻辑类型: ${typeName}，请先调用 registerLogicClass 注册`);
            return -1;
        }
        const logicId = this.nextId++;
        let logicInstance;
        // 优先从对象池取出复用
        const poolArr = this.pool.get(typeName);
        if (poolArr && poolArr.length > 0) {
            logicInstance = poolArr.pop();
            console.log(`[LogicManager] 从对象池复用: type=${typeName}, 池剩余=${poolArr.length}`);
        }
        else {
            logicInstance = new LogicClass();
        }
        logicInstance.logicId = logicId;
        logicInstance.Init(owner);
        this.logicMap.set(logicId, logicInstance);
        this.logicTypeMap.set(logicId, typeName);
        console.log(`[LogicManager] 创建逻辑实例: type=${typeName}, id=${logicId}, owner=${owner.GetName()}`);
        return logicId;
    }
    /**
     * 销毁指定逻辑实例（会尝试回收到对象池）
     * @param logicId 逻辑实例ID
     */
    destroyLogic(logicId) {
        const logic = this.logicMap.get(logicId);
        if (!logic)
            return;
        const typeName = this.logicTypeMap.get(logicId);
        logic.Destroy();
        this.logicMap.delete(logicId);
        this.logicTypeMap.delete(logicId);
        // 尝试回收到对象池
        if (typeName) {
            const config = this.poolConfigs.get(typeName) || DEFAULT_POOL_CONFIG;
            const poolArr = this.pool.get(typeName);
            if (poolArr && poolArr.length < config.maxSize) {
                // 重置实例状态，放回池中
                logic.logicId = -1;
                poolArr.push(logic);
                console.log(`[LogicManager] 回收逻辑实例到对象池: type=${typeName}, 池当前=${poolArr.length}/${config.maxSize}`);
            }
            else {
                console.log(`[LogicManager] 销毁逻辑实例: id=${logicId} (池已满，不回收)`);
            }
        }
        else {
            console.log(`[LogicManager] 销毁逻辑实例: id=${logicId}`);
        }
    }
    /**
     * 获取指定逻辑实例
     * @param logicId 逻辑实例ID
     * @returns 逻辑实例，不存在返回 undefined
     */
    getLogic(logicId) {
        return this.logicMap.get(logicId);
    }
    /**
     * 获取指定类型的逻辑实例
     * @param logicId 逻辑实例ID
     * @returns 强类型的逻辑实例
     */
    getLogicAs(logicId) {
        return this.logicMap.get(logicId);
    }
    /**
     * 获取当前活跃的逻辑实例数量
     */
    getActiveCount() {
        return this.logicMap.size;
    }
    /**
     * 销毁所有逻辑实例（用于关卡切换等场景）
     * @param clearPool 是否同时清空对象池（默认 false，保留池以便下一关复用）
     */
    destroyAll(clearPool = false) {
        console.log(`[LogicManager] 销毁所有逻辑实例，当前数量: ${this.logicMap.size}`);
        this.logicMap.forEach((logic, id) => {
            logic.Destroy();
        });
        this.logicMap.clear();
        this.logicTypeMap.clear();
        if (clearPool) {
            this.pool.forEach((arr) => arr.length = 0);
            console.log(`[LogicManager] 对象池已清空`);
        }
    }
    // ========== 对象池相关 API ==========
    /**
     * 获取指定类型的对象池当前大小
     * @param typeName 类型名称
     * @returns 池中可用实例数量
     */
    getPoolSize(typeName) {
        return this.pool.get(typeName)?.length ?? 0;
    }
    /**
     * 获取指定类型的池配置
     * @param typeName 类型名称
     */
    getPoolConfig(typeName) {
        return this.poolConfigs.get(typeName);
    }
    /**
     * 动态修改指定类型的池配置
     * @param typeName 类型名称
     * @param config 新的池配置（部分字段）
     */
    setPoolConfig(typeName, config) {
        const existing = this.poolConfigs.get(typeName) || { ...DEFAULT_POOL_CONFIG };
        const merged = { ...existing, ...config };
        this.poolConfigs.set(typeName, merged);
        // 如果新 maxSize 比当前池小，截断多余的
        const poolArr = this.pool.get(typeName);
        if (poolArr && poolArr.length > merged.maxSize) {
            poolArr.length = merged.maxSize;
        }
        console.log(`[LogicManager] 更新池配置: ${typeName}, maxSize=${merged.maxSize}`);
    }
    /**
     * 检查逻辑实例是否有效
     * @param logicId 逻辑实例ID
     * @returns 实例是否存在且有效
     */
    isLogicValid(logicId) {
        const logic = this.logicMap.get(logicId);
        return logic !== undefined && logic.isValid();
    }
    /**
     * 向指定 logicId 的实例发送实例级事件
     * @param logicId 目标逻辑实例ID
     * @param eventName 事件名称
     * @param args 事件参数
     * @param options 可选项（高频标记等）
     */
    emitToLogic(logicId, eventName, args, options) {
        EventBus_1.EventBus.getInstance().emitScoped(eventName, logicId, // senderId = 自身
        logicId, // scope = 自身实例
        args, options);
    }
    /**
     * 向所有活跃逻辑实例发送事件（全局广播）
     * @param eventName 事件名称
     * @param args 事件参数
     */
    emitGlobal(eventName, ...args) {
        EventBus_1.EventBus.getInstance().emitScoped(eventName, -1, EventContext_1.GLOBAL_SCOPE, args);
    }
    /**
     * 根据 Owner 查找对应的 logicId
     * @param owner 蓝图对象
     * @returns logicId，未找到返回 -1
     */
    findLogicIdByOwner(owner) {
        if (!owner)
            return -1;
        const ownerName = owner.GetName();
        for (const [id, logic] of this.logicMap) {
            if (logic.owner?.GetName?.() === ownerName) {
                return id;
            }
        }
        return -1;
    }
    /**
     * 打印当前逻辑管理器状态（调试用）
     */
    debugPrintStatus() {
        console.log(`===== LogicManager 状态 =====`);
        console.log(`活跃实例数: ${this.logicMap.size}`);
        this.pool.forEach((arr, typeName) => {
            const config = this.poolConfigs.get(typeName);
            console.log(`  池[${typeName}]: ${arr.length}/${config?.maxSize ?? '?'}`);
        });
        console.log(`================================`);
    }
}
exports.LogicManager = LogicManager;
//# sourceMappingURL=LogicManager.js.map
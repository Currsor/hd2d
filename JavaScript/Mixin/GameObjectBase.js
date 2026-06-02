"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameObjectBase = void 0;
const EventBus_1 = require("./EventBus");
const DIContainer_1 = require("./DIContainer");
const EventContext_1 = require("./EventContext");
/**
 * 所有游戏逻辑的基类
 * 支持事件驱动和依赖注入
 */
class GameObjectBase {
    // 逻辑实例唯一ID
    logicId = -1;
    owner = null;
    /** 当前实例持有的所有事件订阅记录（销毁时自动取消） */
    _subscriptions = [];
    /** 标记当前实例是否已初始化（防止重复初始化导致重复订阅） */
    _initialized = false;
    /** 标记当前实例是否已销毁（防止销毁后继续接收事件） */
    _destroyed = false;
    /**
     * 初始化 - 在逻辑实例创建时调用
     * 如果是从对象池复用的实例，会先调用 OnReset 重置状态
     * 自动注入所有 @Inject 标记的属性
     * @param owner 拥有此逻辑的蓝图对象
     */
    Init(owner) {
        // 重复初始化保护
        if (this._initialized && !this._destroyed) {
            console.warn(`[GameObjectBase] 重复初始化被阻止: logicId=${this.logicId}`);
            return;
        }
        this.owner = owner;
        this._destroyed = false;
        this._initialized = true;
        console.log(`[GameObjectBase] Init logicId=${this.logicId}`);
        // 自动注入 @Inject 标记的依赖
        this._autoInjectDependencies();
        // 如果是从对象池复用的实例，子类可重写 OnReset 来重置状态
        this.OnReset();
        // 调用子类的事件订阅钩子
        this.OnSetup();
    }
    /**
     * 事件订阅钩子 - 子类重写此方法来声明事件订阅
     * 在 Init 中自动调用，无需手动调用
     *
     * 示例：
     * ```ts
     * protected OnSetup(): void {
     *     this.subscribeScoped(EventTypes.OnTick, this.onTick.bind(this), {
     *         filter: ScopeFilter.SELF_AND_GLOBAL,
     *     });
     *     this.subscribeScoped(EventTypes.OnCollision, this.onCollision.bind(this), {
     *         filter: ScopeFilter.SELF,
     *     });
     * }
     * ```
     */
    OnSetup() {
        // 子类重写
    }
    /**
     * 状态重置钩子 - 子类重写此方法来重置内部状态
     * 当实例从对象池中复用时，Init 会自动调用此方法
     * 确保复用的实例状态干净，不残留上一次使用的数据
     *
     * 示例：
     * ```ts
     * protected OnReset(): void {
     *     this.hp = 100;
     *     this.isAlive = true;
     *     this.velocity = { x: 0, y: 0, z: 0 };
     * }
     * ```
     */
    OnReset() {
        // 子类重写
    }
    /**
     * 作用域化订阅事件（自动在 Destroy 时取消订阅）
     * 支持精确控制该订阅者接收哪些作用域的事件
     * @param eventName 事件名称
     * @param handler 事件处理器
     * @param scopeOptions 作用域过滤配置
     * @param priority 优先级
     */
    subscribeScoped(eventName, handler, scopeOptions, priority) {
        if (this._destroyed) {
            console.warn(`[GameObjectBase] 已销毁实例尝试订阅被阻止: logicId=${this.logicId}, event=${eventName}`);
            return;
        }
        const subscription = EventBus_1.EventBus.getInstance().onScoped(eventName, this.logicId, handler, scopeOptions, priority);
        this._subscriptions.push(subscription);
    }
    /**
     * 作为当前实例发送实例级事件
     * @param eventName 事件名称
     * @param args 事件参数
     */
    emitAsInstance(eventName, ...args) {
        EventBus_1.EventBus.getInstance().emitScoped(eventName, this.logicId, this.logicId, args);
    }
    /**
     * 发送全局事件
     * @param eventName 事件名称
     * @param args 事件参数
     */
    emitGlobal(eventName, ...args) {
        EventBus_1.EventBus.getInstance().emitScoped(eventName, this.logicId, EventContext_1.GLOBAL_SCOPE, args);
    }
    /** 当前实例是否仍然有效（未销毁） */
    isValid() {
        return this._initialized && !this._destroyed;
    }
    /**
     * 从 DI 容器获取依赖服务
     * @param token 服务标识符
     * @returns 服务实例
     */
    resolve(token) {
        return DIContainer_1.DIContainer.getInstance().resolve(token);
    }
    /**
     * 从 DI 容器尝试获取依赖服务（不抛异常）
     * @param token 服务标识符
     * @returns 服务实例，不存在返回 undefined
     */
    tryResolve(token) {
        return DIContainer_1.DIContainer.getInstance().tryResolve(token);
    }
    /**
     * 自动注入：扫描 @Inject 装饰器标记的属性，从 DI 容器中解析并赋值
     * 在 Init 中自动调用，无需手动调用
     */
    _autoInjectDependencies() {
        const metadata = (0, DIContainer_1.getInjectMetadata)(this);
        if (metadata.length === 0)
            return;
        const container = DIContainer_1.DIContainer.getInstance();
        for (const entry of metadata) {
            if (entry.optional) {
                this[entry.propertyKey] = container.tryResolve(entry.token);
            }
            else {
                this[entry.propertyKey] = container.resolve(entry.token);
            }
        }
    }
    /**
     * 销毁 - 在逻辑实例销毁时调用，清理资源
     * 自动取消所有事件订阅，并清理实例级节流/批处理配置
     */
    Destroy() {
        if (this._destroyed) {
            console.warn(`[GameObjectBase] 重复销毁被阻止: logicId=${this.logicId}`);
            return;
        }
        console.log(`[GameObjectBase] Destroy logicId=${this.logicId}`);
        this._destroyed = true;
        const eventBus = EventBus_1.EventBus.getInstance();
        // 方式1: 通过订阅记录逐个取消
        for (const sub of this._subscriptions) {
            eventBus.offBySubscription(sub);
        }
        this._subscriptions = [];
        // 方式2: 作为额外安全网，按 subscriberId 清理所有残余订阅
        if (this.logicId >= 0) {
            eventBus.offBySubscriberId(this.logicId);
            // 同时清理实例级节流/批处理配置
            eventBus.removeScopedConfigsByScope(this.logicId);
        }
        this.owner = null;
    }
    /**
     * 获取强类型的 owner 引用
     * @returns 强类型的 owner，如果类型不匹配则返回 null
     */
    getOwnerAs() {
        return this.owner;
    }
}
exports.GameObjectBase = GameObjectBase;
//# sourceMappingURL=GameObjectBase.js.map
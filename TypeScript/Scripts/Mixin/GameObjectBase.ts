import * as UE from "ue";
import { EventBus, EventHandler, EventSubscription, EventPriority } from "./EventBus";
import { DIContainer, getInjectMetadata } from "./DIContainer";
import { ScopeOptions, ScopeFilter, DEFAULT_SCOPE_OPTIONS, GLOBAL_SCOPE } from "./EventContext";

/**
 * 所有游戏逻辑的基类
 * 支持事件驱动和依赖注入
 */
export class GameObjectBase {
    // 逻辑实例唯一ID
    logicId: number = -1;

    owner: UE.Object | null = null;

    /** 当前实例持有的所有事件订阅记录（销毁时自动取消） */
    private _subscriptions: EventSubscription[] = [];

    /** 标记当前实例是否已初始化（防止重复初始化导致重复订阅） */
    private _initialized: boolean = false;

    /** 标记当前实例是否已销毁（防止销毁后继续接收事件） */
    private _destroyed: boolean = false;

    /**
     * 初始化 - 在逻辑实例创建时调用
     * 如果是从对象池复用的实例，会先调用 OnReset 重置状态
     * 自动注入所有 @Inject 标记的属性
     * @param owner 拥有此逻辑的蓝图对象
     */
    Init(owner: UE.Object): void {
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
    protected OnSetup(): void {
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
    protected OnReset(): void {
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
    protected subscribeScoped(
        eventName: string,
        handler: EventHandler,
        scopeOptions: ScopeOptions,
        priority?: number
    ): void {
        if (this._destroyed) {
            console.warn(`[GameObjectBase] 已销毁实例尝试订阅被阻止: logicId=${this.logicId}, event=${eventName}`);
            return;
        }
        const subscription = EventBus.getInstance().onScoped(
            eventName,
            this.logicId,
            handler,
            scopeOptions,
            priority
        );
        this._subscriptions.push(subscription);
    }

    /**
     * 作为当前实例发送实例级事件
     * @param eventName 事件名称
     * @param args 事件参数
     */
    protected emitAsInstance(eventName: string, ...args: any[]): void {
        EventBus.getInstance().emitScoped(
            eventName,
            this.logicId,
            this.logicId,
            args
        );
    }

    /**
     * 发送全局事件
     * @param eventName 事件名称
     * @param args 事件参数
     */
    protected emitGlobal(eventName: string, ...args: any[]): void {
        EventBus.getInstance().emitScoped(
            eventName,
            this.logicId,
            GLOBAL_SCOPE,
            args
        );
    }

    /** 当前实例是否仍然有效（未销毁） */
    isValid(): boolean {
        return this._initialized && !this._destroyed;
    }

    /**
     * 从 DI 容器获取依赖服务
     * @param token 服务标识符
     * @returns 服务实例
     */
    protected resolve<T>(token: string): T {
        return DIContainer.getInstance().resolve<T>(token);
    }

    /**
     * 从 DI 容器尝试获取依赖服务（不抛异常）
     * @param token 服务标识符
     * @returns 服务实例，不存在返回 undefined
     */
    protected tryResolve<T>(token: string): T | undefined {
        return DIContainer.getInstance().tryResolve<T>(token);
    }

    /**
     * 自动注入：扫描 @Inject 装饰器标记的属性，从 DI 容器中解析并赋值
     * 在 Init 中自动调用，无需手动调用
     */
    private _autoInjectDependencies(): void {
        const metadata = getInjectMetadata(this);
        if (metadata.length === 0) return;

        const container = DIContainer.getInstance();
        for (const entry of metadata) {
            if (entry.optional) {
                (this as any)[entry.propertyKey] = container.tryResolve(entry.token);
            } else {
                (this as any)[entry.propertyKey] = container.resolve(entry.token);
            }
        }
    }

    /**
     * 销毁 - 在逻辑实例销毁时调用，清理资源
     * 自动取消所有事件订阅，并清理实例级节流/批处理配置
     */
    Destroy(): void {
        if (this._destroyed) {
            console.warn(`[GameObjectBase] 重复销毁被阻止: logicId=${this.logicId}`);
            return;
        }

        console.log(`[GameObjectBase] Destroy logicId=${this.logicId}`);
        this._destroyed = true;

        const eventBus = EventBus.getInstance();

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
    getOwnerAs<T extends UE.Object>(): T | null {
        return this.owner as T | null;
    }
}
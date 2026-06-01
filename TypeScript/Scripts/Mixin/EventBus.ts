/**
 * 事件总线（单例）
 * 轻量级事件发布/订阅系统
 * 替代蓝图每帧轮询 UpdateLogic 的方式，改为事件驱动
 * 支持事件节流（throttle）和批处理（batch）以优化高频事件
 * 支持实例级事件隔离与作用域化分发
 */

import {
    EventContext,
    EventScope,
    ScopeOptions,
    ScopeFilter,
    GLOBAL_SCOPE,
    DEFAULT_SCOPE_OPTIONS,
    ScopedEventSubscription,
    createEventContext,
    matchesScope,
} from "./EventContext";

/** 事件处理器类型 */
export type EventHandler = (...args: any[]) => void;

/** 事件订阅记录（用于自动取消订阅，向后兼容） */
export interface EventSubscription {
    eventName: string;
    handler: EventHandler;
}

/**
 * 事件优先级常量
 * 数值越大，优先级越高，越先执行
 * 同优先级按订阅顺序执行
 */
export const EventPriority = {
    /** 最低优先级（后台任务、日志记录等） */
    LOW: -100,
    /** 默认优先级 */
    NORMAL: 0,
    /** 较高优先级（重要游戏逻辑） */
    HIGH: 100,
    /** 最高优先级（系统级关键逻辑，如伤害计算、状态校验） */
    CRITICAL: 200,
} as const;

/** 带优先级和作用域的事件处理器条目（内部使用） */
interface PrioritizedHandler {
    handler: EventHandler;
    priority: number;
    /** 插入序号，用于同优先级时保持插入顺序（稳定排序） */
    insertOrder: number;
    /** 订阅者 logicId（-1 表示非逻辑实例） */
    subscriberId: number;
    /** 作用域过滤配置 */
    scopeOptions: ScopeOptions;
}

/** 节流配置 */
interface ThrottleConfig {
    /** 最小触发间隔（毫秒） */
    intervalMs: number;
    /** 距上次实际触发已累积的时间（毫秒） */
    accumulatedMs: number;
    /** 是否为首次触发（首次立即放行） */
    isFirstEmit: boolean;
    /** 被节流期间最新的参数（用于尾调用，保证最后一次不丢失） */
    pendingArgs: any[] | null;
}

/** 批处理配置 */
interface BatchConfig {
    /** 批处理窗口时间（毫秒） */
    windowMs: number;
    /** 累积的事件参数列表 */
    buffer: any[][];
    /** 批处理定时器ID */
    timer: any | null;
}

/** 实例有效性校验回调类型 */
type InstanceValidator = (logicId: number) => boolean;

export class EventBus {
    private static instance: EventBus | null = null;

    /** 事件名 → 带优先级的处理器列表（按优先级降序排列） */
    private listeners: Map<string, PrioritizedHandler[]> = new Map();

    /** 全局插入计数器，用于同优先级时保持插入顺序 */
    private insertCounter: number = 0;

    /** 事件名 → 节流配置（全局级） */
    private throttleConfigs: Map<string, ThrottleConfig> = new Map();

    /** 事件名 → 批处理配置（全局级） */
    private batchConfigs: Map<string, BatchConfig> = new Map();

    /** "事件名@作用域" → 节流配置（实例级） */
    private scopedThrottleConfigs: Map<string, ThrottleConfig> = new Map();

    /** "事件名@作用域" → 批处理配置（实例级） */
    private scopedBatchConfigs: Map<string, BatchConfig> = new Map();

    /** 实例有效性校验函数（由 LogicManager 注册） */
    private instanceValidator: InstanceValidator | null = null;

    /** 调试模式开关 */
    private debugMode: boolean = false;

    /** 高频事件的调试日志抑制（避免日志洪泛） */
    private suppressHighFrequencyLogs: boolean = true;

    private constructor() {}

    /** 获取单例实例 */
    static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }

    // ========== 调试模式 ==========

    /**
     * 设置调试模式
     * @param enabled 是否启用
     * @param suppressHighFrequency 是否抑制高频事件日志（默认 true）
     */
    setDebugMode(enabled: boolean, suppressHighFrequency: boolean = true): void {
        this.debugMode = enabled;
        this.suppressHighFrequencyLogs = suppressHighFrequency;
        console.log(`[EventBus] 调试模式: ${enabled ? '开启' : '关闭'}, 高频日志抑制: ${suppressHighFrequency}`);
    }

    /** 注册实例有效性校验函数 */
    setInstanceValidator(validator: InstanceValidator): void {
        this.instanceValidator = validator;
    }

    // ========== 订阅（作用域化） ==========

    /**
     * 作用域化订阅事件
     * @param eventName 事件名称
     * @param subscriberId 订阅者 logicId（-1 表示非逻辑实例）
     * @param handler 事件处理器
     * @param scopeOptions 作用域过滤配置
     * @param priority 优先级
     * @returns 订阅记录
     */
    onScoped(
        eventName: string,
        subscriberId: number,
        handler: EventHandler,
        scopeOptions: ScopeOptions = DEFAULT_SCOPE_OPTIONS,
        priority: number = EventPriority.NORMAL
    ): EventSubscription {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        const handlers = this.listeners.get(eventName)!;

        // 重复订阅保护：同一 subscriberId + 同一 handler 不重复添加
        if (subscriberId >= 0) {
            const duplicate = handlers.find(
                entry => entry.subscriberId === subscriberId && entry.handler === handler
            );
            if (duplicate) {
                if (this.debugMode) {
                    console.warn(`[EventBus] 重复订阅被阻止: event=${eventName}, subscriberId=${subscriberId}`);
                }
                return { eventName, handler };
            }
        }

        const entry: PrioritizedHandler = {
            handler,
            priority,
            insertOrder: this.insertCounter++,
            subscriberId,
            scopeOptions,
        };

        // 使用二分插入，维持按优先级降序、同优先级按插入顺序的排列
        const insertIndex = this.findInsertIndex(handlers, priority);
        handlers.splice(insertIndex, 0, entry);

        if (this.debugMode) {
            console.log(`[EventBus][DEBUG] 订阅: event=${eventName}, subscriberId=${subscriberId}, filter=${scopeOptions.filter}, priority=${priority}`);
        }

        return { eventName, handler };
    }

    /**
     * 二分查找插入位置，保证按优先级降序排列，同优先级按插入顺序（FIFO）
     */
    private findInsertIndex(handlers: PrioritizedHandler[], priority: number): number {
        let low = 0;
        let high = handlers.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (handlers[mid].priority > priority) {
                low = mid + 1;
            } else if (handlers[mid].priority === priority) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return low;
    }

    /**
     * 通过订阅记录取消订阅
     * @param subscription 订阅记录
     */
    offBySubscription(subscription: EventSubscription): void {
        const handlers = this.listeners.get(subscription.eventName);
        if (!handlers) return;

        const index = handlers.findIndex(entry => entry.handler === subscription.handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }

        if (handlers.length === 0) {
            this.listeners.delete(subscription.eventName);
        }
    }

    /**
     * 移除指定 subscriberId 的所有订阅（实例销毁时调用）
     * @param subscriberId 订阅者 logicId
     */
    offBySubscriberId(subscriberId: number): void {
        let removedCount = 0;
        this.listeners.forEach((handlers, eventName) => {
            const before = handlers.length;
            const filtered = handlers.filter(entry => entry.subscriberId !== subscriberId);
            if (filtered.length !== before) {
                removedCount += before - filtered.length;
                if (filtered.length === 0) {
                    this.listeners.delete(eventName);
                } else {
                    this.listeners.set(eventName, filtered);
                }
            }
        });

        if (this.debugMode && removedCount > 0) {
            console.log(`[EventBus][DEBUG] 按 subscriberId 清理订阅: subscriberId=${subscriberId}, 移除了 ${removedCount} 个`);
        }
    }

    // ========== 发送（作用域化） ==========

    /**
     * 作用域化触发事件
     * @param eventName 事件名称
     * @param senderId 发送者 logicId（-1 表示非逻辑实例）
     * @param scope 事件作用域（logicId 或 GLOBAL_SCOPE）
     * @param args 事件参数
     * @param options 可选：高频标记、目标实例等
     */
    emitScoped(
        eventName: string,
        senderId: number,
        scope: EventScope,
        args: any[],
        options?: { targetId?: number; isHighFrequency?: boolean }
    ): void {
        this.emitWithScope(eventName, senderId, scope, args, options);
    }

    /**
     * 内部统一分发入口
     */
    private emitWithScope(
        eventName: string,
        senderId: number,
        scope: EventScope,
        args: any[],
        options?: { targetId?: number; isHighFrequency?: boolean }
    ): void {
        // 构建作用域化节流/批处理键
        const scopedKey = scope !== GLOBAL_SCOPE ? `${eventName}@${scope}` : "";

        // 优先检查实例级节流/批处理
        if (scopedKey) {
            const scopedBatch = this.scopedBatchConfigs.get(scopedKey);
            if (scopedBatch) {
                this.emitBatched(eventName, scopedBatch, args, senderId, scope, options);
                return;
            }
            const scopedThrottle = this.scopedThrottleConfigs.get(scopedKey);
            if (scopedThrottle) {
                this.emitThrottled(eventName, scopedThrottle, args, senderId, scope, options);
                return;
            }
        }

        // 检查全局级批处理
        const batchConfig = this.batchConfigs.get(eventName);
        if (batchConfig) {
            this.emitBatched(eventName, batchConfig, args, senderId, scope, options);
            return;
        }

        // 检查全局级节流
        const throttleConfig = this.throttleConfigs.get(eventName);
        if (throttleConfig) {
            this.emitThrottled(eventName, throttleConfig, args, senderId, scope, options);
            return;
        }

        // 无优化策略，直接触发
        this.emitImmediateScoped(eventName, senderId, scope, args, options);
    }

    /**
     * 作用域化立即触发事件
     * 按优先级从高到低依次执行处理器，按作用域过滤
     */
    emitImmediateScoped(
        eventName: string,
        senderId: number,
        scope: EventScope,
        args: any[],
        options?: { targetId?: number; isHighFrequency?: boolean }
    ): void {
        const handlers = this.listeners.get(eventName);
        if (!handlers || handlers.length === 0) {
            // 调试日志：事件无订阅者
            if (this.debugMode && !(options?.isHighFrequency && this.suppressHighFrequencyLogs)) {
                console.log(`[EventBus][DEBUG] 事件无订阅者: event=${eventName}, scope=${scope}, senderId=${senderId}`);
            }
            return;
        }

        // 构建事件上下文
        const ctx = createEventContext(eventName, senderId, scope, args, options);

        // 复制一份避免在回调中修改导致迭代问题
        const handlersCopy = [...handlers];
        let matchedCount = 0;

        for (const entry of handlersCopy) {
            // 实例有效性校验：跳过已失效的订阅者
            if (entry.subscriberId >= 0 && this.instanceValidator) {
                if (!this.instanceValidator(entry.subscriberId)) {
                    if (this.debugMode) {
                        console.warn(`[EventBus][DEBUG] 跳过无效实例订阅者: event=${eventName}, subscriberId=${entry.subscriberId}`);
                    }
                    continue;
                }
            }

            // 作用域匹配过滤
            if (!matchesScope(ctx, entry.subscriberId, entry.scopeOptions)) {
                continue;
            }

            matchedCount++;
            try {
                entry.handler(...args);
            } catch (e) {
                console.error(`[EventBus] 事件处理器异常: event=${eventName}, subscriberId=${entry.subscriberId}, scope=${scope}, error=${e}`);
            }
        }

        // 调试日志：分发结果
        if (this.debugMode && !(options?.isHighFrequency && this.suppressHighFrequencyLogs)) {
            console.log(`[EventBus][DEBUG] 分发完成: event=${eventName}, scope=${scope}, senderId=${senderId}, 匹配=${matchedCount}/${handlersCopy.length}`);
        }
    }

    // ========== 节流机制 ==========

    /**
     * 为指定事件配置全局级节流策略
     * @param eventName 事件名称
     * @param intervalMs 最小触发间隔（毫秒）
     */
    setThrottle(eventName: string, intervalMs: number): void {
        this.throttleConfigs.set(eventName, {
            intervalMs,
            accumulatedMs: 0,
            isFirstEmit: true,
            pendingArgs: null,
        });
        console.log(`[EventBus] 设置事件节流: ${eventName}, 间隔=${intervalMs}ms`);
    }

    /**
     * 为指定事件+作用域配置实例级节流策略
     * @param eventName 事件名称
     * @param scope 作用域（logicId）
     * @param intervalMs 最小触发间隔（毫秒）
     */
    setScopedThrottle(eventName: string, scope: number, intervalMs: number): void {
        const key = `${eventName}@${scope}`;
        this.scopedThrottleConfigs.set(key, {
            intervalMs,
            accumulatedMs: 0,
            isFirstEmit: true,
            pendingArgs: null,
        });
        if (this.debugMode) {
            console.log(`[EventBus][DEBUG] 设置实例级节流: ${key}, 间隔=${intervalMs}ms`);
        }
    }

    /**
     * 移除指定事件的全局级节流策略
     * @param eventName 事件名称
     */
    removeThrottle(eventName: string): void {
        this.throttleConfigs.delete(eventName);
    }

    /**
     * 移除指定事件+作用域的实例级节流策略
     * @param eventName 事件名称
     * @param scope 作用域（logicId）
     */
    removeScopedThrottle(eventName: string, scope: number): void {
        this.scopedThrottleConfigs.delete(`${eventName}@${scope}`);
    }

    /**
     * 移除某个实例的所有实例级节流/批处理配置
     * @param scope 作用域（logicId）
     */
    removeScopedConfigsByScope(scope: number): void {
        const suffix = `@${scope}`;
        for (const key of this.scopedThrottleConfigs.keys()) {
            if (key.endsWith(suffix)) {
                this.scopedThrottleConfigs.delete(key);
            }
        }
        for (const key of this.scopedBatchConfigs.keys()) {
            if (key.endsWith(suffix)) {
                const config = this.scopedBatchConfigs.get(key)!;
                if (config.timer !== null) {
                    clearTimeout(config.timer);
                }
                this.scopedBatchConfigs.delete(key);
            }
        }
    }

    /**
     * 节流触发内部实现（基于累计 deltaTime）
     */
    private emitThrottled(
        eventName: string,
        config: ThrottleConfig,
        args: any[],
        senderId: number = -1,
        scope: EventScope = GLOBAL_SCOPE,
        options?: { targetId?: number; isHighFrequency?: boolean }
    ): void {
        if (config.isFirstEmit) {
            config.isFirstEmit = false;
            config.accumulatedMs = 0;
            config.pendingArgs = null;
            this.emitImmediateScoped(eventName, senderId, scope, args, options);
            return;
        }

        const deltaTimeSec = typeof args[0] === 'number' ? args[0] : 0;
        config.accumulatedMs += deltaTimeSec * 1000;

        if (config.accumulatedMs >= config.intervalMs) {
            config.accumulatedMs %= config.intervalMs;
            config.pendingArgs = null;
            this.emitImmediateScoped(eventName, senderId, scope, args, options);
        } else {
            config.pendingArgs = args;
        }
    }

    // ========== 批处理机制 ==========

    /**
     * 为指定事件配置全局级批处理策略
     * @param eventName 事件名称
     * @param windowMs 批处理窗口时间（毫秒）
     */
    setBatch(eventName: string, windowMs: number): void {
        this.batchConfigs.set(eventName, {
            windowMs,
            buffer: [],
            timer: null,
        });
        console.log(`[EventBus] 设置事件批处理: ${eventName}, 窗口=${windowMs}ms`);
    }

    /**
     * 为指定事件+作用域配置实例级批处理策略
     * @param eventName 事件名称
     * @param scope 作用域（logicId）
     * @param windowMs 批处理窗口时间（毫秒）
     */
    setScopedBatch(eventName: string, scope: number, windowMs: number): void {
        const key = `${eventName}@${scope}`;
        this.scopedBatchConfigs.set(key, {
            windowMs,
            buffer: [],
            timer: null,
        });
        if (this.debugMode) {
            console.log(`[EventBus][DEBUG] 设置实例级批处理: ${key}, 窗口=${windowMs}ms`);
        }
    }

    /**
     * 移除指定事件的全局级批处理策略
     * @param eventName 事件名称
     * @param flush 是否立即刷新缓冲区中的事件（默认 true）
     */
    removeBatch(eventName: string, flush: boolean = true): void {
        const config = this.batchConfigs.get(eventName);
        if (config) {
            if (config.timer !== null) {
                clearTimeout(config.timer);
            }
            if (flush && config.buffer.length > 0) {
                this.flushBatch(eventName, config);
            }
            this.batchConfigs.delete(eventName);
        }
    }

    /** 批处理触发内部实现 */
    private emitBatched(
        eventName: string,
        config: BatchConfig,
        args: any[],
        senderId: number = -1,
        scope: EventScope = GLOBAL_SCOPE,
        options?: { targetId?: number; isHighFrequency?: boolean }
    ): void {
        config.buffer.push(args);

        if (config.timer === null) {
            config.timer = setTimeout(() => {
                this.flushBatchScoped(eventName, config, senderId, scope, options);
            }, config.windowMs);
        }
    }

    /** 刷新批处理缓冲区（向后兼容，全局作用域） */
    private flushBatch(eventName: string, config: BatchConfig): void {
        this.flushBatchScoped(eventName, config, -1, GLOBAL_SCOPE);
    }

    /** 刷新批处理缓冲区（作用域化） */
    private flushBatchScoped(
        eventName: string,
        config: BatchConfig,
        senderId: number,
        scope: EventScope,
        options?: { targetId?: number; isHighFrequency?: boolean }
    ): void {
        config.timer = null;
        if (config.buffer.length === 0) return;

        const batchedArgs = [...config.buffer];
        config.buffer = [];

        const handlers = this.listeners.get(eventName);
        if (!handlers || handlers.length === 0) return;

        const ctx = createEventContext(eventName, senderId, scope, batchedArgs, options);
        const handlersCopy = [...handlers];

        for (const entry of handlersCopy) {
            // 实例有效性校验
            if (entry.subscriberId >= 0 && this.instanceValidator) {
                if (!this.instanceValidator(entry.subscriberId)) continue;
            }

            // 作用域匹配过滤
            if (!matchesScope(ctx, entry.subscriberId, entry.scopeOptions)) continue;

            try {
                entry.handler(batchedArgs);
            } catch (e) {
                console.error(`[EventBus] 批处理事件处理器异常: event=${eventName}, subscriberId=${entry.subscriberId}, error=${e}`);
            }
        }
    }

    // ========== 清理与查询 ==========

    /**
     * 清空指定事件的所有监听器
     * @param eventName 事件名称
     */
    clearEvent(eventName: string): void {
        this.listeners.delete(eventName);
    }

    /**
     * 测试专用：清空所有事件监听器及配置
     * 仅供单元测试中重置状态使用，业务代码请勿调用
     */
    clearForTest(): void {
        this.throttleConfigs.clear();
        this.scopedThrottleConfigs.clear();

        this.batchConfigs.forEach((config) => {
            if (config.timer !== null) clearTimeout(config.timer);
        });
        this.batchConfigs.clear();

        this.scopedBatchConfigs.forEach((config) => {
            if (config.timer !== null) clearTimeout(config.timer);
        });
        this.scopedBatchConfigs.clear();

        this.listeners.clear();
    }

    /**
     * 获取指定事件的监听器数量
     */
    getListenerCount(eventName: string): number {
        return this.listeners.get(eventName)?.length ?? 0;
    }

    /**
     * 获取指定事件的监听器优先级信息（调试用）
     * @param eventName 事件名称
     * @returns 各监听器的优先级数组（按执行顺序排列）
     */
    getListenerPriorities(eventName: string): number[] {
        const handlers = this.listeners.get(eventName);
        if (!handlers) return [];
        return handlers.map(entry => entry.priority);
    }

    /**
     * 获取所有已注册事件的名称列表
     */
    getRegisteredEvents(): string[] {
        return Array.from(this.listeners.keys());
    }

    /**
     * 获取指定事件中某个 subscriberId 的订阅数量（调试用）
     */
    getSubscriberCount(eventName: string, subscriberId: number): number {
        const handlers = this.listeners.get(eventName);
        if (!handlers) return 0;
        return handlers.filter(entry => entry.subscriberId === subscriberId).length;
    }

    /**
     * 打印当前事件总线状态（调试用）
     */
    debugPrintStatus(): void {
        console.log(`===== EventBus 状态 =====`);
        console.log(`调试模式: ${this.debugMode}`);
        console.log(`注册事件数: ${this.listeners.size}`);
        this.listeners.forEach((handlers, eventName) => {
            const scopeInfo = handlers.map(h => `sub=${h.subscriberId}:${h.scopeOptions.filter}`).join(', ');
            console.log(`  ${eventName}: ${handlers.length} 个订阅者 [${scopeInfo}]`);
        });
        console.log(`全局级节流: ${this.throttleConfigs.size} 个`);
        console.log(`实例级节流: ${this.scopedThrottleConfigs.size} 个`);
        console.log(`全局级批处理: ${this.batchConfigs.size} 个`);
        console.log(`实例级批处理: ${this.scopedBatchConfigs.size} 个`);
        console.log(`================================`);
    }
}

// 导出上下文相关类型供外部使用
export { EventContext, EventScope, ScopeOptions, ScopeFilter, GLOBAL_SCOPE, ScopedEventSubscription } from "./EventContext";

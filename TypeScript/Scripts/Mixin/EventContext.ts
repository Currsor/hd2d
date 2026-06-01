/**
 * 事件上下文与作用域协议
 * 为事件系统新增实例级隔离能力，明确标识发送者与目标实例
 */

// ========== 作用域常量 ==========

/** 全局作用域标识，表示事件面向所有订阅者广播 */
export const GLOBAL_SCOPE = "__global__" as const;

/** 作用域类型：可以是 logicId（数字）或全局标识 */
export type EventScope = number | typeof GLOBAL_SCOPE;

// ========== 事件上下文 ==========

/**
 * 统一事件上下文
 * 每次 emit 时自动构建，订阅者可从中判断"是谁在更新"
 */
export interface EventContext {
    /** 事件名称 */
    eventName: string;

    /** 发送者 logicId（-1 表示非逻辑实例发送，如蓝图直接广播） */
    senderId: number;

    /** 事件作用域：logicId 表示实例级，GLOBAL_SCOPE 表示全局 */
    scope: EventScope;

    /** 原始负载（emit 时传入的参数数组） */
    payload: any[];

    /** 触发时间戳（毫秒，使用 Date.now()） */
    timestamp: number;

    /** 可选：目标实例 logicId，用于点对点投递 */
    targetId?: number;

    /**
     * 轻量标记：是否为高频更新事件（如动画 OnTick）
     * 为 true 时调试日志可选择性跳过，减少输出噪音
     */
    isHighFrequency?: boolean;
}

// ========== 作用域化订阅选项 ==========

/** 订阅时声明的作用域过滤策略 */
export enum ScopeFilter {
    /** 仅接收自身实例作用域的事件（默认） */
    SELF = "self",
    /** 仅接收全局事件 */
    GLOBAL_ONLY = "global_only",
    /** 接收全局 + 自身实例的事件 */
    SELF_AND_GLOBAL = "self_and_global",
    /** 接收所有事件（不过滤，慎用） */
    ANY = "any",
    /** 接收指定实例作用域的事件 */
    SPECIFIC = "specific",
}

/**
 * 作用域化订阅配置
 * 在订阅时传入，声明该订阅者关心哪些作用域的事件
 */
export interface ScopeOptions {
    /** 过滤策略 */
    filter: ScopeFilter;

    /**
     * 当 filter === SPECIFIC 时生效：
     * 指定要订阅的目标实例 logicId 列表
     */
    targetScopes?: number[];
}

/** 默认作用域选项：仅接收自身实例 + 全局事件 */
export const DEFAULT_SCOPE_OPTIONS: ScopeOptions = {
    filter: ScopeFilter.SELF_AND_GLOBAL,
};

// ========== 作用域化订阅记录 ==========

/**
 * 扩展的订阅记录，包含作用域信息
 * 用于 EventBus 内部匹配和生命周期管理
 */
export interface ScopedEventSubscription {
    /** 事件名称 */
    eventName: string;
    /** 订阅者的 logicId（-1 表示非逻辑实例） */
    subscriberId: number;
    /** 作用域过滤配置 */
    scopeOptions: ScopeOptions;
    /** 原始 handler 引用（用于取消订阅） */
    handler: (...args: any[]) => void;
}

// ========== 工具函数 ==========

/**
 * 构建作用域化的内部事件键
 * 用于 EventBus 内部按 scope 分桶存储和精确匹配
 * @param eventName 事件名称
 * @param scope 作用域
 * @returns 内部键，如 "OnTick@42" 或 "OnTick@__global__"
 */
export function buildScopedKey(eventName: string, scope: EventScope): string {
    return `${eventName}@${scope}`;
}

/**
 * 创建事件上下文
 * @param eventName 事件名称
 * @param senderId 发送者 logicId
 * @param scope 事件作用域
 * @param payload 原始负载
 * @param options 可选的额外字段
 */
export function createEventContext(
    eventName: string,
    senderId: number,
    scope: EventScope,
    payload: any[],
    options?: {
        targetId?: number;
        isHighFrequency?: boolean;
    }
): EventContext {
    return {
        eventName,
        senderId,
        scope,
        payload,
        timestamp: Date.now(),
        targetId: options?.targetId,
        isHighFrequency: options?.isHighFrequency,
    };
}

/**
 * 判断一个订阅者是否应该接收某个事件上下文
 * @param ctx 事件上下文
 * @param subscriberId 订阅者的 logicId
 * @param scopeOptions 订阅者的作用域过滤配置
 * @returns 是否匹配
 */
export function matchesScope(
    ctx: EventContext,
    subscriberId: number,
    scopeOptions: ScopeOptions
): boolean {
    // 如果事件指定了 targetId，只有目标实例能收到
    if (ctx.targetId !== undefined && ctx.targetId !== subscriberId) {
        return false;
    }

    switch (scopeOptions.filter) {
        case ScopeFilter.ANY:
            // 接收所有事件
            return true;

        case ScopeFilter.GLOBAL_ONLY:
            // 仅接收全局事件
            return ctx.scope === GLOBAL_SCOPE;

        case ScopeFilter.SELF:
            // 仅接收与自身 logicId 匹配的实例事件
            return ctx.scope === subscriberId;

        case ScopeFilter.SELF_AND_GLOBAL:
            // 接收全局 + 自身实例的事件
            return ctx.scope === GLOBAL_SCOPE || ctx.scope === subscriberId;

        case ScopeFilter.SPECIFIC:
            // 接收指定实例作用域的事件
            if (!scopeOptions.targetScopes) return false;
            return scopeOptions.targetScopes.includes(ctx.scope as number);

        default:
            return false;
    }
}

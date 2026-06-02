"use strict";
/**
 * 事件上下文与作用域协议
 * 为事件系统新增实例级隔离能力，明确标识发送者与目标实例
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SCOPE_OPTIONS = exports.ScopeFilter = exports.GLOBAL_SCOPE = void 0;
exports.buildScopedKey = buildScopedKey;
exports.createEventContext = createEventContext;
exports.matchesScope = matchesScope;
// ========== 作用域常量 ==========
/** 全局作用域标识，表示事件面向所有订阅者广播 */
exports.GLOBAL_SCOPE = "__global__";
// ========== 作用域化订阅选项 ==========
/** 订阅时声明的作用域过滤策略 */
var ScopeFilter;
(function (ScopeFilter) {
    /** 仅接收自身实例作用域的事件（默认） */
    ScopeFilter["SELF"] = "self";
    /** 仅接收全局事件 */
    ScopeFilter["GLOBAL_ONLY"] = "global_only";
    /** 接收全局 + 自身实例的事件 */
    ScopeFilter["SELF_AND_GLOBAL"] = "self_and_global";
    /** 接收所有事件（不过滤，慎用） */
    ScopeFilter["ANY"] = "any";
    /** 接收指定实例作用域的事件 */
    ScopeFilter["SPECIFIC"] = "specific";
})(ScopeFilter || (exports.ScopeFilter = ScopeFilter = {}));
/** 默认作用域选项：仅接收自身实例 + 全局事件 */
exports.DEFAULT_SCOPE_OPTIONS = {
    filter: ScopeFilter.SELF_AND_GLOBAL,
};
// ========== 工具函数 ==========
/**
 * 构建作用域化的内部事件键
 * 用于 EventBus 内部按 scope 分桶存储和精确匹配
 * @param eventName 事件名称
 * @param scope 作用域
 * @returns 内部键，如 "OnTick@42" 或 "OnTick@__global__"
 */
function buildScopedKey(eventName, scope) {
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
function createEventContext(eventName, senderId, scope, payload, options) {
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
function matchesScope(ctx, subscriberId, scopeOptions) {
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
            return ctx.scope === exports.GLOBAL_SCOPE;
        case ScopeFilter.SELF:
            // 仅接收与自身 logicId 匹配的实例事件
            return ctx.scope === subscriberId;
        case ScopeFilter.SELF_AND_GLOBAL:
            // 接收全局 + 自身实例的事件
            return ctx.scope === exports.GLOBAL_SCOPE || ctx.scope === subscriberId;
        case ScopeFilter.SPECIFIC:
            // 接收指定实例作用域的事件
            if (!scopeOptions.targetScopes)
                return false;
            return scopeOptions.targetScopes.includes(ctx.scope);
        default:
            return false;
    }
}
//# sourceMappingURL=EventContext.js.map
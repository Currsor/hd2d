/**
 * 轻量级依赖注入容器（单例）
 * 专为 puerts 环境设计，不依赖 reflect-metadata
 * 支持单例和瞬态两种生命周期
 * 
 * 定位：
 *   - TS 层内部的轻量级工具/服务（如配置读取器、公式计算器等）
 *   - UE C++ Subsystem 的 TS 包装层（封装 Puerts 获取 Subsystem 的样板代码）
 *   - 开发阶段的 Mock 服务替换
 * 
 * 注意：
 *   系统级功能（背包、存档、任务、AI 等）建议直接使用 UE Subsystem (C++/蓝图) 实现，
 *   然后在此容器中注册其 TS 包装，供逻辑类通过 @Inject 或 resolve() 便捷访问。
 */

/** 服务生命周期 */
export enum Lifecycle {
    /** 单例：全局唯一实例 */
    Singleton = "Singleton",
    /** 瞬态：每次 resolve 创建新实例 */
    Transient = "Transient",
}

/** 服务工厂函数类型 */
export type Factory<T> = (container: DIContainer) => T;

/** 服务注册信息 */
interface ServiceRegistration<T = any> {
    factory: Factory<T>;
    lifecycle: Lifecycle;
    instance?: T;  // 仅 Singleton 使用
}

export class DIContainer {
    private static instance: DIContainer | null = null;

    /** token → 服务注册信息 */
    private services: Map<string, ServiceRegistration> = new Map();

    private constructor() {}

    /** 获取单例实例 */
    static getInstance(): DIContainer {
        if (!DIContainer.instance) {
            DIContainer.instance = new DIContainer();
        }
        return DIContainer.instance;
    }

    /**
     * 注册服务
     * @param token 服务标识符
     * @param factory 创建服务实例的工厂函数
     * @param lifecycle 生命周期（默认 Singleton）
     */
    register<T>(token: string, factory: Factory<T>, lifecycle: Lifecycle = Lifecycle.Singleton): void {
        this.services.set(token, { factory, lifecycle });
        console.log(`[DIContainer] 注册服务: ${token} (${lifecycle})`);
    }

    /**
     * 注册一个已存在的实例作为单例服务
     * @param token 服务标识符
     * @param instance 已有实例
     */
    registerInstance<T>(token: string, instance: T): void {
        this.services.set(token, {
            factory: () => instance,
            lifecycle: Lifecycle.Singleton,
            instance: instance,
        });
        console.log(`[DIContainer] 注册实例: ${token}`);
    }

    /**
     * 解析服务
     * @param token 服务标识符
     * @returns 服务实例
     * @throws 如果未注册则抛出错误
     */
    resolve<T>(token: string): T {
        const registration = this.services.get(token);
        if (!registration) {
            throw new Error(`[DIContainer] 未找到服务: ${token}，请先调用 register 注册`);
        }

        if (registration.lifecycle === Lifecycle.Singleton) {
            // 单例模式：首次创建后缓存
            if (!registration.instance) {
                registration.instance = registration.factory(this);
            }
            return registration.instance as T;
        }

        // 瞬态模式：每次创建新实例
        return registration.factory(this) as T;
    }

    /**
     * 尝试解析服务（不抛异常）
     * @param token 服务标识符
     * @returns 服务实例，未注册返回 undefined
     */
    tryResolve<T>(token: string): T | undefined {
        try {
            return this.resolve<T>(token);
        } catch {
            return undefined;
        }
    }

    /**
     * 检查服务是否已注册
     * @param token 服务标识符
     */
    has(token: string): boolean {
        return this.services.has(token);
    }

    /**
     * 清空所有注册的服务
     */
    clear(): void {
        this.services.clear();
        console.log("[DIContainer] 已清空所有服务注册");
    }

    /**
     * 获取已注册的服务标识符列表
     */
    getRegisteredTokens(): string[] {
        return Array.from(this.services.keys());
    }
}

// ========== 自动依赖注入装饰器 ==========

/** 存储注入元数据的 key（挂在类原型上） */
const INJECT_METADATA_KEY = Symbol("__inject_metadata__");

/** 注入元数据条目 */
export interface InjectMetadata {
    /** 类属性名 */
    propertyKey: string;
    /** DI 容器中的服务 token */
    token: string;
    /** 是否可选（可选注入不存在时不抛异常，值为 undefined） */
    optional: boolean;
}

/**
 * 属性装饰器：标记需要自动注入的依赖
 * 
 * 在 GameObjectBase.Init() 时自动从 DIContainer 中解析并赋值，
 * 无需手动调用 resolve。
 * 
 * @param token DI 容器中的服务标识符
 * @param optional 是否可选（默认 false；为 true 时服务不存在不抛异常）
 * 
 * @example
 * ```ts
 * export class BP_Hero extends GameObjectBase {
 *     // 注入 UE Subsystem 包装层
 *     @Inject("InventorySystem")
 *     private inventory!: UE.BP_InventorySubsystem;
 *
 *     // 注入 TS 层轻量工具服务
 *     @Inject("ConfigReader")
 *     private configReader!: ConfigReader;
 *
 *     @Inject("AudioService", true)  // 可选注入
 *     private audioService?: AudioService;
 *
 *     protected OnSetup(): void {
 *         // 所有 @Inject 属性已自动注入，可直接使用
 *         const hp = this.configReader.getValue("hp");
 *         this.inventory.AddItem("sword_01", 1);
 *     }
 * }
 * ```
 */
export function Inject(token: string, optional: boolean = false): PropertyDecorator {
    return function (target: Object, propertyKey: string | symbol): void {
        // 获取或创建该类原型上的注入元数据数组
        let metadata: InjectMetadata[] = (target as any)[INJECT_METADATA_KEY];
        if (!metadata) {
            // 首次在该原型上创建，使用 defineProperty 避免被子类枚举到父类的
            metadata = [];
            Object.defineProperty(target, INJECT_METADATA_KEY, {
                value: metadata,
                enumerable: false,
                writable: true,
                configurable: true,
            });
        }

        metadata.push({
            propertyKey: propertyKey as string,
            token,
            optional,
        });
    };
}

/**
 * 获取类实例上所有 @Inject 标记的元数据（含继承链）
 * @param instance 类实例
 * @returns 合并后的注入元数据数组
 */
export function getInjectMetadata(instance: object): InjectMetadata[] {
    const result: InjectMetadata[] = [];
    const seen = new Set<string>(); // 避免重复（子类覆盖父类同名属性）

    // 沿原型链向上查找，收集所有层级的注入元数据
    let proto = Object.getPrototypeOf(instance);
    while (proto && proto !== Object.prototype) {
        const metadata: InjectMetadata[] | undefined = (proto as any)[INJECT_METADATA_KEY];
        if (metadata) {
            for (const entry of metadata) {
                // 子类优先：如果子类已声明同名属性的注入，跳过父类的
                if (!seen.has(entry.propertyKey)) {
                    seen.add(entry.propertyKey);
                    result.push(entry);
                }
            }
        }
        proto = Object.getPrototypeOf(proto);
    }

    return result;
}

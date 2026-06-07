/**
 * SubsystemBridge — C++ GameInstanceSubsystem → TS 桥接基类
 *
 * 封装了从 Puerts 环境获取 C++ Subsystem 的全部通用逻辑：
 *   - GameInstance 获取（argv / 环境变量 / 全局引用回退）
 *   - Subsystem UClass 解析（loadUEType）
 *   - SubsystemBlueprintLibrary 调用
 *   - 延迟初始化与自动重试
 *   - UE 结构体类型缓存
 *
 * 子类只需：
 *   1. 指定 subsystemClassPath（如 "/Script/HD_2D.RoleManagementSubsystem"）
 *   2. 实现 bindDelegates()（C++ 委托 → EventBus 转发）
 *   3. 添加领域方法（registerXxx、getXxx 等业务 API）
 *
 * 使用示例：
 * ```ts
 * class InventoryBridge extends SubsystemBridge<UE.BP_InventorySubsystem> {
 *     private static instance: InventoryBridge | null = null;
 *
 *     static getInstance(): InventoryBridge {
 *         if (!this.instance) this.instance = new InventoryBridge();
 *         return this.instance;
 *     }
 *
 *     private constructor() {
 *         super("/Script/MyGame.InventorySubsystem", "[InventoryBridge]");
 *     }
 *
 *     protected bindDelegates(): void {
 *         const sub = this.getSubsystem();
 *         if (!sub) return;
 *         sub.OnItemAdded.Add((itemId: any, count: number) => {
 *             EventBus.getInstance().emitScoped("OnItemAdded", -1, GLOBAL_SCOPE, [
 *                 { itemId: itemId.toString(), count }
 *             ]);
 *         });
 *     }
 *
 *     addItem(itemId: string, count: number): boolean {
 *         const sub = this.ensureSubsystem("addItem");
 *         if (!sub) return false;
 *         return sub.AddItem(itemId, count);
 *     }
 * }
 * ```
 */

import * as UE from "ue";

/** UE 结构体类型缓存（模块级共享，所有 Bridge 实例共用） */
const _typeCache: Record<string, any> = {};

/** 通过 loadUEType 加载 UE 类型 */
export function loadUEType(fullPath: string): any {
    const fn = (globalThis as any).puerts?.loadUEType;
    if (typeof fn === "function") {
        return fn(fullPath);
    }
    return undefined;
}

/** 缓存式加载 UE 结构体类型 */
export function getUEType(fullPath: string): any {
    if (!_typeCache[fullPath]) {
        _typeCache[fullPath] = loadUEType(fullPath);
    }
    return _typeCache[fullPath];
}

/**
 * 尝试加载一个 UE 枚举类型。
 *
 * fullPath 可以是完整路径 `/Script/HD_2D.EComboTrigger`，也可以只提供枚举名 `EComboTrigger`。
 */
export function loadUEEnum(fullPath: string): any {
    const fn = (globalThis as any).puerts?.loadUEType;
    if (typeof fn === "function") {
        const result = fn(fullPath);
        if (result) return result;
    }

    const enumName = fullPath.split("/").pop()?.split(".").pop();
    if (enumName && UE.Enum?.Find) {
        try {
            return UE.Enum.Find(enumName);
        } catch {
            // ignore
        }
    }
    return undefined;
}

/**
 * 从运行时 UE 枚举对象读取值，找不到时返回 fallback。
 */
export function getUEEnumValue(enumType: any, memberName: string, fallback: number): number {
    if (!enumType) {
        console.warn(`[SubsystemBridge] UE enum 未加载，使用 fallback 枚举值 ${memberName}=${fallback}`);
        return fallback;
    }
    const value = enumType[memberName];
    if (typeof value === "number") {
        return value;
    }
    console.warn(`[SubsystemBridge] UE enum 成员 ${memberName} 未找到，使用 fallback 值 ${fallback}`);
    return fallback;
}

/**
 * GameInstance 获取策略
 */
function getGameInstance(logTag: string): UE.GameInstance | null {
    // 策略1: puerts.argv（MainGame Start 传入）
    try {
        const gi = (globalThis as any).puerts?.argv?.getByName?.("GameInstance");
        if (gi) {
            console.log(`${logTag} 通过 puerts.argv 获取 GameInstance`);
            return gi as UE.GameInstance;
        }
    } catch (_) {}

    // 策略2: 全局引用
    try {
        const gi = (globalThis as any).__gameInstance;
        if (gi) {
            console.log(`${logTag} 通过 __gameInstance 获取 GameInstance`);
            return gi as UE.GameInstance;
        }
    } catch (_) {}

    // 策略3: UE.GameplayStatics（需要 World 上下文）
    try {
        const world = (globalThis as any).__world;
        if (world && UE.GameplayStatics) {
            const gi = UE.GameplayStatics.GetGameInstance(world);
            if (gi) {
                console.log(`${logTag} 通过 GameplayStatics 获取 GameInstance`);
                return gi as UE.GameInstance;
            }
        }
    } catch (_) {}

    return null;
}

/**
 * SubsystemBridge 基类
 *
 * @typeParam TSubsystem - C++ Subsystem 类型（如 UE.RoleManagementSubsystem）
 */
export abstract class SubsystemBridge<TSubsystem extends UE.GameInstanceSubsystem> {
    /** 底层 C++ Subsystem 引用（缓存） */
    protected subsystem: TSubsystem | null = null;

    /** 是否已绑定 C++ 委托 */
    protected bDelegatesBound = false;

    /** 是否已尝试过初始化 */
    protected bInitAttempted = false;

    /** Subsystem UClass 缓存 */
    private subsystemClassCache: UE.Class | null = null;

    /**
     * @param subsystemClassPath Puerts 完整类路径，如 "/Script/HD_2D.RoleManagementSubsystem"
     * @param logTag 日志标签，如 "[RoleManager]"
     */
    constructor(
        protected readonly subsystemClassPath: string,
        protected readonly logTag: string,
    ) {}

    // ==================== 生命周期 ====================

    /**
     * 初始化桥接层
     * 获取 C++ Subsystem 引用并绑定事件委托
     * @returns 是否初始化成功；失败时自动标记为延迟重试
     */
    initialize(): boolean {
        try {
            const subsystem = this.getSubsystem();
            if (!subsystem) {
                if (!this.bInitAttempted) {
                    console.log(`${this.logTag} Subsystem 暂不可用，将在首次使用时延迟初始化`);
                    this.bInitAttempted = true;
                }
                return false;
            }

            if (!(subsystem as any).IsInitialized?.()) {
                console.warn(`${this.logTag} Subsystem 尚未初始化，将在首次使用时重试`);
                return false;
            }

            this.bindDelegates();
            console.log(`${this.logTag} 桥接初始化成功`);
            this.bInitAttempted = true;
            return true;
        } catch (e) {
            console.warn(`${this.logTag} 初始化暂未成功（UE 环境可能尚未就绪）: ${e}`);
            this.bInitAttempted = true;
            return false;
        }
    }

    /**
     * 桥接层是否已就绪
     * 如果之前初始化失败，自动重试
     */
    isReady(): boolean {
        const sub = this.getSubsystem();
        if ((sub as any)?.IsInitialized?.()) {
            if (!this.bDelegatesBound) {
                this.bindDelegates();
            }
            return true;
        }
        return false;
    }

    // ==================== Subsystem 获取 ====================

    /**
     * 获取 C++ Subsystem 引用（带缓存，安全返回 null）
     *
     * 注意：Normal Mode（Mixin 模式）下 Puerts 不调用 Start()，
     * 因此 argv 中不会有 GameInstance。这里通过多种回退策略获取。
     */
    protected getSubsystem(): TSubsystem | null {
        if (this.subsystem) return this.subsystem;

        try {
            const gi = getGameInstance(this.logTag);
            if (!gi) {
                console.warn(`${this.logTag} 无法获取 GameInstance`);
                return null;
            }

            const subsystemClass = this.getSubsystemClass();
            if (!subsystemClass) return null;

            // 获取 SubsystemBlueprintLibrary
            let lib = UE.SubsystemBlueprintLibrary;
            if (!lib) {
                lib = loadUEType("/Script/Engine.SubsystemBlueprintLibrary");
            }

            if (lib?.GetGameInstanceSubsystem) {
                const sub = lib.GetGameInstanceSubsystem(gi, subsystemClass) as TSubsystem;
                if (sub) {
                    console.log(`${this.logTag} 获取 Subsystem 成功`);
                    this.subsystem = sub;
                    return sub;
                }
            }

            console.warn(`${this.logTag} SubsystemBlueprintLibrary 不可用`);
            return null;
        } catch (e) {
            console.warn(`${this.logTag} 获取 Subsystem 异常: ${e}`);
            return null;
        }
    }

    /**
     * 获取 Subsystem 的 UClass
     */
    protected getSubsystemClass(): UE.Class | null {
        if (this.subsystemClassCache) return this.subsystemClassCache;

        try {
            const type = loadUEType(this.subsystemClassPath);
            if (type && typeof type.StaticClass === "function") {
                const cls = type.StaticClass();
                if (cls) {
                    this.subsystemClassCache = cls;
                    console.log(`${this.logTag} UClass 加载成功: ${this.subsystemClassPath}`);
                    return cls;
                }
            }
        } catch (e) {
            console.warn(`${this.logTag} UClass 加载失败: ${e}`);
        }

        console.warn(`${this.logTag} 无法加载 UClass: ${this.subsystemClassPath}`);
        return null;
    }

    /**
     * 确保 Subsystem 可用 — 不可用时自动尝试延迟初始化
     * 业务方法调用前先走此检查
     */
    protected ensureSubsystem(caller: string): TSubsystem | null {
        let sub = this.getSubsystem();

        // 已获取但委托未绑定 → 补绑
        if (sub && !this.bDelegatesBound) {
            this.initialize();
        }

        // 未获取 → 重试一次
        if (!sub) {
            sub = this.getSubsystem();
            if (sub && !this.bDelegatesBound) {
                this.initialize();
            }
        }

        if (!sub) {
            console.error(`${this.logTag} ${caller}: Subsystem 不可用`);
            return null;
        }
        if (!(sub as any).IsInitialized?.()) {
            console.error(`${this.logTag} ${caller}: Subsystem 尚未初始化`);
            return null;
        }
        return sub;
    }

    // ==================== 子类必须实现 ====================

    /**
     * 绑定 C++ 委托到 TS EventBus
     *
     * 在 initialize() 成功后自动调用。
     * 子类在此方法内通过 sub.OnXxx.Add(...) 绑定 C++ 委托，
     * 并在回调中将事件转发为 EventBus 全局事件。
     */
    protected abstract bindDelegates(): void;

    // ==================== 工具方法 ====================

    /** 强制重置缓存，用于关卡切换等场景 */
    reset(): void {
        this.subsystem = null;
        this.bDelegatesBound = false;
        this.subsystemClassCache = null;
    }

    /** 创建 UE 结构体实例（带类型缓存） */
    protected createStruct(structPath: string): any {
        const type = getUEType(structPath);
        if (!type) {
            console.warn(`${this.logTag} 无法加载结构体类型: ${structPath}`);
            return null;
        }
        return new type();
    }
}

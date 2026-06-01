import * as UE from "ue";

// ======================== 冲刺配置接口 ========================

/**
 * 冲刺参数配置
 * 使用方可通过 Partial<DashConfig> 只覆盖需要修改的字段
 */
export interface DashConfig {
    /** 冲刺速度（cm/s），施加给 LaunchCharacter 的水平速度 */
    dashSpeed: number;
    /** 冲刺持续时间（秒），期间角色保持高速移动 */
    dashDuration: number;
    /** 冲刺冷却时间（秒），冲刺结束后多久可以再次冲刺 */
    dashCooldown: number;
    /** 冲刺期间的 MaxWalkSpeed 倍率（防止 CMC 速度上限截断冲刺速度） */
    dashSpeedMultiplier: number;
}

/** 默认冲刺配置 */
export const DEFAULT_DASH_CONFIG: Readonly<DashConfig> = Object.freeze({
    dashSpeed: 1200,
    dashDuration: 0.2,
    dashCooldown: 0.8,
    dashSpeedMultiplier: 3.0,
});

// ======================== 冲刺状态枚举 ========================

/** 冲刺当前阶段 */
export enum DashPhase {
    /** 空闲，可以冲刺 */
    Idle = "Idle",
    /** 冲刺进行中 */
    Dashing = "Dashing",
    /** 冷却中 */
    Cooldown = "Cooldown",
}

// ======================== 方向向量接口 ========================

/** 轻量方向向量（纯 TS 对象，避免在 Puerts 中直接构造 UE.Vector） */
export interface DashDirection {
    X: number;
    Y: number;
    Z: number;
}

// ======================== 冲刺回调接口 ========================

/**
 * 冲刺生命周期回调
 * 使用方可选择性实现，用于触发动画、特效、无敌帧等
 */
export interface DashCallbacks {
    /** 冲刺开始时回调 */
    onDashStart?: (direction: DashDirection) => void;
    /** 冲刺结束时回调 */
    onDashEnd?: () => void;
    /** 冷却结束时回调 */
    onCooldownEnd?: () => void;
}

// ======================== DashAbility 核心类 ========================

/**
 * 冲刺能力模块（组合模式）
 * 
 * 设计理念：
 *   独立于任何角色逻辑类，通过组合（Composition）而非继承来使用。
 *   任何拥有 UE.Character 引用的逻辑类都可以创建并使用此模块。
 * 
 * 使用方式：
 * ```ts
 * // 1. 在角色逻辑类中创建实例
 * private dashAbility = new DashAbility(
 *     () => this.getOwnerAs<UE.Character>(),
 *     { dashSpeed: 1500 },  // 可选：覆盖默认配置
 *     {                      // 可选：生命周期回调
 *         onDashStart: (dir) => console.log("冲刺开始", dir),
 *         onDashEnd: () => console.log("冲刺结束"),
 *     }
 * );
 * 
 * // 2. 在事件回调中触发冲刺
 * this.dashAbility.tryDash();
 * 
 * // 3. 在每帧更新中调用 tick
 * this.dashAbility.tick(deltaTime);
 * 
 * // 4. 在角色非激活/销毁时调用
 * this.dashAbility.forceEnd();
 * this.dashAbility.reset();
 * ```
 */
export class DashAbility {

    // ---- 配置 ----
    private config: DashConfig;
    private callbacks: DashCallbacks;

    // ---- 角色引用获取器（延迟求值，避免初始化顺序问题） ----
    private getCharacter: () => UE.CharacterBase | null;

    // ---- 运行时状态 ----
    private phase: DashPhase = DashPhase.Idle;
    private dashElapsed: number = 0;
    private cooldownRemaining: number = 0;
    private originalMaxWalkSpeed: number = 0;

    /** 日志标签，方便区分不同角色的冲刺日志 */
    private logTag: string;

    /**
     * 构造冲刺能力实例
     * 
     * @param getCharacter 获取角色引用的函数（延迟求值）
     * @param configOverride 可选的配置覆盖（只需传入要修改的字段）
     * @param callbacks 可选的生命周期回调
     * @param logTag 日志标签（默认 "DashAbility"）
     */
    constructor(
        getCharacter: () => UE.CharacterBase | null,
        configOverride?: Partial<DashConfig>,
        callbacks?: DashCallbacks,
        logTag?: string,
    ) {
        this.getCharacter = getCharacter;
        this.config = { ...DEFAULT_DASH_CONFIG, ...configOverride };
        this.callbacks = callbacks ?? {};
        this.logTag = logTag ?? "DashAbility";
    }

    // ======================== 公开 API ========================

    /**
     * 尝试执行冲刺
     * 如果当前处于冲刺中或冷却中，会被拒绝并返回 false
     * 
     * @returns 是否成功触发冲刺
     */
    tryDash(): boolean {
        if (this.phase === DashPhase.Dashing) {
            console.log(`[${this.logTag}] 冲刺中，忽略重复冲刺请求`);
            return false;
        }
        if (this.phase === DashPhase.Cooldown) {
            console.log(`[${this.logTag}] 冷却中 (剩余 ${this.cooldownRemaining.toFixed(2)}s)，忽略冲刺请求`);
            return false;
        }

        const character = this.getCharacter();
        if (!character) {
            console.warn(`[${this.logTag}] 角色引用无效，无法冲刺`);
            return false;
        }

        const moveComp = character.CharacterMovement;
        if (!moveComp) {
            console.warn(`[${this.logTag}] CharacterMovement 组件不存在，无法冲刺`);
            return false;
        }

        // 保存原始移动速度
        this.originalMaxWalkSpeed = moveComp.MaxWalkSpeed;

        // 计算冲刺方向
        const dashDirection = this.calculateDashDirection(character);

        // 进入冲刺状态
        this.phase = DashPhase.Dashing;
        this.dashElapsed = 0;

        // 提升 MaxWalkSpeed（防止 CMC 速度上限截断冲刺速度）
        moveComp.MaxWalkSpeed = this.originalMaxWalkSpeed * this.config.dashSpeedMultiplier;

        // 施加冲刺速度
        // Puerts Normal Mode 下 new UE.Vector() 不可用，
        // 借用 GetVelocity() 返回的 UE.Vector 实例修改属性来构造 launch velocity
        const launchVelocity = character.GetVelocity();
        launchVelocity.X = dashDirection.X * this.config.dashSpeed;
        launchVelocity.Y = dashDirection.Y * this.config.dashSpeed;
        launchVelocity.Z = 0;  // 不影响垂直速度
        character.LaunchCharacter(launchVelocity, true, false);

        console.log(`[${this.logTag}] 冲刺开始! 方向=(${dashDirection.X.toFixed(2)}, ${dashDirection.Y.toFixed(2)}), 速度=${this.config.dashSpeed}`);

        // 触发回调
        this.callbacks.onDashStart?.(dashDirection);

        return true;
    }

    /**
     * 每帧更新（必须在角色逻辑的 handleActiveInput 或 OnTick 中调用）
     * 
     * @param deltaTime 帧间隔时间（秒）
     */
    tick(deltaTime: number): void {
        switch (this.phase) {
            case DashPhase.Dashing:
                this.dashElapsed += deltaTime;
                if (this.dashElapsed >= this.config.dashDuration) {
                    this.endDash();
                }
                break;

            case DashPhase.Cooldown:
                this.cooldownRemaining -= deltaTime;
                if (this.cooldownRemaining <= 0) {
                    this.cooldownRemaining = 0;
                    this.phase = DashPhase.Idle;
                    console.log(`[${this.logTag}] 冷却结束，可以再次冲刺`);
                    this.callbacks.onCooldownEnd?.();
                }
                break;

            case DashPhase.Idle:
                // 无需处理
                break;
        }
    }

    /**
     * 强制结束冲刺（用于角色切换、死亡等场景）
     * 如果当前正在冲刺，会立即恢复角色状态
     */
    forceEnd(): void {
        if (this.phase === DashPhase.Dashing) {
            this.endDash();
        }
    }

    /**
     * 完全重置冲刺状态（用于对象池复用）
     * 清除所有运行时状态，包括冷却
     */
    reset(): void {
        if (this.phase === DashPhase.Dashing) {
            this.restoreWalkSpeed();
        }
        this.phase = DashPhase.Idle;
        this.dashElapsed = 0;
        this.cooldownRemaining = 0;
        this.originalMaxWalkSpeed = 0;
    }

    /**
     * 运行时修改冲刺配置（如 Buff 增加冲刺速度）
     * 
     * @param configOverride 要覆盖的配置字段
     */
    updateConfig(configOverride: Partial<DashConfig>): void {
        Object.assign(this.config, configOverride);
    }

    // ======================== 状态查询 ========================

    /** 当前冲刺阶段 */
    get currentPhase(): DashPhase { return this.phase; }

    /** 是否正在冲刺 */
    get isDashing(): boolean { return this.phase === DashPhase.Dashing; }

    /** 是否在冷却中 */
    get isCoolingDown(): boolean { return this.phase === DashPhase.Cooldown; }

    /** 是否可以冲刺（空闲状态） */
    get canDash(): boolean { return this.phase === DashPhase.Idle; }

    /** 冷却剩余时间（秒） */
    get cooldownLeft(): number { return this.cooldownRemaining; }

    /** 冷却进度（0~1，1 表示冷却完成） */
    get cooldownProgress(): number {
        if (this.config.dashCooldown <= 0) return 1;
        return 1 - (this.cooldownRemaining / this.config.dashCooldown);
    }

    // ======================== 内部方法 ========================

    /**
     * 计算冲刺方向
     * 优先使用当前水平速度方向，无速度时使用 CharacterBase 中的 Orientation
     * 
     * 返回纯 TS 对象（DashDirection），避免在 Puerts Normal Mode 下
     * 使用 new UE.Vector() 或 UE.KismetMathLibrary（运行时可能不可用）
     */
    private calculateDashDirection(character: UE.CharacterBase): DashDirection {
        const velocity = character.GetVelocity();
        const horizontalSpeed = Math.sqrt(velocity.X * velocity.X + velocity.Y * velocity.Y);

        if (horizontalSpeed > 10) {
            // 有水平速度时，沿当前移动方向冲刺
            return {
                X: velocity.X / horizontalSpeed,
                Y: velocity.Y / horizontalSpeed,
                Z: 0,
            };
        } else {
            // 无速度时，使用 CharacterBase 中的 Orientation（参考 AnimStateSync）
            const ori = character.Orientation;
            if (Math.abs(ori.X) > 0.001) {
                return { X: ori.X, Y: ori.Y, Z: 0 };
            }
            // 兜底：默认向前（X 轴正方向）
            return { X: 1, Y: 0, Z: 0 };
        }
    }

    /**
     * 结束冲刺，恢复角色状态并进入冷却
     */
    private endDash(): void {
        this.restoreWalkSpeed();

        this.phase = DashPhase.Cooldown;
        this.dashElapsed = 0;
        this.cooldownRemaining = this.config.dashCooldown;

        console.log(`[${this.logTag}] 冲刺结束! 进入冷却 ${this.config.dashCooldown}s`);

        // 触发回调
        this.callbacks.onDashEnd?.();
    }

    /**
     * 恢复原始 MaxWalkSpeed
     */
    private restoreWalkSpeed(): void {
        const character = this.getCharacter();
        if (character?.CharacterMovement && this.originalMaxWalkSpeed > 0) {
            character.CharacterMovement.MaxWalkSpeed = this.originalMaxWalkSpeed;
        }
    }
}

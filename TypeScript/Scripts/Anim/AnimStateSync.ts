/**
 * ==========================================
 *   动画状态同步核心模块
 * ==========================================
 * 
 * 为 PaperZDAnimInstance 子类提供可复用的动画状态计算与同步逻辑。
 * 
 * 职责划分：
 *   - AnimState：统一的布尔状态结构
 *   - computeAnimState()：从 CharacterBase 采样运动状态
 *   - AnimStateSyncContext：绑定上下文管理（对象引用 + 有效性守卫）
 *   - IAnimFieldMapper：字段写回抽象接口，供各蓝图子类实现
 */
import * as UE from "ue";
import { getUEEnumValue, loadUEEnum } from "../Bridge/SubsystemBridge";

// ======================== UObject 有效性检查 ========================

/**
 * 安全检查一个 UE.Object 引用是否仍然有效。
 * 
 * UE.Object 类型定义中没有 IsValid() 方法，Puerts 运行时在对象被 GC/销毁后
 * 访问其属性会抛异常。因此通过 try-catch + GetName() 来探测有效性。
 */
function isUObjectValid(obj: UE.Object | null | undefined): boolean {
    if (!obj) return false;
    try {
        // 尝试访问 UObject 基类方法，如果对象已销毁会抛异常
        obj.GetName();
        return true;
    } catch {
        return false;
    }
}

// ======================== 状态结构 ========================

/** 动画驱动状态（每 Tick 计算一次） */
export interface AnimState {
    /** 角色是否在地面（Walking / NavWalking） */
    isOnGround: boolean;
    /** 角色是否在下落（MovementMode == Falling） */
    isFalling: boolean;
    /** 角色是否正在上升跳跃（空中 + Z 速度 > 0） */
    isJumpingUp: boolean;
    /** 角色是否正在下落（空中 + Z 速度 <= 0） */
    isFallingDown: boolean;
    /** 角色是否应该移动（速度超过阈值且处于可移动模式） */
    shouldMove: boolean;
    /** 身体朝向（仅保留左右方向的 X 分量，Y 固定为 0） */
    orientation: { x: number; y: number };
}

/** 默认的"安全零值"状态，用于绑定失效时保持稳定 */
const DEFAULT_STATE: Readonly<AnimState> = Object.freeze({
    isOnGround: true,
    isFalling: false,
    isJumpingUp: false,
    isFallingDown: false,
    shouldMove: false,
    orientation: Object.freeze({ x: 1, y: 0 }),
});

// ======================== 状态计算 ========================

/** ShouldMove 的速度阈值（单位：cm/s） */
const SPEED_THRESHOLD = 3.0;

const EMovementModeEnum = loadUEEnum("/Script/Engine.EMovementMode");

/**
 * EMovementMode 数值常量。
 *
 * Puerts 运行时中 UE.EMovementMode 枚举对象可能为 undefined，
 * 因此优先从运行时加载枚举值，加载失败时回退到常量数值。
 */
const EMovementModeValues = {
    MOVE_None: getUEEnumValue(EMovementModeEnum, "MOVE_None", 0),
    MOVE_Walking: getUEEnumValue(EMovementModeEnum, "MOVE_Walking", 1),
    MOVE_NavWalking: getUEEnumValue(EMovementModeEnum, "MOVE_NavWalking", 2),
    MOVE_Falling: getUEEnumValue(EMovementModeEnum, "MOVE_Falling", 3),
    MOVE_Swimming: getUEEnumValue(EMovementModeEnum, "MOVE_Swimming", 4),
    MOVE_Flying: getUEEnumValue(EMovementModeEnum, "MOVE_Flying", 5),
    MOVE_Custom: getUEEnumValue(EMovementModeEnum, "MOVE_Custom", 6),
} as const;

/**
 * 从 CharacterBase 采样并计算当前动画驱动状态。
 * 
 * @param character 已验证有效的角色引用
 * @returns 计算后的 AnimState
 */
export function computeAnimState(character: UE.CharacterBase): AnimState {
    const movementComp = character.CharacterMovement;
    if (!movementComp) {
        return { ...DEFAULT_STATE };
    }

    const movementMode = movementComp.MovementMode as unknown as number;
    const velocity = character.GetVelocity();
    const speed = velocity ? velocity.Size() : 0;

    const isOnGround =
        movementMode === EMovementModeValues.MOVE_Walking ||
        movementMode === EMovementModeValues.MOVE_NavWalking;
    const isFalling = movementMode === EMovementModeValues.MOVE_Falling;
    const velocityZ = velocity ? velocity.Z : 0;
    const isJumpingUp = isFalling && velocityZ > 0;
    const isFallingDown = isFalling && velocityZ <= 0;
    const shouldMove = speed > SPEED_THRESHOLD && isOnGround;

    // 使用 CharacterBase 中的 Orientation 变量（由 C++ Tick 更新）
    const orientation = { x: character.Orientation.X, y: character.Orientation.Y };

    return { isOnGround, isFalling, isJumpingUp, isFallingDown, shouldMove, orientation };
}

// ======================== 字段映射接口 ========================

/**
 * 动画蓝图变量写回映射器。
 * 每个 ABP 子类需要实现一个具体的 mapper，将 AnimState 写入自身变量。
 */
export interface IAnimFieldMapper<TAnimInst extends UE.PaperZDAnimInstance = UE.PaperZDAnimInstance> {
    /** 将计算后的状态写入动画实例变量 */
    applyState(animInstance: TAnimInst, state: AnimState): void;
}

// ======================== 绑定上下文 ========================

/**
 * 状态同步上下文：管理角色与动画实例的绑定关系，并在 Tick 中驱动状态同步。
 * 
 * 使用方式：
 * 1. 由 Mixin 入口事件调用 bind() 建立绑定
 * 2. 由 Mixin 的 OnTick 调用 tick() 驱动更新
 */
export class AnimStateSyncContext<TAnimInst extends UE.PaperZDAnimInstance = UE.PaperZDAnimInstance> {
    private animInstance: TAnimInst | null = null;
    private character: UE.CharacterBase | null = null;
    private fieldMapper: IAnimFieldMapper<TAnimInst>;
    private bound: boolean = false;

    constructor(fieldMapper: IAnimFieldMapper<TAnimInst>) {
        this.fieldMapper = fieldMapper;
    }

    // -------- 绑定 --------

    /**
     * 绑定蓝图传入的角色对象与动画实例。
     * 
     * @param characterObj 蓝图传入的角色对象（需转换为 CharacterBase）
     * @param animInst 动画实例自身
     * @returns 绑定是否成功
     */
    bind(characterObj: UE.Object | null | undefined, animInst: TAnimInst | null | undefined): boolean {
        // 重置之前的绑定
        this.unbind();

        // 校验输入
        if (!characterObj || !animInst) {
            console.warn("[AnimStateSync] 绑定失败：输入对象为空");
            return false;
        }

        if (!isUObjectValid(characterObj) || !isUObjectValid(animInst)) {
            console.warn("[AnimStateSync] 绑定失败：输入对象无效");
            return false;
        }

        // 安全转换为 CharacterBase
        const castResult = this.tryCastToCharacterBase(characterObj);
        if (!castResult) {
            console.warn("[AnimStateSync] 绑定失败：角色对象无法转换为 CharacterBase");
            return false;
        }

        this.character = castResult;
        this.animInstance = animInst;
        this.bound = true;
        console.log("[AnimStateSync] 绑定成功");
        return true;
    }

    /** 解除绑定 */
    unbind(): void {
        this.character = null;
        this.animInstance = null;
        this.bound = false;
    }

    /** 当前是否已绑定 */
    isBound(): boolean {
        return this.bound;
    }

    // -------- Tick 驱动 --------

    /**
     * 每 Tick 调用：校验有效性 → 计算状态 → 写回变量。
     * 未绑定或对象失效时安全跳过。
     */
    tick(): void {
        if (!this.bound) {
            return;
        }

        // 运行时有效性守卫
        if (!this.isContextValid()) {
            console.warn("[AnimStateSync] 运行时对象失效，自动解除绑定");
            this.unbind();
            return;
        }

        // 计算状态
        const state = computeAnimState(this.character!);

        // 写回动画蓝图变量
        try {
            this.fieldMapper.applyState(this.animInstance!, state);
        } catch (e) {
            console.error(`[AnimStateSync] 写回变量异常: ${e}`);
        }
    }

    // -------- 内部工具 --------

    /** 检查绑定对象运行时是否仍然有效 */
    private isContextValid(): boolean {
        if (!this.character || !this.animInstance) return false;
        return isUObjectValid(this.character) && isUObjectValid(this.animInstance);
    }

    /**
     * 将 UE.Object 安全转换为 CharacterBase。
     * 利用 Puerts 的运行时类型判断进行保护。
     */
    private tryCastToCharacterBase(obj: UE.Object): UE.CharacterBase | null {
        try {
            // 使用 Puerts 的 Cast 语义：如果 obj 本身就是 CharacterBase 或其子类，直接转换
            const character = obj as unknown as UE.CharacterBase;
            // 验证转换后确实拥有 CharacterBase 的标志性属性
            if (character && character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                return character;
            }
            return null;
        } catch {
            return null;
        }
    }
}

export { DEFAULT_STATE };

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STATE = exports.AnimStateSyncContext = void 0;
exports.computeAnimState = computeAnimState;
// ======================== UObject 有效性检查 ========================
/**
 * 安全检查一个 UE.Object 引用是否仍然有效。
 *
 * UE.Object 类型定义中没有 IsValid() 方法，Puerts 运行时在对象被 GC/销毁后
 * 访问其属性会抛异常。因此通过 try-catch + GetName() 来探测有效性。
 */
function isUObjectValid(obj) {
    if (!obj)
        return false;
    try {
        // 尝试访问 UObject 基类方法，如果对象已销毁会抛异常
        obj.GetName();
        return true;
    }
    catch {
        return false;
    }
}
/** 默认的"安全零值"状态，用于绑定失效时保持稳定 */
const DEFAULT_STATE = Object.freeze({
    isOnGround: true,
    isFalling: false,
    isJumpingUp: false,
    isFallingDown: false,
    shouldMove: false,
    orientation: Object.freeze({ x: 1, y: 0 }),
});
exports.DEFAULT_STATE = DEFAULT_STATE;
// ======================== 状态计算 ========================
/** ShouldMove 的速度阈值（单位：cm/s） */
const SPEED_THRESHOLD = 3.0;
/**
 * EMovementMode 数值常量。
 *
 * Puerts 运行时中 UE.EMovementMode 枚举对象可能为 undefined，
 * 因此使用与 UE C++ 枚举顺序一致的数值常量替代。
 */
const EMovementModeValues = {
    MOVE_None: 0,
    MOVE_Walking: 1,
    MOVE_NavWalking: 2,
    MOVE_Falling: 3,
    MOVE_Swimming: 4,
    MOVE_Flying: 5,
    MOVE_Custom: 6,
};
/**
 * 从 CharacterBase 采样并计算当前动画驱动状态。
 *
 * @param character 已验证有效的角色引用
 * @returns 计算后的 AnimState
 */
function computeAnimState(character) {
    const movementComp = character.CharacterMovement;
    if (!movementComp) {
        return { ...DEFAULT_STATE };
    }
    const movementMode = movementComp.MovementMode;
    const velocity = character.GetVelocity();
    const speed = velocity ? velocity.Size() : 0;
    const isOnGround = movementMode === EMovementModeValues.MOVE_Walking ||
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
// ======================== 绑定上下文 ========================
/**
 * 状态同步上下文：管理角色与动画实例的绑定关系，并在 Tick 中驱动状态同步。
 *
 * 使用方式：
 * 1. 由 Mixin 入口事件调用 bind() 建立绑定
 * 2. 由 Mixin 的 OnTick 调用 tick() 驱动更新
 */
class AnimStateSyncContext {
    animInstance = null;
    character = null;
    fieldMapper;
    bound = false;
    constructor(fieldMapper) {
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
    bind(characterObj, animInst) {
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
    unbind() {
        this.character = null;
        this.animInstance = null;
        this.bound = false;
    }
    /** 当前是否已绑定 */
    isBound() {
        return this.bound;
    }
    // -------- Tick 驱动 --------
    /**
     * 每 Tick 调用：校验有效性 → 计算状态 → 写回变量。
     * 未绑定或对象失效时安全跳过。
     */
    tick() {
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
        const state = computeAnimState(this.character);
        // 写回动画蓝图变量
        try {
            this.fieldMapper.applyState(this.animInstance, state);
        }
        catch (e) {
            console.error(`[AnimStateSync] 写回变量异常: ${e}`);
        }
    }
    // -------- 内部工具 --------
    /** 检查绑定对象运行时是否仍然有效 */
    isContextValid() {
        if (!this.character || !this.animInstance)
            return false;
        return isUObjectValid(this.character) && isUObjectValid(this.animInstance);
    }
    /**
     * 将 UE.Object 安全转换为 CharacterBase。
     * 利用 Puerts 的运行时类型判断进行保护。
     */
    tryCastToCharacterBase(obj) {
        try {
            // 使用 Puerts 的 Cast 语义：如果 obj 本身就是 CharacterBase 或其子类，直接转换
            const character = obj;
            // 验证转换后确实拥有 CharacterBase 的标志性属性
            if (character && character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                return character;
            }
            return null;
        }
        catch {
            return null;
        }
    }
}
exports.AnimStateSyncContext = AnimStateSyncContext;
//# sourceMappingURL=AnimStateSync.js.map
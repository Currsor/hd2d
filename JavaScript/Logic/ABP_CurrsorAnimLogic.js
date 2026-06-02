"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABP_CurrsorAnimLogic = void 0;
const GameObjectBase_1 = require("../Mixin/GameObjectBase");
const EventTypes_1 = require("../Config/EventTypes");
const EventContext_1 = require("../Mixin/EventContext");
const AnimStateSync_1 = require("../Anim/AnimStateSync");
class ABP_CurrsorAnimLogic extends GameObjectBase_1.GameObjectBase {
    /** 缓存的角色引用（从动画蓝图实例的 Currsor 属性获取） */
    character = null;
    /** 标记角色引用是否已成功解析 */
    characterResolved = false;
    /** 缓存最后一次有效的朝向值（停止移动时保持最后朝向） */
    lastOrientationX = 1;
    Init(owner) {
        super.Init(owner);
        console.log(`[ABP_CurrsorAnimLogic] 动画逻辑初始化: ${owner.GetName()}`);
        // 尝试立即解析角色引用
        this.tryResolveCharacter();
    }
    /**
     * 声明事件订阅
     */
    OnSetup() {
        // 订阅 OnTick 事件（接收自身实例级 + 全局 OnTick）
        this.subscribeScoped(EventTypes_1.EventTypes.OnTick, this.onAnimTick.bind(this), {
            filter: EventContext_1.ScopeFilter.SELF_AND_GLOBAL,
        });
        // 订阅 OnJump 事件（玩家主动触发 IA_Jump 时由蓝图转发）
        // 使用 ANY 过滤器：因为事件由 BP_Currsor（角色蓝图）发出，
        // 其 scope 是 CurrsorLogic 的 logicId，与本实例（ABP_CurrsorAnim）的 logicId 不同，
        // 所以需要 ANY 才能跨实例接收
        this.subscribeScoped(EventTypes_1.EventTypes.OnJump, this.onJump.bind(this), {
            filter: EventContext_1.ScopeFilter.ANY,
        });
        // 订阅 OnDashStarted 事件（CurrsorLogic 在 tryDash 成功后发出）
        // 只有冲刺真正执行（非 CD 中）才会触发动画
        // 使用 ANY 过滤器：因为事件由 CurrsorLogic 发出，scope 与本实例不同
        this.subscribeScoped(EventTypes_1.EventTypes.OnDashStarted, this.onDash.bind(this), {
            filter: EventContext_1.ScopeFilter.ANY,
        });
        // 订阅连击攻击开始事件（CurrsorLogic 在 comboAttack.onAttackStart 回调中发出）
        // payload: comboIndex (1/2/3)
        this.subscribeScoped(EventTypes_1.EventTypes.OnComboAttackStart, this.onComboAttackStart.bind(this), {
            filter: EventContext_1.ScopeFilter.ANY,
        });
        // 订阅连击结束事件（CurrsorLogic 在 comboAttack.onComboEnd 回调中发出）
        this.subscribeScoped(EventTypes_1.EventTypes.OnComboEnd, this.onComboEnd.bind(this), {
            filter: EventContext_1.ScopeFilter.ANY,
        });
    }
    /**
     * 对象池复用时重置状态
     */
    OnReset() {
        this.character = null;
        this.characterResolved = false;
        this.lastOrientationX = 1;
    }
    // ======================== 核心逻辑 ========================
    /**
     * 每帧动画状态同步
     * @param deltaTime 帧间隔时间（秒）—— 由 EmitEvent/EmitEventByOwner 传入
     */
    onAnimTick(deltaTime) {
        const animInst = this.getAnimInstance();
        if (!animInst)
            return;
        // 延迟解析角色引用（OnInit 时角色可能尚未就绪）
        if (!this.characterResolved) {
            this.tryResolveCharacter();
            if (!this.characterResolved)
                return;
        }
        // 运行时有效性检查
        if (!this.isCharacterValid()) {
            console.warn("[ABP_CurrsorAnimLogic] 角色引用失效，重新尝试解析");
            this.characterResolved = false;
            this.character = null;
            return;
        }
        // 计算动画状态
        const state = (0, AnimStateSync_1.computeAnimState)(this.character);
        // 写回动画蓝图变量
        this.applyStateToAnimInstance(animInst, state);
    }
    /**
     * 跳跃输入触发回调
     * 仅在玩家主动按下 IA_Jump 时执行，通过 JumpToNode 切换到跳跃动画节点
     */
    onJump() {
        const animInst = this.getAnimInstance();
        if (!animInst)
            return;
        try {
            animInst.JumpToNode("EnterJump");
        }
        catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] JumpToNode("EnterJump") 异常: ${e}`);
        }
    }
    /**
     * 冲刺输入触发回调
     * 在玩家按下 IA_Dash 时执行，通过 JumpToNode 切换到冲刺动画节点
     */
    onDash() {
        const animInst = this.getAnimInstance();
        if (!animInst)
            return;
        try {
            animInst.JumpToNode("EnterDash");
        }
        catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] JumpToNode("EnterDash") 异常: ${e}`);
        }
    }
    /**
     * 连击攻击开始回调
     * 根据 comboIndex 跳转到对应的攻击动画节点
     *
     * 蓝图侧 PaperZD 状态机中需要创建以下节点：
     *   - EnterAttack1：第1段攻击动画
     *   - EnterAttack2：第2段攻击动画
     *   - EnterAttack3：第3段攻击动画
     *
     * @param comboIndex 连击段数（1/2/3）
     */
    onComboAttackStart(comboIndex) {
        const animInst = this.getAnimInstance();
        if (!animInst)
            return;
        const nodeName = `EnterAttack${comboIndex}`;
        try {
            animInst.JumpToNode(nodeName);
            console.log(`[ABP_CurrsorAnimLogic] 跳转到攻击动画节点: ${nodeName}`);
        }
        catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] JumpToNode("${nodeName}") 异常: ${e}`);
        }
    }
    /**
     * 连击结束回调
     * 可在此处理攻击结束后的动画过渡（如回到 Idle）
     *
     * @param totalHits 本次连击总段数
     */
    onComboEnd(totalHits) {
        console.log(`[ABP_CurrsorAnimLogic] 连击结束，共 ${totalHits} 段`);
        // 攻击结束后动画会自然过渡回 Idle（通过 PaperZD 状态机的条件转换）
        // 如果需要强制跳转，可以在此调用 JumpToNode("EnterIdle")
    }
    // ======================== 角色解析 ========================
    /**
     * 尝试从动画蓝图实例上解析角色引用。
     *
     * ABP_Currsor_C 有一个 `Currsor` 属性（BP_Currsor_C 类型），
     * 它继承自 CharacterBase，可直接用于运动状态计算。
     */
    tryResolveCharacter() {
        const animInst = this.getAnimInstance();
        if (!animInst)
            return;
        try {
            // 方式1：从 ABP_Currsor_C 的 Currsor 属性获取角色引用
            const currsorRef = animInst.Currsor;
            if (currsorRef) {
                const character = currsorRef;
                // 验证是否具备 CharacterBase 的标志性属性
                if (character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                    this.character = character;
                    this.characterResolved = true;
                    console.log("[ABP_CurrsorAnimLogic] 角色引用解析成功（通过 Currsor 属性）");
                    return;
                }
            }
            // 方式2：通过 PaperZDAnimInstance 的 GetPaperCharacter() 获取
            const paperChar = animInst.GetPaperCharacter();
            if (paperChar) {
                const character = paperChar;
                if (character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                    this.character = character;
                    this.characterResolved = true;
                    console.log("[ABP_CurrsorAnimLogic] 角色引用解析成功（通过 GetPaperCharacter）");
                    return;
                }
            }
            // 方式3：通过 GetOwningActor() 获取
            const owningActor = animInst.GetOwningActor();
            if (owningActor) {
                const character = owningActor;
                if (character.CharacterMovement !== undefined && character.GetVelocity !== undefined) {
                    this.character = character;
                    this.characterResolved = true;
                    console.log("[ABP_CurrsorAnimLogic] 角色引用解析成功（通过 GetOwningActor）");
                    return;
                }
            }
        }
        catch (e) {
            // 角色尚未就绪，静默失败，下一帧继续尝试
        }
    }
    // ======================== 变量写回 ========================
    /**
     * 将计算后的状态写回动画蓝图实例的变量。
     *
     * 写回策略：安全检查字段存在性后赋值，不存在的字段静默跳过。
     * 如果后续 ABP_Currsor_C 新增了更多动画变量，在此扩展即可。
     */
    applyStateToAnimInstance(animInst, state) {
        try {
            // ShouldMove —— 驱动 Idle ↔ Walk 状态机过渡
            if ("ShouldMove" in animInst) {
                animInst.ShouldMove = state.shouldMove;
            }
            // bIsFalling —— 角色是否在下落
            if ("bIsFalling" in animInst) {
                animInst.bIsFalling = state.isFalling;
            }
            // bIsJumpingUp —— 角色是否正在上升跳跃（空中 + Z 速度 > 0）
            if ("bIsJumpingUp" in animInst) {
                animInst.bIsJumpingUp = state.isJumpingUp;
            }
            // bIsFallingDown —— 角色是否正在下落（空中 + Z 速度 <= 0）
            if ("bIsFallingDown" in animInst) {
                animInst.bIsFallingDown = state.isFallingDown;
            }
            // Orientation —— 身体朝向（仅保留左右 X 分量，Y 固定为 0）
            if ("Orientation" in animInst) {
                // 仅当存在有效的左右朝向时才更新缓存；
                // 纯 Y 轴移动（orientation.x === 0）时保持最后朝向不变
                if (state.orientation.x !== 0) {
                    this.lastOrientationX = state.orientation.x;
                }
                animInst.Orientation.X = this.lastOrientationX;
                animInst.Orientation.Y = 0;
            }
        }
        catch (e) {
            console.error(`[ABP_CurrsorAnimLogic] 写回变量异常: ${e}`);
        }
    }
    // ======================== 工具方法 ========================
    /**
     * 获取强类型的动画蓝图实例（owner 即 ABP_Currsor_C）
     */
    getAnimInstance() {
        return this.getOwnerAs();
    }
    /**
     * 检查角色引用运行时是否仍然有效
     */
    isCharacterValid() {
        if (!this.character)
            return false;
        try {
            // 尝试访问 UObject 基类方法，已销毁的对象会抛异常
            this.character.GetName();
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.ABP_CurrsorAnimLogic = ABP_CurrsorAnimLogic;
//# sourceMappingURL=ABP_CurrsorAnimLogic.js.map
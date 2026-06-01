#pragma once

#include "CoreMinimal.h"
#include "PaperZDCharacter.h"
#include "InputActionValue.h"
#include "CharacterBase.generated.h"

class AHDPlayerController;

/**
 * 角色基类
 * 
 * 所有可切换角色的基类，继承自 APaperZDCharacter。
 * 被 PlayerController 直接 Possess，自身处理输入（移动、跳跃）。
 * 输入配置（InputDataAsset）统一由 AHDPlayerController 管理，角色自身不持有。
 * 
 * 职责：
 * - 接收并处理玩家输入（移动、跳跃）
 * - 管理激活/非激活状态
 * - 提供子类可覆写的输入处理虚函数
 */
UCLASS()
class HD_2D_API ACharacterBase : public APaperZDCharacter
{
    GENERATED_BODY()

public:
    ACharacterBase();

    // ==================== 输入处理 ====================

    /** 设置输入绑定（被 Possess 时自动调用） */
    virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

    /** 移动输入处理（可由子类覆写以自定义移动行为） */
    UFUNCTION(BlueprintCallable, Category = "Character|Input")
    virtual void Move(const FInputActionValue& Value);

    // ==================== 跳跃 & 土狼时间 ====================

    /** 覆写 Jump()，在土狼时间窗口内允许空中起跳 */
    virtual void Jump() override;

    /** 土狼时间窗口（秒）：离开平台后仍可起跳的宽限期 */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Character|Jump")
    float CoyoteTime = 0.1f;

    // ==================== 冲刺 ====================

    /** 冲刺输入处理（由 IA_Dash 触发） */
    UFUNCTION(BlueprintCallable, Category = "Character|Input")
    virtual void Dash();

    // ==================== 攻击 ====================

    /** 攻击输入处理（由 IA_Attack 触发） */
    UFUNCTION(BlueprintCallable, Category = "Character|Input")
    virtual void Attack();

    // ==================== 输入通知事件（蓝图可实现） ====================

    /**
     * 跳跃输入触发时的通知事件。
     * 蓝图侧实现此事件，调用 EmitEventByOwner(Self, "OnJump") 将输入转发到 TS 动画逻辑。
     */
    UFUNCTION(BlueprintImplementableEvent, Category = "Character|Events")
    void OnJumpTriggered();

    /**
     * 冲刺输入触发时的通知事件。
     * 蓝图侧实现此事件，调用 EmitEventByOwner(Self, "OnDash") 将输入转发到 TS 动画逻辑。
     */
    UFUNCTION(BlueprintImplementableEvent, Category = "Character|Events")
    void OnDashTriggered();

    /**
     * 攻击输入触发时的通知事件。
     * 蓝图侧实现此事件，调用 EmitEventByOwner(Self, "OnAttack") 将输入转发到 TS 逻辑层。
     */
    UFUNCTION(BlueprintImplementableEvent, Category = "Character|Events")
    void OnAttackTriggered();

    // ==================== 激活状态 ====================

    /** 设置激活状态 */
    UFUNCTION(BlueprintCallable, Category = "Character")
    void SetActive(bool bActive);

    /** 是否激活 */
    UPROPERTY(BlueprintReadOnly, Category = "Character")
    bool bIsActive = false;

    // ==================== 角色配置 ====================

    /** 角色唯一标识符（与 RoleManagementSubsystem 中的 RoleId 对应） */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Character")
    FName RoleId;

    /** 身体高度（用于胶囊体） */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Character")
    float BodyHeight = 96.0f;

    /** 当前朝向（基于移动方向，x: 1=右, -1=左; y: 保留为0） */
    UPROPERTY(BlueprintReadOnly, Category = "Movement")
    FVector2D Orientation;

protected:
    // ==================== 生命周期 ====================

    virtual void Tick(float DeltaTime) override;

    /** 移动模式变化回调（用于检测离开地面的时刻） */
    virtual void OnMovementModeChanged(EMovementMode PrevMovementMode, uint8 PreviousCustomMode) override;

private:
    // ==================== 土狼时间内部状态 ====================

    /** 上一帧是否在地面上 */
    bool bWasOnGround = true;

    /** 离开地面的时间戳（秒） */
    float LeftGroundTimestamp = 0.f;

    /** 是否处于土狼时间窗口内（非主动跳跃离开地面） */
    bool bInCoyoteWindow = false;
};
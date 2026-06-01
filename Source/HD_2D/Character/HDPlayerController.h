#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "InputActionValue.h"
#include "../RoleManagement/RoleManagementSubsystem.h"
#include "HDPlayerController.generated.h"

class UPlayerInputDataAsset;
class ACharacterBase;

/**
 * HD_2D 项目的 PlayerController
 * 
 * 职责：
 * - 管理 InputMappingContext
 * - 监听 RoleManagementSubsystem 的角色切换事件
 * - 处理角色切换快捷键（按键1-4切换角色）
 * - 切换角色时执行 Possess 操作
 */
UCLASS()
class HD_2D_API AHDPlayerController : public APlayerController
{
    GENERATED_BODY()

public:
    AHDPlayerController();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void SetupInputComponent() override;

    // ==================== 角色切换（通过 RoleManagementSubsystem）====================

    /** 通过 RoleId 请求切换角色 */
    UFUNCTION(BlueprintCallable, Category = "Controller|RoleSwitch")
    FRoleSwitchResult SwitchToRole(FName RoleId, bool bForce = false);

    /** 按已注册角色顺序切换到下一个角色 */
    UFUNCTION(BlueprintCallable, Category = "Controller|RoleSwitch")
    void SwitchToNextRole();

    /** 按已注册角色顺序切换到上一个角色 */
    UFUNCTION(BlueprintCallable, Category = "Controller|RoleSwitch")
    void SwitchToPreviousRole();

    // ==================== 配置 ====================

    /** InputMappingContext */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
    class UInputMappingContext* InputMappingContext;

    /** 输入数据资产（统一管理所有输入：角色移动/跳跃 + 角色切换快捷键） */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
    UPlayerInputDataAsset* InputDataAsset = nullptr;

    /** 已注册的角色 ID 列表（按顺序，用于按键切换） */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Controller|Roles")
    TArray<FName> OrderedRoleIds;

protected:
    // ==================== 角色切换快捷键 ====================

    void SwitchToSlot0();
    void SwitchToSlot1();
    void SwitchToSlot2();
    void SwitchToSlot3();

    // ==================== 事件处理 ====================

    /** 角色切换完成时的回调 */
    UFUNCTION()
    void OnRoleSwitchCompleted(const FRoleSwitchResult& Result);

    /** 角色切换失败时的回调 */
    UFUNCTION()
    void OnRoleSwitchFailed(const FRoleSwitchResult& Result);

    /** 激活角色变更时的回调 — 执行 Possess 新角色 */
    UFUNCTION()
    void OnActiveRoleChanged(FName PreviousRoleId, FName NewRoleId);

    // ==================== 内部方法 ====================

    /** 获取 RoleManagementSubsystem */
    URoleManagementSubsystem* GetRoleSubsystem() const;
};
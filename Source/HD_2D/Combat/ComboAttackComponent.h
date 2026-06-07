#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameplayTagContainer.h"
#include "AnimSequences/PaperZDAnimSequence.h"
#include "ComboAttackComponent.generated.h"

UENUM(BlueprintType)
enum class EComboTrigger : uint8
{
    OnInput    UMETA(DisplayName = "玩家按键"),
    OnTimeout  UMETA(DisplayName = "窗口超时"),
};

USTRUCT(BlueprintType)
struct FComboStateConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, Category = "Anim")
    TSoftObjectPtr<UPaperZDAnimSequence> AttackAnimation;

    UPROPERTY(EditAnywhere, Category = "Data")
    float Damage = 15;

    UPROPERTY(EditAnywhere, Category = "Hitbox")
    FVector HitboxHalfSize = FVector(50, 60, 30);

    UPROPERTY(EditAnywhere, Category = "Hitbox")
    FVector HitboxOffset = FVector(40, 0, 0);

    UPROPERTY(EditAnywhere, Category = "Data")
    float Knockback = 100;

    UPROPERTY(EditAnywhere, Category = "Cancel", meta = (Categories = "Action"))
    FGameplayTagContainer CancelTags;
};

USTRUCT(BlueprintType)
struct FComboTransitionConfig
{
    GENERATED_BODY()

    /** ComboStates 起始索引 */
    UPROPERTY(EditAnywhere)
    int32 FromIndex = 0;

    /** ComboStates 目标索引, -1 = Idle */
    UPROPERTY(EditAnywhere)
    int32 ToIndex = -1;

    UPROPERTY(EditAnywhere)
    EComboTrigger Trigger;
};

UCLASS(ClassGroup = (Combat), meta = (BlueprintSpawnableComponent))
class HD_2D_API UComboAttackComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, Category = "Combo")
    TArray<FComboStateConfig> ComboStates;

    UPROPERTY(EditAnywhere, Category = "Combo")
    TArray<FComboTransitionConfig> Transitions;

    // ── 动画通知转发 ──

    UPROPERTY(EditAnywhere, Category = "Combo|Notifies")
    TArray<FName> NotifyForwardList;

    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCombatNotify, FName, NotifyName);
    UPROPERTY(BlueprintAssignable, Category = "Combo|Notifies")
    FOnCombatNotify OnCombatNotify;

    UFUNCTION(BlueprintCallable, Category = "Combo|Notifies")
    void HandleNotify(FName NotifyName);

    // ── Runtime hit state (TS writes, Blueprint reads) ──

    UPROPERTY(BlueprintReadOnly, Transient, Category = "Combo|Runtime")
    float ActiveDamage = 0;

    UPROPERTY(BlueprintReadOnly, Transient, Category = "Combo|Runtime")
    FVector ActiveHitboxHalfSize = FVector::ZeroVector;

    UPROPERTY(BlueprintReadOnly, Transient, Category = "Combo|Runtime")
    FVector ActiveHitboxOffset = FVector::ZeroVector;

    UPROPERTY(BlueprintReadOnly, Transient, Category = "Combo|Runtime")
    float ActiveKnockback = 0;

    UPROPERTY(BlueprintReadOnly, Transient, Category = "Combo|Runtime")
    bool bHitActive = false;

    /** 激活指定段的碰撞数据（AN_HitStart → TS onHitStart 调用） */
    UFUNCTION(BlueprintCallable, Category = "Combo")
    void ActivateHit(int32 SegmentIndex);

    /** 清除碰撞数据（AN_HitEnd / forceEnd 调用） */
    UFUNCTION(BlueprintCallable, Category = "Combo")
    void DeactivateHit();

    /** 检查指定段是否允许某 Tag 打断 */
    UFUNCTION(BlueprintCallable, Category = "Combo")
    bool CanCancel(int32 StateIndex, FName ActionTag) const;

#if WITH_EDITOR
    virtual void PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent) override;
#endif
};

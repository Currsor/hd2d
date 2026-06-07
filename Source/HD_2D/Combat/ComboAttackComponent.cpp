#include "ComboAttackComponent.h"
#include "GameplayTagsManager.h"

void UComboAttackComponent::HandleNotify(FName NotifyName)
{
    const bool bShouldForward = NotifyForwardList.Num() == 0 || NotifyForwardList.Contains(NotifyName);
    UE_LOG(LogTemp, Log, TEXT("[ComboAttackComponent] HandleNotify: %s forward=%d"), *NotifyName.ToString(), bShouldForward);

    if (bShouldForward)
    {
        OnCombatNotify.Broadcast(NotifyName);
    }
}

void UComboAttackComponent::ActivateHit(int32 SegmentIndex)
{
    if (ComboStates.IsValidIndex(SegmentIndex))
    {
        const FComboStateConfig& S = ComboStates[SegmentIndex];
        ActiveDamage = S.Damage;
        ActiveKnockback = S.Knockback;
        ActiveHitboxHalfSize = S.HitboxHalfSize;
        ActiveHitboxOffset = S.HitboxOffset;
        bHitActive = true;
    }
}

void UComboAttackComponent::DeactivateHit()
{
    bHitActive = false;
    ActiveDamage = 0;
    ActiveKnockback = 0;
}

bool UComboAttackComponent::CanCancel(int32 StateIndex, FName ActionTag) const
{
    if (!ComboStates.IsValidIndex(StateIndex)) return false;

    FGameplayTag Tag = UGameplayTagsManager::Get().RequestGameplayTag(ActionTag, false);
    if (!Tag.IsValid()) return false;

    return ComboStates[StateIndex].CancelTags.HasTag(Tag);
}

#if WITH_EDITOR
void UComboAttackComponent::PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent)
{
    Super::PostEditChangeProperty(PropertyChangedEvent);

    int32 Num = ComboStates.Num();
    for (const FComboTransitionConfig& T : Transitions)
    {
        if (T.FromIndex < 0 || T.FromIndex >= Num)
        {
            UE_LOG(LogTemp, Warning, TEXT("UComboAttackComponent: Transition FromIndex %d 超出 ComboStates 范围 [0, %d)"),
                T.FromIndex, Num);
        }
        if (T.ToIndex < -1 || T.ToIndex >= Num)
        {
            UE_LOG(LogTemp, Warning, TEXT("UComboAttackComponent: Transition ToIndex %d 超出范围 [-1, %d)"),
                T.ToIndex, Num);
        }
    }
}
#endif

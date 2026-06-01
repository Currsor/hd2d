#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "InputMappingContext.h"
#include "InputAction.h"
#include "PlayerInputDataAsset.generated.h"

/**
 * 玩家输入数据资产
 * 存储Enhanced Input的Mapping Context和Actions配置
 */
UCLASS()
class HD_2D_API UPlayerInputDataAsset : public UDataAsset
{
    GENERATED_BODY()

public:
    // Input Mapping Context
    UPROPERTY(EditAnywhere, Category = "Input")
    UInputMappingContext* InputMappingContext;

    // Movement Input Action
    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* MoveAction;

    // Jump Input Action
    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* JumpAction;

    // Dash Input Action
    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* DashAction;

    // Attack Input Action
    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* AttackAction;

    // Switch Slot Actions
    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* SwitchSlot1Action;

    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* SwitchSlot2Action;

    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* SwitchSlot3Action;

    UPROPERTY(EditAnywhere, Category = "Input|Actions")
    UInputAction* SwitchSlot4Action;
};
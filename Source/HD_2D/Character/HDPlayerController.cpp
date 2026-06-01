#include "HDPlayerController.h"
#include "EnhancedInputSubsystems.h"
#include "EnhancedInputComponent.h"
#include "InputMappingContext.h"
#include "PlayerInputDataAsset.h"
#include "CharacterBase.h"

AHDPlayerController::AHDPlayerController()
    : InputMappingContext(nullptr)
    , InputDataAsset(nullptr)
{
}

void AHDPlayerController::BeginPlay()
{
    Super::BeginPlay();

    // 添加 InputMappingContext
    if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
    {
        if (InputMappingContext)
        {
            Subsystem->AddMappingContext(InputMappingContext, 0);
        }
    }

    // 绑定 RoleManagementSubsystem 的事件
    if (URoleManagementSubsystem* RoleSub = GetRoleSubsystem())
    {
        RoleSub->OnRoleSwitchCompleted.AddDynamic(this, &AHDPlayerController::OnRoleSwitchCompleted);
        RoleSub->OnRoleSwitchFailed.AddDynamic(this, &AHDPlayerController::OnRoleSwitchFailed);
        RoleSub->OnActiveRoleChanged.AddDynamic(this, &AHDPlayerController::OnActiveRoleChanged);

        UE_LOG(LogTemp, Log, TEXT("AHDPlayerController: 已绑定 RoleManagementSubsystem 事件"));

        // 如果 SubSystem 已经有激活角色（跨关卡恢复的情况），立即 Possess
        if (RoleSub->HasActiveRole())
        {
            APawn* ActivePawn = RoleSub->GetActiveRolePawn();
            if (ActivePawn)
            {
                Possess(ActivePawn);
                // 设置激活状态
                if (ACharacterBase* CharBase = Cast<ACharacterBase>(ActivePawn))
                {
                    CharBase->SetActive(true);
                }
                UE_LOG(LogTemp, Log, TEXT("AHDPlayerController: 恢复了已激活的角色 '%s'"),
                    *RoleSub->GetActiveRoleId().ToString());
            }
        }
        else if (OrderedRoleIds.Num() > 0)
        {
            // 如果没有激活角色但有配置的角色列表，自动激活第一个
            UE_LOG(LogTemp, Log, TEXT("AHDPlayerController: 自动激活第一个角色 '%s'"),
                *OrderedRoleIds[0].ToString());
            SwitchToRole(OrderedRoleIds[0], true);
        }
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("AHDPlayerController: 无法获取 RoleManagementSubsystem"));
    }
}

void AHDPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    // 解绑事件
    if (URoleManagementSubsystem* RoleSub = GetRoleSubsystem())
    {
        RoleSub->OnRoleSwitchCompleted.RemoveDynamic(this, &AHDPlayerController::OnRoleSwitchCompleted);
        RoleSub->OnRoleSwitchFailed.RemoveDynamic(this, &AHDPlayerController::OnRoleSwitchFailed);
        RoleSub->OnActiveRoleChanged.RemoveDynamic(this, &AHDPlayerController::OnActiveRoleChanged);
    }

    Super::EndPlay(EndPlayReason);
}

void AHDPlayerController::SetupInputComponent()
{
    Super::SetupInputComponent();

    if (!InputDataAsset)
    {
        UE_LOG(LogTemp, Warning, TEXT("AHDPlayerController: InputDataAsset 未设置，角色切换快捷键未绑定"));
        return;
    }

    if (UEnhancedInputComponent* EnhancedInputComponent = Cast<UEnhancedInputComponent>(InputComponent))
    {
        // 绑定角色切换快捷键（按键1-4切换到 OrderedRoleIds 中对应的角色）
        if (InputDataAsset->SwitchSlot1Action)
        {
            EnhancedInputComponent->BindAction(InputDataAsset->SwitchSlot1Action, ETriggerEvent::Started, this, &AHDPlayerController::SwitchToSlot0);
        }
        if (InputDataAsset->SwitchSlot2Action)
        {
            EnhancedInputComponent->BindAction(InputDataAsset->SwitchSlot2Action, ETriggerEvent::Started, this, &AHDPlayerController::SwitchToSlot1);
        }
        if (InputDataAsset->SwitchSlot3Action)
        {
            EnhancedInputComponent->BindAction(InputDataAsset->SwitchSlot3Action, ETriggerEvent::Started, this, &AHDPlayerController::SwitchToSlot2);
        }
        if (InputDataAsset->SwitchSlot4Action)
        {
            EnhancedInputComponent->BindAction(InputDataAsset->SwitchSlot4Action, ETriggerEvent::Started, this, &AHDPlayerController::SwitchToSlot3);
        }
    }
}

// ==================== 角色切换 ====================

FRoleSwitchResult AHDPlayerController::SwitchToRole(FName RoleId, bool bForce)
{
    URoleManagementSubsystem* RoleSub = GetRoleSubsystem();
    if (!RoleSub)
    {
        return FRoleSwitchResult::Failure(ERoleSwitchFailReason::SubsystemNotReady,
            TEXT("无法获取 RoleManagementSubsystem"));
    }

    FRoleSwitchRequest Request;
    Request.TargetRoleId = RoleId;
    Request.bForce = bForce;

    return RoleSub->RequestSwitchRole(Request);
}

void AHDPlayerController::SwitchToNextRole()
{
    if (OrderedRoleIds.Num() == 0) return;

    URoleManagementSubsystem* RoleSub = GetRoleSubsystem();
    if (!RoleSub) return;

    FName CurrentId = RoleSub->GetActiveRoleId();
    int32 CurrentIndex = OrderedRoleIds.IndexOfByKey(CurrentId);
    int32 NextIndex = (CurrentIndex + 1) % OrderedRoleIds.Num();

    SwitchToRole(OrderedRoleIds[NextIndex]);
}

void AHDPlayerController::SwitchToPreviousRole()
{
    if (OrderedRoleIds.Num() == 0) return;

    URoleManagementSubsystem* RoleSub = GetRoleSubsystem();
    if (!RoleSub) return;

    FName CurrentId = RoleSub->GetActiveRoleId();
    int32 CurrentIndex = OrderedRoleIds.IndexOfByKey(CurrentId);
    int32 PrevIndex = (CurrentIndex - 1 + OrderedRoleIds.Num()) % OrderedRoleIds.Num();

    SwitchToRole(OrderedRoleIds[PrevIndex]);
}

// ==================== 快捷键槽位 ====================

void AHDPlayerController::SwitchToSlot0()
{
    if (OrderedRoleIds.IsValidIndex(0))
    {
        SwitchToRole(OrderedRoleIds[0]);
    }
}

void AHDPlayerController::SwitchToSlot1()
{
    if (OrderedRoleIds.IsValidIndex(1))
    {
        SwitchToRole(OrderedRoleIds[1]);
    }
}

void AHDPlayerController::SwitchToSlot2()
{
    if (OrderedRoleIds.IsValidIndex(2))
    {
        SwitchToRole(OrderedRoleIds[2]);
    }
}

void AHDPlayerController::SwitchToSlot3()
{
    if (OrderedRoleIds.IsValidIndex(3))
    {
        SwitchToRole(OrderedRoleIds[3]);
    }
}

// ==================== 事件处理 ====================

void AHDPlayerController::OnRoleSwitchCompleted(const FRoleSwitchResult& Result)
{
    UE_LOG(LogTemp, Log, TEXT("AHDPlayerController: 角色切换完成 %s -> %s (耗时 %.3f 秒)"),
        *Result.PreviousRoleId.ToString(), *Result.NewRoleId.ToString(), Result.SwitchDuration);
}

void AHDPlayerController::OnRoleSwitchFailed(const FRoleSwitchResult& Result)
{
    UE_LOG(LogTemp, Warning, TEXT("AHDPlayerController: 角色切换失败 - %s"), *Result.FailDetail);
}

void AHDPlayerController::OnActiveRoleChanged(FName PreviousRoleId, FName NewRoleId)
{
    UE_LOG(LogTemp, Log, TEXT("AHDPlayerController: 激活角色变更 %s -> %s"),
        *PreviousRoleId.ToString(), *NewRoleId.ToString());

    // 获取新激活的角色 Pawn
    URoleManagementSubsystem* RoleSub = GetRoleSubsystem();
    if (!RoleSub) return;

    APawn* NewPawn = RoleSub->GetActiveRolePawn();
    if (NewPawn)
    {
        // 直接 Possess 新角色（UnPossess 旧角色由 Possess 内部自动处理）
        Possess(NewPawn);

        // 设置新角色为激活状态
        if (ACharacterBase* CharBase = Cast<ACharacterBase>(NewPawn))
        {
            CharBase->SetActive(true);
        }

        UE_LOG(LogTemp, Log, TEXT("AHDPlayerController: 已 Possess 新角色 '%s'"), *NewPawn->GetName());
    }
}

// ==================== 内部方法 ====================

URoleManagementSubsystem* AHDPlayerController::GetRoleSubsystem() const
{
    UGameInstance* GI = GetGameInstance();
    if (!GI) return nullptr;
    return GI->GetSubsystem<URoleManagementSubsystem>();
}

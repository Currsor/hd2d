#include "CharacterBase.h"

#include "GameFramework/CharacterMovementComponent.h"
#include "EnhancedInputComponent.h"
#include "PlayerInputDataAsset.h"
#include "HDPlayerController.h"
#include "Components/BoxComponent.h"
#include "../Combat/ComboAttackComponent.h"

ACharacterBase::ACharacterBase()
{
    PrimaryActorTick.bCanEverTick = true;
    bIsActive = false;
    bWasOnGround = true;
    LeftGroundTimestamp = 0.f;
    bInCoyoteWindow = false;
    Orientation = FVector2D(1.0f, 0.0f);

    // 攻击碰撞盒 — 默认不产生碰撞，由 ComboComponent.bHitActive 控制伤害
    AttackCollision = CreateDefaultSubobject<UBoxComponent>(TEXT("AttackCollision"));
    AttackCollision->SetupAttachment(RootComponent);
    AttackCollision->SetBoxExtent(FVector(50, 60, 30));
    AttackCollision->SetRelativeLocation(FVector(40, 0, 0));
    AttackCollision->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    AttackCollision->SetCollisionResponseToAllChannels(ECR_Ignore);
    AttackCollision->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
    AttackCollision->SetGenerateOverlapEvents(true);
    Orientation = FVector2D(1.0f, 0.0f); // 默认向前
}

void ACharacterBase::SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);

    // 从控制器获取 InputDataAsset（输入配置统一由 HDPlayerController 管理）
    AHDPlayerController* PC = Cast<AHDPlayerController>(GetController());
    if (!PC || !PC->InputDataAsset)
    {
        UE_LOG(LogTemp, Warning, TEXT("ACharacterBase[%s]: 控制器未设置或 InputDataAsset 未配置!"), *GetName());
        return;
    }

    UPlayerInputDataAsset* DataAsset = PC->InputDataAsset;

    if (UEnhancedInputComponent* EnhancedInputComponent = Cast<UEnhancedInputComponent>(PlayerInputComponent))
    {
        // 绑定移动
        if (DataAsset->MoveAction)
        {
            EnhancedInputComponent->BindAction(DataAsset->MoveAction, ETriggerEvent::Triggered, this, &ACharacterBase::Move);
        }

        // 绑定跳跃（Jump/StopJumping 由 ACharacter 基类提供）
        if (DataAsset->JumpAction)
        {
            EnhancedInputComponent->BindAction(DataAsset->JumpAction, ETriggerEvent::Started, this, &ACharacterBase::Jump);
            EnhancedInputComponent->BindAction(DataAsset->JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
        }

        // 绑定冲刺
        if (DataAsset->DashAction)
        {
            EnhancedInputComponent->BindAction(DataAsset->DashAction, ETriggerEvent::Started, this, &ACharacterBase::Dash);
        }

        // 绑定攻击
        if (DataAsset->AttackAction)
        {
            EnhancedInputComponent->BindAction(DataAsset->AttackAction, ETriggerEvent::Started, this, &ACharacterBase::Attack);
        }
    }
}

void ACharacterBase::Move(const FInputActionValue& Value)
{
    if (!Controller) return;
    if (bAttackLocked) return;

    const FVector2D MovementVector = Value.Get<FVector2D>();

    const FRotator Rotation = Controller->GetControlRotation();
    const FRotator YawRotation(0, Rotation.Yaw, 0);

    const FVector ForwardDirection = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
    const FVector RightDirection = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

    AddMovementInput(ForwardDirection, MovementVector.Y);
    AddMovementInput(RightDirection, MovementVector.X);
}

void ACharacterBase::SetAttackLock(bool bLocked)
{
    bAttackLocked = bLocked;
}

void ACharacterBase::SetActive(bool bActive)
{
    bIsActive = bActive;

    if (bActive)
    {
        // 激活：显示角色，启用Tick
        SetActorHiddenInGame(false);
        SetActorTickEnabled(true);
    }
    else
    {
        // 非激活：隐藏角色，禁用Tick
        SetActorHiddenInGame(true);
        SetActorTickEnabled(false);
    }
}

// ==================== 土狼时间 ====================

void ACharacterBase::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    // 更新朝向（基于当前速度方向）
    FVector Velocity = GetVelocity();
    float HorizontalSpeed = Velocity.Size2D();
    const float SPEED_THRESHOLD = 3.0f;
    if (HorizontalSpeed > SPEED_THRESHOLD)
    {
        Orientation.X = (Velocity.X > 0.0f) ? 1.0f : -1.0f;
        Orientation.Y = 0.0f;
    }
    // 否则保持上次的值

    // 土狼时间窗口超时检测
    if (bInCoyoteWindow)
    {
        const float ElapsedSinceLeftGround = GetWorld()->GetTimeSeconds() - LeftGroundTimestamp;
        if (ElapsedSinceLeftGround > CoyoteTime)
        {
            bInCoyoteWindow = false;
        }
    }
}

void ACharacterBase::OnMovementModeChanged(EMovementMode PrevMovementMode, uint8 PreviousCustomMode)
{
    Super::OnMovementModeChanged(PrevMovementMode, PreviousCustomMode);

    const EMovementMode CurrentMode = GetCharacterMovement()->MovementMode;

    // 从地面（Walking/NavWalking）→ 下落（Falling）：开始土狼时间窗口
    const bool bWasGrounded = (PrevMovementMode == MOVE_Walking || PrevMovementMode == MOVE_NavWalking);
    const bool bNowFalling = (CurrentMode == MOVE_Falling);

    if (bWasGrounded && bNowFalling)
    {
        // 只有非主动跳跃时才开启土狼时间（主动跳跃时 bPressedJump 为 true）
        if (!bPressedJump)
        {
            bInCoyoteWindow = true;
            LeftGroundTimestamp = GetWorld()->GetTimeSeconds();
        }
    }

    // 落地时重置土狼时间状态
    if (bNowFalling == false)
    {
        bInCoyoteWindow = false;
    }
}

void ACharacterBase::Jump()
{
    if (bInCoyoteWindow)
    {
        // 土狼时间窗口内：临时切回 Walking 让 Super::Jump() 通过 CanJump 检查
        UCharacterMovementComponent* MoveComp = GetCharacterMovement();
        if (MoveComp)
        {
            MoveComp->SetMovementMode(MOVE_Walking);
        }
        bInCoyoteWindow = false;
    }

    Super::Jump();

    // 通知蓝图侧跳跃已触发（蓝图实现后转发到 TS 动画逻辑）
    OnJumpTriggered();
}

void ACharacterBase::Dash()
{
    // TODO: 冲刺机制的具体实现（冲刺速度、冷却、距离等）

    // 通知蓝图侧冲刺已触发（蓝图实现后转发到 TS 动画逻辑）
    OnDashTriggered();
}

void ACharacterBase::Attack()
{
    // 攻击逻辑由 TS 层 ComboAttackAbility 状态机驱动
    // 此处仅将输入事件转发到蓝图侧，再由蓝图转发到 TS

    // 通知蓝图侧攻击已触发（蓝图实现后转发到 TS 逻辑层）
    OnAttackTriggered();
}

void ACharacterBase::OnAnimNotify(FName NotifyName)
{
    UE_LOG(LogTemp, Log, TEXT("[CharacterBase] OnAnimNotify: %s"), *NotifyName.ToString());

    // 转发到 ComboAttackComponent（如果存在）
    if (UActorComponent* Comp = GetComponentByClass(UComboAttackComponent::StaticClass()))
    {
        Cast<UComboAttackComponent>(Comp)->HandleNotify(NotifyName);
    }
}
// 角色管理子系统实现

#include "RoleManagementSubsystem.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerStart.h"
#include "Kismet/GameplayStatics.h"

// ==================== 日志分类 ====================
DEFINE_LOG_CATEGORY_STATIC(LogRoleManagement, Log, All);

// ==================== 生命周期 ====================

bool URoleManagementSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	return true;
}

void URoleManagementSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bInitialized = true;
	ActiveRoleId = NAME_None;
	ActiveRolePawn = nullptr;
	CurrentSwitchState = ERoleSwitchState::Idle;
	RoleRegistry.Empty();

	LogRole(TEXT("角色管理子系统初始化完成"));
}

void URoleManagementSubsystem::Deinitialize()
{
	LogRole(FString::Printf(TEXT("角色管理子系统反初始化，已注册角色数: %d"), RoleRegistry.Num()));

	// 清理运行时状态
	ActiveRoleId = NAME_None;
	ActiveRolePawn = nullptr;
	CurrentSwitchState = ERoleSwitchState::Idle;
	RoleRegistry.Empty();
	bInitialized = false;

	Super::Deinitialize();
}

// ==================== 角色注册 ====================

bool URoleManagementSubsystem::RegisterRole(const FRoleDefinition& Definition)
{
	if (!bInitialized)
	{
		LogRoleError(TEXT("RegisterRole 失败: 子系统尚未初始化"));
		return false;
	}

	if (!Definition.IsValid())
	{
		LogRoleError(TEXT("RegisterRole 失败: 角色定义无效（RoleId 为空）"));
		return false;
	}

	if (RoleRegistry.Contains(Definition.RoleId))
	{
		LogRoleWarning(FString::Printf(TEXT("RegisterRole 失败: 角色 ID '%s' 已存在，不允许重复注册"),
			*Definition.RoleId.ToString()));
		return false;
	}

	// 使用可变副本，以便从 ExtensionData 中补充 RoleClass
	FRoleDefinition MutableDef = Definition;

	// 如果 RoleClass 为空但 ExtensionData 中有 RoleClassPath（TS 桥接层传入），
	// 则自动从扩展数据中设置 RoleClass 软引用
	if (MutableDef.RoleClass.IsNull())
	{
		const FString* ClassPathPtr = MutableDef.ExtensionData.Find(TEXT("RoleClassPath"));
		if (ClassPathPtr && !ClassPathPtr->IsEmpty())
		{
			MutableDef.RoleClass = TSoftClassPtr<APawn>(FSoftClassPath(*ClassPathPtr));
			LogRole(FString::Printf(TEXT("RegisterRole: 角色 '%s' 从 ExtensionData.RoleClassPath 设置类引用: '%s'"),
				*MutableDef.RoleId.ToString(), **ClassPathPtr));
		}
	}

	// 校验角色类引用
	if (!MutableDef.RoleClass.IsNull())
	{
		if (MutableDef.RoleClass.ToString().IsEmpty())
		{
			LogRoleWarning(FString::Printf(TEXT("RegisterRole: 角色 '%s' 的类引用路径为空"),
				*MutableDef.RoleId.ToString()));
		}
	}
	else
	{
		LogRoleWarning(FString::Printf(TEXT("RegisterRole: 角色 '%s' 未设置类引用（RoleClass 为空且 ExtensionData 中无 RoleClassPath）"),
			*MutableDef.RoleId.ToString()));
	}

	RoleRegistry.Add(MutableDef.RoleId, MutableDef);
	LogRole(FString::Printf(TEXT("角色注册成功: ID='%s', 显示名='%s', 类引用='%s', 可用=%s"),
		*MutableDef.RoleId.ToString(),
		*MutableDef.DisplayName.ToString(),
		*MutableDef.RoleClass.ToString(),
		MutableDef.bAvailable ? TEXT("是") : TEXT("否")));

	return true;
}

bool URoleManagementSubsystem::UnregisterRole(FName RoleId)
{
	if (!bInitialized)
	{
		LogRoleError(TEXT("UnregisterRole 失败: 子系统尚未初始化"));
		return false;
	}

	if (RoleId.IsNone())
	{
		LogRoleError(TEXT("UnregisterRole 失败: RoleId 为空"));
		return false;
	}

	// 不允许注销当前激活的角色
	if (RoleId == ActiveRoleId)
	{
		LogRoleError(FString::Printf(TEXT("UnregisterRole 失败: 角色 '%s' 当前正在激活，无法注销"),
			*RoleId.ToString()));
		return false;
	}

	if (RoleRegistry.Remove(RoleId) > 0)
	{
		LogRole(FString::Printf(TEXT("角色注销成功: ID='%s'"), *RoleId.ToString()));
		return true;
	}

	LogRoleWarning(FString::Printf(TEXT("UnregisterRole 失败: 角色 ID '%s' 未注册"), *RoleId.ToString()));
	return false;
}

bool URoleManagementSubsystem::IsRoleRegistered(FName RoleId) const
{
	return RoleRegistry.Contains(RoleId);
}

// ==================== 角色查询 ====================

bool URoleManagementSubsystem::GetRoleDefinition(FName RoleId, FRoleDefinition& OutDefinition) const
{
	if (const FRoleDefinition* Found = RoleRegistry.Find(RoleId))
	{
		OutDefinition = *Found;
		return true;
	}
	return false;
}

TArray<FRoleDefinition> URoleManagementSubsystem::GetAllRoleDefinitions() const
{
	TArray<FRoleDefinition> Result;
	RoleRegistry.GenerateValueArray(Result);
	return Result;
}

TArray<FName> URoleManagementSubsystem::GetAllRoleIds() const
{
	TArray<FName> Result;
	RoleRegistry.GenerateKeyArray(Result);
	return Result;
}

int32 URoleManagementSubsystem::GetRegisteredRoleCount() const
{
	return RoleRegistry.Num();
}

// ==================== 当前角色状态 ====================

FName URoleManagementSubsystem::GetActiveRoleId() const
{
	return ActiveRoleId;
}

APawn* URoleManagementSubsystem::GetActiveRolePawn() const
{
	return ActiveRolePawn.Get();
}

bool URoleManagementSubsystem::HasActiveRole() const
{
	return !ActiveRoleId.IsNone() && ActiveRolePawn.IsValid();
}

// ==================== 角色切换 ====================

bool URoleManagementSubsystem::IsSwitching() const
{
	return CurrentSwitchState != ERoleSwitchState::Idle && CurrentSwitchState != ERoleSwitchState::Completed;
}

FRoleSwitchResult URoleManagementSubsystem::RequestSwitchRole(const FRoleSwitchRequest& Request)
{
	if (!bInitialized)
	{
		auto Result = FRoleSwitchResult::Failure(ERoleSwitchFailReason::SubsystemNotReady, TEXT("子系统尚未初始化"));
		LogRoleError(FString::Printf(TEXT("切换请求失败: %s"), *Result.FailDetail));
		return Result;
	}

	// 并发保护：如果已有切换流程正在进行，拒绝新请求
	if (IsSwitching())
	{
		auto Result = FRoleSwitchResult::Failure(ERoleSwitchFailReason::SwitchInProgress,
			FString::Printf(TEXT("已有切换流程正在进行 (当前状态: %d)"), static_cast<uint8>(CurrentSwitchState)));
		LogRoleWarning(FString::Printf(TEXT("切换请求被拒绝: %s"), *Result.FailDetail));
		OnRoleSwitchFailed.Broadcast(Result);
		return Result;
	}

	SwitchStartTime = FPlatformTime::Seconds();

	// 记录切换前的角色信息
	FName PreviousRoleId = ActiveRoleId;
	APawn* PreviousPawn = ActiveRolePawn.Get();

	// ── 阶段1：前置校验 (Validating) ──
	SetSwitchState(ERoleSwitchState::Validating);
	FRoleSwitchResult ValidationResult = ValidateSwitchRequest(Request);
	if (!ValidationResult.bSuccess && !Request.bForce)
	{
		SetSwitchState(ERoleSwitchState::Idle);
		ValidationResult.PreviousRoleId = PreviousRoleId;
		LogRoleError(FString::Printf(TEXT("切换校验失败: %s"), *ValidationResult.FailDetail));
		OnRoleSwitchFailed.Broadcast(ValidationResult);
		return ValidationResult;
	}

	// 广播切换开始事件
	OnRoleSwitchStarted.Broadcast(Request);
	LogRole(FString::Printf(TEXT("角色切换开始: %s -> %s"),
		*PreviousRoleId.ToString(), *Request.TargetRoleId.ToString()));

	// ── 阶段2：解绑旧角色 (Unbinding) ──
	SetSwitchState(ERoleSwitchState::Unbinding);
	FRoleSwitchResult UnbindResult;
	if (!UnbindCurrentRole(UnbindResult))
	{
		LogRoleError(FString::Printf(TEXT("解绑旧角色失败: %s"), *UnbindResult.FailDetail));
		RollbackSwitch(PreviousRoleId, PreviousPawn);
		SetSwitchState(ERoleSwitchState::Idle);
		UnbindResult.PreviousRoleId = PreviousRoleId;
		OnRoleSwitchFailed.Broadcast(UnbindResult);
		return UnbindResult;
	}

	// ── 阶段3：激活新角色 (Activating) ──
	SetSwitchState(ERoleSwitchState::Activating);
	const FRoleDefinition* TargetDef = RoleRegistry.Find(Request.TargetRoleId);
	FRoleSwitchResult ActivateResult;
	if (!ActivateRole(*TargetDef, ActivateResult))
	{
		LogRoleError(FString::Printf(TEXT("激活新角色失败: %s"), *ActivateResult.FailDetail));
		RollbackSwitch(PreviousRoleId, PreviousPawn);
		SetSwitchState(ERoleSwitchState::Idle);
		ActivateResult.PreviousRoleId = PreviousRoleId;
		OnRoleSwitchFailed.Broadcast(ActivateResult);
		return ActivateResult;
	}

	// ── 阶段4：切换完成 (Completed) ──
	SetSwitchState(ERoleSwitchState::Completed);
	double Duration = FPlatformTime::Seconds() - SwitchStartTime;

	FRoleSwitchResult SuccessResult = FRoleSwitchResult::Success(PreviousRoleId, Request.TargetRoleId, static_cast<float>(Duration));

	LogRole(FString::Printf(TEXT("角色切换成功: %s -> %s (耗时 %.3f 秒)"),
		*PreviousRoleId.ToString(), *Request.TargetRoleId.ToString(), Duration));

	// 广播事件
	OnRoleSwitchCompleted.Broadcast(SuccessResult);
	OnActiveRoleChanged.Broadcast(PreviousRoleId, ActiveRoleId);

	// 回到空闲状态
	SetSwitchState(ERoleSwitchState::Idle);

	return SuccessResult;
}

// ==================== 角色可用性控制 ====================

bool URoleManagementSubsystem::SetRoleAvailability(FName RoleId, bool bAvailable)
{
	if (FRoleDefinition* Def = RoleRegistry.Find(RoleId))
	{
		Def->bAvailable = bAvailable;
		LogRole(FString::Printf(TEXT("角色 '%s' 可用性已设置为: %s"),
			*RoleId.ToString(), bAvailable ? TEXT("是") : TEXT("否")));
		return true;
	}
	LogRoleWarning(FString::Printf(TEXT("SetRoleAvailability 失败: 角色 '%s' 未注册"), *RoleId.ToString()));
	return false;
}

bool URoleManagementSubsystem::SetRoleSwitchable(FName RoleId, bool bSwitchable)
{
	if (FRoleDefinition* Def = RoleRegistry.Find(RoleId))
	{
		Def->bSwitchable = bSwitchable;
		LogRole(FString::Printf(TEXT("角色 '%s' 可切出性已设置为: %s"),
			*RoleId.ToString(), bSwitchable ? TEXT("是") : TEXT("否")));
		return true;
	}
	LogRoleWarning(FString::Printf(TEXT("SetRoleSwitchable 失败: 角色 '%s' 未注册"), *RoleId.ToString()));
	return false;
}

// ==================== 切换流程内部方法 ====================

FRoleSwitchResult URoleManagementSubsystem::ValidateSwitchRequest(const FRoleSwitchRequest& Request) const
{
	// 检查目标角色是否已注册
	if (Request.TargetRoleId.IsNone())
	{
		return FRoleSwitchResult::Failure(ERoleSwitchFailReason::TargetNotFound,
			TEXT("目标角色 ID 为空"));
	}

	const FRoleDefinition* TargetDef = RoleRegistry.Find(Request.TargetRoleId);
	if (!TargetDef)
	{
		return FRoleSwitchResult::Failure(ERoleSwitchFailReason::TargetNotFound,
			FString::Printf(TEXT("目标角色 '%s' 未注册"), *Request.TargetRoleId.ToString()));
	}

	// 检查是否切换到相同角色
	if (Request.TargetRoleId == ActiveRoleId)
	{
		return FRoleSwitchResult::Failure(ERoleSwitchFailReason::SameAsCurrent,
			FString::Printf(TEXT("目标角色 '%s' 与当前角色相同"), *Request.TargetRoleId.ToString()));
	}

	// 检查目标角色是否可用
	if (!TargetDef->bAvailable)
	{
		return FRoleSwitchResult::Failure(ERoleSwitchFailReason::TargetUnavailable,
			FString::Printf(TEXT("目标角色 '%s' 不可用"), *Request.TargetRoleId.ToString()));
	}

	// 检查当前角色是否允许切出
	if (!ActiveRoleId.IsNone())
	{
		const FRoleDefinition* CurrentDef = RoleRegistry.Find(ActiveRoleId);
		if (CurrentDef && !CurrentDef->bSwitchable)
		{
			return FRoleSwitchResult::Failure(ERoleSwitchFailReason::CurrentNotSwitchable,
				FString::Printf(TEXT("当前角色 '%s' 不允许切出"), *ActiveRoleId.ToString()));
		}
	}

	// 检查角色类引用是否有效
	if (TargetDef->RoleClass.IsNull())
	{
		return FRoleSwitchResult::Failure(ERoleSwitchFailReason::InvalidClassReference,
			FString::Printf(TEXT("目标角色 '%s' 的类引用为空"), *Request.TargetRoleId.ToString()));
	}

	// 校验通过
	FRoleSwitchResult Result;
	Result.bSuccess = true;
	return Result;
}

bool URoleManagementSubsystem::UnbindCurrentRole(FRoleSwitchResult& OutResult)
{
	if (!HasActiveRole())
	{
		return true; // 没有当前角色，无需解绑
	}

	APawn* CurrentPawn = ActiveRolePawn.Get();
	if (CurrentPawn)
	{
		// UnPossess 旧角色（PlayerController 将在 ActivateRole 阶段 Possess 新角色）
		if (APlayerController* PC = Cast<APlayerController>(CurrentPawn->GetController()))
		{
			PC->UnPossess();
			LogRole(FString::Printf(TEXT("旧角色 '%s' 已被 UnPossess"), *ActiveRoleId.ToString()));
		}
		
		// 隐藏旧 Pawn（防止视觉残留）
		CurrentPawn->SetActorHiddenInGame(true);
		CurrentPawn->SetActorTickEnabled(false);
		
		LogRole(FString::Printf(TEXT("旧角色 '%s' 已隐藏"), *ActiveRoleId.ToString()));
	}

	// 清理当前角色状态
	FName OldRoleId = ActiveRoleId;
	ActiveRoleId = NAME_None;
	ActiveRolePawn = nullptr;

	LogRole(FString::Printf(TEXT("旧角色 '%s' 已解绑"), *OldRoleId.ToString()));
	return true;
}
bool URoleManagementSubsystem::ActivateRole(const FRoleDefinition& Definition, FRoleSwitchResult& OutResult)
{
	UWorld* World = GetGameInstance()->GetWorld();
	if (!World)
	{
		OutResult = FRoleSwitchResult::Failure(ERoleSwitchFailReason::ActivateFailed, TEXT("无法获取 World"));
		return false;
	}

	// 加载角色蓝图类（从软引用）
	LogRole(FString::Printf(TEXT("ActivateRole: 正在加载角色 '%s' 的蓝图类, 路径='%s'"),
		*Definition.RoleId.ToString(), *Definition.RoleClass.ToString()));
	UClass* RoleClass = Definition.RoleClass.LoadSynchronous();
	if (!RoleClass)
	{
		OutResult = FRoleSwitchResult::Failure(ERoleSwitchFailReason::InvalidClassReference,
			FString::Printf(TEXT("无法加载角色类: '%s'"), *Definition.RoleClass.ToString()));
		return false;
	}

	// 确定生成位置：如果 SpawnTransform 为默认值（原点），则使用 PlayerStart 位置
	FTransform FinalSpawnTransform = Definition.SpawnTransform;
	if (FinalSpawnTransform.GetLocation().IsNearlyZero() && FinalSpawnTransform.GetRotation().IsIdentity())
	{
	TArray<AActor*> PlayerStarts;
	UGameplayStatics::GetAllActorsOfClass(World, APlayerStart::StaticClass(), PlayerStarts);
	AActor* PlayerStart = PlayerStarts.Num() > 0 ? PlayerStarts[0] : nullptr;
	if (PlayerStart)
	{
		FinalSpawnTransform = PlayerStart->GetActorTransform();
		LogRole(FString::Printf(TEXT("ActivateRole: SpawnTransform 为默认值，使用 PlayerStart 位置: %s"),
			*FinalSpawnTransform.GetLocation().ToString()));
	}
	else
	{
		LogRoleWarning(TEXT("ActivateRole: SpawnTransform 为默认值且未找到 PlayerStart，将在原点生成"));
	}
	}

	// 在确定的位置生成角色 Pawn
	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	APawn* NewPawn = World->SpawnActor<APawn>(RoleClass, FinalSpawnTransform, SpawnParams);
	if (!NewPawn)
	{
		OutResult = FRoleSwitchResult::Failure(ERoleSwitchFailReason::SpawnFailed,
			FString::Printf(TEXT("生成角色 '%s' 失败"), *Definition.RoleId.ToString()));
		return false;
	}

	// 更新当前角色状态（原子性更新）
	ActiveRoleId = Definition.RoleId;
	ActiveRolePawn = NewPawn;

	// 注意：Possess 操作由 HDPlayerController 通过 OnActiveRoleChanged 事件回调完成。

	LogRole(FString::Printf(TEXT("新角色 '%s' 已生成并激活（等待 HDPlayerController Possess）"), *Definition.RoleId.ToString()));
	return true;
}
void URoleManagementSubsystem::RollbackSwitch(FName PreviousRoleId, APawn* PreviousPawn)
{
	LogRoleWarning(FString::Printf(TEXT("正在回滚到角色 '%s'"), *PreviousRoleId.ToString()));

	// 恢复之前的角色状态
	ActiveRoleId = PreviousRoleId;
	ActiveRolePawn = PreviousPawn;

	if (PreviousPawn && PreviousPawn->IsValidLowLevel())
	{
		// 恢复旧角色的可见性
		PreviousPawn->SetActorHiddenInGame(false);
		PreviousPawn->SetActorTickEnabled(true);

		// 回滚时让 PlayerController 重新 Possess 旧角色
		UWorld* World = GetGameInstance()->GetWorld();
		if (World)
		{
			APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0);
			if (PC)
			{
				PC->Possess(PreviousPawn);
				LogRole(TEXT("回滚完成: 旧角色已重新被 Possess"));
			}
		}
		LogRole(TEXT("回滚完成: 旧角色状态已恢复"));
	}
	else
	{
		ActiveRoleId = NAME_None;
		ActiveRolePawn = nullptr;
		LogRoleWarning(TEXT("回滚完成: 旧角色 Pawn 不可用，已重置为空状态"));
	}
}
void URoleManagementSubsystem::SetSwitchState(ERoleSwitchState NewState)
{
	if (CurrentSwitchState != NewState)
	{
		LogRole(FString::Printf(TEXT("切换状态变更: %d -> %d"),
			static_cast<uint8>(CurrentSwitchState), static_cast<uint8>(NewState)));
		CurrentSwitchState = NewState;
	}
}

// ==================== 调试 ====================

void URoleManagementSubsystem::DebugPrintStatus() const
{
	UE_LOG(LogRoleManagement, Log, TEXT("===== 角色管理子系统状态 ====="));
	UE_LOG(LogRoleManagement, Log, TEXT("已初始化: %s"), bInitialized ? TEXT("是") : TEXT("否"));
	UE_LOG(LogRoleManagement, Log, TEXT("已注册角色数: %d"), RoleRegistry.Num());
	UE_LOG(LogRoleManagement, Log, TEXT("当前激活角色: %s"), ActiveRoleId.IsNone() ? TEXT("无") : *ActiveRoleId.ToString());
	UE_LOG(LogRoleManagement, Log, TEXT("当前切换状态: %d"), static_cast<uint8>(CurrentSwitchState));
	UE_LOG(LogRoleManagement, Log, TEXT("已注册角色列表:"));
	for (const auto& Pair : RoleRegistry)
	{
		UE_LOG(LogRoleManagement, Log, TEXT("  - %s (显示名=%s, 可用=%s, 可切出=%s)"),
			*Pair.Key.ToString(),
			*Pair.Value.DisplayName.ToString(),
			Pair.Value.bAvailable ? TEXT("是") : TEXT("否"),
			Pair.Value.bSwitchable ? TEXT("是") : TEXT("否"));
	}
	UE_LOG(LogRoleManagement, Log, TEXT("================================"));
}

// ==================== 日志 ====================

void URoleManagementSubsystem::LogRole(const FString& Message) const
{
	UE_LOG(LogRoleManagement, Log, TEXT("[RoleManagement] %s"), *Message);
}

void URoleManagementSubsystem::LogRoleWarning(const FString& Message) const
{
	UE_LOG(LogRoleManagement, Warning, TEXT("[RoleManagement] %s"), *Message);
}

void URoleManagementSubsystem::LogRoleError(const FString& Message) const
{
	UE_LOG(LogRoleManagement, Error, TEXT("[RoleManagement] %s"), *Message);
}

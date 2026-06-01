// 角色管理子系统
// 作为 GameInstanceSubsystem，提供跨关卡的角色管理核心能力

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "RoleManagementSubsystem.generated.h"

// ==================== 枚举定义 ====================

/** 角色切换状态 */
UENUM(BlueprintType)
enum class ERoleSwitchState : uint8
{
	/** 空闲，未在切换 */
	Idle		UMETA(DisplayName = "Idle"),
	/** 切换请求已受理，正在执行前置校验 */
	Validating	UMETA(DisplayName = "Validating"),
	/** 正在解绑旧角色 */
	Unbinding	UMETA(DisplayName = "Unbinding"),
	/** 正在激活新角色 */
	Activating	UMETA(DisplayName = "Activating"),
	/** 切换完成 */
	Completed	UMETA(DisplayName = "Completed"),
	/** 切换失败，正在回滚 */
	RollingBack	UMETA(DisplayName = "RollingBack"),
};

/** 角色切换失败原因 */
UENUM(BlueprintType)
enum class ERoleSwitchFailReason : uint8
{
	/** 无失败 */
	None					UMETA(DisplayName = "None"),
	/** 子系统未初始化 */
	SubsystemNotReady		UMETA(DisplayName = "SubsystemNotReady"),
	/** 目标角色 ID 不存在 */
	TargetNotFound			UMETA(DisplayName = "TargetNotFound"),
	/** 目标角色不可用 */
	TargetUnavailable		UMETA(DisplayName = "TargetUnavailable"),
	/** 当前角色不允许切换 */
	CurrentNotSwitchable	UMETA(DisplayName = "CurrentNotSwitchable"),
	/** 已有切换流程正在进行 */
	SwitchInProgress		UMETA(DisplayName = "SwitchInProgress"),
	/** 目标与当前相同 */
	SameAsCurrent			UMETA(DisplayName = "SameAsCurrent"),
	/** 前置校验失败 */
	ValidationFailed		UMETA(DisplayName = "ValidationFailed"),
	/** 解绑旧角色失败 */
	UnbindFailed			UMETA(DisplayName = "UnbindFailed"),
	/** 激活新角色失败 */
	ActivateFailed			UMETA(DisplayName = "ActivateFailed"),
	/** 角色类引用无效 */
	InvalidClassReference	UMETA(DisplayName = "InvalidClassReference"),
	/** 角色生成失败 */
	SpawnFailed				UMETA(DisplayName = "SpawnFailed"),
};

// ==================== 结构定义 ====================

/** 角色定义配置 - 描述一个可切换角色的完整信息 */
USTRUCT(BlueprintType)
struct FRoleDefinition
{
	GENERATED_BODY()

	/** 角色唯一标识符 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	FName RoleId;

	/** 角色显示名称 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	FText DisplayName;

	/** 角色蓝图类引用（软引用，延迟加载） */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	TSoftClassPtr<APawn> RoleClass;

	/** 默认生成位置偏移 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	FTransform SpawnTransform;

	/** 是否可用（可通过解锁条件等控制） */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	bool bAvailable = true;

	/** 是否允许当前被切出（不可切换状态下拒绝切换请求） */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	bool bSwitchable = true;

	/** Ability tags for skill/unlock system extension */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role|Extension")
	TArray<FName> AbilityTags;

	/** 扩展数据（自定义键值对，供后续模块扩展） */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role|Extension")
	TMap<FString, FString> ExtensionData;

	/** 有效性检查 */
	bool IsValid() const
	{
		return !RoleId.IsNone();
	}
};

/** 角色切换请求 */
USTRUCT(BlueprintType)
struct FRoleSwitchRequest
{
	GENERATED_BODY()

	/** 目标角色 ID */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	FName TargetRoleId;

	/** 是否强制切换（跳过前置校验） */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	bool bForce = false;

	/** 请求附带的自定义数据 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Role")
	TMap<FString, FString> RequestData;
};

/** 角色切换结果 */
USTRUCT(BlueprintType)
struct FRoleSwitchResult
{
	GENERATED_BODY()

	/** 是否切换成功 */
	UPROPERTY(BlueprintReadOnly, Category = "Role")
	bool bSuccess = false;

	/** 失败原因 */
	UPROPERTY(BlueprintReadOnly, Category = "Role")
	ERoleSwitchFailReason FailReason = ERoleSwitchFailReason::None;

	/** 切换前的角色 ID */
	UPROPERTY(BlueprintReadOnly, Category = "Role")
	FName PreviousRoleId;

	/** 切换后的角色 ID */
	UPROPERTY(BlueprintReadOnly, Category = "Role")
	FName NewRoleId;

	/** 切换耗时（秒） */
	UPROPERTY(BlueprintReadOnly, Category = "Role")
	float SwitchDuration = 0.f;

	/** 附加的失败详情（日志友好） */
	UPROPERTY(BlueprintReadOnly, Category = "Role")
	FString FailDetail;

	/** 构造成功结果 */
	static FRoleSwitchResult Success(FName PrevRoleId, FName NewRoleId, float Duration = 0.f)
	{
		FRoleSwitchResult Result;
		Result.bSuccess = true;
		Result.PreviousRoleId = PrevRoleId;
		Result.NewRoleId = NewRoleId;
		Result.SwitchDuration = Duration;
		return Result;
	}

	/** 构造失败结果 */
	static FRoleSwitchResult Failure(ERoleSwitchFailReason Reason, const FString& Detail = TEXT(""))
	{
		FRoleSwitchResult Result;
		Result.bSuccess = false;
		Result.FailReason = Reason;
		Result.FailDetail = Detail;
		return Result;
	}
};

// ==================== 委托定义 ====================

/** 角色切换前委托 - 参数：目标角色ID */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRoleSwitchStarted, const FRoleSwitchRequest&, Request);

/** 角色切换成功委托 - 参数：切换结果 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRoleSwitchCompleted, const FRoleSwitchResult&, Result);

/** 角色切换失败委托 - 参数：切换结果（含失败原因） */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRoleSwitchFailed, const FRoleSwitchResult&, Result);

/** 当前角色变更委托 - 参数：旧角色ID、新角色ID */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnActiveRoleChanged, FName, PreviousRoleId, FName, NewRoleId);

// ==================== 子系统主类 ====================

/**
 * 角色管理子系统
 * 
 * 作为 GameInstanceSubsystem，随 GameInstance 生命周期存在，
 * 提供角色注册、查询、切换等核心管理能力。
 * 
 * 是角色相关状态的单一事实来源，TS 层通过桥接层调用本系统。
 */
UCLASS()
class HD_2D_API URoleManagementSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// ==================== 生命周期 ====================

	/** 子系统初始化 */
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** 子系统反初始化 */
	virtual void Deinitialize() override;

	/** 是否应该创建此子系统 */
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;

	/** 子系统是否已完成初始化 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement")
	bool IsInitialized() const { return bInitialized; }

	// ==================== 角色注册 ====================

	/**
	 * 注册一个角色定义
	 * @param Definition 角色定义
	 * @return 是否注册成功
	 */
	UFUNCTION(BlueprintCallable, Category = "RoleManagement|Registration")
	bool RegisterRole(const FRoleDefinition& Definition);

	/**
	 * 注销一个角色定义
	 * @param RoleId 角色ID
	 * @return 是否注销成功
	 */
	UFUNCTION(BlueprintCallable, Category = "RoleManagement|Registration")
	bool UnregisterRole(FName RoleId);

	/**
	 * 检查角色是否已注册
	 * @param RoleId 角色ID
	 * @return 是否已注册
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|Registration")
	bool IsRoleRegistered(FName RoleId) const;

	// ==================== 角色查询 ====================

	/**
	 * 根据ID获取角色定义
	 * @param RoleId 角色ID
	 * @param OutDefinition 输出的角色定义
	 * @return 是否找到
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|Query")
	bool GetRoleDefinition(FName RoleId, FRoleDefinition& OutDefinition) const;

	/**
	 * 获取所有已注册的角色定义
	 * @return 角色定义数组
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|Query")
	TArray<FRoleDefinition> GetAllRoleDefinitions() const;

	/**
	 * 获取所有已注册的角色 ID
	 * @return 角色 ID 数组
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|Query")
	TArray<FName> GetAllRoleIds() const;

	/**
	 * 获取已注册角色数量
	 * @return 数量
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|Query")
	int32 GetRegisteredRoleCount() const;

	// ==================== 当前角色状态 ====================

	/**
	 * 获取当前激活角色的ID
	 * @return 当前角色ID，无激活角色时返回 NAME_None
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|ActiveRole")
	FName GetActiveRoleId() const;

	/**
	 * 获取当前激活角色的 Pawn 实例
	 * @return Pawn 引用，无激活角色时返回 nullptr
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|ActiveRole")
	APawn* GetActiveRolePawn() const;

	/**
	 * 当前是否有激活角色
	 * @return 是否有激活角色
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|ActiveRole")
	bool HasActiveRole() const;

	// ==================== 角色切换 ====================

	/**
	 * 请求切换角色
	 * @param Request 切换请求
	 * @return 切换结果
	 */
	UFUNCTION(BlueprintCallable, Category = "RoleManagement|Switch")
	FRoleSwitchResult RequestSwitchRole(const FRoleSwitchRequest& Request);

	/**
	 * 获取当前切换状态
	 * @return 当前切换状态枚举
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|Switch")
	ERoleSwitchState GetSwitchState() const { return CurrentSwitchState; }

	/**
	 * 当前是否正在执行切换
	 * @return 是否正在切换中
	 */
	UFUNCTION(BlueprintPure, Category = "RoleManagement|Switch")
	bool IsSwitching() const;

	// ==================== 角色可用性控制 ====================

	/**
	 * 设置角色是否可用
	 * @param RoleId 角色ID
	 * @param bAvailable 是否可用
	 * @return 是否设置成功
	 */
	UFUNCTION(BlueprintCallable, Category = "RoleManagement|Control")
	bool SetRoleAvailability(FName RoleId, bool bAvailable);

	/**
	 * 设置角色是否可被切出
	 * @param RoleId 角色ID
	 * @param bSwitchable 是否可切换
	 * @return 是否设置成功
	 */
	UFUNCTION(BlueprintCallable, Category = "RoleManagement|Control")
	bool SetRoleSwitchable(FName RoleId, bool bSwitchable);

	// ==================== 事件委托 ====================

	/** 角色切换开始事件 */
	UPROPERTY(BlueprintAssignable, Category = "RoleManagement|Events")
	FOnRoleSwitchStarted OnRoleSwitchStarted;

	/** 角色切换成功事件 */
	UPROPERTY(BlueprintAssignable, Category = "RoleManagement|Events")
	FOnRoleSwitchCompleted OnRoleSwitchCompleted;

	/** 角色切换失败事件 */
	UPROPERTY(BlueprintAssignable, Category = "RoleManagement|Events")
	FOnRoleSwitchFailed OnRoleSwitchFailed;

	/** 当前角色变更事件 */
	UPROPERTY(BlueprintAssignable, Category = "RoleManagement|Events")
	FOnActiveRoleChanged OnActiveRoleChanged;

	// ==================== 调试 ====================

	/** 打印当前系统状态（调试用） */
	UFUNCTION(BlueprintCallable, Category = "RoleManagement|Debug")
	void DebugPrintStatus() const;

protected:
	// ==================== 切换流程内部方法 ====================

	/** 前置校验 */
	FRoleSwitchResult ValidateSwitchRequest(const FRoleSwitchRequest& Request) const;

	/** 解绑旧角色 */
	bool UnbindCurrentRole(FRoleSwitchResult& OutResult);

	/** 激活新角色 */
	bool ActivateRole(const FRoleDefinition& Definition, FRoleSwitchResult& OutResult);

	/** 回滚到稳定状态 */
	void RollbackSwitch(FName PreviousRoleId, APawn* PreviousPawn);

	/** 更新切换状态并记录日志 */
	void SetSwitchState(ERoleSwitchState NewState);

	/** 记录角色系统日志 */
	void LogRole(const FString& Message) const;
	void LogRoleWarning(const FString& Message) const;
	void LogRoleError(const FString& Message) const;

private:
	/** 是否已完成初始化 */
	bool bInitialized = false;

	/** 角色注册表：RoleId → 角色定义 */
	UPROPERTY()
	TMap<FName, FRoleDefinition> RoleRegistry;

	/** 当前激活角色 ID */
	FName ActiveRoleId;

	/** 当前激活角色 Pawn 实例 */
	UPROPERTY()
	TWeakObjectPtr<APawn> ActiveRolePawn;

	/** 当前切换状态 */
	ERoleSwitchState CurrentSwitchState = ERoleSwitchState::Idle;

	/** 切换开始时间（用于计算切换耗时） */
	double SwitchStartTime = 0.0;
};

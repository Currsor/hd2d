// Fill out your copyright notice in the Description page of Project Settings.

#pragma once

#include "CoreMinimal.h"
#include "JsEnv.h"
#include "Engine/GameInstance.h"
#include "CurrsorGameInstance.generated.h"

/**
 * 
 */
UCLASS()
class HD_2D_API UCurrsorGameInstance : public UGameInstance
{
	GENERATED_BODY()

public:
	void InitializePuerTS();
	virtual void Init() override;

	virtual void OnStart() override;

	virtual void Shutdown() override;

	TSharedPtr<puerts::FJsEnv> GetJsEnv() { return GameScript; }

	// PureTS调试模式
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Debug | PuerTS")
	bool bDebugMode = false;

	// 等待调试器
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Debug | PuerTS", meta = (EditCondition = "bDebugMode",EditConditionHides = "bDebugMode"))
	bool bWaitForDebugger = false;

	// 是否是调试模式
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Debug | Editor")  
	bool bDebug = false;

	// 是否是攻击调试模式
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Debug | Editor", meta = (EditCondition = "bDebug",EditConditionHides = "bDebug"))
	bool bAttackDebug = false;

private:
	TSharedPtr<puerts::FJsEnv> GameScript;
};

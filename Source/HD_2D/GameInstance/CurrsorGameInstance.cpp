// Fill out your copyright notice in the Description page of Project Settings.


#include "CurrsorGameInstance.h"

void UCurrsorGameInstance::InitializePuerTS()
{
	if (bDebugMode)
	{
		GameScript = MakeShared<puerts::FJsEnv>(
			std::make_unique<puerts::DefaultJSModuleLoader>(TEXT("JavaScript")),
			std::make_shared<puerts::FDefaultLogger>(),
			8080
			);

		if (bWaitForDebugger)
		{
			GameScript->WaitDebugger();
		}
	}
	else
	{
		GameScript = MakeShared<puerts::FJsEnv>();
	}
	
	// 将 GameInstance 传入 JS 环境，TS 侧通过 puerts.argv.getByName("GameInstance") 获取
	TArray<TPair<FString, UObject*>> Arguments;
	Arguments.Add(TPair<FString, UObject*>(TEXT("GameInstance"), this));
	GameScript->Start("MainGame", Arguments);
}

void UCurrsorGameInstance::Init()
{
	Super::Init();
	
	// 在打包版本中初始化 PuerTS
	if (!IsRunningDedicatedServer())
	{
		InitializePuerTS();
	}
}

void UCurrsorGameInstance::OnStart()
{
	Super::OnStart();
}

void UCurrsorGameInstance::Shutdown()
{
	// 先销毁 JsEnv，确保 mixin 绑定被清理
	if (GameScript.IsValid())
	{
		GameScript.Reset();
	}
	
	Super::Shutdown();
}

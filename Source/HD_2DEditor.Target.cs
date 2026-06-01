// Fill out your copyright notice in the Description page of Project Settings.

using UnrealBuildTool;
using System.Collections.Generic;

public class HD_2DEditorTarget : TargetRules
{
	public HD_2DEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.AddRange( new string[] { "HD_2D" } );
	}
}

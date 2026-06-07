/**
 * GameplayTags.ts
 *
 * 用于在 TS 中集中定义游戏标签字符串，并提供从标签名到 UE GameplayTag 的查询工具。
 *
 * GameplayTag 常量从自动生成文件导入，避免手动配置不一致。
 */
import * as UE from "ue";
import { GameplayTagNames as GeneratedGameplayTagNames, GameplayTags as GeneratedGameplayTags } from "./GameplayTags.generated";

export const GameplayTagNames = GeneratedGameplayTagNames;
export type GameplayTagName = typeof GameplayTagNames[keyof typeof GameplayTagNames];

export const GameplayTags = GeneratedGameplayTags;

function getGameplayTagsManager(): any {
    const managerClass: any = UE.GameplayTagsManager;
    return typeof managerClass.Get === "function" ? managerClass.Get() : null;
}

export function requestGameplayTag(tagName: string, bErrorOnFail = false): any {
    const manager = getGameplayTagsManager();
    if (!manager || typeof manager.RequestGameplayTag !== "function") {
        throw new Error(`GameplayTagsManager.Get() unavailable at runtime`);
    }
    return manager.RequestGameplayTag(tagName, bErrorOnFail);
}

export function isGameplayTagValid(tagName: string): boolean {
    const tag: any = requestGameplayTag(tagName, false);
    return tag && typeof tag.IsValid === "function" && tag.IsValid();
}

export function makeGameplayTagContainer(...tagNames: string[]): UE.GameplayTagContainer {
    const tags = tagNames.map(name => requestGameplayTag(name, true));
    return UE.BlueprintGameplayTagLibrary.MakeGameplayTagContainerFromArray(tags as any);
}

export function hasGameplayTag(container: UE.GameplayTagContainer, tagName: string): boolean {
    const tag = requestGameplayTag(tagName, false);
    if (!tag || typeof tag.IsValid !== "function" || !tag.IsValid()) return false;
    return UE.BlueprintGameplayTagLibrary.HasTag(container, tag, true);
}

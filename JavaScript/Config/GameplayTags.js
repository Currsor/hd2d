"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameplayTags = exports.GameplayTagNames = void 0;
exports.requestGameplayTag = requestGameplayTag;
exports.isGameplayTagValid = isGameplayTagValid;
exports.makeGameplayTagContainer = makeGameplayTagContainer;
exports.hasGameplayTag = hasGameplayTag;
/**
 * GameplayTags.ts
 *
 * 用于在 TS 中集中定义游戏标签字符串，并提供从标签名到 UE GameplayTag 的查询工具。
 *
 * GameplayTag 常量从自动生成文件导入，避免手动配置不一致。
 */
const UE = __importStar(require("ue"));
const GameplayTags_generated_1 = require("./GameplayTags.generated");
exports.GameplayTagNames = GameplayTags_generated_1.GameplayTagNames;
exports.GameplayTags = GameplayTags_generated_1.GameplayTags;
function getGameplayTagsManager() {
    const managerClass = UE.GameplayTagsManager;
    return typeof managerClass.Get === "function" ? managerClass.Get() : null;
}
function requestGameplayTag(tagName, bErrorOnFail = false) {
    const manager = getGameplayTagsManager();
    if (!manager || typeof manager.RequestGameplayTag !== "function") {
        throw new Error(`GameplayTagsManager.Get() unavailable at runtime`);
    }
    return manager.RequestGameplayTag(tagName, bErrorOnFail);
}
function isGameplayTagValid(tagName) {
    const tag = requestGameplayTag(tagName, false);
    return tag && typeof tag.IsValid === "function" && tag.IsValid();
}
function makeGameplayTagContainer(...tagNames) {
    const tags = tagNames.map(name => requestGameplayTag(name, true));
    return UE.BlueprintGameplayTagLibrary.MakeGameplayTagContainerFromArray(tags);
}
function hasGameplayTag(container, tagName) {
    const tag = requestGameplayTag(tagName, false);
    if (!tag || typeof tag.IsValid !== "function" || !tag.IsValid())
        return false;
    return UE.BlueprintGameplayTagLibrary.HasTag(container, tag, true);
}
//# sourceMappingURL=GameplayTags.js.map
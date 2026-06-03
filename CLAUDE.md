# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project identity

**HD_2D** is a 2D side-scroller action game built with Unreal Engine 5.4. Business logic lives in TypeScript (compiled into `Content/JavaScript/`), executed by the **Puerts** plugin (V8 JavaScript engine embedded in UE). C++ provides subsystems, base classes, and data contracts.

The project uses Git repositories managed by `.tmr.manifest`: `hd2d` (code), `hd2d-content` (`Content/`), `hd2d-plugins` (`Plugins/`). Documentation lives in `hd2d-manifest`.

## Build commands

```bash
# macOS
/Path/To/UE_5.4/Engine/Build/BatchFiles/Mac/Build.sh HD_2DEditor Mac Development -Project="$(pwd)/HD_2D.uproject"

# Windows
"\Path\To\UE_5.4\Engine\Build\BatchFiles\Build.bat" HD_2DEditor Win64 Development "%CD%\HD_2D.uproject" -WaitMutex -FromMsBuild

# TypeScript type check
cd TypeScript && npx tsc --noEmit
```

## Architecture: C++ / TS / Blueprint three layers

C++ defines **data structures and lifecycle**, TS implements **behavior**, Blueprint provides **presentation**.

### Where things live

| Layer | Location | Role |
|---|---|---|
| C++ subsystems | `Source/HD_2D/` | State machines, data contracts, UE lifecycle |
| TS bridge layer | `TypeScript/Scripts/Bridge/` | Generic C++→TS bridging (SubsystemBridge base) |
| TS role bridge | `TypeScript/Scripts/RoleManagement/` | RoleManager — first bridge implementation |
| TS game logic | `TypeScript/Scripts/Logic/` | Per-entity Update/Init/Destroy, gameplay behavior |
| TS ability system | `TypeScript/Scripts/Ability/` | Combat abilities (composition pattern) |
| TS infrastructure | `TypeScript/Scripts/Mixin/` | EventBus, DIContainer, LogicManager, GameObjectBase |
| TS config | `TypeScript/Scripts/Config/` | Centralized registration (roles, logic types) |
| TS animation | `TypeScript/Scripts/Anim/` | Animation state sync engine |
| C++ character | `Source/HD_2D/Character/` | Input binding, coyote time, orientation tracking |

### Adding a new C++ Subsystem → TS bridge

Use `TypeScript/Scripts/Bridge/SubsystemBridge.ts` base class. Only 3 things to implement:

```ts
class MyBridge extends SubsystemBridge<UE.MySubsystem> {
    static getInstance(): MyBridge { /* singleton */ }
    private constructor() {
        super("/Script/HD_2D.MySubsystem", "[MyBridge]");
    }

    protected bindDelegates(): void {
        const sub = this.getSubsystem();
        if (!sub) return;
        sub.OnSomethingHappened.Add((param: any) => {
            EventBus.getInstance().emitScoped(
                "OnSomething", -1, GLOBAL_SCOPE, [{ param: param.toString() }]
            );
        });
    }

    // domain methods...
    doThing(): boolean {
        const sub = this.ensureSubsystem("doThing");
        if (!sub) return false;
        return sub.DoThing();
    }
}
```

The base class handles: GameInstance acquisition (argv/global/gameplay fallback), UClass resolution, SubsystemBlueprintLibrary call, lazy init with auto-retry, delegate binding lifecycle.

### Key systems

- **RoleManagement**: 5-phase state machine (Idle→Validating→Unbinding→Activating→Completed, rollback on failure)
- **EventBus**: Scoped pub-sub with instance isolation, throttling, duplicate protection
- **LogicManager**: Entity lifecycle with object pooling per type
- **ComboAttackAbility**: 3-segment state machine (Startup→Active→Recovery), composition pattern
- **AnimStateSync**: Per-frame CharacterBase→ABP state sync via computeAnimState
- **BFL_JSLogic**: Single Blueprint→TS entry point (mixin on BlueprintFunctionLibrary)

### File conventions

- Source files use Chinese comments alongside English code
- JS files in `Content/JavaScript/` are compiled output — edit `.ts` in `TypeScript/Scripts/` instead
- Blueprint paths in TS: `/Game/Blueprints/Player/Currsor/BP_Currsor.BP_Currsor_C`
- `Content/JavaScript/TEMP/` is experimental, not production

## Engine plugins

- **Puerts**: V8 JS engine. V8 prebuilt libs via `setup.sh`, not in repo.
- **PaperZD**: 2D character animation. `ACharacterBase` inherits `APaperZDCharacter`.
- **LogViewerPro**: In-editor log viewer.

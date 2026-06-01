# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project identity

**HD_2D** is a 2D side-scroller action game built with Unreal Engine 5.4. Business logic lives in TypeScript/JavaScript (compiled into `Content/JavaScript/`), executed by the **Puerts** plugin (V8 JavaScript engine embedded in UE). C++ provides subsystems, base classes, and data contracts.

The project uses **TMR** (Tencent Multiple Repository) to manage three Git repositories within one workspace: `hd2d` (code/config, this repo), `hd2d-content` (`Content/`), and `hd2d-plugins` (`Plugins/`). See `.tmr.manifest` and `TMR.md` for details. When making changes, be aware which repo you're in — `Content/` and `Plugins/` have their own git histories.

## Build commands

```bash
# Generate Xcode project (macOS)
/Path/To/UE_5.4/Engine/Build/BatchFiles/Mac/GenerateProjectFiles.sh /path/to/HD_2D.uproject -Game -Engine

# Compile Editor target (macOS)
/Path/To/UE_5.4/Engine/Build/BatchFiles/Mac/Build.sh HD_2DEditor Mac Development -Project="/path/to/HD_2D.uproject"

# Compile Editor target (Windows)
"\Path\To\UE_5.4\Engine\Build\BatchFiles\Build.bat" HD_2DEditor Win64 Development "%CD%\HD_2D.uproject" -WaitMutex -FromMsBuild

# Install TypeScript dependencies (for VSCode type hints)
cd TypeScript && npm install
```

There is no separate test runner. JS tests in `Content/JavaScript/Tests/` are manual — invoke in-game by calling `RoleSystemValidator.runAll()` or through the V8 inspector.

## Architecture: C++ / JS bridge

This is the defining architectural pattern. C++ defines **data structures and lifecycle**, JS implements **behavior**.

### Data flow (boot sequence)

```
CurrsorGameInstance::Init()                       → boots Puerts JsEnv
  → GameScript->Start("MainGame")                 → loads Content/JavaScript/MainGame.js
    → require("./Mixin/EventBus")                  → step 1: infrastructure singletons
    → require("./Mixin/DIContainer")
    → require("./Config/RegisterLogics")           → step 2: register all logic types + roles
    → require("./Mixin/BP_JSBridge_Mixin")         → step 3: inject BFL_JSLogic blueprint bridge
    → JS bridges to C++ subsystems via Puerts interop (ue.* namespace)
```

`Config/RegisterLogics.js` calls `LogicManager.registerLogicClass()` for each entity type (Cube, Hero, Currsor, Monster) and `Config/RegisterRoles.js` calls `RoleManager.registerRole()` for each character (Currsor). `BP_JSBridge_Mixin.js` injects `InitializeLogic()`, `DestroyLogic()`, `EmitEvent()`, and `EmitEventByOwner()` into the `BFL_JSLogic` BlueprintFunctionLibrary — this is the single entry point from Blueprint into the JS logic layer.

C++ subsystems (e.g. `URoleManagementSubsystem`) expose `UFUNCTION` methods. JS calls them through Puerts' auto-generated bindings. C++ broadcasts `UPROPERTY(BlueprintAssignable)` delegate events; JS subscribes via the JS event bus bridge layer.

### Where things live

| Layer | Location | Role |
|---|---|---|
| C++ subsystems | `Source/HD_2D/` | State machines, data contracts, UE lifecycle |
| JS game logic | `Content/JavaScript/Logic/` | Per-entity Update/Init/Destroy, gameplay behavior |
| JS ability system | `Content/JavaScript/Ability/` | Combat abilities (combo attack state machine, dash) |
| JS infrastructure | `Content/JavaScript/Mixin/` | EventBus, DI container, LogicManager, GameObjectBase, BFL_JSLogic bridge |
| JS bridge layers | `Content/JavaScript/RoleManagement/` | JS wrappers around C++ subsystems |
| JS config | `Content/JavaScript/Config/` | Centralized entity registration (roles, logic types) |
| Animation mixins | `Content/JavaScript/Anim/` | Per-frame animation state sync (Mixin pattern) |
| C++ character base | `Source/HD_2D/Character/` | Input binding, coyote time, orientation tracking |

### Puerts mixin injection

JS can inject methods into existing Blueprint classes at runtime using `puerts.blueprint.mixin()`. For example, `ABP_Currsor_Mixin.js` injects `BindCharacter()` and `TickAnimState()` into `ABP_Currsor_C`. The mixin uses `WeakMap` for per-instance context storage to avoid property pollution.

When modifying Blueprint classes that receive mixins, ensure the Blueprint's function signatures match what the JS mixin expects, or the mixin call will silently fail.

### BFL_JSLogic bridge mixin (Blueprint → JS entry point)

`BP_JSBridge_Mixin.js` injects methods into the `BFL_JSLogic` BlueprintFunctionLibrary. This is the **single integration point** where any Blueprint (Actor, Widget, Animation BP) enters the JS logic layer:

- `InitializeLogic(Target, LogicTypeName)` → calls `LogicManager.createLogic()`, returns a logicId
- `DestroyLogic(LogicId)` → calls `LogicManager.destroyLogic()`
- `EmitEvent(EventName, Payload)` → global broadcast via `EventBus.emitScoped()`
- `EmitEventByOwner(Target, EventName, Payload)` → instance-scoped emit by owner object (used by Animation BPs)
- `SetEventThrottle` / `SetInstanceEventThrottle` / `SetEventBatch` → configures EventBus performance

If this mixin fails to inject (e.g. `BFL_JSLogic` Blueprint path is wrong), the entire JS logic layer becomes unreachable from Blueprint — all entity logic init and event forwarding silently break.

### DI container (@Inject decorator)

`DIContainer.js` provides a lightweight singleton/transient service registry. The `@Inject(token, optional?)` property decorator enables automatic dependency resolution during `GameObjectBase.Init()`:

```ts
class BP_Hero extends GameObjectBase {
    @Inject("InventorySystem")
    private inventory!: UE.BP_InventorySubsystem;

    @Inject("AudioService", true)  // optional
    private audioService?: AudioService;
}
```

Inject metadata is read from the prototype chain (subclass overrides supersede parent), so inherited entity classes can add dependencies without breaking base class injection.

## Key systems

### Role switching (character swap) state machine

`URoleManagementSubsystem` (C++, `GameInstanceSubsystem`) implements a 5-phase state machine:

```
Idle → Validating → Unbinding → Activating → Completed → Idle
                          ↓ (any phase failure)
                      RollingBack → Idle
```

- `FRoleDefinition`: character identity (RoleId, RoleClass soft-ref, availability flags, ability tags)
- `FRoleSwitchRequest` → `RequestSwitchRole()` → `FRoleSwitchResult`
- Concurrency protection: only one switch at a time (`IsSwitching()` check)
- On failure: rolls back to previous pawn state
- JS bridge (`Content/JavaScript/RoleManagement/`) mirrors these types and wraps the subsystem calls

`AHDPlayerController` listens to `OnActiveRoleChanged` to `Possess()` the new pawn. `OrderedRoleIds` on the controller defines the D-pad / number key switch order.

### RoleManager TS facade

`Content/JavaScript/RoleManagement/RoleManager.js` is the singleton TS wrapper around `URoleManagementSubsystem`. It handles all Puerts interop boilerplate:

- **Lazy subsystem acquisition**: tries `puerts.argv.getByName("GameInstance")` first, falls back to `SubsystemBlueprintLibrary.GetGameInstanceSubsystem()`, caches result
- **Delegate bridging**: binds C++ `OnRoleSwitchStarted/Completed/Failed/OnActiveRoleChanged` delegates and forwards them as global-scope EventBus events
- **Type marshaling**: converts TS `IRoleDefinition` ↔ C++ `FRoleDefinition` (RoleClassPath carried through ExtensionData), TS `IRoleSwitchResult` ↔ C++ `FRoleSwitchResult`
- **Late initialization**: `ensureSubsystem()` auto-retries if UE environment wasn't ready on first call

`RoleTypes.js` mirrors C++ enums (`ERoleSwitchState`, `ERoleSwitchFailReason`); `RoleEventTypes.js` defines the TS-side event name constants. `RoleSystemValidator.js` provides in-game integration tests for the full switch lifecycle.

### Event bus (scoped, instance-isolated)

`Content/JavaScript/Mixin/EventBus.js` is a custom pub-sub with these properties:

- **Scoped events**: each emitter has a `scope` (integer ID); subscribers filter by `ScopeFilter` (SELF, GLOBAL_ONLY, SELF_AND_GLOBAL, ANY, SPECIFIC)
- **Instance isolation**: `emitScoped("OnTick", emitterId=5, scope=5, [0.016])` only reaches subscribers whose scope filter includes emitter 5
- **Throttling**: `setScopedThrottle(eventName, subscriberId, intervalMs)` — per-subscriber, per-event rate limiting
- **Duplicate subscription protection**: same subscriber + same handler ref → auto-dedup
- **Instance validity checking**: `setInstanceValidator(fn)` — dead instances are silently skipped
- **Debug mode**: `setDebugMode(true)` logs all dispatch decisions

### LogicManager object pooling

`LogicManager` manages JS logic instances with an object pool per logic type. `registerLogicClass(typeName, LogicClass, poolConfig)` accepts `{maxSize, lazyInit, prewarmCount}`:

- `createLogic(typeName, owner)` — pulls from pool if available, otherwise instantiates; calls `logic.Init(owner)`, returns logicId
- `destroyLogic(logicId)` — calls `logic.Destroy()`, returns instance to pool if under `maxSize`
- `prewarm(typeName, count)` — pre-creates instances for non-lazy types
- LogicManager registers itself as the EventBus instance validator (`isLogicValid(id)` → skips dead instances during dispatch)

Pool recycling uses `logic.logicId = -1` as a sentinel for pooled instances.

### Input pipeline

```
EnhancedInput (InputAction) → ACharacterBase::SetupPlayerInputComponent()
  → Move(), Jump(), Dash(), Attack() on the possessed character
  → BlueprintImplementableEvent (e.g. OnAttackTriggered)
  → Blueprint forwards to TS logic layer
```

**UPlayerInputDataAsset** is the single source of truth for InputAction configuration. It lives on **AHDPlayerController::InputDataAsset**, not on individual characters.

### Combat ability system (composition pattern)

`Content/JavaScript/Ability/ComboAttackAbility.js` implements a 3-segment combo attack as a **self-contained state machine** designed for composition (not inheritance):

```
Idle → [tryAttack()] → Attack_N (Startup → Active → Recovery)
  → [combo window open + input] → Attack_N+1
  → [window close/timeout] → Cooldown → Idle
```

Each attack segment has three sub-phases: `Startup` (animation wind-up, uncancellable), `Active` (hit detection enabled), `Recovery` (hit detection ends, combo window opens). Between Recovery and window close, `tryAttack()` advances to the next segment; during Startup/Active, input is buffered if `allowInputBuffering` is enabled.

Blueprint animation notifies (AN_AttackX_HitStart, AN_AttackX_HitEnd, AN_AttackX_ComboWindowOpen, AN_AttackX_ComboWindowClose) drive the state machine via `notifyHitStart()/notifyHitEnd()/notifyComboWindowOpen()/notifyComboWindowClose()`. Callbacks (`onAttackStart`, `onHitStart`, `onComboEnd`, etc.) are injected at construction — the ability module has no direct knowledge of any specific character class.

`DashAbility.js` follows the same composition pattern. New abilities should follow this convention: constructor receives `getCharacter`, `configOverride`, and `callbacks`; state is driven by `tick(deltaTime)` and blueprint notification methods.

### Animation state sync engine

`Content/JavaScript/Anim/AnimStateSync.js` drives per-frame state synchronization from CharacterBase to the Animation Blueprint:

```
character.GetVelocity() + CharacterMovement.MovementMode
  → computeAnimState(character)  →  {isOnGround, isFalling, shouldMove, orientation, ...}
  → fieldMapper.applyState(animInstance, state)  →  writes to ABP variables (e.g. ShouldMove)
```

`AnimStateSyncContext` manages character-to-anim-instance binding via `WeakMap` (one context per ABP instance). `bind(characterObj, animInst)` validates and casts the character reference (using `tryCastToCharacterBase` with duck-typing checks). `tick()` guards against stale references — if character or anim instance becomes invalid, the context auto-unbinds. `CurrsorFieldMapper.applyState()` writes computed booleans into ABP variables (extensible for new animation parameters).

`computeAnimState()` uses numeric `EMovementMode` constants rather than Puerts enum values, since the enum type may be undefined at runtime. The `SPEED_THRESHOLD` of 3.0 cm/s prevents micro-movement jitter from triggering the walk animation.

### Coyote time

`ACharacterBase` implements coyote time (grace period for jump after leaving a platform). On `OnMovementModeChanged` from grounded to falling (non-jump-initiated), `bInCoyoteWindow` is set for `CoyoteTime` seconds (default 0.1s). During the window, `Jump()` temporarily sets movement mode back to `MOVE_Walking` so `Super::Jump()` passes `CanJump()`.

## File conventions

- Source files use Chinese comments alongside English code — this is intentional, not a localization issue
- JS files in `Content/JavaScript/` are compiled output (`*.js` + `*.js.map`). TypeScript source likely lives in a `TypeScript/` directory (referenced in README). Always check for `.ts` sources before editing `.js` directly.
- `Content/JavaScript/TEMP/` contains experimental / work-in-progress scripts — not production code
- Blueprint assets referenced from JS use paths like `/Game/Blueprints/Player/Currsor/Anim/ABP_Currsor.ABP_Currsor_C`

## Engine plugins

- **Puerts** (`Plugins/Puerts/`): V8 JS engine integration. Requires manual V8 prebuilt library download (`v8_9.4.146.24`). Debug mode enabled via `UCurrsorGameInstance::bDebugMode` (Chrome DevTools on port 8080).
- **PaperZD** (`Plugins/Marketplace/PaperZD_5.4/`): 2D character animation. `ACharacterBase` inherits from `APaperZDCharacter`.
- **LogViewerPro** (`Plugins/LogViewerPro/`): In-editor log viewer widget.

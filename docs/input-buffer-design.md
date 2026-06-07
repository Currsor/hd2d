# 预输入缓冲系统

## 问题

动作游戏中，玩家常常在上一动作完成前按下下一个动作。如果输入恰好落在不可接受的时间窗口，动作会被静默吞掉——手感断掉。

```
玩家操作:        跳跃中 ──── 落地前 0.1s 按攻击 → 想落地后立刻攻击
无缓冲:          攻击被吞 → 玩家困惑"我明明按了"
有缓冲:          落地后自动执行攻击 → 手感连贯
```

## 核心概念

**缓冲队列** —— 一个挂载在 `GenericComboFSM` 上的轻量队列，保存被拒绝但尚未超时的输入。当状态机进入可接受该输入的状态时，自动从队列中取出最早的有效条目并执行。

```ts
interface QueuedAction {
    action: string;      // "Attack" | "Jump" | "Dash" | ...
    timestamp: number;   // Date.now() 毫秒
}

const BUFFER_TTL_MS = 500;  // 缓冲有效期 0.5 秒
```

## 缓冲写入的触发点

不是所有被拒绝的输入都写入缓冲。只有当前状态 **不可立即处理** 该输入时才写入。

| 输入 | FSM 当前状态 | 行为 |
|---|---|---|
| Attack | Idle | 立即执行, 不缓冲 |
| Attack | Attacking, combo窗口内 | 立即推进下一段, 不缓冲 |
| Attack | Attacking, 不在combo窗口 | → **缓冲** |
| Jump | Idle | 立即执行 |
| Jump | Attacking, cancel窗口内, CancelTags含Jump | 立即打断 → Jump |
| Jump | Attacking, 不在cancel窗口内 或 CancelTags不含Jump | → **缓冲** |
| Dash | ... | 同理 Jump |

## 缓冲消费的触发点

| 触发点 | 消费条件 | 消费动作 |
|---|---|---|
| `onComboWindowOpen` | 队列中有 `"Attack"` 且 Transition 允许 OnInput | 取最早一个 Attack，推进到下一段 |
| `onCancelOpen` | 队列中有任何动作，且当前段 CancelTags 包含它 | 取最早一个合法动作，forceEnd，返回给 CurrsorLogic 执行 |
| `tryAttack` (Idle) | 队列中有 `"Attack"` 且 TTL 未过期 | 取最早一个 Attack，enterState(0) |
| 缓冲过期 | timestamp + TTL < now | 自动丢弃 |

## 优先级

不做隐式优先级。FIFO 队列保持输入时序的直觉——谁先按谁先出。特殊情况：

```
队列: [Attack(t=100), Jump(t=120)]

onCancelOpen 触发:
  遍历 queue → Attack 不在 CancelTags → 跳过
  → Jump 在 CancelTags → 消费, forceEnd → executeJump
  Attack 保留, 等待 combo 窗口

onCancelClose 触发:
  遍历 queue → Attack 不在 CancelTags → 跳过
  → 没有可消费项

下一个 idle 帧:
  tryAttack → 检查队列 → Attack 在, TTL 未过 → enterState(0)
```

## 完整数据流

```
玩家操作时间线:

t=0    按空格 (Jump)
t=0.02  按攻击 (Attack)  ← 稍晚一点

──────── 帧处理 ────────

CurrsorLogic.handleActiveInput(dt):
  1. onJump()
     → comboFSM.tryCancel("Jump", Date.now())
     → 当前 Idle → return true → executeJump()
     → JumpToNode("EnterJump")

  2. onAttack()
     → comboFSM.tryAttack(Date.now())
     → 当前 currentIdx < 0? 
     → 是 Idle? 否 (正在跳跃, currentIdx 未设置因为跳跃不走 FSM)
     
     等一下——跳跃不在 FSM 里。FSM 只管攻击。

──── 问题 ────

FSM 不知道跳跃在执行。跳跃是 CurrsorLogic + dashAbility 管的，不走 comboFSM。
所以 tryAttack 看到的 currentIdx 是 -1（FSM 在 Idle），认为可以攻击，
结果同时触发 attack → JumpToNode("Combo") → 覆盖跳跃动画。

这是bug。
```

## 关键设计：FSM 通过 activeTags 感知占用状态

`GenericComboFSM` 用 `activeTags: Set<string>` 替代简单的 busy 布尔值——任何动画独占的动作都设一个 Tag，

```ts
class GenericComboFSM {
    private activeTags: Set<string> = new Set();

    /** 动作开始时设 Tag */
    beginAction(tag: string): void { this.activeTags.add(tag); }

    /** 动作结束时清 Tag，空闲时自动消费缓冲中的 Attack */
    endAction(tag: string, now: number): void {
        this.activeTags.delete(tag);
        if (this.activeTags.size === 0 && this.currentIdx === -1) {
            const idx = this.buffer.findIndex(b => b.action === "Attack");
            if (idx >= 0 && this.cooldownRemaining <= 0) {
                this.buffer.splice(idx, 1);
                this.enterState(0);
            }
        }
    }

    get canAttack(): boolean {
        if (this.currentIdx !== -1) return false;
        if (this.cooldownRemaining > 0) return false;
        for (const t of this.activeTags) {
            if (t !== "Idle") return false;
        }
        return true;
    }
}
```

CurrsorLogic 在执行跳跃/冲刺等需要动画独占的动作时，调用 beginAction/endAction：

```ts
executeJump(): void {
    this.comboFSM.beginAction("Jump");
    // ...
}
onJumpEnd(): void {
    this.comboFSM.endAction("Jump", Date.now());
}
```

修正后的时间线：

```
t=0    onJump()
       → comboFSM.tryCancel("Jump") = true
       → executeJump()
       → comboFSM.beginAction("Jump")      ← activeTags = {"Jump"}

t=0.02 onAttack()
       → comboFSM.tryAttack()
       → canAttack = false (activeTags has "Jump")
       → bufferInput("Attack")             ← 缓冲

跳跃落地:
       → comboFSM.endAction("Jump")        ← activeTags = {}
       → endAction 中自动消费 buffer → "Attack" 在, TTL 未过期
       → enterState(0)
       → 攻击开始 ✓
```

## 最终架构

```
CurrsorLogic (输入接线)          GenericComboFSM (状态 + 缓冲)
───────────────────────          ─────────────────────────────
onAttack                          tryAttack(now)
  → tryAttack → 失败?              ├─ Idle + !busy → enterState(0)
  → buffer                          ├─ Combo窗口 → transition
                                    └─ 否则 → bufferInput

onJump / onDash                   tryCancel(action, now)
  → tryCancel → 成功?              ├─ Idle → true(!busy会自动设置)
    → execute                      ├─ Cancel窗口 + tag → forceEnd → true
    → notifyActionStart             └─ 否则 → bufferInput → false

动作结束                          notifyActionEnd(now)
  → notifyActionEnd                  → busy = false
                                     → 消费 buffer 中的最早有效 Attack
```

## 边缘情况处理

**同一帧两个输入：** EventBus 按订阅顺序触发，CurrsorLogic 的处理顺序就是输入的到达顺序。不合并、不排序。

**缓冲满溢：** 队列最大 3 条。超出时替换最旧的同类型（刷新），不同类型直接丢弃最旧的。

**状态切换清空缓冲：** `forceEnd()` 和 `reset()` 不清空缓冲——被打断后应该保留，因为打断可能是跳跃触发的而玩家还在期待攻击。`reset()` 清空（对象池复用）。

**缓冲欺骗：** 缓冲中的 Attack 不应该在 `onCancelOpen` 时被当成打断消费。`onCancelOpen` 只消费 Jump/Dash/Skill 类动作，`onComboWindowOpen` 消费 Attack。严格区分。

**跳跃和连击同时缓冲：** 队列 `[Attack, Jump]`。`onCancelOpen` → 消费 Jump → forceEnd → executeJump。Attack 留在队列。跳跃结束后 `endAction` → Attack 被消费。符合直觉。

---

## 接口简化 (v2)

`ComboFSMCallbacks` 从 4 个简化为 2 个：

```
v1: { onEnterState, onExitCombo, onSetHitData, onClearHitData }
v2: { onEnterState, onExitCombo }
```

碰撞数据不再通过回调传递。FSM 调 `Component.ActivateHit(idx)` 写运行时属性，蓝图 `OnOverlap` 读 `Component.bHitActive/ActiveDamage/...`。TS→蓝图的数据通路由 Component 承载。CurrsorLogic 不再需要 `(a as any)` 变量写入。

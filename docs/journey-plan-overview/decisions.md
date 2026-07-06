# 多步骤指引规划概览 — 决策日志

按时间倒序记录本次设计的关键决策（ADR 风格）。

## D-004: 双 UI 展示（Widget + 屏幕底部居中）

**日期**：2026-07-05
**状态**：已实现

### 背景

概览 UI 应该在哪里展示？

### 选项

A) **只在 widget 内**：简单，但 host 应用必须有自己的 widget 才能用
B) **只在屏幕底部居中**：SDK 自己渲染，独立于 host
C) **两者都有**：widget 内为主，SDK 渲染为兜底

### 决定

选择 **C) 两者都有**。

### 理由

1. **灵活性**：host 可以选择用 widget 集成，也可以用裸 SDK 集成
2. **用户体验**：用户在 widget 中输入目标后，概览出现在输入框附近更自然（widget 内为主）
3. **兜底价值**：SDK 渲染概览意味着即使不用 widget，也能完整使用 journey 功能

### 影响

工作量增加：需要写两套样式（widget 浅色 + SDK 深色），但代码复用率高（步骤列表渲染逻辑基本一致）。

## D-003: 新增 'previewing' 状态，而非复用 planning 状态

**日期**：2026-07-05
**状态**：已实现

### 背景

如何表达"已规划、待用户启动"的中间态？

### 选项

A) **复用 `planning` 状态 + 加 flag**：例如 `planning` + `awaitingUserStart = true`
B) **新增 `'previewing'` 状态**：明确表达"正在预览概览"

### 决定

选择 **B) 新增 'previewing' 状态**。

### 理由

1. **语义清晰**：previewing 直接说明当前在做什么（展示概览），未来加 telemetry 也容易分类
2. **避免误用 flag**：flag 模式容易遗漏检查（特别是新代码作者）
3. **未来可扩展**：未来如果要在 previewing 期间支持"重新规划"按钮，新状态更容易承接

### 影响

`JourneyStatus` 类型多一个 union 成员；`isActive` 加一个判断；`_cancel` 增加一行清理 overview。所有现有代码忽略新状态时不会出错（union 检查会编译报错提醒）。

## D-002: 抽出 `_planSteps()` 私有方法

**日期**：2026-07-05
**状态**：已实现

### 背景

`startSmart` 和 `startSmartWithPreview` 都需要"调 planJourney + 处理失败"的逻辑。

### 选项

A) **复制粘贴**：两份代码独立维护
B) **抽出 `_planSteps()`**：DRY

### 决定

选择 **B) 抽出 `_planSteps()`**。

### 理由

1. **避免 drift**：两份逻辑分头改很容易出现一边更新另一边没更新
2. **统一错误处理**：失败和 0 步的处理逻辑只在一处
3. **代码量小**：抽出方法只多几行（`_fail` 调用已经统一）

### 实现

```typescript
private async _planSteps(goal: string): Promise<JourneyStep[] | null> {
  let steps: JourneyStep[];
  try {
    await this.domScanner.refresh();
    const elements = this.domScanner.getElements();
    steps = await this.agentClient.planJourney(goal, ...);
  } catch (err) {
    console.warn('[ShowMeSDK] Smart journey planning failed:', err);
    this._fail('规划失败，请检查 Agent 服务');
    return null;
  }
  if (!steps.length) {
    this._fail('未能为该目标规划步骤');
    return null;
  }
  return steps;
}
```

`startSmart` 和 `startSmartWithPreview` 都先调它，然后决定下一步。

## D-001: JourneyOverview 独立组件，而非 JourneyPill 的新 phase

**日期**：2026-07-05
**状态**：已实现

### 背景

概览 UI 怎么实现？

### 选项

A) **JourneyPill 加新 phase**：复用 pill 容器，加 'previewing' / 'overview' 阶段
B) **新建独立组件 `JourneyOverview`**：单独一个 shadow-DOM 面板

### 决定

选择 **B) 新建独立组件**。

### 理由

1. **形态不同**：pill 是左下小药丸（status strip），overview 是底部居中宽面板（step list）。强行塞进 pill 容器会导致 DOM 结构和样式都扭曲
2. **生命周期不同**：pill 在执行期 mount/unmount，overview 在 previewing 期 mount/unmount。两者互相独立更干净
3. **SDK_OVERLAY_IDS 简化**：每个组件一个 ID，ProgressionDetector 的过滤逻辑直接基于 ID 判断

### 副作用

SDK 多了一个组件文件（约 230 LOC）。但避免了 pill 类膨胀到 1000+ LOC。

### 实现

```typescript
export class JourneyOverview {
  constructor(opts: {
    goal: string;
    steps: JourneyStep[];
    onStart: () => void;
    onCancel: () => void;
  });
  mount(): void;
  unmount(): void;
  setStarting(): void;  // 防双击
}
```

API 与 JourneyPill 对称：mount/unmount + 单一职责。
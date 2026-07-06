# 多步骤指引：先规划后执行（Plan Overview）

## 背景

ShowMeTheButton SDK 的多步引导（journey）功能当前行为：

1. 用户输入目标 → SDK 调 `POST /api/v1/journey/plan` 拿到完整步骤
2. **立刻自动执行** —— 光标飞向第 1 步，pill 显示"1/N"
3. 用户不知道要花多少步、要做什么

**用户反馈**："现在，多步骤指引是一步一步执行思考的，我认为需要一次性把 plan 规划出来给用户"

## 设计目标

- 用户输入目标 → 一次性规划所有步骤
- 弹概览面板展示步骤列表（编号 + 标题 + 描述）
- 用户**主动点"开始执行"**才进入分步执行

## 架构总览

```
                        用户输入目标
                              ↓
              ┌───────────────────────────────┐
              │ widget.submit()              │
              │ state='plan-overview'         │
              └───────────────┬───────────────┘
                              ↓
              ┌───────────────────────────────┐
              │ SDK.previewJourney(goal)     │
              │ - AgentClient.planJourney     │
              │ - status='previewing'         │
              │ - mount JourneyOverview       │
              └───────────────┬───────────────┘
                              ↓
              ┌───────────────────────────────┐
              │ UI 双重展示：                  │
              │ - widget 内：步骤列表 + 按钮  │
              │ - 屏幕底部居中：JourneyOverview│
              └───────────────┬───────────────┘
                              ↓
                       用户点"开始执行"
                              ↓
              ┌───────────────────────────────┐
              │ SDK.startPreviewedJourney()   │
              │ - unmount overview            │
              │ - _beginPill()                │
              │ - _runFixed(steps)            │
              └───────────────┬───────────────┘
                              ↓
                  逐步执行（pill 显示 1/N, 2/N, ...）
```

## 状态机

`JourneyRunner` 状态扩展：

```
                 startSmartWithPreview(goal)
                          │
                          ▼
                     planning
                  │    │    │
                  │    │    └─→ error (网络/0步)
                  │    │
                  │    └──→ cancelled (用户取消规划)
                  │
                  ▼ plan succeeded
              previewing ──────────────→ running
                  │                         │
                  ├── user Start ──────────→│
                  └── user Cancel ─────────→│
                                            │
                                  (后续 _runFixed 流程)
```

新增状态：`'previewing'`（已规划，等待用户 Start）

新增字段：`JourneyState.plan?: JourneyStep[]`（仅 previewing 时填充）

新增 SDK 方法：
- `previewJourney(goal, onState?) → Promise<JourneyStep[] | null>`
- `startPreviewedJourney() → Promise<void>`

新增 runner 方法：
- `startSmartWithPreview(goal): Promise<JourneyStep[] | null>`
- `startPreviewedJourney(): Promise<void>`
- `_planSteps(goal): Promise<JourneyStep[] | null>` —— 抽出的规划逻辑

## 双 UI 展示

概览信息**同时**出现在两个地方：

### 1. Widget 内（widget 自身渲染）

- 在 widget 右下面板里，列出所有步骤
- 提供"▶ 开始执行 (N 步)"和"再想想"按钮
- 沿用 widget 自身的浅色玻璃风格

### 2. 屏幕底部居中（SDK 渲染）

- 新组件 `JourneyOverview`，shadow DOM 隔离
- 深色玻璃风格 + 紫色渐变 + 编号圆圈
- 同样有"开始执行"按钮（fallback，确保即使 widget 关闭也能启动）

为什么不只用一个？

- **Widget 内**：用户当前正在交互的容器，已经有焦点和上下文
- **底部居中 SDK 渲染**：兜底方案。如果 host 应用没用 widget（例如集成在别的框架里），SDK 仍能展示概览

## 关键代码改动

| 文件 | 改动 |
|------|------|
| [JourneyRunner.ts](https://github.com/HCOG/ShowMeTheButton/blob/main/show-me-sdk/packages/core/src/journey/JourneyRunner.ts) | +status 'previewing'、+state.plan、+SDK_OVERLAY_IDS、抽 `_planSteps`、重写 `startSmart`、新增 `startSmartWithPreview`/`startPreviewedJourney`、更新 `_cancel` |
| [JourneyOverview.ts](https://github.com/HCOG/ShowMeTheButton/blob/main/show-me-sdk/packages/core/src/journey/JourneyOverview.ts) | **新建**，宽面板底部居中渲染 |
| [sdk.ts](https://github.com/HCOG/ShowMeTheButton/blob/main/show-me-sdk/packages/core/src/sdk.ts) | +`previewJourney` / `startPreviewedJourney` 公开 API |
| [show-me.service.ts](https://github.com/HCOG/ShowMeTheButton/blob/main/angular-demo/src/app/services/show-me.service.ts) | +`previewJourney` / `startPreviewedJourney` 服务层包装 |
| [show-me-widget.component.ts](https://github.com/HCOG/ShowMeTheButton/blob/main/angular-demo/src/app/components/show-me-widget/show-me-widget.component.ts) | +`plan-overview` 状态、`plannedSteps`/`planGoal` 字段、`startPlannedJourney`/`cancelPlannedJourney` 方法、改造 `submit()` 的 journey 分支 |
| [show-me-widget.component.html](https://github.com/HCOG/ShowMeTheButton/blob/main/angular-demo/src/app/components/show-me-widget/show-me-widget.component.html) | +plan-overview 分支模板 |
| [show-me-widget.component.scss](https://github.com/HCOG/ShowMeTheButton/blob/main/angular-demo/src/app/components/show-me-widget/show-me-widget.component.scss) | +步骤列表 + actions 样式 |

## 复用的现有代码

- `AgentClient.planJourney()` —— 已存在，直接调用
- `JourneyPill` —— 不修改，仅在执行期挂载
- `_runFixed` / `_executeStep` / `ProgressionDetector` —— 完全不动
- `TargetRing` 紫色渐变 —— JourneyOverview 复用同一调色板

## 向后兼容性

- `startSmart(goal)` —— **行为不变**（自动执行）
- `startIterativeJourney()` —— **行为不变**（跨页迭代）
- `startJourney(config)` —— **行为不变**（预定义步骤）
- `guide()` —— **行为不变**（widget 现在会从 guide 走进 preview，但其他调用方不变）

唯一的对外新增：`previewJourney()` / `startPreviewedJourney()` + `JourneyStatus` 加了 `'previewing'` + `JourneyState` 加了可选 `plan` 字段。

## 设计/决策文档

- [decisions.md](./decisions.md) —— 关键 ADR 记录
- [testing.md](./testing.md) —— 端到端测试记录

## 关联 PR

（待提交）
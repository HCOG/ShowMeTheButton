# 多步骤指引：先规划后执行（Plan Overview）

本目录记录"用户输入目标 → 一次性规划所有步骤 → 弹概览面板 → 用户主动开始"的设计文档。

## 文件清单

| 文件 | 内容 |
|------|------|
| [design.md](./design.md) | 完整设计：架构图、状态机、关键代码改动、双 UI 展示说明 |
| [decisions.md](./decisions.md) | 4 条 ADR：双 UI、previewing 状态、抽出 _planSteps、overview 独立组件 |
| [testing.md](./testing.md) | 端到端测试记录：4 个核心场景 + 5 个边界场景 |

## 问题一句话总结

智能光标在多步骤引导中是"自动执行"，用户无法预知要做什么、花多少步。修复后：用户输入目标 → 一次性规划 → 弹概览面板（双 UI：widget 内 + 屏幕底部）→ 用户点"开始执行"才进入分步执行。

## 关键改动文件

| 文件 | 类型 |
|------|------|
| `show-me-sdk/packages/core/src/journey/JourneyRunner.ts` | 改 |
| `show-me-sdk/packages/core/src/journey/JourneyOverview.ts` | **新建** |
| `show-me-sdk/packages/core/src/sdk.ts` | 改 |
| `angular-demo/src/app/services/show-me.service.ts` | 改 |
| `angular-demo/src/app/components/show-me-widget/show-me-widget.component.ts` | 改 |
| `angular-demo/src/app/components/show-me-widget/show-me-widget.component.html` | 改 |
| `angular-demo/src/app/components/show-me-widget/show-me-widget.component.scss` | 改 |

## 测试结果

✅ 概览面板显示
✅ 取消路径
✅ 正常执行路径
✅ 单元素查询回归不受影响

详见 [testing.md](./testing.md)。
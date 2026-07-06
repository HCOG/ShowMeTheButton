# 智能光标锁定行为

本目录记录 ShowMeTheButton 智能光标"飞向目标后锁定"行为的设计文档。

## 文件清单

| 文件 | 内容 |
|------|------|
| [design.md](./design.md) | 完整设计文档：背景、目标、解决方案、代码实现 |
| [decisions.md](./decisions.md) | 关键决策日志（ADR 风格），记录每个选择的选项和理由 |
| [testing.md](./testing.md) | 测试验证记录：实测步骤、结果、边界条件 |

## 问题一句话总结

智能光标在飞向目标后，用户移动鼠标会把它拽回鼠标位置。修复后光标在动画完成时锁定在目标，鼠标移动被忽略，直到显式调用 `sdk.releaseCursor()` 释放。

## 关键改动文件

- `show-me-sdk/packages/core/src/cursor/CursorEngine.ts` — 增加 `isStuck` 标志和 `release()` 方法
- `show-me-sdk/packages/core/src/sdk.ts` — 暴露 `releaseCursor()` SDK API

## 关联 PR

[HCOG/ShowMeTheButton#1](https://github.com/HCOG/ShowMeTheButton/pull/1) — fix(cursor): lock cursor at destination after flyTo animation
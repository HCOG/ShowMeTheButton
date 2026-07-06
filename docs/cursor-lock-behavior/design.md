# 智能光标锁定行为设计

## 背景

智能光标（Smart Cursor）是 ShowMeTheButton SDK 的核心交互组件。它的主要职责是：
1. 激活时跟随用户鼠标移动
2. 当用户进行自然语言查询后，平滑飞向匹配到的目标元素
3. 悬停在目标上展示功能说明 tooltip

## 问题描述

在本次修复之前，光标在飞向目标后存在一个体验问题：

**用户报告**："智能光标在飞向正确的地方后会一直停留在那吗？假如说用户移动鼠标，这个光标不应该飞回跟随"

### 问题原因分析

`CursorEngine.ts` 的 `handleMouseMove` 方法没有任何动画状态检查：

```typescript
private handleMouseMove(event: MouseEvent): void {
  if (!this.cursorElement || !this.config.followMouse) return;
  this.cursorElement.style.left = `${event.clientX + this.config.offsetX}px`;
  this.cursorElement.style.top = `${event.clientY + this.config.offsetY}px`;
}
```

这导致：
- **动画进行中**：用户的鼠标移动会立即把光标拽回鼠标位置，动画失去意义
- **动画结束后**：鼠标移动会让光标从目标位置跳走，丢失"指向目标"的语义

## 设计目标

| 阶段 | 期望行为 | 鼠标移动处理 |
|------|----------|--------------|
| 空闲 / 跟随模式 | 光标跟随鼠标 | 立即响应 |
| 飞向目标动画中 | 光标平滑飞向目标 | **忽略** |
| 悬停在目标上 | 光标锁定在目标 | **忽略**（保持指示语义） |

## 解决方案

### 状态机设计

引入两个互不冲突的状态标志：

```typescript
private isAnimating = false;  // 动画进行中
private isStuck = false;      // 锁定在目标（动画完成后）
```

### 状态转换

```
       flyTo()                  动画完成
   ┌─────────────┐         ┌──────────────┐
   │             │         │              │
   ▼             │         ▼              │
 idle ────────► animating ────────► stuck │
                                          │
                                          │ releaseCursor()
                                          ▼
                                        idle
```

### 代码实现

**`CursorEngine.ts` 的修改**：

```typescript
// 新增字段
private isAnimating = false;
/** When stuck, cursor stays at destination and ignores mouse movement. */
private isStuck = false;

// handleMouseMove 增加检查
private handleMouseMove(event: MouseEvent): void {
  if (!this.cursorElement
      || !this.config.followMouse
      || this.isAnimating
      || this.isStuck) {  // ← 新增
    return;
  }
  this.cursorElement.style.left = `${event.clientX + this.config.offsetX}px`;
  this.cursorElement.style.top = `${event.clientY + this.config.offsetY}px`;
}

// flyTo 状态转换
async flyTo(target: HTMLElement, duration = 800): Promise<void> {
  // ...
  this.isAnimating = true;
  this.isStuck = false; // 清除之前的锁定
  try {
    await this.animate(startX, startY, targetX, targetY, duration);
    this.currentTarget = target;
  } finally {
    this.isAnimating = false;
    this.isStuck = true; // ← 动画结束后锁定
  }
}

// 释放锁定
release(): void {
  this.isStuck = false;
}
```

**`sdk.ts` 暴露 SDK API**：

```typescript
/** Release the cursor from its stuck position so it resumes following the mouse. */
releaseCursor(): void {
  this.cursorEngine.release();
}
```

## 调用方影响

### 现有调用方

`sdk.ts` 的 `guide()` 方法会调用 `cursorEngine.flyTo(target)`，现在飞向完成后光标会自动锁定：
- 用户移动鼠标 → 光标不响应 ✓
- 单次查询的语义保持完整 ✓

### Journey（多步引导）

`JourneyRunner` 在每个步骤之间调用 `flyTo`。新的锁定行为对 journey 的影响：
- 每个步骤目标明确指示，不会被鼠标干扰
- 下一步骤的 `flyTo` 调用会自动清除 `isStuck`，进入新的动画周期

### 如何恢复鼠标跟随

需要恢复时（例如用户希望自己浏览页面），调用：

```typescript
sdk.releaseCursor();
```

## 验证

通过 Chrome DevTools MCP 在 Angular demo 上实测：

```
positions: [
  { time: 0,    left: "85px",   isStuck: false },  // 动画开始
  { time: 1000, left: "314px",  isStuck: false },  // 动画进行
  { time: 1800, left: "336px",  isStuck: true  },  // 动画结束，立即锁定
  { time: 2200, left: "336px",  isStuck: true  }   // 鼠标移动后，光标保持
]
afterMouseMove: { left: "336px" }  // 鼠标在 (100,100) 但光标不动 ✓
```

## 意外发现：Angular AOT 编译

测试过程中发现 Angular 应用的 ng serve 在第一次重启前缓存了旧版本的 SDK。表现：
- 私有字段 `isAnimating`/`isStuck` 在 JS 控制台读取时返回 `undefined`
- 但行为与新代码一致

**解决方法**：清空 `angular-demo/.angular/cache` 并重启 ng serve。

这不是代码问题，只是开发环境的 dev server 缓存机制。如果未来修改了 SDK 源码后没看到效果，记得重启 Angular dev server。

## 决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 动画中是否忽略鼠标 | A) 忽略 / B) 跟随 | A) 忽略 | 动画目标是明确的，鼠标干扰会破坏动画语义 |
| 动画后是否锁定 | A) 锁定 / B) 恢复跟随 | A) 锁定 | 用户提出明确要求："飞向正确的地方后会一直停留在那" |
| 锁定后如何恢复 | A) 自动超时 / B) 显式调用 | B) 显式调用 | 让调用方完全控制何时释放，更灵活 |
| 是否增加超时自动解锁 | A) 是 / B) 否 | B) 否 | 当前没看到需求，避免引入隐式行为 |
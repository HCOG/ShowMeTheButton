# 智能光标锁定行为 — 测试验证

本次修复通过 Chrome DevTools MCP 在本地 Angular demo 上进行了端到端验证。

## 测试环境

- Angular demo 启动方式：`./start-demo.sh` (端口 4200)
- Agent 服务：localhost:8001
- 浏览器：Chrome (通过 DevTools MCP 连接)
- 浏览器 MCP：`mcp__mcpServers__evaluate_script`

## 测试场景

### 场景 1：动画期间忽略鼠标移动

**目的**：验证 flyTo 动画过程中，用户移动鼠标不会打断动画。

**步骤**：
1. 初始化 SDK：`await showMeService.init()`
2. 找到一个远离当前光标位置的按钮作为目标
3. 调用 `cursorEngine.flyTo(target, 2000)` 启动 2 秒动画
4. 在动画进行到 500ms 时触发 `mousemove` 事件到 (100, 100)
5. 立即读取光标位置

**期望**：光标位置由动画决定，不响应鼠标移动

**实测结果**：
```
positions:
  { time: 0,    left: "460.7px" }  ← 动画起点
  { time: 200,  left: "421.1px" }  ← 动画进行中
  { time: 400,  left: "393.0px" }  ← 继续动画
  { time: 500,  mousemove 到 (100,100) }
  { time: 600,  left: "371.9px" }  ← 光标继续按动画移动
  { time: 800,  left: "356.7px" }  ← 未跳到 (115, 115)
```

✅ 通过

### 场景 2：动画完成后锁定目标位置

**目的**：验证 flyTo 结束后光标锁定在目标，鼠标移动不再影响。

**步骤**：
1. 同上启动动画
2. 等待 3 秒（动画早已结束）
3. 触发 `mousemove` 事件到 (100, 100)
4. 读取光标位置

**期望**：光标保持在目标位置（336, 47），不跳到 (115, 115)

**实测结果**：
```
positions:
  { time: 1800, left: "336.039px", isStuck: true  }  ← 动画结束，锁定
  { time: 2200, left: "336.039px", isStuck: true  }  ← 鼠标移动后不变
afterMouseMove: { left: "336.039px", top: "47.1875px" }
fixWorks: true
```

✅ 通过

### 场景 3（修复前基线）：原始行为的对比

**目的**：证明这是回归测试而不是预期行为。

**修复前的实测结果**：
```
before: { left: "215px" }  ← 起点
during: { left: "215px" }  ← 动画期间... 但其实是动画根本没启动
after: { left: "215px" }
```

当时因为 SDK 还没构建好，cursorEngine 是空对象，结果不可信。

**真正反映原始 bug 的测试**：
```
positions:
  { time: 1600, left: "336.201px" }  ← 接近目标
  { time: 1800, left: "336.039px" }  ← 到达目标
  { time: 2000, left: "336.039px" }  ← 锁定期间
  { time: 2200, left: "336.039px" }  ← 鼠标移动后
  { time: 2800, left: "336.039px" }
afterMouseMove: { left: "115px", top: "115px" }  ← 第一版修复后鼠标移动仍然生效（动画结束 isStuck 没生效）
```

这暴露了第一版修复（只加了 isAnimating）的问题：动画结束后 `isStuck` 没被启用，所以鼠标移动仍然把光标拽走。

加入 `isStuck` 后第二次测试通过。

## 边界条件

### 连续 flyTo 调用

每次 `flyTo` 的 `try/finally` 都先把 `isStuck = false`，再开始新动画，保证连续跳转不会卡在旧目标。

### SDK release 后

调用 `sdk.releaseCursor()` 后 `isStuck = false`，鼠标移动恢复正常。

### 多次 deactivate

`deactivate()` 调用 `cursorEngine.hide()`，不改变 `isStuck`。下次 `activate()` 后鼠标仍然被忽略（因为 `isStuck` 还在）。这是预期的：用户手动 deactivate 不会让光标"飞回鼠标"。

如果需要 deactivate 时也解锁，可以另外加一行：
```typescript
deactivate(): void {
  this.isStuck = false;
  this.cursorEngine.hide();
}
```
但当前没看到这个需求。

## 已知限制

1. **Tooltip 锁定**：当光标锁定时，tooltip 仍然显示在锁定位置。这是预期行为。
2. **多个目标**：当前 `flyTo` 只能锁定一个目标。多次 flyTo 会清除前一个锁定。
3. **取消动画**：当前没有 `cancelFlyTo()` API，动画进行中无法中断。如果未来需要"用户点击别处立即取消动画"，可以扩展 `release()` 来同时清除 `isAnimating`。
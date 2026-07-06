# 多步骤指引规划概览 — 端到端测试记录

## 测试环境

- 启动方式：手动启动 agent + ng serve（之前 `start-demo.sh` 因 ng 首次构建超过 120s 超时）
- Agent: localhost:8001
- Angular demo: localhost:4200
- 浏览器: Chrome via DevTools MCP

## 测试场景

### 场景 1: 概览面板显示

**目的**：输入多步骤目标，确认概览面板出现

**步骤**：
1. 打开 http://localhost:4200/button-hell
2. 点击右下角 🎯 打开 widget
3. 输入 "我想完成添加新报表到系统并导出的整个流程"
4. 点击"查找"

**实测**：
- 短暂出现左下角 pill："🤖 正在规划步骤…"（planning 阶段）
- 规划完成后 pill 卸载
- **同时出现两个概览 UI**：
  - 屏幕底部居中：深色玻璃面板，标题"📋 已为你规划 5 步"，5 个步骤行，每行有编号圆圈 + 标题 + 描述，"▶ 开始执行 (5 步)" + "随时可以取消"
  - Widget 内：浅色，5 个步骤列表 + "▶ 开始执行 (5 步)" + "再想想"
- Pill 此时未显示 ✓

**实测截图**：步骤 1-5 完整渲染，包括"点击新建报表"、"填写报表信息"、"保存报表"、"生成报表"、"导出报表"

✅ **通过**

### 场景 2: 取消路径

**目的**：用户在概览期点"再想想"，确认取消并清理

**步骤**：
1. 重复场景 1 步骤 1-4
2. 点 widget 内的"再想想"

**实测**：
- `document.getElementById('smt-journey-overview')` → null（已卸载）
- `document.getElementById('smt-journey-pill')` → null（已卸载）
- Widget 状态：`'expanded'`（回到输入态）

✅ **通过**

### 场景 3: 正常执行路径

**目的**：用户在概览期点"开始执行"，确认 pill 接管执行

**步骤**：
1. 输入 "我想查看和编辑销售报表"
2. 概览显示 3 步
3. 点"▶ 开始执行 (3 步)"

**实测**：
- JourneyOverview 卸载 ✓
- Pill 挂载：显示 "1/3" + "进入报表中心" + "👆 请执行操作" + "完成 ✓"
- Widget 关闭（回到 collapsed）

✅ **通过**

### 场景 4: 单元素查询回归（不受影响）

**目的**：单步骤查询仍然走原有 result/confirm 流程，不走概览

**步骤**：
1. 输入 "添加按钮"（明确单元素）
2. 查找

**实测**：
- 返回 `type: 'single'`（不是 journey）
- Widget 显示 result 状态："✅ 用户请求明确提到'添加按钮'..." + "匹配度：95%"
- 光标锁定到 "➕ 添加" 按钮上（紫色圆点）
- Pill 不显示

✅ **通过**

## 边界场景（未完整测试，但代码逻辑覆盖）

### 边界 1: 规划失败（agent 不可用）

`_planSteps()` catch → `_fail('规划失败，请检查 Agent 服务')` → status='error' → widget 显示 error 状态

### 边界 2: 规划返回 0 步

`_planSteps()` 检测 `!steps.length` → `_fail('未能为该目标规划步骤')` → status='error'

### 边界 3: 双击 Start 按钮

`startPreviewedJourney()` guard：`if (this._st() !== 'previewing') return` 第二次调用 no-op
另外 JourneyOverview `setStarting()` 视觉禁用按钮

### 边界 4: 规划期间取消

`_cancel()` 在 `_planSteps` await 期间被触发 → status='cancelled' → startSmartWithPreview 检查 `this._st() !== 'planning'` 提前 return

### 边界 5: 概览期间页面导航

Overview 在 `document.body` 下，不会被 SPA 路由卸载。步骤可能失效（用户可取消）

## 验证通过的功能

- [x] 规划阶段显示 pill
- [x] 规划完成切换到概览状态（pill 卸载）
- [x] Widget 内概览 UI 显示
- [x] 底部居中 JourneyOverview 显示
- [x] 取消按钮清理所有 overlay
- [x] "开始执行"切换到执行期 pill
- [x] 单元素查询路径不受影响
- [x] `_planSteps` 错误处理（通过代码 review 确认）
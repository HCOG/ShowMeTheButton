# ShowMe SDK 开发计划

## 目标
开发一个前端SDK，实现DOM扫描、光标导航、动画引擎等核心功能

## 实施步骤

### 1. 创建项目结构
- 创建 `show-me-sdk/packages/core/` 目录
- 初始化 package.json
- 配置 TypeScript 编译选项
- 设置构建工具（Vite/Rollup）

### 2. 实现核心模块

#### 2.1 事件总线（EventBus）
- 发布-订阅模式
- 支持事件监听、触发、取消
- 单例模式

#### 2.2 DOM扫描器（DOMScanner）
- 扫描可交互元素（按钮、链接、表单等）
- 收集元素元数据（位置、标签、类型）
- 支持 Shadow DOM 递归扫描
- MutationObserver 监听DOM变化

#### 2.3 光标引擎（CursorEngine）
- 创建光标DOM元素
- 跟随鼠标模式
- 导航模式（飞向目标）
- 悬停提示
- Shadow DOM 隔离

#### 2.4 动画引擎（AnimationEngine）
- requestAnimationFrame 动画
- 缓动函数（easeOutCubic）
- 路径动画
- 悬停效果

#### 2.5 Agent客户端（AgentClient）
- HTTP/WebSocket 连接Agent服务
- 发送查询请求
- 接收定位结果
- 支持轮询任务状态

#### 2.6 定位引擎（LocatorEngine）
- 匹配算法
- 模糊搜索
- 优先级排序

### 3. 集成测试
- Angular Demo 集成SDK
- 端到端测试

### 4. 文档
- TypeDoc 文档
- 使用示例
- API 文档

## 技术栈
- TypeScript
- Vite/Rollup
- RxJS（可选）

## 验收标准
- SDK 可以扫描页面元素
- 光标可以飞向目标元素
- 支持 Angular 集成

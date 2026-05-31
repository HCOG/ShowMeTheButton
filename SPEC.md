# ShowMeTheButton - 智能UI导航助手

## 1. 项目概述

### 1.1 项目定位
一款面向**企业客户**的智能UI导航工具，帮助用户在使用复杂网页软件时，通过自然语言（语音/文本）快速定位目标UI组件。

### 1.2 核心价值
- **降低学习成本**：用户无需阅读完整手册，通过自然对话即可找到功能入口
- **提升用户体验**：直观的光标导航替代繁琐的文字指引
- **企业知识复用**：将散落的用户手册、操作指南整合为可交互的智能助手

### 1.3 目标用户画像
- 企业内部员工使用ERP、CRM等复杂系统
- SaaS平台为新用户提供实时引导
- 客服场景中快速定位用户问题对应的功能

---

## 2. 核心功能

### 2.1 光标替身系统
- 🖱️ **跟随模式**：光标替身实时跟随用户鼠标移动
- 🎯 **导航模式**：接收到目标指令后，智能飘移到目标UI组件
- ⏸️ **悬停提示**：到达目标后自动悬停，并显示功能说明
- 🔄 **返回模式**：用户确认后，光标返回原位置

### 2.2 自然语言交互
- **语音输入**：支持麦克风实时语音识别
- **文本输入**：支持手动输入搜索描述
- **多轮对话**：支持追问和澄清意图
- **反馈机制**：用户可确认/否认定位结果

### 2.3 智能定位引擎
- **DOM元素扫描**：自动标记页面中所有可交互元素
- **语义匹配**：理解用户描述并匹配最相关的组件
- **模糊搜索**：支持近似描述（如"那个红色的按钮"）
- **优先级排序**：考虑元素可见性、位置、功能类型等因素

### 2.4 本地Agent系统
- **意图理解**：解析用户的自然语言请求
- **知识检索**：从RAG知识库中检索相关操作指南
- **决策推理**：确定最合适的UI组件作为目标
- **完全本地运行**：无需网络，保护企业隐私

### 2.5 RAG知识库
- **文档导入**：支持PDF、Markdown、HTML等格式的用户手册
- **智能分块**：自动将文档切分为可检索的知识片段
- **向量存储**：使用本地向量数据库存储知识向量
- **定期更新**：支持增量更新知识库内容

---

## 3. 技术架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     企业客户应用                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              业务系统（你的软件）                   │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│          ┌──────────────┴──────────────┐               │
│          ▼                             ▼               │
│  ┌─────────────────┐         ┌─────────────────┐       │
│  │   前端SDK       │         │   知识库文件     │       │
│  │  (show-me-sdk)  │         │  (手动/PDF/MD)   │       │
│  └────────┬────────┘         └────────┬────────┘       │
│           │                           │               │
└───────────┼───────────────────────────┼───────────────┘
            │                           │
            ▼                           ▼
┌───────────────────────┐     ┌───────────────────────┐
│     前端运行环境       │     │     本地Agent服务      │
│  ┌─────────────────┐  │     │  ┌─────────────────┐  │
│  │ 光标组件        │  │     │  │ RAG检索引擎      │  │
│  │ 语音识别        │  │     │  │ 向量数据库       │  │
│  │ DOM扫描器       │  │     │  │ 本地LLM         │  │
│  │ 动画引擎        │  │     │  │ 意图识别        │  │
│  └─────────────────┘  │     │  └─────────────────┘  │
└───────────────────────┘     └───────────────────────┘
```

### 3.2 核心组件

| 组件名称 | 技术选型 | 职责 |
|---------|---------|------|
| **show-me-sdk** | TypeScript | 前端SDK，封装光标、语音、DOM功能 |
| **show-me-agent** | Python/Node.js | 本地Agent服务，处理RAG和LLM推理 |
| **show-me-vector** | ChromaDB/SQLite | 本地向量数据库 |
| **show-me-core** | - | 核心引擎，处理定位逻辑 |

---

## 4. 前端SDK设计（show-me-sdk）

### 4.1 核心模块

```typescript
// SDK 模块结构
show-me-sdk/
├── core/
│   ├── cursor.ts        // 光标管理
│   ├── dom-scanner.ts   // DOM扫描
│   └── locator.ts       // 定位引擎
├── input/
│   ├── voice.ts         // 语音识别
│   └── text.ts          // 文本输入
├── ui/
│   ├── cursor-avatar.ts  // 光标替身UI
│   └── tooltip.ts       // 悬停提示
└── agent/
    └── client.ts        // Agent通信
```

### 4.2 初始化流程

```typescript
import { ShowMeSDK } from 'show-me-sdk';

const showMe = new ShowMeSDK({
  agentEndpoint: 'http://localhost:3001', // 本地Agent地址
  knowledgeBase: 'user-manual', // 知识库标识
  language: 'zh-CN',
  voiceEnabled: true,
  cursorStyle: 'default' // 可自定义
});

showMe.init(); // 初始化
showMe.activate(); // 激活（可随时开关）
```

### 4.3 DOM元素标记策略

#### 3.1 自动标记规则

```typescript
// 自动扫描的可交互元素类型
const INTERACTIVE_SELECTORS = [
  // 表单元素
  'button:not([disabled])',
  '[role="button"]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'a[href]',
  
  // 语义元素
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="menu"]',
  
  // 常见UI框架
  '.btn', '.button',
  '[class*="btn"]',
  '[class*="button"]',
  
  // 图标按钮
  '[class*="icon"]',
  'i[class*="icon"]',
];

// 元素属性增强
interface MarkedElement {
  id: string;
  element: HTMLElement;
  bounds: DOMRect;
  label: string;           // 自动生成或从aria-label获取
  description: string;     // 元素描述
  priority: number;        // 匹配优先级
  metadata: {
    type: 'button' | 'input' | 'link' | 'menu' | 'other';
    icon?: string;         // 图标类名
    text?: string;         // 按钮文字
    disabled?: boolean;
  };
}
```

#### 3.2 非侵入式实现

**方式一：Shadow DOM隔离**
```typescript
// SDK在页面中注入Shadow Root，所有增强都在内部
class ShowMeContainer extends HTMLElement {
  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `<div id="cursor-layer"></div>`;
    
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
}
```

**方式二：CSS变量覆盖**
```typescript
// 不修改原应用样式，只在SDK层添加样式
:host {
  --smt-cursor-size: 24px;
  --smt-tooltip-bg: rgba(0, 0, 0, 0.85);
  pointer-events: none; // 不阻挡原应用交互
}
```

---

## 5. 后端Agent设计

### 5.1 Agent工作流程

```
用户输入 → 意图识别 → RAG检索 → 上下文构建 → LLM推理 → 定位指令 → 前端执行
```

### 5.2 模块设计

```python
# Agent 服务架构
show_me_agent/
├── server.py              # API服务
├── intent/
│   ├── recognizer.py      # 意图识别
│   └── classifier.py      # 意图分类
├── rag/
│   ├── embeddings.py      # 向量化模型
│   ├── retriever.py       # 检索器
│   └── ranker.py          # 重排序
├── llm/
│   ├── local_llm.py       # 本地LLM调用
│   └── prompt.py          # 提示词管理
└── locator/
    ├── analyzer.py        # UI分析
    └── instruction.py     # 定位指令生成
```

### 5.3 API接口

```yaml
POST /api/v1/query
Content-Type: application/json

Request:
{
  "query": "我想导出这个报表为PDF",
  "context": {
    "page_url": "https://...",
    "marked_elements": [
      {"id": "btn-1", "label": "导出", "type": "button"},
      {"id": "btn-2", "label": "打印", "type": "button"}
    ]
  },
  "history": []  # 可选的对话历史
}

Response:
{
  "success": true,
  "result": {
    "target_id": "btn-1",
    "confidence": 0.92,
    "reasoning": "根据操作手册第3.2节，导出功能在报表页面顶部导航栏...",
    "suggestion": "点击【导出】按钮后，会弹出格式选择对话框..."
  }
}
```

---

## 6. RAG知识库方案

### 6.1 知识库结构

```
knowledge-base/
├── docs/                  # 原始文档
│   ├── user-guide.pdf
│   ├── api-doc.md
│   └── faq.json
├── processed/            # 处理后的知识块
│   └── chunks.json
└── vectors/              # 向量索引
    └── chroma/
```

### 6.2 文档处理流程

```python
# 知识库导入流程
1. 文档解析 → 提取文本内容
2. 智能分块 → 按章节/段落切分（chunk_size: 500 tokens）
3. 向量化 → 使用本地embedding模型
4. 存储 → 保存到ChromaDB
5. 索引 → 构建倒排索引加速检索
```

### 6.3 企业适配

```typescript
// 企业自定义知识库
interface KnowledgeBaseConfig {
  sources: {
    type: 'local' | 'api' | 'cms';
    path?: string;
    url?: string;
    refreshInterval?: number; // 自动刷新间隔
  };
  
  preprocessing: {
    language: 'zh' | 'en' | 'multi';
    chunkStrategy: 'fixed' | 'semantic';
    chunkSize: number;
  };
}
```

---

## 7. 集成方式

### 7.1 企业集成选项

| 方式 | 说明 | 侵入性 |
|-----|------|--------|
| **npm包** | `npm install show-me-sdk` | 低 |
| **CDN引入** | `<script src="...">` | 低 |
| **iframe隔离** | 在iframe中运行 | 中 |
| **浏览器扩展** | Chrome扩展形式 | 无 |
| **企业内网部署** | 完全本地化部署 | - |

### 7.2 企业SDK配置示例

```typescript
// 企业级配置
const showMe = new ShowMeSDK({
  // Agent服务（企业内网部署）
  agentEndpoint: 'http://ai-helper.internal.company.com:3001',
  
  // 知识库配置
  knowledgeBase: {
    id: 'erp-user-manual-v2',
    version: '2.3.1',
    // 可以指定多个知识库
    sources: [
      { type: 'local', path: '/docs/manual.pdf' },
      { type: 'api', url: 'https://help.internal.com/api/v1/kb' }
    ]
  },
  
  // UI定制
  appearance: {
    cursorAvatar: '/company-logo-cursor.png',
    theme: 'dark', // 或 'light' | 'auto'
    tooltipStyle: 'minimal' // 或 'detailed'
  },
  
  // 权限控制
  permissions: {
    voiceEnabled: true,
    autoActivate: false, // 用户主动开启
    departmentFilter: ['sales', 'support'] // 部门限制
  }
});
```

---

## 8. 隐私与安全

### 8.1 本地优先原则
- 所有RAG检索和LLM推理都在本地执行
- 不上传用户操作数据到云端
- 知识库文件存储在企业本地

### 8.2 数据隔离
- 每个企业有独立的知识库实例
- 支持私有化部署
- 无跨企业数据共享

---

## 9. 下一步讨论

### 待确定的技术细节

1. **前端框架兼容性**
   - React / Vue / Angular 的集成方式
   - 是否需要提供对应的封装组件库？

2. **LLM模型选择**
   - 本地部署：Ollama + Llama2/Phi-3/Qwen？
   - 对话式LLM还是纯RAG？

3. **光标动画效果**
   - 飘移路径算法（A*？贝塞尔曲线？）
   - 动画时长和缓动函数

4. **性能优化**
   - DOM扫描时机（全量/增量）
   - 缓存策略

5. **错误处理**
   - 找不到目标时的降级策略
   - 多候选结果时的交互方式

---

## 10. 优先级建议

### MVP阶段（核心可用）
1. ✅ DOM扫描 + 元素标记
2. ✅ 光标跟随 + 导航动画
3. ✅ 文本输入查询
4. ✅ 基础RAG检索
5. ✅ 单知识库支持

### V1阶段（完善体验）
1. 🔄 语音输入集成
2. 🔄 多轮对话支持
3. 🔄 企业SDK封装
4. 🔄 知识库管理后台

### V2阶段（规模化）
1. 📋 多语言支持
2. 📋 多个知识库切换
3. 📋 浏览器扩展版本
4. 📋 分布式部署方案

---

*文档版本：v0.1*
*创建日期：2026-05-31*
*状态：待讨论*

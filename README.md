# ShowMeTheButton

智能UI导航助手 - 通过自然语言帮助用户快速定位复杂网页应用中的功能按钮。

## 🎯 项目简介

在使用复杂的网页软件时，即使有详细的用户手册，找到对应的UI组件依然困难。ShowMeTheButton 提供了一个智能光标替身，用户可以通过语音或文本描述想要完成的任务，光标会自动飘移到对应的按钮位置并悬停提示。

## 🏗️ 项目架构

```
ShowMeTheButton
├── angular-demo/          # Angular演示应用
│   ├── pages/            # 复杂页面示例
│   │   ├── button-hell/      # 按钮地狱
│   │   ├── complex-form/     # 超复杂表单
│   │   ├── image-editor/     # 图片编辑工具
│   │   ├── dashboard/        # 数据仪表盘
│   │   └── workflow/         # 工作流设计器
│   └── ...
│
├── demo-backend/         # Demo应用后端（FastAPI）
│   └── ...               # 为演示应用提供API服务
│
├── show-me-sdk/          # 前端SDK
│   ├── packages/
│   │   ├── core/        # 框架无关核心
│   │   └── angular/      # Angular适配层
│   └── ...
│
├── show-me-agent/        # Agent服务（部署用）
│   └── ...               # RAG + LLM 推理服务
│
├── show-me-agent-sdk/    # Agent SDK（Python包）
│   └── ...               # 企业客户集成包
│
├── docs/                 # 知识库文档
│   └── ...               # 用户手册Markdown文件
│
├── knowledge-base/       # RAG向量数据库
│   └── chroma/
│
└── docker/               # Docker配置
    └── docker-compose.yml
```

## 🚀 快速开始

### 前置要求

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- Angular CLI 18+

### 1. 克隆项目

```bash
git clone https://github.com/your-org/ShowMeTheButton.git
cd ShowMeTheButton
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填写必要的配置
```

### 3. 启动所有服务

```bash
cd docker
docker-compose up -d
```

### 4. 访问应用

- Angular Demo: http://localhost:4200
- Demo Backend API: http://localhost:8000
- Agent API: http://localhost:8001
- API文档: http://localhost:8001/docs

## 📦 模块说明

### Angular Demo (`angular-demo/`)

演示应用，包含多个复杂的UI页面示例，用于测试SDK的功能。每个页面都有真实的交互功能。

### Demo Backend (`demo-backend/`)

为演示应用提供后端API服务，包括图片处理、表单提交等功能。

### Show-Me SDK (`show-me-sdk/`)

前端SDK，提供DOM扫描、光标导航、语音识别等功能。支持Angular、React、Vue等主流框架。

### Show-Me Agent (`show-me-agent/`)

后端推理服务，接收前端SDK的查询请求，检索知识库并返回目标按钮的ID和推理过程。

### Show-Me Agent SDK (`show-me-agent-sdk/`)

Python SDK包，企业客户可以集成到自己的应用中使用。

## 🛠️ 开发指南

### 环境要求

- Node.js 18+
- Python 3.10+
- Angular CLI 18+

### 开发模式启动

```bash
# 1. 启动Demo后端
cd demo-backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 2. 启动Agent服务
cd show-me-agent
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# 3. 启动Angular Demo
cd angular-demo
npm install
ng serve
```

### 运行测试

```bash
# Angular测试
cd angular-demo
ng test

# Python测试
cd show-me-agent
pytest tests/
```

## 📚 文档

- [需求规格文档](./SPEC.md)
- [技术架构文档](./ARCHITECTURE.md)
- [API文档](./docs/api/)

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- Angular Team
- FastAPI
- ChromaDB
- MiniMax AI

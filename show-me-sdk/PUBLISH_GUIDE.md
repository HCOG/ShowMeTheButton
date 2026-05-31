# ShowMe SDK 发布指南

## 当前状态

ShowMe SDK 目前使用动态JS注入方式进行开发和演示，暂不发布npm包。

**优点：**
- 开发调试简单，修改代码后刷新即可
- 可以快速迭代测试
- 不需要发布流程

**缺点：**
- 不是标准化的包管理方式
- 需要自己管理SDK文件的服务器

---

## 未来发布NPM包的方案

### 1. 项目结构

```
show-me-sdk/
├── packages/
│   ├── core/                    # 核心SDK
│   │   ├── src/
│   │   │   ├── bus/             # 事件总线
│   │   │   ├── scanner/          # DOM扫描器
│   │   │   ├── cursor/           # 光标引擎
│   │   │   ├── animation/        # 动画引擎
│   │   │   ├── client/          # Agent客户端
│   │   │   ├── sdk.ts           # SDK主类
│   │   │   ├── types.ts         # 类型定义
│   │   │   └── index.ts         # 入口文件
│   │   ├── dist/               # 构建产物
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── angular/                 # Angular适配层
│   │   ├── src/
│   │   │   ├── module/          # Angular Module
│   │   │   ├── components/      # 组件
│   │   │   └── services/        # 服务
│   │   └── package.json
│   │
│   └── react/                   # React适配层（后续）
│       ├── src/
│       └── package.json
│
├── lerna.json                   # Monorepo配置
└── package.json                # 根package.json
```

### 2. package.json 示例

```json
{
  "name": "@show-me/sdk-core",
  "version": "0.1.0",
  "description": "ShowMeTheButton Core SDK - Framework-agnostic core functionality",
  "main": "./dist/show-me-core.umd.js",
  "module": "./dist/show-me-core.es.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/show-me-core.es.js",
      "require": "./dist/show-me-core.umd.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc && vite build",
    "dev": "vite build --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "keywords": [
    "dom-scanner",
    "cursor-navigation",
    "ui-automation",
    "user-assistance",
    "show-me-the-button"
  ],
  "author": "Your Name",
  "license": "MIT",
  "peerDependencies": {},
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/HCOG/ShowMeTheButton.git"
  }
}
```

### 3. 发布流程

#### 3.1 准备工作

```bash
# 1. 确保版本号正确
# 修改 package.json 中的 version 字段

# 2. 运行测试
npm run test

# 3. 类型检查
npm run typecheck

# 4. 构建
npm run build
```

#### 3.2 发布到npm

```bash
# 登录npm
npm login

# 发布到npm（公开包）
npm publish --access public

# 或者发布到私有源
npm publish --registry https://your-private-registry.com
```

#### 3.3 发布到私有npm服务器

```bash
# 配置私有源
npm config set registry https://your-private-registry.com

# 登录私有源
npm login --registry https://your-private-registry.com

# 发布
npm publish --registry https://your-private-registry.com
```

### 4. 企业客户使用方式

#### 4.1 安装

```bash
npm install @show-me/sdk-core
```

#### 4.2 TypeScript项目使用

```typescript
import { ShowMeSDK, DOMScanner, CursorEngine } from '@show-me/sdk-core';

const sdk = new ShowMeSDK({
  agentEndpoint: 'https://your-agent-service.com',
  language: 'zh-CN',
  cursorStyle: {
    offsetX: 15,
    offsetY: 15
  }
});

await sdk.init();
sdk.activate();

// 用户说"我想导出报表"
const result = await sdk.query('我想导出报表');
```

#### 4.3 Angular集成

```typescript
// app.module.ts
import { ShowMeModule } from '@show-me/sdk-angular';

@NgModule({
  imports: [
    ShowMeModule.forRoot({
      agentEndpoint: 'https://your-agent.com'
    })
  ]
})
export class AppModule { }
```

#### 4.4 React集成（后续）

```typescript
import { ShowMeProvider, useShowMe } from '@show-me/sdk-react';

function App() {
  return (
    <ShowMeProvider config={{ agentEndpoint: '...' }}>
      <YourApp />
    </ShowMeProvider>
  );
}

function MyComponent() {
  const { query, activate, deactivate } = useShowMe();
  
  return (
    <button onClick={() => query('我想导出报表')}>
      导出
    </button>
  );
}
```

### 5. 版本管理

使用 [Semantic Versioning](https://semver.org/)

- **MAJOR**: 不兼容的API变更
- **MINOR**: 向后兼容的功能添加
- **PATCH**: 向后兼容的问题修复

```bash
# 补丁版本
npm version patch  # 0.1.0 -> 0.1.1

# 次版本
npm version minor  # 0.1.0 -> 0.2.0

# 主版本
npm version major  # 0.1.0 -> 1.0.0
```

### 6. Changelog

每次发布需要更新 CHANGELOG.md：

```markdown
# Changelog

## [0.1.0] - 2024-01-01

### Added
- DOM扫描器
- 光标引擎
- 动画系统
- Agent客户端

### Changed
- 优化了光标跟随性能

### Fixed
- 修复了Shadow DOM兼容性问题
```

### 7. 发布检查清单

发布前确认：

- [ ] 所有测试通过
- [ ] TypeScript类型正确
- [ ] 构建产物完整
- [ ] README.md 已更新
- [ ] CHANGELOG.md 已更新
- [ ] version 正确
- [ ] package.json 的 files 字段正确
- [ ] Git tag 已创建

### 8. Git Tag

```bash
# 创建tag
git tag v0.1.0
git push origin v0.1.0

# 或者在npm version后自动tag
npm version 0.1.0 --message "Release: %s"
```

---

## Angular适配层

```typescript
// packages/angular/src/module/show-me.module.ts

import { ModuleWithProviders, NgModule } from '@angular/core';
import { ShowMeService } from './service/show-me.service';

@NgModule({
  declarations: [
    ShowMeCursor,
    ShowMeTooltip
  ],
  exports: [
    ShowMeCursor,
    ShowMeTooltip
  ],
  providers: [ShowMeService]
})
export class ShowMeModule {
  static forRoot(config: ShowMeConfig): ModuleWithProviders {
    return {
      ngModule: ShowMeModule,
      providers: [
        { provide: SHOW_ME_CONFIG, useValue: config }
      ]
    };
  }
}
```

---

## React适配层

```typescript
// packages/react/src/ShowMeProvider.tsx

import React, { createContext, useContext } from 'react';

const ShowMeContext = createContext(null);

export function ShowMeProvider({ children, config }) {
  const [sdk, setSdk] = useState(null);
  
  useEffect(() => {
    const initSDK = async () => {
      const showMe = new ShowMeSDK(config);
      await showMe.init();
      setSdk(showMe);
    };
    initSDK();
  }, [config]);
  
  return (
    <ShowMeContext.Provider value={sdk}>
      {children}
    </ShowMeContext.Provider>
  );
}

export function useShowMe() {
  return useContext(ShowMeContext);
}
```

---

## 发布平台选择

### 公共npm
- npmjs.com
- 适合开源项目
- 免费（public包）

### 私有npm
- Verdaccio
- Nexus Repository
- Artifactory
- 适合企业内网使用

### GitHub Packages
- 与GitHub集成
- 每个组织有免费额度
- 支持npm、docker等

---

## 建议的后续步骤

1. **完善SDK功能**
   - [x] DOM扫描器
   - [x] 光标引擎
   - [x] 动画系统
   - [ ] 语音输入
   - [ ] 更好的Angular适配
   - [ ] React适配
   - [ ] Vue适配（可选）

2. **完善文档**
   - [x] API文档
   - [ ] 使用示例
   - [ ] 迁移指南
   - [ ] 视频教程

3. **测试覆盖**
   - [ ] 单元测试
   - [ ] E2E测试
   - [ ] 浏览器兼容性测试

4. **发布前检查**
   - [ ] 所有测试通过
   - [ ] 文档完善
   - [ ] 版本号更新
   - [ ] CHANGELOG更新

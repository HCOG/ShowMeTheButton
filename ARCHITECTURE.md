# ShowMeTheButton - 技术架构设计文档

## 目录

1. [系统架构总览](#1-系统架构总览)
2. [前端SDK架构（show-me-sdk）](#2-前端sdk架构show-me-sdk)
3. [后端Agent架构（show-me-agent）](#3-后端agent架构show-me-agent)
4. [LLM抽象层设计](#4-llm抽象层设计)
5. [RAG知识库架构](#5-rag知识库架构)
6. [数据流设计](#6-数据流设计)
7. [错误处理与降级策略](#7-错误处理与降级策略)
8. [安全与隐私设计](#8-安全与隐私设计)

---

## 1. 系统架构总览

### 1.1 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                        企业客户应用层                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │  Angular应用  │  │   React应用   │  │   Vue应用     │       │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘       │
│          └──────────────────┼──────────────────┘               │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      前端SDK层（show-me-sdk）                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  @show-me/sdk-core (框架无关核心)                        │    │
│  │  ├── CursorEngine      - 光标管理                       │    │
│  │  ├── DOMScanner        - DOM扫描                        │    │
│  │  ├── LocatorEngine     - 定位引擎                        │    │
│  │  ├── AnimationEngine   - 动画引擎                        │    │
│  │  └── EventBus          - 事件总线                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │@show-me/ng   │ │@show-me/react│ │@show-me/vue  │            │
│  │ Angular封装  │ │ React封装    │ │ Vue封装      │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    后端Agent层（show-me-agent）                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    API Gateway                           │    │
│  │              /api/v1/query  /api/v1/chat                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│  │ IntentEngine │ │  RAGEngine   │ │ LLMRouter    │              │
│  │   意图理解    │ │   知识检索    │ │   模型路由    │              │
│  └──────────────┘ └──────────────┘ └──────────────┘              │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              LLM抽象层 (LLM Abstraction Layer)           │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │    │
│  │  │ MiniMax │  │ Ollama  │  │ OpenAI  │  │ Custom  │     │    │
│  │  │ Adapter │  │ Adapter │  │ Adapter │  │ Adapter │     │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  数据存储层                               │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │  ChromaDB    │  │  SQLite      │  │ FileSystem   │   │    │
│  │  │  向量数据库   │  │  关系数据     │  │  知识库文件   │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

1. **SDK核心框架无关**：使用 TypeScript + 装饰器模式
2. **LLM后端可插拔**：统一的 Adapter 接口
3. **知识库存储分离**：向量数据库与文件系统解耦
4. **事件驱动架构**：模块间通过 EventBus 通信
5. **本地优先**：减少网络依赖，保护隐私

---

## 2. 前端SDK架构（show-me-sdk）

### 2.1 项目结构

```
show-me-sdk/
├── packages/
│   ├── core/                    # 框架无关核心包
│   │   ├── src/
│   │   │   ├── cursor/          # 光标引擎
│   │   │   │   ├── CursorEngine.ts
│   │   │   │   ├── CursorAvatar.ts
│   │   │   │   └── cursor.css
│   │   │   ├── scanner/        # DOM扫描器
│   │   │   │   ├── DOMScanner.ts
│   │   │   │   ├── ElementMarker.ts
│   │   │   │   └── selectors.ts
│   │   │   ├── locator/         # 定位引擎
│   │   │   │   ├── LocatorEngine.ts
│   │   │   │   └── Matcher.ts
│   │   │   ├── animation/       # 动画引擎
│   │   │   │   ├── AnimationEngine.ts
│   │   │   │   └── Easing.ts
│   │   │   ├── input/           # 输入模块
│   │   │   │   ├── VoiceInput.ts
│   │   │   │   └── TextInput.ts
│   │   │   ├── bus/             # 事件总线
│   │   │   │   └── EventBus.ts
│   │   │   ├── client/          # Agent通信
│   │   │   │   └── AgentClient.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── angular/                 # Angular封装
│   │   ├── src/
│   │   │   ├── module/
│   │   │   │   └── ShowMeModule.ts
│   │   │   ├── component/
│   │   │   │   ├── cursor/
│   │   │   │   └── tooltip/
│   │   │   ├── directive/
│   │   │   │   └── show-me.directive.ts
│   │   │   └── service/
│   │   │       └── show-me.service.ts
│   │   └── package.json
│   │
│   ├── react/                   # React封装
│   │   ├── src/
│   │   │   ├── ShowMeProvider.tsx
│   │   │   ├── useShowMe.ts
│   │   │   ├── Cursor.tsx
│   │   │   └── package.json
│   │   └── package.json
│   │
│   ├── vue/                     # Vue封装
│   │   ├── src/
│   │   │   ├── plugin.ts
│   │   │   ├── composables/
│   │   │   │   └── useShowMe.ts
│   │   │   └── components/
│   │   │       ├── Cursor.vue
│   │   │       └── Tooltip.vue
│   │   └── package.json
│   │
│   └── lerna.json              # Monorepo配置
│
└── README.md
```

### 2.2 核心类设计

#### 2.2.1 ShowMeSDK 主类

```typescript
// packages/core/src/index.ts

export interface ShowMeConfig {
  agentEndpoint: string;
  knowledgeBase?: KnowledgeBaseConfig;
  language?: 'zh-CN' | 'en-US';
  voiceEnabled?: boolean;
  cursorStyle?: CursorStyle;
  debug?: boolean;
}

export class ShowMeSDK {
  private config: ShowMeConfig;
  private cursorEngine: CursorEngine;
  private domScanner: DOMScanner;
  private locatorEngine: LocatorEngine;
  private animationEngine: AnimationEngine;
  private eventBus: EventBus;
  private agentClient: AgentClient;
  private isInitialized: boolean = false;
  private isActive: boolean = false;

  constructor(config: ShowMeConfig) {
    this.config = this.validateConfig(config);
    this.eventBus = new EventBus();
    this.cursorEngine = new CursorEngine(this.eventBus);
    this.domScanner = new DOMScanner(this.eventBus);
    this.locatorEngine = new LocatorEngine(this.eventBus);
    this.animationEngine = new AnimationEngine(this.eventBus);
    this.agentClient = new AgentClient(this.config.agentEndpoint);
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    // 1. 初始化光标
    await this.cursorEngine.init();
    
    // 2. 扫描DOM
    const elements = await this.domScanner.scan();
    
    // 3. 初始化定位引擎
    this.locatorEngine.setElements(elements);
    
    // 4. 初始化语音（如果启用）
    if (this.config.voiceEnabled) {
      await this.initVoiceInput();
    }
    
    this.isInitialized = true;
    this.eventBus.emit('sdk:initialized');
  }

  activate(): void {
    if (!this.isInitialized) {
      throw new Error('SDK not initialized. Call init() first.');
    }
    this.isActive = true;
    this.cursorEngine.show();
    this.eventBus.emit('sdk:activated');
  }

  deactivate(): void {
    this.isActive = false;
    this.cursorEngine.hide();
    this.eventBus.emit('sdk:deactivated');
  }

  async query(userQuery: string): Promise<QueryResult> {
    // 1. 获取当前页面元素
    const elements = this.locatorEngine.getElements();
    
    // 2. 发送到Agent
    const response = await this.agentClient.query({
      query: userQuery,
      elements: elements.map(e => ({
        id: e.id,
        label: e.label,
        type: e.metadata.type,
        text: e.metadata.text,
      })),
      context: {
        url: window.location.href,
        timestamp: Date.now(),
      },
    });
    
    // 3. 动画导航到目标
    if (response.success && response.result.target_id) {
      const target = elements.find(e => e.id === response.result.target_id);
      if (target) {
        await this.animationEngine.navigateTo(target.bounds);
        this.cursorEngine.hover(target.id);
      }
    }
    
    return response;
  }

  private validateConfig(config: ShowMeConfig): ShowMeConfig {
    // 配置验证逻辑
    if (!config.agentEndpoint) {
      throw new Error('agentEndpoint is required');
    }
    return {
      language: 'zh-CN',
      voiceEnabled: true,
      debug: false,
      ...config,
    };
  }
}
```

#### 2.2.2 DOMScanner

```typescript
// packages/core/src/scanner/DOMScanner.ts

export interface ScannedElement {
  id: string;
  element: HTMLElement;
  bounds: DOMRect;
  label: string;
  description: string;
  priority: number;
  metadata: {
    type: 'button' | 'input' | 'link' | 'menu' | 'tab' | 'icon' | 'other';
    text?: string;
    icon?: string;
    disabled?: boolean;
    ariaLabel?: string;
    role?: string;
  };
}

const INTERACTIVE_SELECTORS = [
  'button:not([disabled]):not([type="hidden"])',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '.btn', '.button',
  '[class*="btn"]', '[class*="button"]',
  '[class*="btn-primary"]', '[class*="btn-default"]',
  '[class*="icon"]:not(i)',
  'i[class*="icon"]',
  '[class*="action"]',
  '[aria-label]',
];

export class DOMScanner {
  private eventBus: EventBus;
  private elements: Map<string, ScannedElement> = new Map();
  private marker: ElementMarker;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.marker = new ElementMarker();
  }

  async scan(): Promise<ScannedElement[]> {
    const results: ScannedElement[] = [];
    const selector = INTERACTIVE_SELECTORS.join(',');
    const nodes = document.querySelectorAll(selector);
    
    let index = 0;
    nodes.forEach((node) => {
      const element = node as HTMLElement;
      if (this.isVisible(element) && this.shouldMark(element)) {
        const scanned = this.scanElement(element, index++);
        results.push(scanned);
        this.elements.set(scanned.id, scanned);
        this.marker.mark(element, scanned.id);
      }
    });
    
    this.eventBus.emit('scanner:complete', { count: results.length });
    return results;
  }

  private scanElement(element: HTMLElement, index: number): ScannedElement {
    const bounds = element.getBoundingClientRect();
    const id = `smt-el-${index}`;
    
    return {
      id,
      element,
      bounds,
      label: this.generateLabel(element),
      description: this.generateDescription(element),
      priority: this.calculatePriority(element),
      metadata: {
        type: this.detectType(element),
        text: this.extractText(element),
        icon: this.extractIcon(element),
        disabled: element.disabled,
        ariaLabel: element.getAttribute('aria-label'),
        role: element.getAttribute('role'),
      },
    };
  }

  private generateLabel(element: HTMLElement): string {
    // 优先使用 aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    
    // 其次使用 text content
    const text = this.extractText(element);
    if (text) return text.trim();
    
    // 使用 placeholder
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;
    
    // 使用 title
    const title = element.getAttribute('title');
    if (title) return title;
    
    return '未命名元素';
  }

  private generateDescription(element: HTMLElement): string {
    const type = this.metadata.type;
    const text = this.metadata.text;
    
    return `类型: ${type}${text ? `, 文本: "${text}"` : ''}`;
  }

  private calculatePriority(element: HTMLElement): number {
    let priority = 50;
    
    // 可见区域内的元素优先级提高
    const bounds = element.getBoundingClientRect();
    const inViewport = (
      bounds.top >= 0 &&
      bounds.left >= 0 &&
      bounds.bottom <= window.innerHeight &&
      bounds.right <= window.innerWidth
    );
    if (inViewport) priority += 20;
    
    // 大元素优先级提高（更可能是主要按钮）
    const area = bounds.width * bounds.height;
    if (area > 1000) priority += 10;
    
    // 主色调按钮优先级提高
    const className = element.className;
    if (className.includes('primary') || className.includes('main')) {
      priority += 15;
    }
    
    return priority;
  }

  private detectType(element: HTMLElement): ScannedElement['metadata']['type'] {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    
    if (tagName === 'button' || role === 'button') return 'button';
    if (tagName === 'a') return 'link';
    if (tagName === 'input') return 'input';
    if (tagName === 'select') return 'input';
    if (tagName === 'textarea') return 'input';
    if (role === 'menuitem') return 'menu';
    if (role === 'tab') return 'tab';
    if (this.extractIcon(element)) return 'icon';
    
    return 'other';
  }

  private extractText(element: HTMLElement): string {
    // 获取直接文本内容
    const directText = element.textContent?.trim() || '';
    // 获取 aria-label
    const ariaLabel = element.getAttribute('aria-label') || '';
    return directText || ariaLabel;
  }

  private extractIcon(element: HTMLElement): string | undefined {
    // 检查是否有图标类
    const iconClasses = ['icon', 'fa', 'material-icons', 'oi', 'glyphicon'];
    for (const cls of iconClasses) {
      if (element.classList.contains(cls)) {
        return element.className;
      }
    }
    
    // 检查子元素中的图标
    const iconElement = element.querySelector('[class*="icon"]');
    return iconElement?.className;
  }

  private isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  private shouldMark(element: HTMLElement): boolean {
    // 排除已经标记的元素
    if (element.id.startsWith('smt-el-')) return false;
    
    // 排除隐藏元素
    if (!this.isVisible(element)) return false;
    
    // 排除过小的元素（可能是装饰性图标）
    const bounds = element.getBoundingClientRect();
    if (bounds.width < 20 && bounds.height < 20) return false;
    
    return true;
  }

  getElements(): ScannedElement[] {
    return Array.from(this.elements.values());
  }

  getElementById(id: string): ScannedElement | undefined {
    return this.elements.get(id);
  }

  refresh(): Promise<ScannedElement[]> {
    this.marker.clear();
    this.elements.clear();
    return this.scan();
  }
}
```

#### 2.2.3 AnimationEngine

```typescript
// packages/core/src/animation/AnimationEngine.ts

import { Easing } from './Easing';

export interface AnimationConfig {
  duration: number;        // 动画时长(ms)
  easing: keyof typeof Easing;  // 缓动函数
  hoverDuration: number;    // 悬停提示时长(ms)
}

const DEFAULT_CONFIG: AnimationConfig = {
  duration: 800,
  easing: 'easeOutCubic',
  hoverDuration: 2000,
};

export class AnimationEngine {
  private eventBus: EventBus;
  private config: AnimationConfig;
  private cursorElement: HTMLElement | null = null;
  private animationFrame: number | null = null;

  constructor(eventBus: EventBus, config?: Partial<AnimationConfig>) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setCursorElement(element: HTMLElement): void {
    this.cursorElement = element;
  }

  async navigateTo(targetBounds: DOMRect): Promise<void> {
    if (!this.cursorElement) {
      throw new Error('Cursor element not set');
    }

    const startBounds = this.cursorElement.getBoundingClientRect();
    const startX = startBounds.left + startBounds.width / 2;
    const startY = startBounds.top + startBounds.height / 2;
    const endX = targetBounds.left + targetBounds.width / 2;
    const endY = targetBounds.top + targetBounds.height / 2;

    await this.animate(startX, startY, endX, endY);
    
    this.eventBus.emit('animation:complete', { 
      target: targetBounds,
      timestamp: Date.now(),
    });
  }

  private animate(
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const easingFn = Easing[this.config.easing];

      const tick = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / this.config.duration, 1);
        const easedProgress = easingFn(progress);

        const currentX = startX + (endX - startX) * easedProgress;
        const currentY = startY + (endY - startY) * easedProgress;

        if (this.cursorElement) {
          this.cursorElement.style.left = `${currentX}px`;
          this.cursorElement.style.top = `${currentY}px`;
          this.cursorElement.style.transform = 'translate(-50%, -50%)';
        }

        if (progress < 1) {
          this.animationFrame = requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };

      this.animationFrame = requestAnimationFrame(tick);
    });
  }

  async hover(elementId: string): Promise<void> {
    // 触发悬停效果
    this.eventBus.emit('cursor:hover', { elementId });
    
    // 等待悬停时长
    await this.delay(this.config.hoverDuration);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cancel(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
}
```

```typescript
// packages/core/src/animation/Easing.ts

export const Easing = {
  linear: (t: number) => t,
  
  easeInQuad: (t: number) => t * t,
  
  easeOutQuad: (t: number) => t * (2 - t),
  
  easeInOutQuad: (t: number) => 
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  easeInCubic: (t: number) => t * t * t,
  
  easeOutCubic: (t: number) => 
    (--t) * t * t + 1,
  
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  
  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 
      ? 0 
      : t === 1 
        ? 1 
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
} as const;
```

#### 2.2.4 EventBus

```typescript
// packages/core/src/bus/EventBus.ts

export type EventCallback<T = any> = (data: T) => void;

export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<T = any>(event: string, callback: EventCallback<T>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  emit<T = any>(event: string, data?: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  once<T = any>(event: string, callback: EventCallback<T>): void {
    const onceCallback: EventCallback<T> = (data) => {
      callback(data);
      this.off(event, onceCallback);
    };
    this.on(event, onceCallback);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// 预定义事件类型
export const SDK_EVENTS = {
  INITIALIZED: 'sdk:initialized',
  ACTIVATED: 'sdk:activated',
  DEACTIVATED: 'sdk:deactivated',
  SCANNER_COMPLETE: 'scanner:complete',
  ANIMATION_COMPLETE: 'animation:complete',
  CURSOR_HOVER: 'cursor:hover',
  QUERY_START: 'query:start',
  QUERY_COMPLETE: 'query:complete',
  QUERY_ERROR: 'query:error',
  VOICE_START: 'voice:start',
  VOICE_END: 'voice:end',
  VOICE_RESULT: 'voice:result',
} as const;
```

### 2.3 Angular封装

```typescript
// packages/angular/src/module/ShowMeModule.ts

import { ModuleWithProviders, NgModule, InjectionToken } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShowMeDirective } from '../directive/show-me.directive';
import { CursorComponent } from '../component/cursor/cursor.component';
import { TooltipComponent } from '../component/tooltip/tooltip.component';
import { ShowMeService } from '../service/show-me.service';
import { ShowMeConfig } from '@show-me/core';

export const SHOW_ME_CONFIG = new InjectionToken<ShowMeConfig>('SHOW_ME_CONFIG');

@NgModule({
  declarations: [
    ShowMeDirective,
    CursorComponent,
    TooltipComponent,
  ],
  imports: [CommonModule],
  exports: [
    ShowMeDirective,
    CursorComponent,
    TooltipComponent,
  ],
  providers: [ShowMeService],
})
export class ShowMeModule {
  static forRoot(config: ShowMeConfig): ModuleWithProviders<ShowMeModule> {
    return {
      ngModule: ShowMeModule,
      providers: [
        { provide: SHOW_ME_CONFIG, useValue: config },
      ],
    };
  }
}
```

```typescript
// packages/angular/src/service/show-me.service.ts

import { Injectable, Inject, OnDestroy } from '@angular/core';
import { SHOW_ME_CONFIG } from '../module/ShowMeModule';
import { ShowMeSDK, ShowMeConfig } from '@show-me/core';

@Injectable()
export class ShowMeService implements OnDestroy {
  private sdk: ShowMeSDK | null = null;
  private initialized = false;

  constructor(@Inject(SHOW_ME_CONFIG) private config: ShowMeConfig) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    
    this.sdk = new ShowMeSDK(this.config);
    await this.sdk.init();
    this.initialized = true;
  }

  async query(question: string) {
    if (!this.sdk) {
      throw new Error('SDK not initialized');
    }
    return this.sdk.query(question);
  }

  activate(): void {
    this.sdk?.activate();
  }

  deactivate(): void {
    this.sdk?.deactivate();
  }

  ngOnDestroy(): void {
    this.sdk?.deactivate();
  }
}
```

```typescript
// packages/angular/src/directive/show-me.directive.ts

import { Directive, Input, OnInit, OnDestroy } from '@angular/core';
import { ShowMeService } from '../service/show-me.service';

@Directive({
  selector: '[showMe]',
})
export class ShowMeDirective implements OnInit, OnDestroy {
  @Input('showMe') config?: { 
    autoActivate?: boolean;
    tooltip?: string;
  };

  constructor(private showMeService: ShowMeService) {}

  async ngOnInit(): Promise<void> {
    await this.showMeService.init();
    
    if (this.config?.autoActivate) {
      this.showMeService.activate();
    }
  }

  ngOnDestroy(): void {
    this.showMeService.deactivate();
  }
}
```

---

## 3. 后端Agent架构（show-me-agent）

### 3.1 项目结构

```
show-me-agent/
├── src/
│   ├── server.py                    # FastAPI应用
│   ├── api/
│   │   ├── routes/
│   │   │   ├── query.py            # 查询接口
│   │   │   ├── chat.py             # 对话接口
│   │   │   └── health.py           # 健康检查
│   │   └── middleware/
│   │       └── cors.py
│   ├── core/
│   │   ├── config.py                # 配置管理
│   │   ├── events.py               # 事件系统
│   │   └── logging.py              # 日志配置
│   ├── engine/
│   │   ├── intent/
│   │   │   ├── recognizer.py        # 意图识别
│   │   │   └── classifier.py        # 意图分类
│   │   ├── rag/
│   │   │   ├── embeddings.py        # 向量化
│   │   │   ├── retriever.py         # 检索器
│   │   │   ├── ranker.py            # 重排序
│   │   │   └── loader.py            # 文档加载
│   │   └── locator/
│   │       ├── analyzer.py          # UI分析
│   │       └── instruction.py       # 指令生成
│   ├── llm/
│   │   ├── base.py                  # 基类
│   │   ├── minimax.py               # MiniMax适配器
│   │   ├── ollama.py                # Ollama适配器
│   │   └── openai.py                # OpenAI适配器
│   ├── storage/
│   │   ├── vector.py                # 向量存储
│   │   └── cache.py                 # 缓存
│   └── models/
│       ├── request.py              # 请求模型
│       └── response.py             # 响应模型
├── tests/
├── config/
│   └── settings.yaml               # 配置文件
├── requirements.txt
└── README.md
```

### 3.2 FastAPI服务

```python
# src/server.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import query, chat, health
from src.core.config import settings
from src.core.logging import setup_logging

app = FastAPI(
    title="ShowMeTheButton Agent",
    description="智能UI导航助手的Agent服务",
    version="0.1.0",
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(health.router, prefix="/api/v1", tags=["健康检查"])
app.include_router(query.router, prefix="/api/v1", tags=["查询"])
app.include_router(chat.router, prefix="/api/v1", tags=["对话"])

@app.on_event("startup")
async def startup_event():
    setup_logging()
    
@app.on_event("shutdown")
async def shutdown_event():
    pass
```

```python
# src/api/routes/query.py

from fastapi import APIRouter, HTTPException
from src.models.request import QueryRequest
from src.models.response import QueryResponse
from src.engine.intent.recognizer import IntentRecognizer
from src.engine.rag.retriever import RAGRetriever
from src.engine.locator.analyzer import UIAnalyzer

router = APIRouter()

intent_recognizer = IntentRecognizer()
rag_retriever = RAGRetriever()
ui_analyzer = UIAnalyzer()

@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    try:
        # 1. 意图识别
        intent = await intent_recognizer.recognize(request.query)
        
        # 2. RAG检索
        if intent.needs_knowledge:
            context = await rag_retriever.retrieve(
                query=request.query,
                top_k=5
            )
        else:
            context = []
        
        # 3. UI分析
        result = await ui_analyzer.analyze(
            query=request.query,
            elements=request.context.get("marked_elements", []),
            knowledge_context=context,
            intent=intent
        )
        
        return QueryResponse(
            success=True,
            result=result,
            intent=intent
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 3.3 核心引擎

```python
# src/engine/intent/recognizer.py

from dataclasses import dataclass
from typing import List, Optional
from src.llm.base import BaseLLM

@dataclass
class Intent:
    type: str  # 'locate' | 'explain' | 'navigate' | 'search'
    confidence: float
    entities: dict
    needs_knowledge: bool = True

class IntentRecognizer:
    def __init__(self):
        self.intent_patterns = {
            'locate': [
                '点击', '找到', '定位', '哪个', '哪里', 
                '在哪儿', '怎么找', '按钮', '功能', '入口'
            ],
            'explain': [
                '是什么', '解释', '说明', '什么作用', 
                '什么意思', '用来干嘛', '用途'
            ],
            'navigate': [
                '打开', '进入', '跳转到', '去', '导航',
                '我想', '我要'
            ],
            'search': [
                '搜索', '查找', '查询', '寻找'
            ]
        }
    
    async def recognize(self, query: str) -> Intent:
        # 简化的意图识别逻辑
        query_lower = query.lower()
        
        # 匹配意图类型
        matched_intents = []
        for intent_type, keywords in self.intent_patterns.items():
            score = sum(1 for keyword in keywords if keyword in query_lower)
            if score > 0:
                matched_intents.append((intent_type, score))
        
        if not matched_intents:
            # 默认定位意图
            return Intent(
                type='locate',
                confidence=0.5,
                entities={},
                needs_knowledge=True
            )
        
        # 选择得分最高的意图
        best_intent = max(matched_intents, key=lambda x: x[1])
        intent_type, score = best_intent
        
        return Intent(
            type=intent_type,
            confidence=min(score / 3, 1.0),  # 归一化
            entities={},
            needs_knowledge=True
        )
```

```python
# src/engine/rag/retriever.py

from typing import List, Optional
from dataclasses import dataclass
import chromadb
from chromadb.config import Settings
from src.engine.rag.embeddings import EmbeddingModel
from src.engine.rag.ranker import Reranker

@dataclass
class KnowledgeChunk:
    content: str
    source: str
    page: int
    score: float

class RAGRetriever:
    def __init__(self):
        self.embedding_model = EmbeddingModel()
        self.reranker = Reranker()
        self.client = chromadb.Client(Settings(
            anonymized_telemetry=False,
            allow_reset=True
        ))
        self.collection = self.client.get_collection("knowledge_base")
    
    async def retrieve(
        self, 
        query: str, 
        top_k: int = 5
    ) -> List[KnowledgeChunk]:
        # 1. 向量化查询
        query_vector = await self.embedding_model.embed(query)
        
        # 2. 向量检索
        results = self.collection.query(
            query_embeddings=[query_vector],
            n_results=top_k * 2  # 多检索一些用于重排序
        )
        
        # 3. 构建知识块
        chunks = [
            KnowledgeChunk(
                content=doc,
                source=results['metadatas'][0][i].get('source', ''),
                page=results['metadatas'][0][i].get('page', 0),
                score=results['distances'][0][i]
            )
            for i, doc in enumerate(results['documents'][0])
        ]
        
        # 4. 重排序
        reranked = await self.reranker.rerank(query, chunks, top_k)
        
        return reranked
```

```python
# src/engine/locator/analyzer.py

from dataclasses import dataclass
from typing import List, Optional
from src.engine.intent.recognizer import Intent
from src.models.request import MarkedElement

@dataclass
class LocateResult:
    target_id: str
    confidence: float
    reasoning: str
    suggestion: Optional[str] = None

class UIAnalyzer:
    def __init__(self):
        self.type_weights = {
            'button': 1.0,
            'link': 0.9,
            'menu': 0.8,
            'tab': 0.7,
            'input': 0.6,
            'icon': 0.5,
            'other': 0.3
        }
    
    async def analyze(
        self,
        query: str,
        elements: List[MarkedElement],
        knowledge_context: List[dict],
        intent: Intent
    ) -> LocateResult:
        # 1. 提取关键实体
        entities = self.extract_entities(query)
        
        # 2. 过滤候选元素
        candidates = self.filter_candidates(elements, entities)
        
        # 3. 计算匹配分数
        scored = self.score_candidates(
            candidates, 
            entities, 
            knowledge_context
        )
        
        # 4. 选择最佳匹配
        if not scored:
            return LocateResult(
                target_id="",
                confidence=0.0,
                reasoning="未找到匹配的元素"
            )
        
        best = max(scored.items(), key=lambda x: x[1])
        target_id, score = best
        
        return LocateResult(
            target_id=target_id,
            confidence=score,
            reasoning=self.generate_reasoning(target_id, entities, knowledge_context),
            suggestion=self.generate_suggestion(target_id, knowledge_context)
        )
    
    def extract_entities(self, query: str) -> dict:
        # 简化的实体提取
        entities = {
            'text_keywords': [],
            'type': None,
            'color': None,
            'position': None
        }
        
        # 提取颜色
        colors = ['红色', '蓝色', '绿色', '黄色', '白色', '黑色']
        for color in colors:
            if color in query:
                entities['color'] = color
                break
        
        # 提取类型关键词
        type_keywords = {
            'button': ['按钮', 'button', '确认', '提交', '保存'],
            'link': ['链接', 'link', '跳转'],
            'input': ['输入框', 'input', '输入', '填写'],
            'menu': ['菜单', 'menu', '导航'],
        }
        
        for elem_type, keywords in type_keywords.items():
            if any(kw in query.lower() for kw in keywords):
                entities['type'] = elem_type
                break
        
        # 提取文本关键词
        import re
        words = re.findall(r'[\w]+', query)
        entities['text_keywords'] = [w for w in words if len(w) >= 2]
        
        return entities
    
    def filter_candidates(
        self,
        elements: List[MarkedElement],
        entities: dict
    ) -> List[MarkedElement]:
        candidates = elements
        
        # 按类型过滤
        if entities['type']:
            candidates = [
                e for e in candidates 
                if e.get('type') == entities['type']
            ]
        
        return candidates if candidates else elements
    
    def score_candidates(
        self,
        candidates: List[MarkedElement],
        entities: dict,
        knowledge_context: List[dict]
    ) -> dict[str, float]:
        scores = {}
        
        for elem in candidates:
            score = 0.0
            
            # 类型权重
            elem_type = elem.get('type', 'other')
            score += self.type_weights.get(elem_type, 0.3) * 0.3
            
            # 文本匹配
            label = elem.get('label', '').lower()
            text = elem.get('text', '').lower()
            for keyword in entities['text_keywords']:
                if keyword.lower() in label or keyword.lower() in text:
                    score += 0.2
            
            # 知识库匹配
            for chunk in knowledge_context:
                if any(
                    keyword.lower() in chunk.get('content', '').lower()
                    for keyword in entities['text_keywords']
                ):
                    score += 0.3
                    break
            
            # 优先级
            score += (elem.get('priority', 50) / 100) * 0.2
            
            scores[elem['id']] = min(score, 1.0)
        
        return scores
    
    def generate_reasoning(
        self,
        target_id: str,
        entities: dict,
        knowledge_context: List[dict]
    ) -> str:
        # 生成推理说明
        reasoning_parts = []
        
        if entities['text_keywords']:
            reasoning_parts.append(
                f"根据关键词「{'」「'.join(entities['text_keywords'])}」"
            )
        
        if knowledge_context:
            source = knowledge_context[0].get('source', '')
            reasoning_parts.append(f"参考文档「{source}」")
        
        if not reasoning_parts:
            reasoning_parts.append("根据页面元素分析")
        
        return '，'.join(reasoning_parts)
    
    def generate_suggestion(
        self,
        target_id: str,
        knowledge_context: List[dict]
    ) -> str:
        if knowledge_context:
            return f"点击后将{knowledge_context[0].get('content', '执行操作')[:50]}..."
        return "点击后将执行相应操作"
```

---

## 4. LLM抽象层设计

### 4.1 架构设计

```
┌─────────────────────────────────────────────┐
│              LLM抽象层接口                    │
│            (BaseLLM Interface)               │
└──────────────────┬──────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│ MiniMax │  │ Ollama  │  │ OpenAI  │
│ Adapter │  │ Adapter │  │ Adapter │
└─────────┘  └─────────┘  └─────────┘
     │             │             │
     └─────────────┼─────────────┘
                   ▼
          ┌─────────────────┐
          │  HTTP/WebSocket │
          │    请求发送      │
          └─────────────────┘
```

### 4.2 接口定义

```python
# src/llm/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional, AsyncIterator

@dataclass
class LLMMessage:
    role: str  # 'system' | 'user' | 'assistant'
    content: str

@dataclass
class LLMResponse:
    content: str
    usage: dict
    model: str
    finish_reason: str

@dataclass
class LLMConfig:
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: str = 'default'
    temperature: float = 0.7
    max_tokens: int = 2000
    timeout: int = 60
    retry_times: int = 3

class BaseLLM(ABC):
    """LLM抽象基类"""
    
    def __init__(self, config: LLMConfig):
        self.config = config
    
    @abstractmethod
    async def chat(
        self, 
        messages: List[LLMMessage],
        **kwargs
    ) -> LLMResponse:
        """发送对话请求"""
        pass
    
    @abstractmethod
    async def stream_chat(
        self,
        messages: List[LLMMessage],
        **kwargs
    ) -> AsyncIterator[str]:
        """流式对话请求"""
        pass
    
    @abstractmethod
    async def embeddings(self, texts: List[str]) -> List[List[float]]:
        """获取文本向量"""
        pass
    
    @abstractmethod
    def get_model_name(self) -> str:
        """获取模型名称"""
        pass
```

### 4.3 MiniMax适配器

```python
# src/llm/minimax.py

from typing import List, AsyncIterator
import aiohttp
from .base import BaseLLM, LLMMessage, LLMResponse, LLMConfig

class MiniMaxAdapter(BaseLLM):
    """MiniMax API适配器"""
    
    API_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2"
    EMBEDDING_URL = "https://api.minimax.chat/v1/embeddings"
    
    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self.api_key = config.api_key
        self.group_id = getattr(config, 'group_id', None)
    
    async def chat(
        self,
        messages: List[LLMMessage],
        **kwargs
    ) -> LLMResponse:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.config.model or "MiniMax-Text-01",
            "messages": [
                {"role": m.role, "content": m.content}
                for m in messages
            ],
            "temperature": kwargs.get("temperature", self.config.temperature),
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout)
            ) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"MiniMax API error: {error}")
                
                data = await response.json()
                
                return LLMResponse(
                    content=data['choices'][0]['message']['content'],
                    usage=data.get('usage', {}),
                    model=data.get('model', 'MiniMax-Text-01'),
                    finish_reason=data['choices'][0].get('finish_reason', 'stop')
                )
    
    async def stream_chat(
        self,
        messages: List[LLMMessage],
        **kwargs
    ) -> AsyncIterator[str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.config.model or "MiniMax-Text-01",
            "messages": [
                {"role": m.role, "content": m.content}
                for m in messages
            ],
            "temperature": kwargs.get("temperature", self.config.temperature),
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
            "stream": True
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout)
            ) as response:
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        if line == 'data: [DONE]':
                            break
                        data = json.loads(line[6:])
                        delta = data['choices'][0]['delta']
                        if 'content' in delta:
                            yield delta['content']
    
    async def embeddings(self, texts: List[str]) -> List[List[float]]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "embo-01",
            "texts": texts
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.EMBEDDING_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout)
            ) as response:
                data = await response.json()
                return data.get('embeddings', [])
    
    def get_model_name(self) -> str:
        return self.config.model or "MiniMax-Text-01"
```

### 4.4 Ollama适配器

```python
# src/llm/ollama.py

from typing import List, AsyncIterator
import aiohttp
from .base import BaseLLM, LLMMessage, LLMResponse, LLMConfig

class OllamaAdapter(BaseLLM):
    """Ollama本地LLM适配器"""
    
    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self.base_url = config.base_url or "http://localhost:11434"
        self.model = config.model or "llama3.2"
    
    async def chat(
        self,
        messages: List[LLMMessage],
        **kwargs
    ) -> LLMResponse:
        payload = {
            "model": self.model,
            "messages": [
                {"role": m.role, "content": m.content}
                for m in messages
            ],
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", self.config.temperature),
                "num_predict": kwargs.get("max_tokens", self.config.max_tokens),
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout)
            ) as response:
                data = await response.json()
                
                return LLMResponse(
                    content=data['message']['content'],
                    usage=data.get('total_duration', {}),
                    model=self.model,
                    finish_reason='stop'
                )
    
    async def stream_chat(
        self,
        messages: List[LLMMessage],
        **kwargs
    ) -> AsyncIterator[str]:
        payload = {
            "model": self.model,
            "messages": [
                {"role": m.role, "content": m.content}
                for m in messages
            ],
            "stream": True
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/chat",
                json=payload
            ) as response:
                async for line in response.content:
                    data = json.loads(line)
                    if 'message' in data:
                        yield data['message'].get('content', '')
    
    async def embeddings(self, texts: List[str]) -> List[List[float]]:
        embeddings = []
        
        async with aiohttp.ClientSession() as session:
            for text in texts:
                payload = {
                    "model": self.model,
                    "prompt": text
                }
                
                async with session.post(
                    f"{self.base_url}/api/embeddings",
                    json=payload
                ) as response:
                    data = await response.json()
                    embeddings.append(data.get('embedding', []))
        
        return embeddings
    
    def get_model_name(self) -> str:
        return self.model
```

### 4.5 LLM路由器

```python
# src/llm/router.py

from typing import Optional, Dict
from enum import Enum
from .base import BaseLLM, LLMConfig
from .minimax import MiniMaxAdapter
from .ollama import OllamaAdapter
from .openai import OpenAIAdapter

class LLMProvider(Enum):
    MINIMAX = "minimax"
    OLLAMA = "ollama"
    OPENAI = "openai"
    CUSTOM = "custom"

class LLMRouter:
    """LLM路由器，支持多后端切换"""
    
    def __init__(self):
        self.adapters: Dict[LLMProvider, BaseLLM] = {}
        self.current_provider: LLMProvider = LLMProvider.MINIMAX
    
    def register_adapter(
        self, 
        provider: LLMProvider, 
        adapter: BaseLLM
    ) -> None:
        """注册LLM适配器"""
        self.adapters[provider] = adapter
    
    def set_provider(self, provider: LLMProvider) -> None:
        """切换LLM提供者"""
        if provider not in self.adapters:
            raise ValueError(f"Provider {provider} not registered")
        self.current_provider = provider
    
    def get_adapter(self) -> BaseLLM:
        """获取当前适配器"""
        return self.adapters.get(
            self.current_provider,
            self.adapters[LLMProvider.MINIMAX]  # 默认MiniMax
        )
    
    async def chat(self, *args, **kwargs):
        """统一chat接口"""
        return await self.get_adapter().chat(*args, **kwargs)
    
    async def stream_chat(self, *args, **kwargs):
        """统一流式chat接口"""
        return await self.get_adapter().stream_chat(*args, **kwargs)
    
    async def embeddings(self, *args, **kwargs):
        """统一embeddings接口"""
        return await self.get_adapter().embeddings(*args, **kwargs)


# 全局路由器实例
llm_router = LLMRouter()

def init_llm_router(config: dict) -> LLMRouter:
    """初始化LLM路由器"""
    
    # 初始化MiniMax
    if config.get('minimax'):
        minimax_config = LLMConfig(
            api_key=config['minimax']['api_key'],
            model=config['minimax'].get('model', 'MiniMax-Text-01'),
            group_id=config['minimax'].get('group_id')
        )
        minimax_adapter = MiniMaxAdapter(minimax_config)
        llm_router.register_adapter(LLMProvider.MINIMAX, minimax_adapter)
    
    # 初始化Ollama
    if config.get('ollama'):
        ollama_config = LLMConfig(
            base_url=config['ollama'].get('base_url', 'http://localhost:11434'),
            model=config['ollama'].get('model', 'llama3.2'),
            timeout=config['ollama'].get('timeout', 120)
        )
        ollama_adapter = OllamaAdapter(ollama_config)
        llm_router.register_adapter(LLMProvider.OLLAMA, ollama_adapter)
    
    # 设置默认provider
    default_provider = config.get('default_provider', 'minimax')
    llm_router.set_provider(LLMProvider(default_provider))
    
    return llm_router
```

---

## 5. RAG知识库架构

### 5.1 知识库处理流程

```
用户文档 → 解析器 → 分块器 → 向量化 → 存储 → 检索
   │          │         │        │        │
   ▼          ▼         ▼        ▼        ▼
PDF/MD/HTML  PyMuPDF   Recursive LangChain ChromaDB
             pdfplumber Character  Chunking
                         Splitter
```

### 5.2 文档加载器

```python
# src/engine/rag/loader.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional
import os

@dataclass
class Document:
    page_content: str
    metadata: dict

class BaseLoader(ABC):
    @abstractmethod
    def load(self, file_path: str) -> List[Document]:
        pass

class PDFLoader(BaseLoader):
    def load(self, file_path: str) -> List[Document]:
        try:
            from pymupdf import open as open_pdf
        except ImportError:
            from pypdf import PdfReader
        
        documents = []
        
        if 'pymupdf' in dir():
            with open_pdf(file_path) as doc:
                for page_num, page in enumerate(doc):
                    text = page.get_text()
                    documents.append(Document(
                        page_content=text,
                        metadata={
                            'source': os.path.basename(file_path),
                            'page': page_num + 1,
                            'total_pages': len(doc)
                        }
                    ))
        else:
            reader = PdfReader(file_path)
            for page_num, page in enumerate(reader.pages):
                text = page.extract_text()
                documents.append(Document(
                    page_content=text,
                    metadata={
                        'source': os.path.basename(file_path),
                        'page': page_num + 1,
                        'total_pages': len(reader.pages)
                    }
                ))
        
        return documents

class MarkdownLoader(BaseLoader):
    def load(self, file_path: str) -> List[Document]:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return [Document(
            page_content=content,
            metadata={
                'source': os.path.basename(file_path),
                'page': 1
            }
        )]

class HTMLLoader(BaseLoader):
    def load(self, file_path: str) -> List[Document]:
        from bs4 import BeautifulSoup
        
        with open(file_path, 'r', encoding='utf-8') as f:
            html = f.read()
        
        soup = BeautifulSoup(html, 'html.parser')
        text = soup.get_text(separator='\n', strip=True)
        
        return [Document(
            page_content=text,
            metadata={
                'source': os.path.basename(file_path),
                'page': 1
            }
        )]

class DocumentLoaderFactory:
    @staticmethod
    def get_loader(file_path: str) -> BaseLoader:
        ext = os.path.splitext(file_path)[1].lower()
        
        loaders = {
            '.pdf': PDFLoader,
            '.md': MarkdownLoader,
            '.markdown': MarkdownLoader,
            '.html': HTMLLoader,
            '.htm': HTMLLoader,
            '.txt': MarkdownLoader,  # 复用
        }
        
        loader_class = loaders.get(ext)
        if not loader_class:
            raise ValueError(f"Unsupported file type: {ext}")
        
        return loader_class()
    
    @staticmethod
    def load_document(file_path: str) -> List[Document]:
        loader = DocumentLoaderFactory.get_loader(file_path)
        return loader.load(file_path)
```

### 5.3 分块策略

```python
# src/engine/rag/chunker.py

from typing import List, Callable
from dataclasses import dataclass
from .loader import Document

@dataclass
class ChunkConfig:
    chunk_size: int = 500
    chunk_overlap: int = 50
    separators: List[str] = None
    
    def __post_init__(self):
        if self.separators is None:
            self.separators = [
                "\n\n",
                "\n",
                "。",
                "！",
                "？",
                "；",
                "，",
                " ",
                ""
            ]

class RecursiveChunker:
    """递归字符分块器"""
    
    def __init__(self, config: ChunkConfig = None):
        self.config = config or ChunkConfig()
    
    def chunk(self, documents: List[Document]) -> List[Document]:
        chunks = []
        
        for doc in documents:
            doc_chunks = self._chunk_text(
                doc.page_content,
                doc.metadata
            )
            chunks.extend(doc_chunks)
        
        return chunks
    
    def _chunk_text(
        self, 
        text: str, 
        metadata: dict
    ) -> List[Document]:
        chunks = []
        
        for separator in self.config.separators:
            if separator in text:
                texts = text.split(separator)
                break
        else:
            texts = [text]
        
        current_chunk = ""
        
        for text in texts:
            if len(current_chunk) + len(text) <= self.config.chunk_size:
                current_chunk += text
            else:
                if current_chunk:
                    chunks.append(Document(
                        page_content=current_chunk.strip(),
                        metadata={
                            **metadata,
                            'chunk_size': len(current_chunk)
                        }
                    ))
                
                # 处理重叠
                overlap_text = current_chunk[-self.config.chunk_overlap:] if current_chunk else ""
                current_chunk = overlap_text + text
        
        if current_chunk.strip():
            chunks.append(Document(
                page_content=current_chunk.strip(),
                metadata={
                    **metadata,
                    'chunk_size': len(current_chunk)
                }
            ))
        
        return chunks
```

### 5.4 向量存储

```python
# src/storage/vector.py

import chromadb
from chromadb.config import Settings
from typing import List, Optional
from src.engine.rag.loader import Document
from src.llm.router import llm_router

class VectorStore:
    """向量存储管理器"""
    
    def __init__(self, persist_directory: str = "./data/vectors"):
        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(anonymized_telemetry=False)
        )
        self.collection = None
    
    def create_collection(self, name: str = "knowledge_base"):
        """创建或获取集合"""
        self.collection = self.client.get_or_create_collection(
            name=name,
            metadata={"description": "Knowledge base for ShowMeTheButton"}
        )
        return self.collection
    
    async def add_documents(
        self,
        documents: List[Document],
        ids: List[str] = None
    ):
        """添加文档到向量库"""
        if not self.collection:
            self.create_collection()
        
        if ids is None:
            ids = [f"doc_{i}" for i in range(len(documents))]
        
        texts = [doc.page_content for doc in documents]
        metadatas = [doc.metadata for doc in documents]
        
        embeddings = await llm_router.embeddings(texts)
        
        self.collection.add(
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
            ids=ids
        )
    
    def query(
        self,
        query_embedding: List[float],
        n_results: int = 5,
        where: dict = None,
        where_document: dict = None
    ):
        """查询向量库"""
        if not self.collection:
            raise ValueError("Collection not initialized")
        
        return self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where,
            where_document=where_document
        )
    
    def delete(self, ids: List[str]):
        """删除文档"""
        if self.collection:
            self.collection.delete(ids=ids)
    
    def reset(self):
        """重置向量库"""
        if self.collection:
            self.collection.delete()
```

---

## 6. 数据流设计

### 6.1 完整查询流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端SDK                                    │
│                                                                  │
│  用户输入： "我想导出报表"                                          │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐                                                │
│  │ VoiceInput  │  语音识别 → 文本                                  │
│  └─────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐                                                │
│  │ DOMScanner  │  获取页面元素列表                                 │
│  └─────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐                                                │
│  │AgentClient  │  发送 {query, elements}                         │
│  └─────────────┘                                                │
│       │                                                          │
└───────┼──────────────────────────────────────────────────────────┘
        │ HTTP POST /api/v1/query
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                        后端Agent                                  │
│                                                                  │
│  ┌──────────────┐                                                │
│  │   FastAPI    │  接收请求                                       │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────┐                                                │
│  │IntentRecognizer│ 识别意图：locate                              │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────┐                                                │
│  │  RAGRetriever │ 检索知识库                                     │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────┐                                                │
│  │  UIAnalyzer  │  分析UI元素，匹配目标                            │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────┐                                                │
│  │  LLMEnhancer │  可选：LLM增强推理（复杂查询）                    │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────┐                                                │
│  │LocateResult │  返回 {target_id, confidence, reasoning}        │
│  └──────────────┘                                                │
│       │                                                          │
└───────┼──────────────────────────────────────────────────────────┘
        │ HTTP Response
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                        前端SDK                                    │
│                                                                  │
│  ┌──────────────┐                                                │
│  │  QueryResult │  接收结果                                       │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────┐                                                │
│  │AnimationEngine│  动画导航到目标元素                             │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────┐                                                │
│  │  CursorEngine │  显示悬停提示                                   │
│  └──────────────┘                                                │
│       │                                                          │
│       ▼                                                          │
│  用户看到光标飘移到 "导出" 按钮，悬停显示 "点击导出报表"              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 请求/响应模型

```python
# src/models/request.py

from pydantic import BaseModel, Field
from typing import List, Optional

class MarkedElement(BaseModel):
    id: str
    label: str
    type: str  # 'button' | 'input' | 'link' | 'menu' | 'tab' | 'icon' | 'other'
    text: Optional[str] = None
    icon: Optional[str] = None

class QueryRequest(BaseModel):
    query: str = Field(..., description="用户查询")
    context: dict = Field(
        default_factory=dict,
        description="上下文信息"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "我想导出这个报表为PDF",
                "context": {
                    "page_url": "https://example.com/reports",
                    "marked_elements": [
                        {
                            "id": "btn-export",
                            "label": "导出",
                            "type": "button",
                            "text": "导出"
                        },
                        {
                            "id": "btn-print",
                            "label": "打印",
                            "type": "button", 
                            "text": "打印"
                        }
                    ]
                }
            }
        }

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: dict = Field(default_factory=dict)
```

```python
# src/models/response.py

from pydantic import BaseModel, Field
from typing import Optional, List
from .request import MarkedElement

class LocateResult(BaseModel):
    target_id: str
    confidence: float = Field(..., ge=0, le=1)
    reasoning: str
    suggestion: Optional[str] = None

class IntentInfo(BaseModel):
    type: str
    confidence: float
    entities: dict

class QueryResponse(BaseModel):
    success: bool
    result: Optional[LocateResult] = None
    intent: Optional[IntentInfo] = None
    error: Optional[str] = None
    latency_ms: Optional[float] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "result": {
                    "target_id": "btn-export",
                    "confidence": 0.92,
                    "reasoning": "根据用户手册第3.2节，导出功能是报表页面的主要操作",
                    "suggestion": "点击后将弹出导出格式选择对话框"
                },
                "intent": {
                    "type": "locate",
                    "confidence": 0.95,
                    "entities": {"text_keywords": ["导出", "报表"]}
                },
                "latency_ms": 125.5
            }
        }
```

---

## 7. 错误处理与降级策略

### 7.1 错误分类

```python
# src/core/errors.py

from enum import Enum

class ErrorCode(Enum):
    # SDK错误 (1xxx)
    SDK_NOT_INITIALIZED = 1001
    SDK_ALREADY_INITIALIZED = 1002
    SDK_INIT_FAILED = 1003
    SDK_ELEMENT_NOT_FOUND = 1004
    SDK_ANIMATION_FAILED = 1005
    
    # Agent错误 (2xxx)
    AGENT_CONNECTION_FAILED = 2001
    AGENT_TIMEOUT = 2002
    AGENT_INVALID_RESPONSE = 2003
    
    # RAG错误 (3xxx)
    RAG_COLLECTION_NOT_FOUND = 3001
    RAG_RETRIEVAL_FAILED = 3002
    RAG_EMBEDDING_FAILED = 3003
    RAG_EMPTY_RESULT = 3004
    
    # LLM错误 (4xxx)
    LLM_CONNECTION_FAILED = 4001
    LLM_TIMEOUT = 4002
    LLM_INVALID_RESPONSE = 4003
    LLM_QUOTA_EXCEEDED = 4004
    
    # 业务错误 (5xxx)
    NO_MATCHING_ELEMENT = 5001
    LOW_CONFIDENCE_RESULT = 5002
    AMBIGUOUS_QUERY = 5003

class ShowMeError(Exception):
    def __init__(self, code: ErrorCode, message: str, details: dict = None):
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(f"[{code.name}] {message}")
```

### 7.2 降级策略

```python
# 前端降级策略

class FallbackStrategy:
    @staticmethod
    def handle_no_match(sdk: ShowMeSDK, query: str):
        """找不到匹配元素的降级处理"""
        # 1. 尝试更宽松的匹配
        elements = sdk.locatorEngine.getElements()
        fuzzy_matches = sdk.locatorEngine.fuzzyMatch(query, elements)
        
        if fuzzy_matches:
            # 展示多个候选
            return {
                "type": "candidates",
                "items": fuzzy_matches[:3],
                "message": "找到多个可能的目标，请选择："
            }
        
        # 2. 返回搜索建议
        return {
            "type": "suggestion",
            "message": "未找到匹配的元素，请尝试：",
            "suggestions": [
                "使用更具体的描述",
                "说出元素的位置（如'左上角的按钮'）",
                "说出元素的外观（如'红色的按钮'）"
            ]
        }
    
    @staticmethod
    async def handle_agent_unavailable(sdk: ShowMeSDK, query: str):
        """Agent服务不可用时的降级"""
        # 使用本地规则引擎
        elements = sdk.locatorEngine.getElements()
        
        # 简单的关键词匹配
        keywords = query.lower().split()
        matches = [
            e for e in elements
            if any(kw in e.label.lower() or kw in (e.metadata.text or '').lower()
                   for kw in keywords)
        ]
        
        if matches:
            best = max(matches, key=lambda e: e.priority)
            return {
                "type": "local_fallback",
                "target_id": best.id,
                "confidence": 0.5,
                "message": "（本地模式）可能的目标："
            }
        
        return {
            "type": "error",
            "message": "无法处理请求，请检查网络连接或Agent服务"
        }
```

---

## 8. 安全与隐私设计

### 8.1 数据隔离


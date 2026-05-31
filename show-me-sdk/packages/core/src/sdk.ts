import { EventBus, SDK_EVENTS } from './bus/EventBus';
import { DOMScanner } from './scanner/DOMScanner';
import { CursorEngine } from './cursor/CursorEngine';
import { AgentClient } from './client/AgentClient';
import { ShowMeConfig } from './types';

export class ShowMeSDK {
  private config: ShowMeConfig;
  private eventBus: EventBus;
  private domScanner: DOMScanner;
  private cursorEngine: CursorEngine;
  private agentClient: AgentClient;
  private initialized = false;
  private active = false;

  constructor(config: ShowMeConfig) {
    this.config = config;
    this.eventBus = new EventBus();
    this.domScanner = new DOMScanner(this.eventBus);
    this.cursorEngine = new CursorEngine(this.eventBus, config.cursorStyle);
    this.agentClient = new AgentClient(config.agentEndpoint);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    await this.cursorEngine.init();
    await this.domScanner.scan();
    
    this.initialized = true;
    this.eventBus.emit(SDK_EVENTS.INITIALIZED);
  }

  activate(): void {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call init() first');
    }
    this.active = true;
    this.cursorEngine.show();
    this.eventBus.emit(SDK_EVENTS.ACTIVATED);
  }

  deactivate(): void {
    this.active = false;
    this.cursorEngine.hide();
    this.eventBus.emit(SDK_EVENTS.DEACTIVATED);
  }

  async query(userQuery: string): Promise<any> {
    const elements = this.domScanner.getElements();
    
    const response = await this.agentClient.query({
      query: userQuery,
      elements: elements.map((e) => ({
        id: e.id,
        label: e.label,
        type: e.type,
        text: e.metadata.text,
      })),
      context: {
        url: window.location.href,
        timestamp: Date.now(),
      },
    });

    if (response.success && response.result?.target_id) {
      const target = this.domScanner.getElementById(response.result.target_id);
      if (target) {
        await this.cursorEngine.flyTo(target.element);
        await this.cursorEngine.hover(target.element, response.result.reasoning);
      }
    }

    return response;
  }
}

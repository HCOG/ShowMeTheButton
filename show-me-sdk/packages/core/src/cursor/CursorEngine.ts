import { EventBus } from '../bus/EventBus';
import { SDK_EVENTS } from '../bus/EventBus';
import { CursorConfig } from '../types';

export class CursorEngine {
  private eventBus: EventBus;
  private cursorElement: HTMLElement | null = null;
  private tooltipElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private config: Required<CursorConfig>;
  private isVisible = false;
  private currentTarget: HTMLElement | null = null;

  constructor(eventBus: EventBus, config: CursorConfig = {}) {
    this.eventBus = eventBus;
    this.config = {
      autoHide: config.autoHide ?? true,
      followMouse: config.followMouse ?? true,
      zIndex: config.zIndex ?? 999999,
      offsetX: config.offsetX ?? 15,  // 默认偏移15px
      offsetY: config.offsetY ?? 15,
    };
  }

  async init(): Promise<void> {
    this.createCursor();
    this.setupMouseTracking();
    this.eventBus.emit(SDK_EVENTS.INITIALIZED);
  }

  private createCursor(): void {
    const container = document.createElement('div');
    container.id = 'show-me-sdk-cursor';
    container.attachShadow({ mode: 'open' });
    this.shadowRoot = container.shadowRoot;
    
    const style = document.createElement('style');
    style.textContent = `
      :host {
        pointer-events: none;
        z-index: ${this.config.zIndex};
      }
      
      .cursor {
        position: fixed;
        width: 24px;
        height: 24px;
        background: #667eea;
        border-radius: 50%;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.5);
        transition: transform 0.1s ease;
      }
      
      .cursor.hidden {
        opacity: 0;
      }
      
      .tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        white-space: nowrap;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
      }
    `;
    
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    
    this.shadowRoot?.appendChild(style);
    this.shadowRoot?.appendChild(cursor);
    
    this.cursorElement = cursor;
    document.body.appendChild(container);
  }

  private setupMouseTracking(): void {
    if (this.config.followMouse) {
      document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.cursorElement || !this.config.followMouse) return;
    
    // 跟随鼠标但有小偏移（光标在鼠标右下方）
    this.cursorElement.style.left = `${event.clientX + this.config.offsetX}px`;
    this.cursorElement.style.top = `${event.clientY + this.config.offsetY}px`;
  }

  show(): void {
    this.isVisible = true;
    this.cursorElement?.classList.remove('hidden');
    this.eventBus.emit(SDK_EVENTS.ACTIVATED);
  }

  hide(): void {
    this.isVisible = false;
    this.cursorElement?.classList.add('hidden');
    this.eventBus.emit(SDK_EVENTS.DEACTIVATED);
  }

  async flyTo(target: HTMLElement, duration = 800): Promise<void> {
    const targetRect = target.getBoundingClientRect();
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    
    const startRect = this.cursorElement?.getBoundingClientRect();
    const startX = startRect?.left ?? 0;
    const startY = startRect?.top ?? 0;
    
    await this.animate(startX, startY, targetX, targetY, duration);
    this.currentTarget = target;
  }

  private animate(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      
      const tick = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        
        const currentX = startX + (endX - startX) * eased;
        const currentY = startY + (endY - startY) * eased;
        
        this.cursorElement!.style.left = `${currentX}px`;
        this.cursorElement!.style.top = `${currentY}px`;
        this.cursorElement!.style.transform = 'translate(-50%, -50%)';
        
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      
      requestAnimationFrame(tick);
    });
  }

  hover(element: HTMLElement, message: string, duration = 4000): Promise<void> {
    return new Promise(resolve => {
      this.showTooltip(message);
      
      setTimeout(() => {
        this.hideTooltip();
        resolve();
      }, duration);
    });
  }

  private showTooltip(message: string): void {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = message;
    this.shadowRoot?.appendChild(tooltip);
    this.tooltipElement = tooltip;
  }

  private hideTooltip(): void {
    this.tooltipElement?.remove();
    this.tooltipElement = null;
  }

  destroy(): void {
    this.cursorElement?.remove();
    document.querySelector('#show-me-sdk-cursor')?.remove();
    this.eventBus.clear();
  }
}

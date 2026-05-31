import { EventBus } from '../bus/EventBus';
import { SDK_EVENTS } from '../bus/EventBus';

export interface ScannedElement {
  id: string;
  element: HTMLElement;
  bounds: DOMRect;
  label: string;
  type: 'button' | 'input' | 'link' | 'menu' | 'tab' | 'icon' | 'other';
  metadata: {
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
  'input:not([type="hidden"])',
  'select:not([disabled])',
  'textarea',
  'a[href]',
  '.btn',
  '.button',
  '[class*="btn"]',
  '[class*="button"]',
  '[aria-label]',
];

export class DOMScanner {
  private eventBus: EventBus;
  private elements: Map<string, ScannedElement> = new Map();
  private mutationObserver: MutationObserver | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
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
      }
    });
    
    this.eventBus.emit(SDK_EVENTS.SCANNER_COMPLETE, { count: results.length });
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
      type: this.detectType(element),
      metadata: {
        text: this.extractText(element),
        icon: this.extractIcon(element),
        disabled: element.disabled,
        ariaLabel: element.getAttribute('aria-label') || undefined,
        role: element.getAttribute('role') || undefined,
      },
    };
  }

  private generateLabel(element: HTMLElement): string {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    
    const text = this.extractText(element);
    if (text) return text.trim();
    
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;
    
    const title = element.getAttribute('title');
    if (title) return title;
    
    return '未命名元素';
  }

  private detectType(element: HTMLElement): ScannedElement['type'] {
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

  private extractText(element: HTMLElement): string | undefined {
    return element.textContent?.trim() || element.getAttribute('aria-label') || undefined;
  }

  private extractIcon(element: HTMLElement): string | undefined {
    const iconClasses = ['icon', 'fa', 'material-icons'];
    for (const cls of iconClasses) {
      if (element.classList.contains(cls)) {
        return element.className;
      }
    }
    
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
    if (element.id.startsWith('smt-el-')) return false;
    if (!this.isVisible(element)) return false;
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
    this.elements.clear();
    return this.scan();
  }

  observe(callback?: () => void): void {
    this.mutationObserver = new MutationObserver(() => {
      callback?.();
      this.refresh();
    });
    
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  disconnect(): void {
    this.mutationObserver?.disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TargetRing — a pulsing highlight ring rendered over a target element.
//
// Rendered in its own fixed-position Shadow-DOM overlay so it sits above all
// page content and never modifies the target element itself (pointer-events:
// none → clicks pass straight through). Tracks the element's position every
// animation frame, so it stays glued to the target through scroll/resize.
//
// Shared by the JourneyRunner (per-step highlight) and the SDK single-element
// location flow (guide()/flyToElement highlight).
// ─────────────────────────────────────────────────────────────────────────────

import { Z_INDEX } from '../constants';

export class TargetRing {
  private container: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private ringEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private rafId: number | null = null;
  private target: HTMLElement | null = null;

  /**
   * Show the ring around `target`. If `label` is provided, a small popover is
   * rendered just outside the ring (above the element, or below when there is
   * no room) so the hint sits where the user is actually looking.
   */
  show(target: HTMLElement, label?: string): void {
    this.target = target;

    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'smt-target-ring';
      Object.assign(this.container.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '0',
        height: '0',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: String(Z_INDEX.OVERLAY),
      });
      this.shadow = this.container.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = RING_STYLES;
      this.shadow.appendChild(style);

      this.ringEl = document.createElement('div');
      this.ringEl.className = 'ring';
      this.shadow.appendChild(this.ringEl);

      this.labelEl = document.createElement('div');
      this.labelEl.className = 'ring-label';
      this.shadow.appendChild(this.labelEl);

      document.body.appendChild(this.container);
    }

    if (this.labelEl) {
      const text = (label ?? '').trim();
      this.labelEl.textContent = text;
      this.labelEl.style.display = text ? 'block' : 'none';
    }

    this._updatePosition();
    this._startTracking();
  }

  hide(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.ringEl) this.ringEl.style.opacity = '0';
    if (this.labelEl) this.labelEl.style.opacity = '0';
    // Remove after fade
    setTimeout(() => {
      this.container?.remove();
      this.container = null;
      this.shadow = null;
      this.ringEl = null;
      this.labelEl = null;
      this.target = null;
    }, 300);
  }

  private _updatePosition() {
    if (!this.target || !this.ringEl) return;
    const r = this.target.getBoundingClientRect();
    const pad = 6;
    const top = r.top - pad;
    const left = r.left - pad;
    const width = r.width + pad * 2;
    const height = r.height + pad * 2;
    Object.assign(this.ringEl.style, {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${height}px`,
      opacity: '1',
    });

    // Position the label above the ring, or below if it would clip the top.
    if (this.labelEl && this.labelEl.style.display !== 'none') {
      const labelH = 34;
      const placeBelow = top < labelH + 12;
      this.labelEl.classList.toggle('below', placeBelow);
      Object.assign(this.labelEl.style, {
        left: `${left + width / 2}px`,
        top: placeBelow ? `${top + height + 10}px` : `${top - 10}px`,
        opacity: '1',
      });
    }
  }

  private _startTracking() {
    const tick = () => {
      this._updatePosition();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}

const RING_STYLES = `
  .ring {
    position: fixed;
    border-radius: 8px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.25s ease, top 0.1s, left 0.1s, width 0.1s, height 0.1s;
    animation: ring-pulse 1.8s ease-in-out infinite;
    box-sizing: border-box;
  }
  @keyframes ring-pulse {
    0%, 100% {
      box-shadow:
        0 0 0 2px #667eea,
        0 0 0 5px rgba(102,126,234,0.25),
        0 0 20px rgba(102,126,234,0.15);
    }
    50% {
      box-shadow:
        0 0 0 3px #764ba2,
        0 0 0 10px rgba(118,75,162,0.2),
        0 0 30px rgba(118,75,162,0.1);
    }
  }

  .ring-label {
    position: fixed;
    transform: translate(-50%, -100%);
    max-width: 280px;
    background: rgba(18, 22, 38, 0.95);
    color: #f0f4ff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12.5px;
    line-height: 1.4;
    font-weight: 500;
    padding: 7px 11px;
    border-radius: 8px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.3), 0 0 0 1px rgba(102,126,234,0.4);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.25s ease, top 0.1s, left 0.1s;
    white-space: normal;
    text-align: center;
    z-index: 1;
  }
  /* little caret pointing at the element */
  .ring-label::after {
    content: '';
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    bottom: -11px;
    border-top-color: rgba(18, 22, 38, 0.95);
  }
  .ring-label.below { transform: translate(-50%, 0); }
  .ring-label.below::after {
    bottom: auto;
    top: -11px;
    border-top-color: transparent;
    border-bottom-color: rgba(18, 22, 38, 0.95);
  }
`;

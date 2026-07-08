// ─────────────────────────────────────────────────────────────────────────────
// JourneyPill — compact bottom-left overlay.
//
// Shows: step dots · step title · [Done] · [✕]
// The "Done" button fades in after 2 s so the user can manually advance
// when auto-detection doesn't fire (e.g. filling a form field).
// ─────────────────────────────────────────────────────────────────────────────

import { JourneyStep } from './JourneyRunner';
import { Z_INDEX } from '../constants';

export type PillPhase = 'planning' | 'finding' | 'navigating' | 'waiting' | 'completed';

export class JourneyPill {
  private container: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private pillEl: HTMLElement | null = null;
  private onCancel: () => void;

  constructor(onCancel: () => void) {
    this.onCancel = onCancel;
  }

  mount(): void {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'smt-journey-pill';
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '24px',
      left: '24px',
      zIndex: String(Z_INDEX.OVERLAY),
      pointerEvents: 'none',
    });
    this.shadow = this.container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = PILL_STYLES;
    this.shadow.appendChild(style);

    this.pillEl = document.createElement('div');
    this.pillEl.className = 'pill';
    this.shadow.appendChild(this.pillEl);

    // Event delegation: clicks bubble out to shadow host's content
    this.pillEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      e.stopPropagation();
      if (btn.id === 'smt-cancel') {
        this.onCancel();
      } else if (btn.id === 'smt-done') {
        document.dispatchEvent(new CustomEvent('smt:done'));
      }
    });

    // Pills need pointer-events on the pill itself, not the container
    this.pillEl.style.pointerEvents = 'all';
    document.body.appendChild(this.container);
  }

  /** Show a "planning…" state while the agent is figuring out the steps. */
  showPlanning(): void {
    if (!this.pillEl) return;
    this.pillEl.innerHTML = `
      <span class="planning-icon">🤖</span>
      <span class="title">正在规划步骤…</span>
      <button class="btn-cancel" id="smt-cancel" title="取消">✕</button>
    `;
  }

  /** Show an error message in the pill (auto-dismisses via the caller). */
  showError(message: string): void {
    if (!this.pillEl) return;
    const safe = message.length > 60 ? message.slice(0, 58) + '…' : message;
    this.pillEl.innerHTML = `
      <span class="error-icon">⚠️</span>
      <span class="title">${safe}</span>
      <button class="btn-cancel" id="smt-cancel" title="关闭">✕</button>
    `;
  }

  /**
   * Render the pill for a step. `total === 0` means the total is unknown
   * (iterative mode) — we then show completed dots plus one pulsing "active"
   * dot, and the label drops the "/N".
   */
  update(current: number, total: number, step: JourneyStep, phase: PillPhase): void {
    if (!this.pillEl) return;

    const phaseLabel: Record<PillPhase, string> = {
      planning:   '🤖 正在规划…',
      finding:    '🔍 定位中…',
      navigating: '✈️ 飞向目标…',
      waiting:    '👆 请执行操作',
      completed:  '🎉 完成！',
    };

    const unknownTotal = total <= 0;

    // Build dots. With an unknown total, show done dots + one active dot.
    const dotCount = unknownTotal ? current : total;
    const dots = Array.from({ length: dotCount }, (_, i) => {
      const cls = i < current - 1 ? 'dot done' : i === current - 1 ? 'dot active' : 'dot';
      return `<span class="${cls}"></span>`;
    }).join('') + (unknownTotal ? '<span class="dot pending"></span>' : '');

    const stepLabel = unknownTotal ? `第 ${current} 步` : `${current}/${total}`;

    const isWaiting = phase === 'waiting';
    const isCompleted = phase === 'completed';
    const titleText = step.title.length > 40 ? step.title.slice(0, 38) + '…' : step.title;

    this.pillEl.innerHTML = `
      <div class="dots">${dots}</div>
      <span class="step-label">${stepLabel}</span>
      <span class="divider">·</span>
      <span class="title">${titleText}</span>
      <span class="phase ${phase}">${phaseLabel[phase]}</span>
      ${isWaiting
        ? `<button class="btn-done ${isWaiting ? 'visible' : ''}" id="smt-done">完成 ✓</button>`
        : isCompleted
        ? `<span class="completed-icon">✅</span>`
        : ''}
      <button class="btn-cancel" id="smt-cancel" title="取消">✕</button>
    `;
  }

  unmount(): void {
    this.container?.remove();
    this.container = null;
    this.pillEl = null;
    this.shadow = null;
  }
}

const PILL_STYLES = `
  :host { all: initial; }

  .pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(18, 22, 38, 0.94);
    color: #e2e8f0;
    border-radius: 100px;
    padding: 10px 14px 10px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06);
    backdrop-filter: blur(12px);
    animation: pill-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
    white-space: nowrap;
    max-width: 520px;
  }

  @keyframes pill-in {
    from { opacity: 0; transform: translateY(12px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .dots { display: flex; gap: 4px; flex-shrink: 0; }
  .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    transition: background 0.3s;
  }
  .dot.active  { background: #667eea; box-shadow: 0 0 0 2px rgba(102,126,234,0.35); }
  .dot.done    { background: #48bb78; }
  .dot.pending {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.25);
    animation: dot-pending 1.4s ease-in-out infinite;
  }
  @keyframes dot-pending {
    0%, 100% { opacity: 0.3; }
    50%      { opacity: 0.8; }
  }

  .step-label { font-size: 11px; color: rgba(255,255,255,0.4); flex-shrink: 0; }
  .divider    { color: rgba(255,255,255,0.2); flex-shrink: 0; }
  .title      { font-weight: 500; color: #f0f4ff; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; }

  .phase {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    flex-shrink: 0;
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.6);
  }
  .phase.waiting    { background: rgba(102,126,234,0.25); color: #a3b3ff; }
  .phase.navigating { background: rgba(118,75,162,0.25); color: #c4a3ff; }
  .phase.completed  { background: rgba(72,187,120,0.25); color: #9ae6b4; }
  .phase.finding    { background: rgba(237,137,54,0.18); color: #fbb36a; }

  .planning-icon { font-size: 16px; }

  .completed-icon { font-size: 16px; flex-shrink: 0; }

  .error-icon { font-size: 16px; flex-shrink: 0; }

  .btn-done {
    background: rgba(102,126,234,0.3);
    color: #a3b3ff;
    border: 1px solid rgba(102,126,234,0.4);
    border-radius: 20px;
    padding: 3px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    animation: fade-in 0.3s ease 2s forwards;
    transition: background 0.15s;
  }
  .btn-done:hover { background: rgba(102,126,234,0.5); }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .btn-cancel {
    background: rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.5);
    border: none;
    border-radius: 50%;
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }
  .btn-cancel:hover { background: rgba(255,80,80,0.25); color: #fc8181; }
`;

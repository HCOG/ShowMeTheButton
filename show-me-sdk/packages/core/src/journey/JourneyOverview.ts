import { JourneyStep } from './JourneyRunner';
import { Z_INDEX } from '../constants';

interface JourneyOverviewOptions {
  goal: string;
  steps: JourneyStep[];
  onStart: () => void;
  onCancel: () => void;
}

/** Mode of the overview panel across its lifecycle. */
export type OverviewMode = 'overview' | 'executing' | 'completed';

/** Per-step execution status (only meaningful in `executing`/`completed` modes). */
export type StepStatus = 'pending' | 'active' | 'completed';

/**
 * Bottom-center panel that drives the journey from plan → execution → done.
 *
 * Replaces the legacy `JourneyPill` execution HUD for the `startSmartWithPreview`
 * path: the same component shows the planned steps upfront, swaps to live
 * progress as each step runs, and finally shows a "完成" banner.
 *
 * Mode transitions:
 *   overview  →  user clicks Start  →  executing
 *   executing  →  last step done    →  completed (auto-dismisses after delay)
 *   any        →  user clicks Cancel → unmounted by the runner
 */
export class JourneyOverview {
  private container: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panel: HTMLElement | null = null;
  private startBtn: HTMLButtonElement | null = null;
  private starting = false;
  private mode: OverviewMode = 'overview';
  /** Per-step status, keyed by step number (1-based). */
  private stepStatus: StepStatus[] = [];

  constructor(private opts: JourneyOverviewOptions) {
    this.stepStatus = opts.steps.map(() => 'pending');
  }

  mount(): void {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'smt-journey-overview';
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: String(Z_INDEX.OVERLAY),
      pointerEvents: 'none',
    });
    this.shadow = this.container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERVIEW_STYLES;
    this.shadow.appendChild(style);

    this.panel = document.createElement('div');
    this.panel.className = 'overview';
    this.panel.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      e.stopPropagation();
      if (btn.id === 'smt-overview-start') {
        this._handleStart();
      } else if (btn.id === 'smt-overview-cancel') {
        this.opts.onCancel();
      }
    });
    this.panel.style.pointerEvents = 'all';

    this._render();
    this.shadow.appendChild(this.panel);
    document.body.appendChild(this.container);
  }

  /**
   * Switch from `overview` (plan awaiting Start) to `executing` (steps running).
   * Replaces the Start button with a Cancel-only action.
   */
  setExecuting(): void {
    this.mode = 'executing';
    this._render();
  }

  /** Update a step's status. Triggers a partial re-render of the row only. */
  setStepStatus(stepNumber: number, status: StepStatus): void {
    const idx = stepNumber - 1;
    if (idx < 0 || idx >= this.stepStatus.length) return;
    if (this.stepStatus[idx] === status) return;
    this.stepStatus[idx] = status;
    this._renderStepRow(idx);
  }

  /** All steps done. Banner swaps to "完成" + auto-dismiss hint. */
  setCompleted(): void {
    this.mode = 'completed';
    // Mark any still-active steps as completed (defensive).
    for (let i = 0; i < this.stepStatus.length; i++) {
      if (this.stepStatus[i] !== 'completed') this.stepStatus[i] = 'completed';
    }
    this._render();
  }

  unmount(): void {
    this.container?.remove();
    this.container = null;
    this.shadow = null;
    this.panel = null;
    this.startBtn = null;
  }

  private _handleStart(): void {
    if (this.starting) return;
    this.starting = true;
    if (this.startBtn) {
      this.startBtn.disabled = true;
      this.startBtn.classList.add('loading');
      this.startBtn.textContent = '正在启动…';
    }
    this.opts.onStart();
  }

  private _renderStepRow(idx: number): void {
    const row = this.panel?.querySelector<HTMLLIElement>(`[data-step-row="${idx}"]`);
    if (!row) return;
    const step = this.opts.steps[idx];
    const status = this.stepStatus[idx];
    row.className = `step-row status-${status}`;
    row.innerHTML = this._stepRowInner(step, idx, status);
  }

  private _stepRowInner(s: JourneyStep, i: number, status: StepStatus): string {
    const badge =
      status === 'completed' ? '✅'
      : status === 'active'  ? '…'
      : `<span class="step-num">${i + 1}</span>`;
    return `
      ${badge}
      <div class="step-text">
        <div class="step-title">${escapeHtml(s.title)}</div>
        ${s.description ? `<div class="step-desc">${escapeHtml(s.description)}</div>` : ''}
      </div>
    `;
  }

  private _render(): void {
    if (!this.panel) return;
    const { goal, steps } = this.opts;

    const rows = steps.map((s, i) =>
      `<li class="step-row status-${this.stepStatus[i]}" data-step-row="${i}">
        ${this._stepRowInner(s, i, this.stepStatus[i])}
      </li>`
    ).join('');

    const eyebrow =
      this.mode === 'overview'   ? `📋 已为你规划 ${steps.length} 步`
      : this.mode === 'executing' ? `⚙️ 正在执行 (${this._completedCount()}/${steps.length})`
      :                              `🎉 已完成 ${steps.length} 步`;

    const actions =
      this.mode === 'overview'
        ? `<div class="actions">
             <button class="btn-start" id="smt-overview-start">
               ▶ 开始执行 (${steps.length} 步)
             </button>
             <span class="actions-hint">随时可以取消</span>
           </div>`
        : this.mode === 'executing'
        ? `<div class="actions">
             <button class="btn-cancel-wide" id="smt-overview-cancel">取消执行</button>
           </div>`
        : `<div class="actions">
             <span class="actions-hint">几秒后自动关闭…</span>
             <button class="btn-close" id="smt-overview-cancel">关闭</button>
           </div>`;

    this.panel.innerHTML = `
      <div class="header">
        <div class="header-text">
          <div class="header-eyebrow">${eyebrow}</div>
          <div class="header-goal">${escapeHtml(goal)}</div>
        </div>
        ${this.mode === 'overview'
          ? `<button class="btn-cancel" id="smt-overview-cancel" title="取消">✕</button>`
          : ''}
      </div>
      <ol class="step-list">${rows}</ol>
      ${actions}
    `;

    this.startBtn = this.panel.querySelector<HTMLButtonElement>('#smt-overview-start');
  }

  private _completedCount(): number {
    return this.stepStatus.filter(s => s === 'completed').length;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const OVERVIEW_STYLES = `
  :host { all: initial; }

  .overview {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 420px;
    max-width: calc(100vw - 32px);
    background: rgba(18, 22, 38, 0.94);
    color: #e2e8f0;
    border-radius: 16px;
    padding: 16px 18px 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06);
    backdrop-filter: blur(12px);
    animation: overview-in 0.35s cubic-bezier(0.34,1.56,0.64,1);
  }

  @keyframes overview-in {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ── Header ───────────────────────────────────────────── */
  .header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .header-text { flex: 1; min-width: 0; }
  .header-eyebrow {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .header-goal {
    font-size: 14px;
    font-weight: 600;
    color: #f0f4ff;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .btn-cancel {
    background: rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.5);
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }
  .btn-cancel:hover { background: rgba(255,80,80,0.25); color: #fc8181; }

  /* ── Step list ────────────────────────────────────────── */
  .step-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 240px;
    overflow-y: auto;
  }
  .step-list::-webkit-scrollbar { width: 6px; }
  .step-list::-webkit-scrollbar-track { background: transparent; }
  .step-list::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
  }

  .step-row {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    background: rgba(255,255,255,0.04);
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.05);
    transition: background 0.2s, border-color 0.2s, opacity 0.2s;
  }
  .step-row.status-completed {
    background: rgba(72,187,120,0.08);
    border-color: rgba(72,187,120,0.25);
    opacity: 0.85;
  }
  .step-row.status-completed .step-title {
    text-decoration: line-through;
    text-decoration-color: rgba(72,187,120,0.5);
  }
  .step-row.status-active {
    background: rgba(102,126,234,0.12);
    border-color: rgba(102,126,234,0.35);
    box-shadow: 0 0 0 1px rgba(102,126,234,0.2);
  }

  .step-num {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(102,126,234,0.35);
  }
  /* Active state: show a pulsing "thinking" indicator instead of the static number */
  .step-row.status-active > .step-num,
  .step-row.status-active > .step-bullet {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    animation: thinking-pulse 1.2s ease-in-out infinite;
  }
  .step-row.status-completed > .step-bullet {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(72,187,120,0.25);
    color: #48bb78;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .step-bullet {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  @keyframes thinking-pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(102,126,234,0.5); }
    50%      { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(102,126,234,0); }
  }

  .step-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .step-title {
    font-size: 13px;
    font-weight: 600;
    color: #f0f4ff;
    line-height: 1.4;
  }
  .step-desc {
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    line-height: 1.45;
  }

  /* ── Actions ──────────────────────────────────────────── */
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 2px;
  }
  .btn-start {
    flex: 1;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.15s, opacity 0.15s;
    box-shadow: 0 4px 12px rgba(102,126,234,0.35);
    font-family: inherit;
  }
  .btn-start:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(102,126,234,0.45);
  }
  .btn-start:active:not(:disabled) { transform: translateY(0); }
  .btn-start:disabled {
    cursor: default;
    opacity: 0.7;
  }
  .btn-start.loading { background: rgba(255,255,255,0.08); box-shadow: none; }

  .btn-cancel-wide, .btn-close {
    flex: 1;
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.7);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit;
  }
  .btn-cancel-wide:hover, .btn-close:hover {
    background: rgba(255,80,80,0.18);
    color: #fc8181;
    border-color: rgba(255,80,80,0.3);
  }

  .actions-hint {
    font-size: 11px;
    color: rgba(255,255,255,0.35);
    white-space: nowrap;
  }
`;
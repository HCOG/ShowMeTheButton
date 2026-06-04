import { DOMScanner } from '../scanner/DOMScanner';
import { CursorEngine } from '../cursor/CursorEngine';
import { AgentClient } from '../client/AgentClient';
import { EventBus } from '../bus/EventBus';

export interface JourneyStep {
  step: number;
  title: string;
  description: string;
  query: string;
  hint?: string;
  targetPage?: string;
}

export interface JourneyConfig {
  id: string;
  title: string;
  description: string;
  page?: string;
  steps: JourneyStep[];
}

export type JourneyStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

export interface JourneyState {
  status: JourneyStatus;
  currentStep: number;   // 1-based
  totalSteps: number;
  step?: JourneyStep;
}

// ─────────────────────────────────────────────────────────────────────────────

export class JourneyRunner {
  private hud: JourneyHUD | null = null;
  private journey: JourneyConfig | null = null;

  /** Current 1-based step index, 0 = not started */
  private currentStep = 0;
  private status: JourneyStatus = 'idle';

  /** Resolved by user clicking "Next" in the HUD */
  private nextResolve: (() => void) | null = null;

  private onStateChange?: (state: JourneyState) => void;

  constructor(
    private domScanner: DOMScanner,
    private cursorEngine: CursorEngine,
    private agentClient: AgentClient,
    private eventBus: EventBus,
  ) {}

  onState(cb: (state: JourneyState) => void) {
    this.onStateChange = cb;
  }

  getState(): JourneyState {
    return {
      status: this.status,
      currentStep: this.currentStep,
      totalSteps: this.journey?.steps.length ?? 0,
      step: this.journey?.steps[this.currentStep - 1],
    };
  }

  private _emit() {
    const s = this.getState();
    this.onStateChange?.(s);
    this.eventBus.emit('journey:state', s);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async start(journey: JourneyConfig): Promise<void> {
    // Cancel any in-progress journey first
    if (this.status === 'running') {
      this._doCancel();
    }

    this.journey = journey;
    this.currentStep = 0;
    this.status = 'running';
    this.nextResolve = null;

    this.hud = new JourneyHUD(journey, {
      onNext:   () => this._advanceNext(),
      onPrev:   () => this._goToPrev(),
      onCancel: () => this.cancel(),
    });
    this.hud.mount();

    await this._runLoop(0);
  }

  cancel() {
    this._doCancel();
  }

  private _doCancel() {
    this.status = 'cancelled';
    // Unblock any waiting _waitNext() call
    const resolve = this.nextResolve;
    this.nextResolve = null;
    resolve?.();
    // Tear down HUD
    this.hud?.unmount();
    this.hud = null;
    this._emit();
  }

  private _advanceNext() {
    const resolve = this.nextResolve;
    this.nextResolve = null;
    resolve?.();
  }

  private _goToPrev() {
    if (this.currentStep <= 1) return;
    // Signal the current wait to jump back by setting step index before resolving
    this.currentStep = Math.max(1, this.currentStep - 2); // will be re-incremented
    this._advanceNext();
  }

  // ── Core loop ───────────────────────────────────────────────────────────────

  private async _runLoop(fromIndex: number): Promise<void> {
    const steps = this.journey!.steps;
    let i = fromIndex;

    while (i < steps.length) {
      if (this.status !== 'running') break;

      this.currentStep = i + 1;
      const step = steps[i];

      // ── Find & fly ──────────────────────────────────────────────────────────
      this.hud!.update(this.currentStep, steps.length, step, 'finding');
      this._emit();

      await this.domScanner.refresh();

      const elements = this.domScanner.getElements();
      let targetId: string | null = null;
      let reasoning = '';

      try {
        const resp = await this.agentClient.query({
          query: step.query,
          elements: elements.map(e => ({ id: e.id, label: e.label, type: e.type, text: e.metadata.text })),
          context: { url: window.location.href, timestamp: Date.now() },
        });
        if (resp.success && resp.result?.target_id) {
          targetId = resp.result.target_id;
          reasoning = resp.result.reasoning;
        }
      } catch (err) {
        console.warn('[ShowMeSDK] Journey agent query failed:', err);
      }

      // Guard: loop might have been cancelled during the async agent call
      if (this.status !== 'running') break;

      if (targetId) {
        const target = this.domScanner.getElementById(targetId);
        if (target) {
          this.hud!.update(this.currentStep, steps.length, step, 'navigating');
          await this.cursorEngine.flyTo(target.element);
          await this.cursorEngine.hover(
            target.element,
            step.hint ?? reasoning ?? step.description,
            3000,
          );
        }
      }

      // Guard again after animation
      if (this.status !== 'running') break;

      // ── Last step: auto-complete ─────────────────────────────────────────────
      if (i === steps.length - 1) {
        this.status = 'completed';
        this.hud!.update(this.currentStep, steps.length, step, 'completed');
        this._emit();
        await sleep(2500);
        this.hud?.unmount();
        this.hud = null;
        break;
      }

      // ── Intermediate step: wait for "Next →" click ───────────────────────────
      this.hud!.update(this.currentStep, steps.length, step, 'waiting');

      const prevStep = this.currentStep;
      await this._waitNext();

      if (this.status !== 'running') break;

      // Handle "Prev" — currentStep was decremented by _goToPrev before resolving
      if (this.currentStep < prevStep) {
        i = this.currentStep; // loop will do currentStep = i+1 at top
      } else {
        i++; // normal advance
      }
    }
  }

  private _waitNext(): Promise<void> {
    return new Promise<void>(resolve => {
      this.nextResolve = resolve;
    });
  }
}

// ── Journey HUD (Shadow DOM overlay) ─────────────────────────────────────────

type HudPhase = 'finding' | 'navigating' | 'waiting' | 'completed';

interface HudCallbacks {
  onNext: () => void;
  onPrev: () => void;
  onCancel: () => void;
}

class JourneyHUD {
  private container: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private contentEl: HTMLElement | null = null;
  private _phase: HudPhase = 'finding';
  private _onNext: () => void;
  private _onPrev: () => void;
  private _onCancel: () => void;

  constructor(private journey: JourneyConfig, cb: HudCallbacks) {
    this._onNext   = cb.onNext;
    this._onPrev   = cb.onPrev;
    this._onCancel = cb.onCancel;
  }

  mount() {
    if (this.container) return; // already mounted
    this.container = document.createElement('div');
    this.container.id = 'smt-journey-hud';
    this.shadow = this.container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = HUD_STYLES;
    this.shadow.appendChild(style);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'hud';
    this.shadow.appendChild(this.contentEl);

    document.body.appendChild(this.container);

    // Attach persistent listeners to fixed IDs via event delegation on contentEl
    this.contentEl.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest('button')?.id;
      if (id === 'smt-cancel') { e.stopPropagation(); this._onCancel(); }
      if (id === 'smt-prev')   { e.stopPropagation(); this._onPrev(); }
      if (id === 'smt-next')   { e.stopPropagation(); this._onNext(); }
      if (id === 'smt-done')   { e.stopPropagation(); this._onCancel(); }
    });
  }

  update(current: number, total: number, step: JourneyStep, phase: HudPhase) {
    if (!this.contentEl) return;
    this._phase = phase;

    const pct = Math.round(((current - 1) / total) * 100);
    const phaseLabel: Record<HudPhase, string> = {
      finding:    '🔍 正在定位…',
      navigating: '✈️ 飞向目标…',
      waiting:    '👆 请点击高亮按钮，然后点「下一步」',
      completed:  '🎉 教程完成！',
    };
    const isWaiting   = phase === 'waiting';
    const isCompleted = phase === 'completed';
    const isFirst     = current === 1;

    // Use textContent / attribute updates rather than full innerHTML
    // to avoid detaching and re-attaching the entire subtree.
    // First render: build the full HTML once; afterwards patch in-place.
    if (!this.contentEl.querySelector('.hud-inner')) {
      this.contentEl.innerHTML = `
        <div class="hud-inner">
          <div class="header">
            <span class="journey-title">${this.journey.title}</span>
            <button class="btn-cancel" id="smt-cancel">✕</button>
          </div>
          <div class="progress-bar"><div class="progress-fill" id="smt-prog"></div></div>
          <div class="step-badge" id="smt-badge"></div>
          <div class="step-title"  id="smt-title"></div>
          <div class="step-desc"   id="smt-desc"></div>
          <div class="phase-label" id="smt-phase"></div>
          <div class="controls">
            <button id="smt-prev"  class="btn-prev">← 上一步</button>
            <button id="smt-next"  class="btn-next">下一步 →</button>
            <button id="smt-done"  class="btn-done" style="display:none">完成 ✓</button>
          </div>
        </div>`;
    }

    // Patch only the parts that change
    const q = (sel: string) => this.contentEl!.querySelector(sel) as HTMLElement | null;

    q('#smt-prog')!.style.width  = `${pct}%`;
    q('#smt-badge')!.textContent = `第 ${current} 步 / 共 ${total} 步`;
    q('#smt-title')!.textContent = step.title;
    q('#smt-desc')!.textContent  = step.description;

    const phaseEl = q('#smt-phase')!;
    phaseEl.textContent  = phaseLabel[phase];
    phaseEl.className    = `phase-label ${phase}`;

    const prevBtn = q('#smt-prev') as HTMLButtonElement | null;
    const nextBtn = q('#smt-next') as HTMLButtonElement | null;
    const doneBtn = q('#smt-done') as HTMLButtonElement | null;

    if (prevBtn) prevBtn.disabled = isFirst || !isWaiting;
    if (nextBtn) {
      nextBtn.disabled = !isWaiting;
      nextBtn.style.display = isCompleted ? 'none' : '';
    }
    if (doneBtn) doneBtn.style.display = isCompleted ? '' : 'none';
  }

  unmount() {
    this.container?.remove();
    this.container = null;
    this.contentEl = null;
    this.shadow = null;
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Styles ────────────────────────────────────────────────────────────────────

const HUD_STYLES = `
  .hud {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999998;
    width: 440px;
    background: white;
    border-radius: 14px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.22);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
    animation: slide-down 0.25s ease;
    pointer-events: all;
  }
  @keyframes slide-down {
    from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .header {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .journey-title { font-size: 13px; font-weight: 600; opacity: 0.9; }
  .btn-cancel {
    background: rgba(255,255,255,0.2);
    border: none; color: white;
    width: 24px; height: 24px;
    border-radius: 50%; cursor: pointer; font-size: 12px;
    display: flex; align-items: center; justify-content: center;
  }
  .btn-cancel:hover { background: rgba(255,255,255,0.35); }
  .progress-bar { height: 4px; background: #e2e8f0; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width 0.4s ease; }
  .step-badge { padding: 10px 16px 0; font-size: 11px; font-weight: 700; color: #667eea; text-transform: uppercase; letter-spacing: 0.05em; }
  .step-title { padding: 4px 16px 0; font-size: 16px; font-weight: 700; color: #1a202c; }
  .step-desc  { padding: 6px 16px 0; font-size: 13px; color: #4a5568; line-height: 1.5; }
  .phase-label { padding: 8px 16px; font-size: 12px; font-weight: 600; border-radius: 6px; margin: 8px 16px 0; background: #f7fafc; color: #718096; }
  .phase-label.waiting    { background: #ebf8ff; color: #2b6cb0; }
  .phase-label.completed  { background: #f0fff4; color: #276749; }
  .phase-label.navigating { background: #faf5ff; color: #553c9a; }
  .controls { display: flex; gap: 8px; padding: 12px 16px 14px; justify-content: flex-end; }
  .btn-prev, .btn-next, .btn-done {
    padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; border: none; transition: all 0.15s;
  }
  .btn-prev { background: #edf2f7; color: #4a5568; }
  .btn-prev:hover:not(:disabled) { background: #e2e8f0; }
  .btn-next { background: #667eea; color: white; }
  .btn-next:hover:not(:disabled) { background: #5a67d8; }
  .btn-done { background: #48bb78; color: white; }
  .btn-done:hover { background: #38a169; }
  .btn-prev:disabled, .btn-next:disabled { opacity: 0.4; cursor: not-allowed; }
`;

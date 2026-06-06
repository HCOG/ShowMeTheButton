import { DOMScanner } from '../scanner/DOMScanner';
import { CursorEngine } from '../cursor/CursorEngine';
import { TargetRing } from '../cursor/TargetRing';
import { AgentClient } from '../client/AgentClient';
import { EventBus } from '../bus/EventBus';

// ── Public types ──────────────────────────────────────────────────────────────

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

export type JourneyStatus = 'idle' | 'planning' | 'running' | 'completed' | 'cancelled' | 'error';

export interface JourneyState {
  status: JourneyStatus;
  currentStep: number;   // 1-based
  totalSteps: number;
  step?: JourneyStep;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressionDetector — resolves when the user completes the current step.
//
// Triggers:
//   1. User clicks the highlighted target element (or any child)
//   2. The page URL changes (navigation happened)
//   3. The "Done" button inside the pill HUD is clicked
// ─────────────────────────────────────────────────────────────────────────────

type ProgressionReason = 'clicked' | 'navigated' | 'input' | 'mutated' | 'done';

/** Ids of the SDK's own overlay hosts — mutations within these are ignored. */
const SDK_OVERLAY_IDS = ['show-me-sdk-cursor', 'smt-target-ring', 'smt-journey-pill'];

class ProgressionDetector {
  private cleanup: Array<() => void> = [];

  /**
   * Returns a promise that resolves once the user completes the current step.
   * Triggers (any one of):
   *   1. clicked   — pointer/touch on the highlighted target element
   *   2. navigated — URL / route change
   *   3. input     — value committed in the target field (typing, select, date)
   *   4. mutated   — significant DOM change elsewhere (e.g. an overlay opening)
   *   5. done      — the pill's "Done" button (manual fallback)
   */
  waitForAction(target: HTMLElement | null): Promise<ProgressionReason> {
    return new Promise<ProgressionReason>((resolve) => {
      let settled = false;
      const settle = (reason: ProgressionReason) => {
        if (settled) return;
        settled = true;
        this._teardown();
        resolve(reason);
      };

      // 1. Click / tap on target element (capture phase so we see it before it
      //    disappears). touchend covers mobile where the click may be swallowed.
      if (target) {
        const onPointer = (e: Event) => {
          const hit = e.target as Node;
          if (target.contains(hit) || target === hit) {
            // Slight delay so the click's own effect (e.g. modal opening) can settle
            setTimeout(() => settle('clicked'), 400);
          }
        };
        document.addEventListener('click', onPointer, true);
        document.addEventListener('touchend', onPointer, true);
        this.cleanup.push(() => {
          document.removeEventListener('click', onPointer, true);
          document.removeEventListener('touchend', onPointer, true);
        });

        // 3. Value committed inside the target (covers typing / select / date).
        //    `change` is a strong commit signal; `input` is debounced until the
        //    user pauses typing.
        let inputTimer: ReturnType<typeof setTimeout> | null = null;
        const onChange = () => settle('input');
        const onInput = () => {
          if (inputTimer) clearTimeout(inputTimer);
          inputTimer = setTimeout(() => settle('input'), 1200);
        };
        target.addEventListener('change', onChange, true);
        target.addEventListener('input', onInput, true);
        this.cleanup.push(() => {
          if (inputTimer) clearTimeout(inputTimer);
          target.removeEventListener('change', onChange, true);
          target.removeEventListener('input', onInput, true);
        });
      }

      // 2. URL change (popstate / hashchange / SPA navigation via polling)
      const initialHref = location.href;
      const urlPoll = setInterval(() => {
        if (location.href !== initialHref) settle('navigated');
      }, 300);
      const onPop = () => settle('navigated');
      window.addEventListener('popstate', onPop);
      window.addEventListener('hashchange', onPop);
      this.cleanup.push(() => {
        clearInterval(urlPoll);
        window.removeEventListener('popstate', onPop);
        window.removeEventListener('hashchange', onPop);
      });

      // 4. Significant DOM mutation — covers actions that don't click the target
      //    or change the URL (e.g. an action opens a panel/overlay elsewhere).
      //    Conservative to avoid false positives from background activity:
      //      • only added/removed ELEMENT nodes count (not attribute/text noise)
      //      • mutations inside our own overlays are ignored
      //      • a grace period skips the initial render settling after flyTo
      //      • debounced until the DOM goes quiet before resolving
      //    Note: MutationObserver does not cross shadow-DOM boundaries, so the
      //    cursor / ring / pill internals are invisible here by construction.
      const isOurNode = (n: Node): boolean => {
        const el = n.nodeType === Node.ELEMENT_NODE
          ? (n as HTMLElement)
          : (n.parentElement ?? null);
        return !!el?.closest?.(SDK_OVERLAY_IDS.map(id => `#${id}`).join(','));
      };
      let graceElapsed = false;
      const graceTimer = setTimeout(() => { graceElapsed = true; }, 900);
      let mutSettleTimer: ReturnType<typeof setTimeout> | null = null;
      const observer = new MutationObserver((records) => {
        if (!graceElapsed) return;
        const relevant = records.some(r =>
          r.type === 'childList' &&
          [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)]
            .some(n => n.nodeType === Node.ELEMENT_NODE && !isOurNode(n)),
        );
        if (!relevant) return;
        if (mutSettleTimer) clearTimeout(mutSettleTimer);
        mutSettleTimer = setTimeout(() => settle('mutated'), 600);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      this.cleanup.push(() => {
        clearTimeout(graceTimer);
        if (mutSettleTimer) clearTimeout(mutSettleTimer);
        observer.disconnect();
      });

      // 5. "Done" button click inside the pill (dispatched as a custom event)
      const onDone = () => settle('done');
      document.addEventListener('smt:done', onDone);
      this.cleanup.push(() => document.removeEventListener('smt:done', onDone));
    });
  }

  abort() {
    this._teardown();
  }

  private _teardown() {
    this.cleanup.forEach(fn => fn());
    this.cleanup = [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JourneyPill — compact bottom-left overlay.
//
// Shows: step dots · step title · [Done] · [✕]
// The "Done" button fades in after 2 s so the user can manually advance
// when auto-detection doesn't fire (e.g. filling a form field).
// ─────────────────────────────────────────────────────────────────────────────

type PillPhase = 'planning' | 'finding' | 'navigating' | 'waiting' | 'completed';

class JourneyPill {
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
      zIndex: '2147483646',
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

// ─────────────────────────────────────────────────────────────────────────────
// JourneyRunner — orchestrates the guided multi-step journey.
//
// Three entry points:
//   start(config)         — static pre-defined steps (original flow, preserved)
//   startSmart(goal)      — backend plans ALL steps up front from the goal
//   startIterative(goal)  — backend plans ONE step at a time against the live
//                           DOM (enables multi-page journeys)
//
// Progression between steps is fully automatic:
//   - A ProgressionDetector listens for clicks/taps on the highlighted element,
//     value commits (typing/select), URL changes, significant DOM mutations,
//     or the "Done" button in the pill.
//   - No explicit "Next →" button required.
// ─────────────────────────────────────────────────────────────────────────────

export class JourneyRunner {
  private pill: JourneyPill | null = null;
  private ring: TargetRing | null = null;
  private detector: ProgressionDetector | null = null;

  private journey: JourneyConfig | null = null;
  private currentStep = 0;
  /** Total steps; 0 means unknown (iterative mode). */
  private totalSteps = 0;
  /** The step object currently being executed (for getState in iterative mode). */
  private currentStepObj?: JourneyStep;
  private status: JourneyStatus = 'idle';
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

  /**
   * Read-back helper that defeats TypeScript's control-flow narrowing of
   * `this.status`. After `this.status = 'x'`, TS may narrow the type to `'x'`
   * within the same scope; calling a method resets that narrowing so we can
   * legitimately compare against other values (e.g. 'cancelled').
   */
  private _st(): JourneyStatus { return this.status; }

  getState(): JourneyState {
    return {
      status: this.status,
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      step: this.currentStepObj,
    };
  }

  /** Whether a journey is currently planning or running. */
  get isActive(): boolean {
    return this.status === 'running' || this.status === 'planning';
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Start a journey from a pre-defined config (steps known in advance). */
  async start(config: JourneyConfig): Promise<void> {
    this._cancel();
    this.journey = config;
    this._beginPill();
    this.totalSteps = config.steps.length;
    await this._runFixed(config.steps);
  }

  /**
   * Start a SMART journey — the backend agent plans ALL steps up front from the
   * goal, then executes them. Best for single-page goals. For multi-page goals
   * prefer {@link startIterative}, which re-plans against the live DOM.
   */
  async startSmart(goal: string): Promise<void> {
    this._cancel();
    this._beginPill();
    this.pill!.showPlanning();
    this.status = 'planning';
    this._emit();

    let steps: JourneyStep[];
    try {
      await this.domScanner.refresh();
      const elements = this.domScanner.getElements();
      steps = await this.agentClient.planJourney(
        goal,
        elements.map(e => ({ id: e.id, label: e.label, type: e.type, text: e.metadata.text })),
      );
    } catch (err) {
      console.warn('[ShowMeSDK] Smart journey planning failed:', err);
      this._fail('规划失败，请检查 Agent 服务');
      return;
    }

    if (this._st() === 'cancelled') return;
    if (!steps.length) {
      console.warn('[ShowMeSDK] Agent returned no steps for goal:', goal);
      this._fail('未能为该目标规划步骤');
      return;
    }

    this.journey = { id: `smart-${Date.now()}`, title: goal, description: goal, steps };
    this.totalSteps = steps.length;
    await this._runFixed(steps);
  }

  /**
   * Start an ITERATIVE journey — the agent decides ONE step at a time. After
   * each completed step the DOM is re-scanned and the agent is asked for the
   * next step (or whether the goal is done). This is what makes multi-page
   * journeys work, since later pages aren't visible when the journey starts.
   *
   * `seedSteps` (optional) are executed first before the agent takes over —
   * useful to prime a curated workflow while still letting the agent adapt /
   * extend it against the live UI.
   */
  async startIterative(goal: string, seedSteps?: JourneyStep[]): Promise<void> {
    this._cancel();
    this._beginPill();
    this.totalSteps = 0; // unknown — pill renders a growing dot trail
    this.status = 'running';

    const history: Array<{ title: string; description?: string }> = [];
    const queue: JourneyStep[] = [...(seedSteps ?? [])];
    const MAX_STEPS = 14;
    let n = 0;

    while (n < MAX_STEPS) {
      if (this._st() !== 'running') break;

      let step = queue.shift();

      // No queued step → ask the agent for the next one against the live DOM.
      if (!step) {
        this.currentStep = n + 1;
        this.currentStepObj = { step: n + 1, title: '规划下一步…', description: '', query: '' };
        this.pill!.update(this.currentStep, 0, this.currentStepObj, 'planning');
        this._emit();

        await this.domScanner.refresh();
        const elements = this.domScanner.getElements();
        const resp = await this.agentClient.nextStep(
          goal,
          history,
          elements.map(e => ({ id: e.id, label: e.label, type: e.type, text: e.metadata.text })),
        );

        if (this._st() !== 'running') break;

        if (!resp.success) {
          this._fail(resp.error ? `规划失败：${resp.error}` : '规划失败，请检查 Agent 服务');
          return;
        }
        if (resp.done || !resp.step) {
          if (n === 0) { this._fail('未能为该目标规划步骤'); return; }
          this._completeIterative();
          return;
        }
        step = resp.step;
      }

      n++;
      this.currentStep = n;
      this.currentStepObj = step;
      this._emit();

      await this._executeStep(step, n, 0);
      if (this._st() !== 'running') break;

      history.push({ title: step.title, description: step.description });

      this.ring?.hide();
      this.ring = null;
      await sleep(300);
    }

    // Reached the safety cap while still running → wrap up gracefully.
    if (this._st() === 'running') this._completeIterative();
  }

  cancel(): void {
    this._cancel();
  }

  // ── Core loop ───────────────────────────────────────────────────────────────

  /** Run a fixed, fully-known list of steps. */
  private async _runFixed(steps: JourneyStep[]): Promise<void> {
    this.status = 'running';

    for (let i = 0; i < steps.length; i++) {
      if (this._st() !== 'running') break;

      this.currentStep = i + 1;
      this.currentStepObj = steps[i];
      this._emit();

      await this._executeStep(steps[i], i + 1, steps.length);
      if (this._st() !== 'running') break;

      if (i === steps.length - 1) {
        // Last step → complete.
        this.ring?.hide();
        this.ring = null;
        this.status = 'completed';
        this.pill!.update(this.currentStep, steps.length, steps[i], 'completed');
        this._emit();
        await sleep(1800);
        this._teardownOverlays();
        break;
      }

      // Intermediate → brief flash, then advance.
      this.ring?.hide();
      this.ring = null;
      await sleep(300);
    }
  }

  /**
   * Execute ONE step: find the element, fly the cursor, ring + label it, then
   * wait for the user's progression action. Shared by fixed and iterative runs.
   * Does NOT hide the ring or mark completion — the caller decides what's next.
   */
  private async _executeStep(step: JourneyStep, current: number, total: number): Promise<void> {
    // ── Phase: finding ───────────────────────────────────────────────────────
    this.pill!.update(current, total, step, 'finding');

    await this.domScanner.refresh();
    const elements = this.domScanner.getElements();

    let targetEl: HTMLElement | null = null;
    try {
      const resp = await this.agentClient.query({
        query: step.query,
        elements: elements.map(e => ({ id: e.id, label: e.label, type: e.type, text: e.metadata.text })),
        context: { url: window.location.href, timestamp: Date.now() },
      });
      if (resp.success && resp.result?.target_id) {
        const found = this.domScanner.getElementById(resp.result.target_id);
        if (found) targetEl = found.element;
      }
    } catch (err) {
      console.warn('[ShowMeSDK] Step agent query failed:', err);
    }

    if (this._st() !== 'running') return;

    // ── Phase: navigating ────────────────────────────────────────────────────
    if (targetEl) {
      this.pill!.update(current, total, step, 'navigating');
      await this.cursorEngine.flyTo(targetEl);
      if (!this.ring) this.ring = new TargetRing();
      this.ring.show(targetEl, step.hint || step.description); // U2: label near target
    }

    if (this._st() !== 'running') return;

    // ── Phase: waiting — auto-advance on the user's action ───────────────────
    this.pill!.update(current, total, step, 'waiting');
    this.detector = new ProgressionDetector();
    await this.detector.waitForAction(targetEl);
    this.detector = null;
  }

  /** Mark an iterative journey complete and tear down. */
  private _completeIterative(): void {
    this.ring?.hide();
    this.ring = null;
    this.status = 'completed';
    const last = this.currentStepObj ?? { step: this.currentStep, title: '完成', description: '', query: '' };
    this.pill?.update(this.currentStep, 0, last, 'completed');
    this._emit();
    const pill = this.pill;
    setTimeout(() => { pill?.unmount(); }, 1800);
    this.pill = null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _beginPill() {
    this.pill = new JourneyPill(() => this.cancel());
    this.pill.mount();
    this.currentStep = 0;
    this.currentStepObj = undefined;
    this.totalSteps = 0;
    this.status = 'running';
  }

  private _cancel() {
    if (this.status === 'idle') return;
    this.status = 'cancelled';
    this.detector?.abort();
    this.detector = null;
    this._teardownOverlays();
    this._emit();
  }

  /**
   * Enter the error state: surface the message in the pill so the user gets
   * visible feedback, emit the error state, then auto-dismiss the pill.
   */
  private _fail(message: string) {
    this.status = 'error';
    this.detector?.abort();
    this.detector = null;
    this.ring?.hide();
    this.ring = null;
    this._emit();
    if (this.pill) {
      this.pill.showError(message);
      const pill = this.pill;
      this.pill = null; // detach so a new journey can mount cleanly
      setTimeout(() => pill.unmount(), 3500);
    }
  }

  private _teardownOverlays() {
    this.pill?.unmount();
    this.pill = null;
    this.ring?.hide();
    this.ring = null;
  }

  private _emit() {
    const s = this.getState();
    this.onStateChange?.(s);
    this.eventBus.emit('journey:state', s);
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

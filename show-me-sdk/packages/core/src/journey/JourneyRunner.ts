import { DOMScanner } from '../scanner/DOMScanner';
import { CursorEngine } from '../cursor/CursorEngine';
import { TargetRing } from '../cursor/TargetRing';
import { AgentClient } from '../client/AgentClient';
import { EventBus } from '../bus/EventBus';
import { JourneyOverview } from './JourneyOverview';
import { JourneyPill } from './JourneyPill';
import { ProgressionDetector } from './ProgressionDetector';
import { Z_INDEX } from '../constants';

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

export type JourneyStatus = 'idle' | 'planning' | 'previewing' | 'running' | 'completed' | 'cancelled' | 'error';

export interface JourneyState {
  status: JourneyStatus;
  currentStep: number;   // 1-based
  totalSteps: number;
  step?: JourneyStep;
  /** Populated when status === 'previewing' or 'running' — full list of planned steps. */
  plan?: JourneyStep[];
}




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
  private overview: JourneyOverview | null = null;

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
      plan: (this.status === 'previewing' || this.status === 'running')
        ? this.journey?.steps
        : undefined,
    };
  }

  /** Whether a journey is currently planning or running. */
  get isActive(): boolean {
    return this.status === 'running' || this.status === 'planning' || this.status === 'previewing';
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

    const steps = await this._planSteps(goal);
    if (!steps) return; // already failed/cancelled
    if (this._st() !== 'planning') return; // cancelled during planning

    this.journey = { id: `smart-${Date.now()}`, title: goal, description: goal, steps };
    this.totalSteps = steps.length;
    await this._runFixed(steps);
  }

  /**
   * Start a SMART journey and show the user the planned steps BEFORE executing.
   * The overview panel is mounted; the caller must then invoke
   * {@link startPreviewedJourney} (typically from a "Start" button) to begin.
   *
   * Returns the planned steps (or null on planning failure / 0 steps).
   */
  async startSmartWithPreview(goal: string): Promise<JourneyStep[] | null> {
    this._cancel();
    this._beginPill();
    this.pill!.showPlanning();
    this.status = 'planning';
    this._emit();

    const steps = await this._planSteps(goal);
    if (!steps) return null;
    if (this._st() !== 'planning') return null; // cancelled during planning

    this.journey = { id: `smart-${Date.now()}`, title: goal, description: goal, steps };
    this.totalSteps = steps.length;

    // The pill served its planning purpose — tear it down so the overview is
    // the only HUD while awaiting the user's Start. A fresh pill will mount
    // when execution actually begins.
    this.pill?.unmount();
    this.pill = null;

    this.status = 'previewing';
    this._emit();

    this.overview = new JourneyOverview({
      goal,
      steps,
      onStart: () => this.startPreviewedJourney(),
      onCancel: () => this.cancel(),
    });
    this.overview.mount();
    return steps;
  }

  /**
   * Begin executing a journey that was previously planned via
   * {@link startSmartWithPreview}. No-op if the runner is not currently in
   * the `previewing` state (defends against double-clicks).
   */
  async startPreviewedJourney(): Promise<void> {
    if (this._st() !== 'previewing') return;
    if (!this.journey) return;

    // Switch the overview from plan → executing mode. It stays mounted through
    // the whole run as the single source of truth for step progress, replacing
    // the legacy JourneyPill HUD for this entry point.
    this.overview?.setExecuting();
    this._beginPillSilently();
    await this._runFixed(this.journey.steps);
  }

  /**
   * Internal: ask the agent for steps. On failure or 0 steps, surfaces an error
   * via `_fail()` and returns null so the caller can early-return.
   */
  private async _planSteps(goal: string): Promise<JourneyStep[] | null> {
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
      return null;
    }

    if (!steps.length) {
      console.warn('[ShowMeSDK] Agent returned no steps for goal:', goal);
      this._fail('未能为该目标规划步骤');
      return null;
    }
    return steps;
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
  async startIterative(goal: string, seedSteps?: JourneyStep[], options?: { silent?: boolean }): Promise<void> {
    this._cancel();
    if (options?.silent) {
      this._beginPillSilently();
    } else {
      this._beginPill();
    }
    // Store the seed (or empty array) so getState().plan returns the full
    // step list during the run — widget listeners need this to keep their
    // step list in sync with what the runner is actually executing.
    this.journey = {
      id: `iterative-${Date.now()}`,
      title: goal,
      description: goal,
      steps: seedSteps ?? [],
    };
    this.totalSteps = seedSteps?.length ?? 0; // unknown once we start re-planning
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
        // Release the cursor lock so it immediately follows the user's mouse
        // again once the journey is done — no manual `releaseCursor()` needed.
        this.cursorEngine.release();
        this.pill?.update(this.currentStep, steps.length, steps[i], 'completed');
        this.overview?.setCompleted();
        this._emit();
        if (this.overview) {
          // Overview-driven run: let the "完成" banner linger, then auto-close.
          const ov = this.overview;
          this.overview = null;
          setTimeout(() => ov.unmount(), 2500);
        } else {
          // Pill-driven run (legacy / single-element flow): same auto-close.
          this._teardownOverlays();
        }
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
    this.overview?.setStepStatus(current, 'active');
    this.pill?.update(current, total, step, 'finding');

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
      this.pill?.update(current, total, step, 'navigating');
      await this.cursorEngine.flyTo(targetEl);
      if (!this.ring) this.ring = new TargetRing();
      this.ring.show(targetEl);
    }

    if (this._st() !== 'running') return;

    // ── Phase: waiting — auto-advance on the user's action ───────────────────
    this.pill?.update(current, total, step, 'waiting');
    this.detector = new ProgressionDetector();
    await this.detector.waitForAction(targetEl);
    this.detector = null;

    // Step done — mark it completed in the overview (and clear the ring).
    this.overview?.setStepStatus(current, 'completed');
    this.ring?.hide();
    this.ring = null;
  }

  /** Mark an iterative journey complete and tear down. */
  private _completeIterative(): void {
    this.ring?.hide();
    this.ring = null;
    this.status = 'completed';
    this.cursorEngine.release();
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

  /**
   * Initialize the journey state without mounting the JourneyPill HUD. Used by
   * `startPreviewedJourney`, where the JourneyOverview panel IS the HUD and a
   * pill would be visually redundant.
   */
  private _beginPillSilently() {
    this.currentStep = 0;
    this.currentStepObj = undefined;
    this.totalSteps = 0;
    this.status = 'running';
  }

  private _cancel() {
    if (this.status === 'idle') return;
    this.status = 'cancelled';
    // Cancel returns control to the user — the cursor should immediately
    // follow their mouse again (the cancel button was unreachable otherwise).
    this.cursorEngine.release();
    this.detector?.abort();
    this.detector = null;
    // Overview lives outside `_teardownOverlays` because it has its own
    // lifecycle (mounted during previewing, not during execution).
    this.overview?.unmount();
    this.overview = null;
    this._teardownOverlays();
    this._emit();
  }

  /**
   * Enter the error state: surface the message in the pill so the user gets
   * visible feedback, emit the error state, then auto-dismiss the pill.
   */
  private _fail(message: string) {
    this.status = 'error';
    this.cursorEngine.release();
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

  // ── Public helpers used by WorkflowExecutor (v2) ───────────────────────

  /**
   * Locate an element by a free-form natural-language query, fly the AI
   * cursor to it, then wait for the user to perform the action (or for the
   * timeout to expire). Resolves when the user triggers progression; rejects
   * on timeout unless `optional` is true.
   */
  async flyToAndWaitForProgression(
    query: string,
    options: { timeout?: number; optional?: boolean } = {},
  ): Promise<void> {
    await this.domScanner.refresh();
    const elements = this.domScanner.getElements();
    // For now we match by label substring (a real product would call the
    // agent's /query endpoint for LLM-based resolution; keep this minimal).
    const lowered = query.toLowerCase();
    const match = elements.find((e) => e.label.toLowerCase().includes(lowered))
      ?? elements[0];
    if (!match) {
      if (options.optional) return;
      throw new Error(`No element found for query: ${query}`);
    }

    await this.cursorEngine.flyTo(match.element);

    if (!this.ring) this.ring = new TargetRing();
    this.ring.show(match.element);

    const detector = new ProgressionDetector();
    this.detector = detector;
    const timeoutMs = (options.timeout ?? 60) * 1000;
    try {
      await Promise.race([
        detector.waitForAction(match.element),
        sleep(timeoutMs).then(() => Promise.reject(new Error('progression timeout'))),
      ]);
    } catch (err) {
      if (!options.optional) throw err;
    } finally {
      this.detector = null;
    }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

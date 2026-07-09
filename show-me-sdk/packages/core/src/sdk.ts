import { EventBus, SDK_EVENTS } from './bus/EventBus';
import { DOMScanner } from './scanner/DOMScanner';
import { CursorEngine } from './cursor/CursorEngine';
import { TargetRing } from './cursor/TargetRing';
import { AgentClient } from './client/AgentClient';
import { JourneyRunner, JourneyConfig, JourneyState, JourneyStep } from './journey/JourneyRunner';
import { SpeechInput } from './voice/SpeechInput';
import { ShowMeConfig } from './types';
import type { AskUserPayload } from './types';
import {
  isV2Workflow,
  migrateV1ToV2,
  validateWorkflowV2,
} from './journey/workflow';
import type { Workflow, WorkflowState } from './types/workflow';

export interface GuideResult {
  type: 'single' | 'journey';
  /** Only present for type === 'single' */
  reasoning?: string;
  confidence?: number;
  /** Element id of the single-match target (present for type === 'single'). */
  targetId?: string;
  /**
   * True when the single match was below the confidence threshold and the
   * cursor was NOT moved — the caller should confirm with the user before
   * navigating (e.g. "Is this what you meant?"). Confirm via flyToElement().
   */
  needsConfirmation?: boolean;
  /**
   * LLM-driven disambiguation: when the agent decides the user's intent is
   * ambiguous (multiple plausible matches, missing prerequisites, etc.), it
   * populates this field with a question + options. The host UI should
   * surface the question to the user and call `continueWithAnswer()`
   * (or re-issue `guide()` with an enriched query) once an answer is given.
   */
  askUser?: AskUserPayload;
  /**
   * KB candidate titles that informed the LLM's disambiguation. Surfaced in
   * the UI as small chips under the question so the user can see WHY the LLM
   * is asking (e.g. "I'm asking because we found: model-a, model-b, model-c").
   */
  suggestions?: string[];
}

/** Below this confidence, guide() asks the caller to confirm before flying. */
const CONFIDENCE_CONFIRM_THRESHOLD = 0.5;

export class ShowMeSDK {
  private config: ShowMeConfig;
  private eventBus: EventBus;
  public domScanner: DOMScanner;
  public cursorEngine: CursorEngine;
  private agentClient: AgentClient;
  public journey: JourneyRunner;
  public speech: SpeechInput;
  private initialized = false;
  private active = false;

  /** Highlight ring for single-element location (separate from the journey's). */
  private highlightRing: TargetRing | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  /** How long the single-location highlight stays before fading. */
  private static readonly HIGHLIGHT_MS = 4000;

  constructor(config: ShowMeConfig) {
    this.config = config;
    this.eventBus = new EventBus();
    this.domScanner = new DOMScanner(this.eventBus);
    this.cursorEngine = new CursorEngine(this.eventBus, config.cursorStyle);
    this.agentClient = new AgentClient(config.agentEndpoint);
    this.journey = new JourneyRunner(
      this.domScanner,
      this.cursorEngine,
      this.agentClient,
      this.eventBus,
    );
    this.speech = new SpeechInput(this.eventBus);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.cursorEngine.init();
    await this.domScanner.scan();
    this.initialized = true;
    this.eventBus.emit(SDK_EVENTS.INITIALIZED);
  }

  activate(): void {
    if (!this.initialized) throw new Error('SDK not initialized. Call init() first');
    this.active = true;
    this.cursorEngine.show();
    this.eventBus.emit(SDK_EVENTS.ACTIVATED);
  }

  deactivate(): void {
    this.active = false;
    this._clearHighlight();
    this.cursorEngine.hide();
    this.eventBus.emit(SDK_EVENTS.DEACTIVATED);
  }

  /**
   * Unified guide — the backend decides whether this is a single-element lookup
   * or a multi-step journey.
   *
   * • single  → flies the cursor to the element; returns immediately after animation.
   * • journey → starts the pill-based journey (fire-and-forget); returns immediately
   *             so callers (e.g. the widget) can close themselves right away.
   */
  async guide(
    userQuery: string,
    onJourneyState?: (state: JourneyState) => void,
    options?: { silent?: boolean },
  ): Promise<GuideResult> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();

    await this.domScanner.refresh();
    const elements = this.domScanner.getElements();

    const response = await this.agentClient.guide({
      query: userQuery,
      elements: elements.map(e => ({ id: e.id, label: e.label, type: e.type, text: e.metadata.text })),
      context: { url: window.location.href, timestamp: Date.now() },
    });

    if (!response.success) {
      throw new Error(response.error ?? 'Guide failed');
    }

    if (response.type === 'journey') {
      // Clear any lingering single-location highlight, and cancel any journey
      // already in flight so we never stack two pill HUDs.
      this._clearHighlight();
      this.journey.cancel();
      if (onJourneyState) this.journey.onState(onJourneyState);
      // Drive the journey iteratively: the backend's up-front steps (if any)
      // seed the run, then the agent re-plans against the live DOM after each
      // step — this is what makes multi-page goals work. Fire-and-forget so the
      // caller (widget) can close its own UI; the pill HUD takes over.
      //
      // startIterative mounts the pill synchronously before its first await, so
      // the pill is already visible by the time this method returns (U1 — no
      // "nothing happening" gap between the widget closing and the pill).
      this.journey.startIterative(userQuery, response.steps, { silent: options?.silent }).catch(err =>
        console.warn('[ShowMeSDK] Journey error:', err),
      );
      return { type: 'journey' };
    }

    // Single element
    const result = response.result;
    const confidence = result?.confidence ?? 0;

    // Agent decided the intent is ambiguous → hand the user a clarifying
    // question. The caller (widget) renders the question panel and feeds
    // the answer back via continueWithAnswer() or a re-issued guide().
    if (result?.ask_user) {
      const out: GuideResult = {
        type: 'single',
        reasoning: result.reasoning,
        confidence,
        askUser: result.ask_user as AskUserPayload,
      };
      if (result.suggestions && result.suggestions.length > 0) {
        out.suggestions = result.suggestions;
      }
      return out;
    }

    // Low confidence → don't move the cursor; let the caller confirm first (U3).
    if (result?.target_id && confidence < CONFIDENCE_CONFIRM_THRESHOLD) {
      const out: GuideResult = {
        type: 'single',
        reasoning: result.reasoning,
        confidence,
        targetId: result.target_id,
        needsConfirmation: true,
      };
      if (result.suggestions && result.suggestions.length > 0) {
        out.suggestions = result.suggestions;
      }
      return out;
    }

    if (result?.target_id) {
      const target = this.domScanner.getElementById(result.target_id);
      if (target) {
        await this.cursorEngine.flyTo(target.element);
        this._highlight(target.element);
        await this.cursorEngine.hover(target.element, result.reasoning);
      }
    }
    return {
      type: 'single',
      reasoning: result?.reasoning,
      confidence,
      targetId: result?.target_id ?? undefined,
    };
  }

  /**
   * Fly the cursor to a scanned element by id, pulse a highlight ring around it,
   * and show its reasoning tooltip. Used both to act on a low-confidence guide()
   * result after the user confirms and as a standalone "show me this" helper.
   */
  async flyToElement(targetId: string, tooltip?: string): Promise<boolean> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    const target = this.domScanner.getElementById(targetId);
    if (!target) return false;
    await this.cursorEngine.flyTo(target.element);
    this._highlight(target.element);
    await this.cursorEngine.hover(target.element, tooltip ?? '');
    return true;
  }

  /**
   * Pulse a highlight ring around an element for single-element location. The
   * cursor's own tooltip carries the reasoning, so the ring is label-less here.
   * Auto-fades after HIGHLIGHT_MS; replaced if another highlight starts.
   */
  private _highlight(element: HTMLElement): void {
    this._clearHighlight();
    this.highlightRing = new TargetRing();
    this.highlightRing.show(element);
    this.highlightTimer = setTimeout(() => this._clearHighlight(), ShowMeSDK.HIGHLIGHT_MS);
  }

  private _clearHighlight(): void {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    this.highlightRing?.hide();
    this.highlightRing = null;
  }

  async query(userQuery: string): Promise<any> {
    const elements = this.domScanner.getElements();
    const response = await this.agentClient.query({
      query: userQuery,
      elements: elements.map((e) => ({
        id: e.id, label: e.label, type: e.type, text: e.metadata.text,
      })),
      context: { url: window.location.href, timestamp: Date.now() },
    });

    if (response.success && response.result?.target_id) {
      const target = this.domScanner.getElementById(response.result.target_id);
      if (target) {
        await this.cursorEngine.flyTo(target.element);
        this._highlight(target.element);
        await this.cursorEngine.hover(target.element, response.result.reasoning);
      }
    }
    return response;
  }

  /** Start a multi-step guided journey from a pre-defined config. */
  async startJourney(
    config: JourneyConfig,
    onState?: (state: JourneyState) => void,
  ): Promise<void> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    if (onState) this.journey.onState(onState);
    await this.journey.start(config);
  }

  /**
   * Power-user API. Start a SMART journey by explicitly planning steps from a
   * goal via the dedicated `/api/v1/journey/plan` endpoint.
   *
   * Most callers should prefer {@link guide}, which lets the backend decide
   * single-element vs journey from one unified call. Use this only when you
   * KNOW the request is a multi-step goal and want to skip that classification
   * (e.g. launching a journey from a "guided tour" button).
   *
   * The pill overlay shows a "planning…" state while the backend reasons about
   * which buttons to click, then auto-executes each step with visual guidance.
   */
  async startSmartJourney(
    goal: string,
    onState?: (state: JourneyState) => void,
  ): Promise<void> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    if (onState) this.journey.onState(onState);
    await this.journey.startSmart(goal);
  }

  /**
   * Plan a multi-step journey and SHOW the user the planned steps BEFORE executing.
   * The overview panel mounts at the bottom of the page; the caller must then invoke
   * {@link startPreviewedJourney} (typically from a "Start" button) to begin.
   *
   * Returns the planned steps (or null on planning failure / 0 steps). The same
   * array is also exposed via the `journey:state` event's `plan` field once the
   * status reaches `'previewing'`.
   */
  async previewJourney(
    goal: string,
    onState?: (state: JourneyState) => void,
  ): Promise<JourneyStep[] | null> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    if (onState) this.journey.onState(onState);
    return this.journey.startSmartWithPreview(goal);
  }

  /**
   * Classify a query without starting a journey. Returns whether the agent
   * classified it as a single-element match or a multi-step journey, plus
   * the pre-planned steps (when available).
   *
   * Pure data — no DOM mounting, no cursor movement, no state changes. The
   * widget uses this to decide between "show result" (single) and "show
   * plan overview" (journey) without paying the cost of a second agent call.
   */
  async classify(userQuery: string): Promise<{
    type: 'single' | 'journey';
    result?: {
      reasoning?: string;
      confidence?: number;
      targetId?: string;
      needsConfirmation?: boolean;
      askUser?: AskUserPayload;
      suggestions?: string[];
    };
    steps?: JourneyStep[];
  }> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    await this.domScanner.refresh();
    const elements = this.domScanner.getElements();
    const response = await this.agentClient.guide({
      query: userQuery,
      elements: elements.map(e => ({ id: e.id, label: e.label, type: e.type, text: e.metadata.text })),
      context: { url: window.location.href, timestamp: Date.now() },
    });
    if (!response.success) {
      throw new Error(response.error ?? 'Classify failed');
    }
    if (response.type === 'journey') {
      return { type: 'journey', steps: response.steps ?? [] };
    }
    const r = response.result;
    const confidence = r?.confidence ?? 0;
    const targetId = r?.target_id ?? undefined;
    const result: {
      reasoning?: string;
      confidence?: number;
      targetId?: string;
      askUser?: AskUserPayload;
      suggestions?: string[];
    } = {
      reasoning: r?.reasoning,
      confidence,
      targetId,
    };
    if (r?.ask_user) {
      result.askUser = r.ask_user as AskUserPayload;
    } else if (targetId && confidence < CONFIDENCE_CONFIRM_THRESHOLD) {
      // Low confidence without an ask_user — caller should fall back to the
      // simple confirm/reject dialog. We surface this via the same field
      // path (no separate flag needed) by re-deriving from `targetId`.
    }
    if (r?.suggestions && r.suggestions.length > 0) {
      result.suggestions = r.suggestions;
    }
    return { type: 'single', result };
  }

  /**
   * Pure data API: ask the agent to plan steps for `goal` and return them
   * WITHOUT mounting any UI / changing any state.
   *
   * Use this when the caller wants to render its own plan-overview panel
   * (e.g. morphing its widget UI into a centered overview) before invoking
   * {@link startIterativeJourney} on user confirmation. The companion UI
   * {@link previewJourney} remains the right choice when the caller is happy
   * with the SDK's body-mounted JourneyOverview panel.
   *
   * Returns `[]` when the agent plans nothing. Throws on transport errors.
   */
  async planJourney(goal: string): Promise<JourneyStep[]> {
    if (!this.initialized) await this.init();
    await this.domScanner.refresh();
    const elements = this.domScanner.getElements();
    return this.agentClient.planJourney(
      goal,
      elements.map(e => ({ id: e.id, label: e.label, type: e.type, text: e.metadata.text })),
    );
  }

  /**
   * Begin executing a journey that was previously planned via
   * {@link previewJourney}. No-op if the runner is not currently in the
   * `previewing` state (defends against double-clicks).
   */
  async startPreviewedJourney(): Promise<void> {
    await this.journey.startPreviewedJourney();
  }

  /**
   * Start an ITERATIVE journey: the agent plans one step at a time against the
   * live DOM, re-scanning after each step. This enables multi-page journeys.
   *
   * `seedSteps` (optional) run first to prime a curated workflow before the
   * agent takes over — handy for "guided tour" buttons that have known steps
   * but should still adapt to UI changes.
   */
  async startIterativeJourney(
    goal: string,
    onState?: (state: JourneyState) => void,
    seedSteps?: JourneyConfig['steps'],
    options?: { silent?: boolean },
  ): Promise<void> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    if (onState) this.journey.onState(onState);
    // When silent=true, the caller (typically a custom widget) is rendering
    // its own HUD and the SDK should NOT mount the bottom-left JourneyPill.
    await this.journey.startIterative(goal, seedSteps, { silent: options?.silent });
  }

  /**
   * Run a v2 (or v1, auto-migrated) workflow. Emits `workflow:state` events
   * on the SDK's EventBus for the host to render. Returns when the workflow
   * reaches a terminal status (succeeded / failed / cancelled).
   *
   * @param workflow  Either a v2 DAG (`{version:2, nodes, entry}`) or a v1
   *                   linear `{steps:[…]}`. v1 is auto-migrated.
   * @param options.silent  When true (default), the SDK does NOT mount the
   *                        bottom-left JourneyPill. The caller (typically a
   *                        custom widget) is the sole HUD.
   * @param options.onState  Convenience wrapper around EventBus.on('workflow:state').
   */
  async runWorkflow(
    workflow: Workflow,
    options: { silent?: boolean; onState?: (state: WorkflowState) => void } = {},
  ): Promise<void> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    const wf = isV2Workflow(workflow) ? workflow : migrateV1ToV2(workflow);
    validateWorkflowV2(wf);

    const { WorkflowExecutor } = await import('./journey/workflow-executor');
    const executor = new WorkflowExecutor({
      cursorEngine: this.cursorEngine,
      journeyRunner: this.journey,
      eventBus: this.eventBus,
    });
    if (options.onState) {
      this.eventBus.on('workflow:state', options.onState as any);
    }
    await executor.run(wf, { silent: options.silent });
  }

  cancelJourney(): void {
    this.journey.cancel();
  }

  /** Whether a journey is currently planning or running. */
  get isJourneyActive(): boolean {
    return this.journey.isActive;
  }

  /** Whether voice input is available in this browser. */
  isVoiceSupported(): boolean {
    return this.speech.isSupported();
  }

  /**
   * Start listening for a spoken question. `onText` fires with interim and final
   * transcripts (isFinal flag); `onEnd` fires when recognition stops.
   * Language defaults to the SDK config language (zh-CN).
   */
  startVoiceInput(
    onText: (text: string, isFinal: boolean) => void,
    onEnd?: () => void,
    onError?: (error: string) => void,
  ): void {
    this.speech.onResult(onText);
    if (onEnd) this.speech.onEnd(onEnd);
    if (onError) this.speech.onError(onError);
    this.speech.start(this.config.language ?? 'zh-CN');
  }

  stopVoiceInput(): void {
    this.speech.stop();
  }

  /** Release the cursor from its stuck position so it resumes following the mouse. */
  releaseCursor(): void {
    this.cursorEngine.release();
  }

  get isActive(): boolean {
    return this.active;
  }
}

import { EventBus, SDK_EVENTS } from './bus/EventBus';
import { DOMScanner } from './scanner/DOMScanner';
import { CursorEngine } from './cursor/CursorEngine';
import { AgentClient } from './client/AgentClient';
import { JourneyRunner, JourneyConfig, JourneyState } from './journey/JourneyRunner';
import { SpeechInput } from './voice/SpeechInput';
import { ShowMeConfig } from './types';

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
  async guide(userQuery: string, onJourneyState?: (state: JourneyState) => void): Promise<GuideResult> {
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
      // Cancel any journey already in flight so we never stack two pill HUDs.
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
      this.journey.startIterative(userQuery, response.steps).catch(err =>
        console.warn('[ShowMeSDK] Journey error:', err),
      );
      return { type: 'journey' };
    }

    // Single element
    const result = response.result;
    const confidence = result?.confidence ?? 0;

    // Low confidence → don't move the cursor; let the caller confirm first (U3).
    if (result?.target_id && confidence < CONFIDENCE_CONFIRM_THRESHOLD) {
      return {
        type: 'single',
        reasoning: result.reasoning,
        confidence,
        targetId: result.target_id,
        needsConfirmation: true,
      };
    }

    if (result?.target_id) {
      const target = this.domScanner.getElementById(result.target_id);
      if (target) {
        await this.cursorEngine.flyTo(target.element);
        await this.cursorEngine.hover(target.element, result.reasoning);
      }
    }
    return {
      type: 'single',
      reasoning: result?.reasoning,
      confidence,
      targetId: result?.target_id,
    };
  }

  /**
   * Fly the cursor to a scanned element by id and show its reasoning tooltip.
   * Used to act on a low-confidence guide() result after the user confirms.
   */
  async flyToElement(targetId: string, tooltip?: string): Promise<boolean> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    const target = this.domScanner.getElementById(targetId);
    if (!target) return false;
    await this.cursorEngine.flyTo(target.element);
    await this.cursorEngine.hover(target.element, tooltip ?? '');
    return true;
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
  ): Promise<void> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    if (onState) this.journey.onState(onState);
    await this.journey.startIterative(goal, seedSteps);
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

  get isActive(): boolean {
    return this.active;
  }
}

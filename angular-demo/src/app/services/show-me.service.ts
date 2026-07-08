import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ShowMeSDK, JourneyConfig, JourneyState, JourneyStep, GuideResult } from '@show-me/core';
import { filter, Subject, Subscription } from 'rxjs';
export type QueryStatus = 'idle' | 'scanning' | 'querying' | 'success' | 'error';

export interface QueryResult {
  targetId: string;
  confidence: number;
  reasoning: string;
}

@Injectable({ providedIn: 'root' })
export class ShowMeService implements OnDestroy {
  private sdk: ShowMeSDK | null = null;
  private routerSub: Subscription;
  private _active = false;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;

  /** Emits when a global hotkey (Alt+V) requests voice input. The widget subscribes. */
  readonly voiceHotkey$ = new Subject<void>();
  /** Emits on every journey state change (start, step advance, complete, cancel). */
  readonly journeyState$ = new Subject<JourneyState>();

  constructor(private router: Router) {
    // Re-scan DOM after every navigation (new page = new elements).
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (!this.sdk) return;
        // A journey re-scans the DOM itself before each step, so skip the
        // router-triggered rescan while one is active to avoid double-scanning.
        if (this.sdk.isJourneyActive) return;
        // Debounce: a single navigation can emit multiple NavigationEnd events
        // (redirects, guards); coalesce into one scan after the page settles.
        if (this.rescanTimer) clearTimeout(this.rescanTimer);
        this.rescanTimer = setTimeout(() => this.rescan(), 300);
      });
  }

  get isActive(): boolean {
    return this._active;
  }

  /** Initialize and activate the SDK (idempotent). */
  async init(agentEndpoint: string = 'http://localhost:8001'): Promise<void> {
    if (this.sdk) return;

    this.sdk = new ShowMeSDK({ agentEndpoint });
    await this.sdk.init();
    this.sdk.activate();
    // Forward every journey state change so the widget can drive its own
    // executing / completed panels without mounting a separate JourneyPill.
    this.sdk.journey.onState((s) => this.journeyState$.next(s));
    this._active = true;
  }

  activate(): void {
    this.sdk?.activate();
    this._active = true;
  }

  deactivate(): void {
    this.sdk?.deactivate();
    this._active = false;
  }

  /** Toggle the assistant cursor on/off. Returns the new active state. */
  async toggleCursor(): Promise<boolean> {
    if (!this.sdk) {
      await this.init();
      return this._active;
    }
    if (this._active) {
      this.deactivate();
    } else {
      this.activate();
    }
    return this._active;
  }

  /** Whether the browser supports voice input. */
  get isVoiceSupported(): boolean {
    return this.sdk ? this.sdk.isVoiceSupported() : ShowMeService.browserVoiceSupported();
  }

  static browserVoiceSupported(): boolean {
    return typeof window !== 'undefined' &&
      !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  /** Trigger the voice-input hotkey path (used by Alt+V). */
  requestVoice(): void {
    this.voiceHotkey$.next();
  }

  async startVoiceInput(
    onText: (text: string, isFinal: boolean) => void,
    onEnd?: () => void,
    onError?: (error: string) => void,
  ): Promise<void> {
    if (!this.sdk) await this.init();
    this.sdk!.startVoiceInput(onText, onEnd, onError);
  }

  stopVoiceInput(): void {
    this.sdk?.stopVoiceInput();
  }

  async rescan(): Promise<number> {
    if (!this.sdk) return 0;
    const elements = await this.sdk.domScanner.refresh();
    return elements.length;
  }

  /**
   * Classify a query (single vs journey) without starting execution.
   * Returns the classification + optional pre-planned steps for journeys.
   */
  async classify(goal: string): Promise<{
    type: 'single' | 'journey';
    result?: { reasoning?: string; confidence?: number; targetId?: string; needsConfirmation?: boolean };
    steps?: JourneyStep[];
  }> {
    if (!this.sdk) await this.init();
    return this.sdk!.classify(goal);
  }

  /**
   * Unified guide — backend decides single vs multi-step journey automatically.
   * For journeys the pill HUD starts immediately; caller can close its own UI.
   * `options.silent = true` suppresses the bottom-left JourneyPill so the caller
   * can render its own execution HUD (e.g. the widget's `executing` state).
   */
  async guide(
    text: string,
    onJourneyState?: (s: JourneyState) => void,
    options?: { silent?: boolean },
  ): Promise<GuideResult> {
    if (!this.sdk) await this.init();
    return this.sdk!.guide(text, onJourneyState, options);
  }

  async query(text: string): Promise<QueryResult> {
    if (!this.sdk) throw new Error('SDK not initialized');

    // Ensure we have a fresh scan
    if (this.sdk.domScanner.getElements().length === 0) {
      await this.sdk.domScanner.scan();
    }

    const response = await this.sdk.query(text);

    if (!response.success) {
      throw new Error(response.error || 'Query failed');
    }

    return {
      targetId: response.result.target_id,
      confidence: response.result.confidence,
      reasoning: response.result.reasoning,
    };
  }

  async startJourney(config: JourneyConfig, onState?: (s: JourneyState) => void): Promise<void> {
    if (!this.sdk) await this.init();
    await this.sdk!.startJourney(config, onState);
  }

  /**
   * Start an iterative, agent-planned journey from a natural-language goal.
   * `seedSteps` (optional) prime a curated workflow before the agent adapts it.
   */
  async startIterativeJourney(
    goal: string,
    onState?: (s: JourneyState) => void,
    seedSteps?: JourneyConfig['steps'],
    options?: { silent?: boolean },
  ): Promise<void> {
    if (!this.sdk) await this.init();
    await this.sdk!.startIterativeJourney(goal, onState, seedSteps, options);
  }

  /** Fly the cursor to a specific element (used to confirm a low-confidence match). */
  async flyToElement(targetId: string, tooltip?: string): Promise<boolean> {
    if (!this.sdk) await this.init();
    return this.sdk!.flyToElement(targetId, tooltip);
  }

  cancelJourney(): void {
    this.sdk?.cancelJourney();
  }

  /** Plan a journey and present the overview panel without auto-executing. */
  async previewJourney(
    goal: string,
    onJourneyState?: (s: JourneyState) => void,
  ): Promise<JourneyStep[] | null> {
    if (!this.sdk) await this.init();
    return this.sdk!.previewJourney(goal, onJourneyState);
  }

  /** Pure data: ask the agent to plan steps without mounting any UI. */
  async planJourney(goal: string): Promise<JourneyStep[]> {
    if (!this.sdk) await this.init();
    return this.sdk!.planJourney(goal);
  }

  /** Start executing a journey previously returned by previewJourney(). */
  async startPreviewedJourney(): Promise<void> {
    if (!this.sdk) return;
    await this.sdk.startPreviewedJourney();
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    this.sdk?.deactivate();
  }
}

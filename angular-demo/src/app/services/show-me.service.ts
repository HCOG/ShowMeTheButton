import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ShowMeSDK, JourneyConfig, JourneyState, GuideResult } from '@show-me/core';
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

  /** Emits when a global hotkey (Alt+V) requests voice input. The widget subscribes. */
  readonly voiceHotkey$ = new Subject<void>();

  constructor(private router: Router) {
    // Re-scan DOM after every navigation (new page = new elements)
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.sdk) {
          // Small delay so Angular has time to render the new page
          setTimeout(() => this.rescan(), 300);
        }
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
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
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
   * Unified guide — backend decides single vs multi-step journey automatically.
   * For journeys the pill HUD starts immediately; caller can close its own UI.
   */
  async guide(text: string, onJourneyState?: (s: JourneyState) => void): Promise<GuideResult> {
    if (!this.sdk) await this.init();
    return this.sdk!.guide(text, onJourneyState);
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

  cancelJourney(): void {
    this.sdk?.cancelJourney();
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
    this.sdk?.deactivate();
  }
}

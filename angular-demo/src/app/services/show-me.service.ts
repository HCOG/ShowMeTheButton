import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ShowMeSDK, JourneyConfig, JourneyState } from '@show-me/core';
import { filter, Subscription } from 'rxjs';

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

  async rescan(): Promise<number> {
    if (!this.sdk) return 0;
    const elements = await this.sdk.domScanner.refresh();
    return elements.length;
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

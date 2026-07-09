import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { JourneyStep, JourneyState, injectRecorderIds, AskUserPayload } from '@show-me/core';
import { ShowMeService } from '../../services/show-me.service';
import { RecorderService } from '../../services/recorder.service';
import { RecorderPanelComponent } from '../recorder-panel/recorder-panel.component';
import { environment } from '../../../environments/environment';
import { installTestBridge } from './debug/test-bridge';

type PanelState =
  | 'collapsed' | 'expanded' | 'listening' | 'loading'
  | 'plan-overview'      // user is reviewing planned steps before Start
  | 'executing'          // journey is running; widget shows the step list
  | 'completed'          // all steps done; widget shows 🎉 + countdown
  | 'result' | 'error' | 'confirm' | 'ask-user';  // ask-user: LLM asks a question

@Component({
  selector: 'app-show-me-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, RecorderPanelComponent],
  templateUrl: './show-me-widget.component.html',
  styleUrls: ['./show-me-widget.component.scss'],
})
export class ShowMeWidgetComponent implements OnInit, OnDestroy {
  state: PanelState = 'collapsed';
  queryText = '';
  resultText = '';
  errorText = '';
  confidence = 0;
  /** Pending low-confidence match awaiting user confirmation. */
  private pendingTargetId: string | null = null;

  /** Pending ask-user payload from the agent. Non-null in the 'ask-user' state. */
  askUserPayload: AskUserPayload | null = null;
  /** Single-select radio value (or multi-select array of selected option ids). */
  askUserSelection: 'single' | 'multi' = 'single';
  askUserSelectedId: string | null = null;
  askUserSelectedIds: string[] = [];
  /** Free-form text input (when askUserPayload.kind === 'text'). */
  askUserTextInput = '';
  /** Last submitted user query (used to enrich with the ask-user answer). */
  private lastQuery = '';
  /** How many ask-user rounds we've been through on the current query.
   *  Caps at MAX_ASK_ROUNDS to prevent infinite back-and-forth. */
  private askRoundCount = 0;
  private static MAX_ASK_ROUNDS = 3;

  /** Stashed classification result so the ask-user view can render
   *  `suggestions` chips from `result.suggestions`. Cleared on each new
   *  submit. */
  classification: {
    result?: {
      reasoning?: string;
      confidence?: number;
      targetId?: string;
      needsConfirmation?: boolean;
      askUser?: AskUserPayload;
      suggestions?: string[];
    };
    steps?: JourneyStep[];
  } | null = null;

  /** Steps returned by planJourney() awaiting the user's Start. */
  planSteps: JourneyStep[] = [];
  /** The original goal the user typed, echoed in the centered overview. */
  planGoal = '';

  /** Full step list during execution + completion. */
  execSteps: JourneyStep[] = [];
  /** 1-based index of the current step during execution. */
  execCurrent = 0;
  /** Per-step status for the executing/completed list ('pending'|'active'|'completed'). */
  execStepStatus: Array<'pending' | 'active' | 'completed'> = [];
  /** Phase of the current step (mirrors JourneyPill phase). */
  execPhase: 'finding' | 'navigating' | 'waiting' = 'waiting';

  /** Countdown seconds for the completed state before reverting to expanded. */
  completedCountdown = 5;
  private completedTimerSub: Subscription | null = null;

  /** ShowMeRecorderMode — dev only, gated by environment.recorderEnabled. */
  readonly recorderEnabled = environment.recorderEnabled;
  recorderActive = false;
  private recorderSub: Subscription | null = null;

  private hotkeySub?: Subscription;
  private journeySub?: Subscription;

  constructor(public showMe: ShowMeService, private recorder: RecorderService) {}

  get voiceSupported(): boolean {
    return this.showMe.isVoiceSupported;
  }

  ngOnInit(): void {
    // Alt+V hotkey (from app shell) → open widget and start listening.
    this.hotkeySub = this.showMe.voiceHotkey$.subscribe(() => this.startVoice());
    // Drive the executing / completed panels from the SDK's journey:state event.
    this.journeySub = this.showMe.journeyState$.subscribe((s) => this.onJourneyState(s));
    // Expose SDK for testing (dev only — installTestBridge is a no-op when
    // window is undefined; production builds tree-shake the call site).
    installTestBridge(this.showMe);
  }

  ngOnDestroy(): void {
    this.hotkeySub?.unsubscribe();
    this.journeySub?.unsubscribe();
    this._stopCountdown();
    this.recorderSub?.unsubscribe();
    this.showMe.stopVoiceInput();
  }

  private _stopCountdown(): void {
    this.completedTimerSub?.unsubscribe();
    this.completedTimerSub = null;
  }

  toggle(): void {
    if (this.state === 'collapsed') {
      this.state = 'expanded';
    } else {
      this.showMe.stopVoiceInput();
      this.state = 'collapsed';
      this.queryText = '';
      this.resultText = '';
      this.errorText = '';
    }
  }

  /**
   * Toggle the workflow recorder. Stamps interactive elements with
   * `data-show-me-target-id` and shows the recorder panel. Only available
   * when the build-time `environment.recorderEnabled` flag is on (dev).
   */
  toggleRecorder(): void {
    if (!this.recorderEnabled) return;
    if (this.recorderActive) {
      this.recorder.cancel();
      this.recorderActive = false;
    } else {
      this.recorder.start(window.location.pathname);
      this.recorderActive = true;
      this.recorderSub?.unsubscribe();
      this.recorderSub = this.recorder.enabled$.subscribe((on) => {
        this.recorderActive = on;
      });
    }
  }

  // --- Voice input -----------------------------------------------------------

  async startVoice(): Promise<void> {
    if (!this.voiceSupported) {
      this.errorText = '当前浏览器不支持语音输入，请使用 Chrome';
      this.state = 'error';
      return;
    }
    // Make sure the panel is open and reset prior result.
    this.queryText = '';
    this.resultText = '';
    this.errorText = '';
    this.state = 'listening';

    await this.showMe.startVoiceInput(
      (text, isFinal) => {
        this.queryText = text;
        if (isFinal && text.trim()) {
          // Auto-submit once we have a final transcript.
          this.submit();
        }
      },
      () => {
        // Recognition ended without a final result → fall back to manual edit.
        if (this.state === 'listening') {
          this.state = 'expanded';
        }
      },
      (err) => {
        this.state = 'expanded';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.errorText = '麦克风权限被拒绝';
          this.state = 'error';
        }
      },
    );
  }

  stopVoice(): void {
    this.showMe.stopVoiceInput();
    if (this.state === 'listening') {
      this.state = 'expanded';
    }
  }

  async submit(): Promise<void> {
    if (!this.queryText.trim()) return;

    // Stop listening if a voice utterance triggered this.
    this.showMe.stopVoiceInput();

    this.state = 'loading';
    this.resultText = '';
    this.errorText = '';
    this.planSteps = [];
    this.classification = null;
    this.askRoundCount = 0;
    this.planGoal = '';

    try {
      // Lazy-init on first use
      if (!this.showMe.isActive) {
        await this.showMe.init();
      }

      // Two-step: classify first, then either render result OR plan overview.
      // We can't use guide() here because it would auto-start the journey
      // (and mount the Pill for the non-silent path). We want the widget to
      // own the entire flow: plan → show overview → user clicks Start → silent run.
      const classification = await this.showMe.classify(this.queryText);

      if (classification.type === 'journey') {
        // classification.steps may be empty (the agent didn't pre-plan). In
        // that case fall through to a separate planJourney() call.
        let steps: JourneyStep[] = classification.steps ?? [];
        if (!steps.length) {
          try {
            steps = await this.showMe.planJourney(this.queryText);
          } catch (err: any) {
            this.errorText = err.message || '规划失败';
            this.state = 'error';
            return;
          }
        }
        if (!steps.length) {
          this.errorText = '未能为该目标规划步骤';
          this.state = 'error';
          return;
        }
        this.planSteps = steps;
        this.planGoal = this.queryText;
        this.state = 'plan-overview';
        return;
      }

      // Single element — use the existing flow.
      const r = classification.result;
      this.classification = classification;
      this._applySingleResult(r);
    } catch (err: any) {
      this.errorText = err.message || '查询失败，请检查Agent服务是否运行';
      this.state = 'error';
    }
  }

  /** Shared handler for a single-type classification result. Used by both
   *  the initial submit() and the ask-user round-trip. */
  private _applySingleResult(r: {
    reasoning?: string;
    confidence?: number;
    targetId?: string;
    needsConfirmation?: boolean;
    askUser?: AskUserPayload;
    suggestions?: string[];
  } | undefined): void {
    if (r?.askUser) {
      this.lastQuery = this.queryText;
      this.askUserPayload = r.askUser;
      this.askUserSelection = r.askUser.selection ?? 'single';
      this.askUserSelectedId = null;
      this.askUserSelectedIds = [];
      this.askUserTextInput = '';
      this.state = 'ask-user';
      return;
    }
    if (r?.needsConfirmation && r.targetId) {
      this.resultText = r.reasoning ?? '';
      this.confidence = r.confidence ?? 0;
      this.pendingTargetId = r.targetId;
      this.state = 'confirm';
      return;
    }
    if (r?.targetId) {
      void this.showMe.flyToElement(r.targetId, r.reasoning);
    }
    this.resultText = r?.reasoning ?? '';
    this.confidence = r?.confidence ?? 0;
    this.state = 'result';
  }

  /** User clicked "▶ 开始执行" in the centered overview → run the journey. */
  async startPlannedJourney(): Promise<void> {
    if (!this.planGoal || !this.planSteps.length) return;
    const goal = this.planGoal;
    const steps = this.planSteps;
    // Seed exec state with all-pending; journey:state events will update.
    this.execSteps = [...steps];
    this.execCurrent = 1;
    this.execStepStatus = steps.map(() => 'pending');
    this.execStepStatus[0] = 'active';
    this.execPhase = 'finding';
    this.state = 'executing';
    this.queryText = '';
    this.planSteps = [];
    this.planGoal = '';
    // silent=true → SDK does NOT mount the bottom-left JourneyPill; the widget
    // is the sole HUD for this run.
    await this.showMe.startIterativeJourney(goal, undefined, steps, { silent: true });
  }

  /** User clicked "取消" in the centered overview → revert to expanded. */
  cancelPlannedJourney(): void {
    this.planSteps = [];
    this.planGoal = '';
    this.state = 'expanded';
    this.queryText = '';
  }

  /** User clicked "取消执行" in the executing state. */
  cancelExecutingJourney(): void {
    this.showMe.cancelJourney();
    // journey:state will fire with status='cancelled' → onJourneyState resets.
  }

  /**
   * Manual override for the progression detector. Use when the user has
   * performed the step (clicked, typed, navigated) but the auto-detection
   * missed it — clicking here marks the current step done and advances.
   */
  advanceCurrentStep(): void {
    // Reuse the JourneyRunner's internal "smt:done" channel the pill uses
    // to advance when the user manually completes a step.
    document.dispatchEvent(new CustomEvent('smt:done'));
  }

  /** User clicked "关闭" in the completed state — skip the countdown. */
  closeCompleted(): void {
    this._stopCountdown();
    this._resetToExpanded();
  }

  /**
   * SDK → widget bridge. Translates JourneyState events into the widget's own
   * state machine. Called for every status change of the running journey.
   */
  private onJourneyState(s: JourneyState): void {
    if (s.status === 'running' && s.plan?.length) {
      // First time we see the running state for this widget, or a step advanced.
      // Merge in case the runner has a different list than what we seeded.
      if (s.plan.length !== this.execSteps.length) {
        this.execSteps = [...s.plan];
        this.execStepStatus = s.plan.map((_, i) =>
          i < s.currentStep - 1 ? 'completed'
          : i === s.currentStep - 1 ? 'active'
          : 'pending',
        );
      } else {
        // Mark the previous step completed and the new one active.
        for (let i = 0; i < this.execStepStatus.length; i++) {
          if (i < s.currentStep - 1) this.execStepStatus[i] = 'completed';
          else if (i === s.currentStep - 1) this.execStepStatus[i] = 'active';
          else this.execStepStatus[i] = 'pending';
        }
      }
      this.execCurrent = s.currentStep;
      this.execPhase = 'waiting';
      this.state = 'executing';
      // If a countdown was running (e.g. user clicked Start after a previous
      // completion), cancel it.
      this._stopCountdown();
    } else if (s.status === 'completed') {
      // All steps done — mark them all, switch to the completed panel, start
      // the 5-second countdown.
      for (let i = 0; i < this.execStepStatus.length; i++) {
        this.execStepStatus[i] = 'completed';
      }
      this.state = 'completed';
      this._startCompletedCountdown();
    } else if (s.status === 'cancelled') {
      this._stopCountdown();
      this._resetToExpanded();
    } else if (s.status === 'error') {
      // Errors are surfaced via the SDK's pill (which the runner still shows);
      // for the widget we just collapse so the user can retry.
      this._stopCountdown();
      this._resetToExpanded();
    }
  }

  private _startCompletedCountdown(): void {
    this.completedCountdown = 5;
    this._stopCountdown();
    this.completedTimerSub = interval(1000).subscribe(() => {
      this.completedCountdown -= 1;
      if (this.completedCountdown <= 0) {
        this._stopCountdown();
        this._resetToExpanded();
      }
    });
  }

  private _resetToExpanded(): void {
    this.state = 'expanded';
    this.queryText = '';
    this.resultText = '';
    this.errorText = '';
    this.execSteps = [];
    this.execCurrent = 0;
    this.execStepStatus = [];
  }

  /** User confirmed the low-confidence match → fly to it. */
  async confirmTarget(): Promise<void> {
    if (!this.pendingTargetId) return;
    const id = this.pendingTargetId;
    this.pendingTargetId = null;
    await this.showMe.flyToElement(id, this.resultText);
    this.state = 'result';
  }

  /** User submitted the ask-user answer → re-issue the query with the
   *  chosen answer folded in as additional context. The server signals
   *  `askUser.keepGoing === true` to chain another question; we cap
   *  total rounds at MAX_ASK_ROUNDS regardless. */
  async confirmAskUser(): Promise<void> {
    if (!this.askUserPayload) return;
    this.askRoundCount += 1;
    if (this.askRoundCount > ShowMeWidgetComponent.MAX_ASK_ROUNDS) {
      this.errorText = 'Maximum clarification rounds reached; please refine your query.';
      this.state = 'error';
      this.askUserPayload = null;
      return;
    }
    const answer = this._collectAskUserAnswer();
    const enriched = answer
      ? `${this.lastQuery}\n\n[user clarification]\n${this.askUserPayload.question}\n${answer}`
      : this.lastQuery;
    this.askUserPayload = null;
    this.queryText = enriched;
    // Re-issue WITHOUT resetting askRoundCount — this is a continuation of
    // the same query. Bypass the full submit() flow so we don't blow away
    // the counter; go through guide + classify directly.
    this.state = 'loading';
    try {
      await this.showMe.guide(this.queryText);
      const classification = await this.showMe.classify(this.queryText);
      this.classification = classification;
      if (classification.type === 'journey') {
        // The agent now thinks the user is doing a multi-step workflow.
        // Surface the plan-overview so the user can re-launch from the top.
        const steps: JourneyStep[] = classification.steps ?? [];
        if (steps.length) {
          this.planSteps = steps;
          this.planGoal = this.queryText;
          this.state = 'plan-overview';
        } else {
          this.errorText = '未能为该目标规划步骤';
          this.state = 'error';
        }
      } else {
        this._applySingleResult(classification.result);
      }
    } catch (err: any) {
      this.errorText = err.message || '查询失败';
      this.state = 'error';
    }
  }

  /** User skipped the ask-user question. Fall back to a plain re-issue of
   *  the original query. */
  async skipAskUser(): Promise<void> {
    if (!this.askUserPayload) return;
    this.askUserPayload = null;
    this.queryText = this.lastQuery;
    await this.submit();
  }

  /** User picked an option in the ask-user panel. Single-select replaces;
   *  multi-select toggles membership in the selection list. */
  onAskUserChoice(id: string): void {
    if (this.askUserSelection === 'multi') {
      const i = this.askUserSelectedIds.indexOf(id);
      if (i === -1) this.askUserSelectedIds = [...this.askUserSelectedIds, id];
      else this.askUserSelectedIds = this.askUserSelectedIds.filter((x) => x !== id);
    } else {
      this.askUserSelectedId = id;
    }
  }

  /** Format the user's answer based on the payload's selection / kind. */
  private _collectAskUserAnswer(): string {
    const p = this.askUserPayload;
    if (!p) return '';
    if (p.kind === 'text') {
      return this.askUserTextInput.trim();
    }
    // 'option' kind
    if (this.askUserSelection === 'multi') {
      const labels = this.askUserSelectedIds
        .map((id) => p.options.find((o) => o.id === id)?.label)
        .filter(Boolean)
        .join(', ');
      return this.askUserSelectedIds.length > 0 ? labels : '';
    }
    if (this.askUserSelectedId) {
      const opt = p.options.find((o) => o.id === this.askUserSelectedId);
      return opt ? opt.label : '';
    }
    return '';
  }
  }

  /** User rejected the low-confidence match → go back to ask again. */
  rejectTarget(): void {
    this.pendingTargetId = null;
    this.state = 'expanded';
    this.queryText = '';
    this.resultText = '';
  }

  retry(): void {
    this.state = 'expanded';
    this.errorText = '';
  }

  newQuery(): void {
    this.state = 'expanded';
    this.queryText = '';
    this.resultText = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
    if (event.key === 'Escape') {
      this.toggle();
    }
  }
}

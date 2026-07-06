import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { JourneyStep } from '@show-me/core';
import { ShowMeService } from '../../services/show-me.service';

type PanelState = 'collapsed' | 'expanded' | 'listening' | 'loading' | 'result' | 'error' | 'confirm' | 'plan-overview';

@Component({
  selector: 'app-show-me-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  /** Steps returned by planJourney() awaiting the user's Start. */
  planSteps: JourneyStep[] = [];
  /** The original goal the user typed, echoed in the centered overview. */
  planGoal = '';

  private hotkeySub?: Subscription;

  constructor(public showMe: ShowMeService) {}

  get voiceSupported(): boolean {
    return this.showMe.isVoiceSupported;
  }

  ngOnInit(): void {
    // Alt+V hotkey (from app shell) → open widget and start listening.
    this.hotkeySub = this.showMe.voiceHotkey$.subscribe(() => this.startVoice());
    // Expose SDK for testing
    (window as any).__showMeService = this.showMe;
  }

  ngOnDestroy(): void {
    this.hotkeySub?.unsubscribe();
    this.showMe.stopVoiceInput();
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
    this.planGoal = '';

    try {
      // Lazy-init on first use
      if (!this.showMe.isActive) {
        await this.showMe.init();
      }

      const result = await this.showMe.guide(this.queryText);

      if (result.type === 'journey') {
        // guide() has already kicked off the iterative journey. Cancel it so
        // we can render our own centered plan-overview panel instead of the
        // SDK's body-mounted JourneyOverview. Then re-fetch the steps via the
        // pure-data planJourney() — the plan endpoint is the same one
        // startSmart uses internally, no extra agent work.
        this.showMe.cancelJourney();
        try {
          const steps = await this.showMe.planJourney(this.queryText);
          if (!steps.length) {
            this.errorText = '未能为该目标规划步骤';
            this.state = 'error';
            return;
          }
          this.planSteps = steps;
          this.planGoal = this.queryText;
          // CSS morph kicks in: panel re-anchors from right-bottom to
          // center-bottom and grows from 320 → 460 px.
          this.state = 'plan-overview';
        } catch (err: any) {
          this.errorText = err.message || '规划失败';
          this.state = 'error';
        }
      } else if (result.needsConfirmation && result.targetId) {
        // Low-confidence match: ask the user before moving the cursor (U3).
        this.resultText = result.reasoning ?? '';
        this.confidence = result.confidence ?? 0;
        this.pendingTargetId = result.targetId;
        this.state = 'confirm';
      } else {
        this.resultText = result.reasoning ?? '';
        this.confidence = result.confidence ?? 0;
        this.state = 'result';
      }
    } catch (err: any) {
      this.errorText = err.message || '查询失败，请检查Agent服务是否运行';
      this.state = 'error';
    }
  }

  /** User clicked "▶ 开始执行" in the centered overview → run the journey. */
  async startPlannedJourney(): Promise<void> {
    if (!this.planGoal || !this.planSteps.length) return;
    const goal = this.planGoal;
    const steps = this.planSteps;
    // Collapse before the SDK mounts any UI so they don't visually overlap.
    this.state = 'collapsed';
    this.queryText = '';
    this.planSteps = [];
    this.planGoal = '';
    // startIterativeJourney accepts seed steps; after the seed runs out, the
    // agent re-plans against the live DOM, which is exactly what we want.
    await this.showMe.startIterativeJourney(goal, undefined, steps);
  }

  /** User clicked "取消" in the centered overview → revert to expanded. */
  cancelPlannedJourney(): void {
    this.planSteps = [];
    this.planGoal = '';
    this.state = 'expanded';
    this.queryText = '';
  }

  /** User confirmed the low-confidence match → fly to it. */
  async confirmTarget(): Promise<void> {
    if (!this.pendingTargetId) return;
    const id = this.pendingTargetId;
    this.pendingTargetId = null;
    await this.showMe.flyToElement(id, this.resultText);
    this.state = 'result';
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

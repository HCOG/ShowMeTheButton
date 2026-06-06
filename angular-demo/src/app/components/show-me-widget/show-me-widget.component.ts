import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ShowMeService } from '../../services/show-me.service';

type PanelState = 'collapsed' | 'expanded' | 'listening' | 'loading' | 'result' | 'error';

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

  private hotkeySub?: Subscription;

  constructor(public showMe: ShowMeService) {}

  get voiceSupported(): boolean {
    return this.showMe.isVoiceSupported;
  }

  ngOnInit(): void {
    // Alt+V hotkey (from app shell) → open widget and start listening.
    this.hotkeySub = this.showMe.voiceHotkey$.subscribe(() => this.startVoice());
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

    try {
      // Lazy-init on first use
      if (!this.showMe.isActive) {
        await this.showMe.init();
      }

      const result = await this.showMe.guide(this.queryText);

      if (result.type === 'journey') {
        // The pill HUD has taken over — close the widget so it doesn't overlap.
        this.state = 'collapsed';
        this.queryText = '';
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

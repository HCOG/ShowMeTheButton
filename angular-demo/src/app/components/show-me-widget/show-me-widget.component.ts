import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShowMeService } from '../../services/show-me.service';

type PanelState = 'collapsed' | 'expanded' | 'loading' | 'result' | 'error';

@Component({
  selector: 'app-show-me-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './show-me-widget.component.html',
  styleUrls: ['./show-me-widget.component.scss'],
})
export class ShowMeWidgetComponent {
  state: PanelState = 'collapsed';
  queryText = '';
  resultText = '';
  errorText = '';
  confidence = 0;

  constructor(public showMe: ShowMeService) {}

  toggle(): void {
    if (this.state === 'collapsed') {
      this.state = 'expanded';
    } else {
      this.state = 'collapsed';
      this.queryText = '';
      this.resultText = '';
      this.errorText = '';
    }
  }

  async submit(): Promise<void> {
    if (!this.queryText.trim()) return;

    this.state = 'loading';
    this.resultText = '';
    this.errorText = '';

    try {
      // Lazy-init on first use
      if (!this.showMe.isActive) {
        await this.showMe.init();
      }

      const result = await this.showMe.query(this.queryText);

      this.resultText = result.reasoning;
      this.confidence = result.confidence;
      this.state = 'result';
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

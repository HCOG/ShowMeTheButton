import { Component, EventEmitter, inject, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RecorderService, WorkflowMeta } from '../../services/recorder.service';
import type { WorkflowV2 } from '@show-me/core';

@Component({
  selector: 'app-recorder-summary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recorder-summary.component.html',
  styleUrls: ['./recorder-summary.component.scss'],
})
export class RecorderSummaryComponent {
  private recorder = inject(RecorderService);
  private router = inject(Router);

  @Output() closed = new EventEmitter<void>();

  title = '';
  description = '';
  estimatedTime = '';
  tagsInput = '';
  intent = '';

  currentPage = this.guessCurrentPage();

  /** Build the workflow from the live recorder state and download it. */
  save(): void {
    const meta: WorkflowMeta = {
      title: this.title.trim() || 'Untitled workflow',
      description: this.description.trim(),
      page: this.currentPage,
      estimatedTime: this.estimatedTime.trim() || undefined,
      tags: this.tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      intent: this.intent.trim(),
    };
    this.recorder.finish(meta);
    this.closed.emit();
  }

  cancel(): void {
    this.closed.emit();
  }

  /** Best-effort detection of the route the user is currently on. */
  private guessCurrentPage(): string {
    const url = this.router.url || '/';
    return url.split('?')[0];
  }
}

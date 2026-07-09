import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { RecorderService, RecordedStep } from '../../services/recorder.service';

@Component({
  selector: 'app-recorder-annotation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recorder-annotation.component.html',
  styleUrls: ['./recorder-annotation.component.scss'],
})
export class RecorderAnnotationComponent implements OnDestroy {
  private recorder = inject(RecorderService);
  private subs: Subscription[] = [];

  step: RecordedStep | null = null;
  draft: {
    title: string;
    description: string;
    hint: string;
    type: 'action' | 'wait' | 'branch';
    branchGoto: number | null;
  } = { title: '', description: '', hint: '', type: 'action', branchGoto: null };

  get allSteps(): RecordedStep[] {
    // Snapshot — used for branch "goto" dropdown. Cheap: RecorderService
    // already publishes the list as a BehaviorSubject.
    let snapshot: RecordedStep[] = [];
    this.recorder.steps$.subscribe((s) => (snapshot = s)).unsubscribe();
    return snapshot;
  }

  constructor() {
    this.subs.push(
      this.recorder.annotation$.subscribe((s) => {
        if (s && s !== this.step) {
          this.step = s;
          this.draft = {
            title: s.title,
            description: s.description,
            hint: s.hint ?? '',
            type: s.type,
            branchGoto: null,
          };
        } else if (!s) {
          this.step = null;
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  save(): void {
    if (!this.step) return;
    const updated: RecordedStep = {
      ...this.step,
      title: this.draft.title || this.step.label,
      description: this.draft.description,
      type: this.draft.type,
      hint: this.draft.hint || undefined,
    };
    if (this.draft.type === 'branch' && this.draft.branchGoto) {
      updated.branch = {
        whenDescription: this.draft.description,
        goto: `step-${this.draft.branchGoto}`,
      };
    }
    this.recorder.updateStep(updated);
    this.dismiss();
  }

  dismiss(): void {
    this.step = null;
    this.recorder.annotation$.next(null);
  }
}

import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { RecorderService, RecordedStep } from '../../services/recorder.service';
import { RecorderSummaryComponent } from '../recorder-summary/recorder-summary.component';
import { RecorderAnnotationComponent } from '../recorder-annotation/recorder-annotation.component';

@Component({
  selector: 'app-recorder-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RecorderSummaryComponent, RecorderAnnotationComponent],
  templateUrl: './recorder-panel.component.html',
  styleUrls: ['./recorder-panel.component.scss'],
})
export class RecorderPanelComponent implements OnDestroy {
  private recorder = inject(RecorderService);
  private subs: Subscription[] = [];

  steps: RecordedStep[] = [];
  showSummary = false;
  fromStep = 1;
  toStep = 1;

  constructor() {
    this.subs.push(this.recorder.steps$.subscribe((s) => (this.steps = s)));
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  addWait(): void {
    this.recorder.addManualStep('wait');
  }

  addBranch(): void {
    this.recorder.addManualStep('branch');
  }

  togglePrereq(step: number, target: number): void {
    this.recorder.togglePrereq(step, target);
  }

  openSummary(): void {
    this.showSummary = true;
  }

  closeSummary(): void {
    this.showSummary = false;
  }

  cancel(): void {
    this.recorder.cancel();
  }

  isPrereq(step: number, target: number): boolean {
    const s = this.steps.find((x) => x.step === step);
    return s?.prerequisites.includes(`step-${target}`) ?? false;
  }

  trackByStep = (_: number, s: RecordedStep) => s.step;
}

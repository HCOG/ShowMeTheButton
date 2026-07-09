import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { generateSelector, injectRecorderIds } from '@show-me/core';
import type { ActionNode, BranchNode, Condition, WaitNode, WorkflowV2, JsonValue } from '@show-me/core';
import { environment } from '../../environments/environment';

/**
 * One recorded user interaction (a click on an element, or an explicit
 * "wait" / "branch" step the user added). Persists to a `WorkflowV2`
 * action/wait/branch node on `finish()`.
 */
export interface RecordedStep {
  /** 1-based ordinal — the user-visible step number in the recorder panel. */
  step: number;
  /** Concrete node type the user picked. */
  type: 'action' | 'wait' | 'branch';
  /** For 'action': generated CSS selector; otherwise undefined. */
  selector?: string;
  /** Human-readable label derived from a11y / textContent / id. */
  label: string;
  /** User-supplied short title (saved to node.title). */
  title: string;
  /** User-supplied description (saved to node.description). */
  description: string;
  /** Optional user-supplied tooltip (saved to node.hint). */
  hint?: string;
  /** Only set when type === 'branch'. */
  branch?: {
    /** Selected target step id (or undefined = "fallback to default"). */
    goto?: string;
    /** Human-readable condition. */
    whenDescription?: string;
  };
  /** Step ids this step depends on (saved to the plan-level metadata, not the node). */
  prerequisites: string[];
}

/** Workflow-level metadata captured at finish(). */
export interface WorkflowMeta {
  title: string;
  description: string;
  page: string;
  estimatedTime?: string;
  /** Free-form keywords for agent ↔ workflow matching. */
  tags: string[];
  /** Natural-language intent — what this workflow is for. */
  intent: string;
}

@Injectable({ providedIn: 'root' })
export class RecorderService {
  /** True while the recorder is active (between start() and stop()/cancel()). */
  readonly enabled$ = new BehaviorSubject<boolean>(false);
  /** Live list of recorded steps in order. */
  readonly steps$ = new BehaviorSubject<RecordedStep[]>([]);
  /** Emits the most-recently-clicked element so the UI can highlight it. */
  readonly highlight$ = new Subject<HTMLElement | null>();
  /** Emits when the recorder needs the user to fill in the annotation popover. */
  readonly annotation$ = new Subject<RecordedStep | null>();

  private steps: RecordedStep[] = [];
  private nextStep = 1;
  private clickHandler = this.handleClick.bind(this);
  /** 'data-show-me-recorder-active' set on <html> while recording. */
  private readonly MARKER = 'data-show-me-recorder-active';

  start(page: string): void {
    if (!environment.recorderEnabled) {
      console.warn('[Recorder] Not enabled in this build.');
      return;
    }
    if (this.enabled$.value) return;
    this.steps = [];
    this.nextStep = 1;
    this.steps$.next([]);
    this.enabled$.next(true);
    document.documentElement.setAttribute(this.MARKER, '1');
    injectRecorderIds();
    // Capture phase so we see the click before any app handler.
    document.addEventListener('click', this.clickHandler, true);
    this.currentPage = page;
  }

  stop(): void {
    document.removeEventListener('click', this.clickHandler, true);
    document.documentElement.removeAttribute(this.MARKER);
    this.enabled$.next(false);
  }

  cancel(): void {
    this.stop();
    this.steps = [];
    this.nextStep = 1;
    this.steps$.next([]);
  }

  /** Insert a step from the panel (e.g. user clicked "add wait"). */
  addManualStep(type: 'wait' | 'branch'): RecordedStep {
    const step: RecordedStep = {
      step: this.nextStep++,
      type,
      label: type === 'wait' ? '等待条件' : '分支判断',
      title: type === 'wait' ? '等待' : '分支',
      description: '',
      prerequisites: [],
    };
    this.steps = [...this.steps, step];
    this.steps$.next(this.steps);
    return step;
  }

  /** Toggle a prerequisite flag for a step (mutual deps). */
  togglePrereq(step: number, target: number): void {
    const idx = this.steps.findIndex((s) => s.step === step);
    if (idx === -1) return;
    const s = this.steps[idx];
    const has = s.prerequisites.includes(`step-${target}`);
    s.prerequisites = has
      ? s.prerequisites.filter((p) => p !== `step-${target}`)
      : [...s.prerequisites, `step-${target}`];
    this.steps = [...this.steps];
    this.steps$.next(this.steps);
  }

  /** Replace a step (used by the annotation popover). */
  updateStep(updated: RecordedStep): void {
    const idx = this.steps.findIndex((s) => s.step === updated.step);
    if (idx === -1) return;
    this.steps = this.steps.map((s) => (s.step === updated.step ? updated : s));
    this.steps$.next(this.steps);
  }

  /** Build a v2 DAG and trigger a browser download. */
  finish(meta: WorkflowMeta): WorkflowV2 {
    const nodes: WorkflowV2['nodes'] = {};
    const stepIds: string[] = [];

    for (const s of this.steps) {
      const id = `step-${s.step}`;
      stepIds.push(id);
      if (s.type === 'action') {
        const action: ActionNode = {
          id,
          type: 'action',
          title: s.title,
          description: s.description || s.label,
          query: s.selector ?? s.label,
        };
        if (s.hint) action.hint = s.hint;
        nodes[id] = action;
      } else if (s.type === 'wait') {
        const wait: WaitNode = {
          id,
          type: 'wait',
          title: s.title,
          description: s.description,
          until: { kind: 'duration', ms: 1000 },
        };
        nodes[id] = wait;
      } else if (s.type === 'branch') {
        const branch: BranchNode = {
          id,
          type: 'branch',
          title: s.title,
          description: s.description,
          branches: s.branch?.whenDescription
            ? [{
                when: { kind: 'param-truthy', name: '_branch' } as Condition,
                goto: s.branch.goto ?? stepIds[0],
              }]
            : [],
          default: s.branch?.goto ?? stepIds[0],
        };
        nodes[id] = branch;
      }
    }

    // If a step depends on another (prerequisites), wrap it in a wait that
    // gates on the prerequisite having completed. Cheap proxy: wait 0ms and
    // trust the runtime to call this after the prereq in the plan.
    // (A real prereq graph would need a dedicated 'prereq' node type;
    // for now we record intent in metadata and let the executor run steps
    // in recorded order.)
    const metaPrereqs: Record<string, string[]> = {};
    for (const s of this.steps) {
      if (s.prerequisites.length) {
        metaPrereqs[`step-${s.step}`] = s.prerequisites;
      }
    }

    const wf: WorkflowV2 = {
      id: meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recorded',
      title: meta.title,
      description: meta.description,
      page: meta.page,
      version: 2,
      entry: stepIds[0] ?? 'step-1',
      nodes,
      metadata: {
        tags: meta.tags,
        author: undefined,
        updatedAt: new Date().toISOString(),
        // Stash recording-only data in metadata for downstream agent matching.
        intent: meta.intent,
        prereqs: Object.keys(metaPrereqs).length ? metaPrereqs : undefined,
      } as any,
    };

    this.downloadJson(wf);
    this.stop();
    this.steps = [];
    this.nextStep = 1;
    this.steps$.next([]);
    return wf;
  }

  // ── Internals ──────────────────────────────────────────────────────

  private currentPage = '';

  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target) return;
    // Ignore clicks on SDK overlays and the recorder panel itself.
    if (target.closest(
      '#show-me-sdk-cursor, #smt-target-ring, #smt-journey-pill, #smt-journey-overview, .smt-recorder-overlay',
    )) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const selector = generateSelector(target);
    const label = bestLabel(target);
    const step: RecordedStep = {
      step: this.nextStep++,
      type: 'action',
      selector,
      label,
      title: label.slice(0, 40),
      description: '',
      prerequisites: [],
    };
    this.steps = [...this.steps, step];
    this.steps$.next(this.steps);
    this.highlight$.next(target);
    this.annotation$.next(step);
  }

  private downloadJson(wf: WorkflowV2): void {
    const blob = new Blob([JSON.stringify(wf, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wf.id || 'recorded'}.workflow.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Pick the best human-readable label for an element: aria-label →
 * text content (trimmed) → title → placeholder → id → tag name.
 */
function bestLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const text = (el.textContent ?? '').trim();
  if (text) return text;
  const title = el.getAttribute('title');
  if (title) return title;
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;
  if (el.id) return `#${el.id}`;
  return el.tagName.toLowerCase();
}

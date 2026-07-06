import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

type ActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'upload'
  | 'review'
  | 'submit'
  | 'confirm'
  | 'wait'
  | 'verify'
  | 'ask_user'
  | 'handoff'
  | 'unknown';

type RiskLevel = 'low' | 'medium' | 'high';
type ComponentStatus = 'mapped' | 'candidate' | 'unmapped';
type ValidationType =
  | 'route_changed'
  | 'component_visible'
  | 'field_valid'
  | 'business_status'
  | 'toast_visible'
  | 'api_state'
  | 'manual_check'
  | 'unknown';

interface ComponentRef {
  status: ComponentStatus;
  component_id: string | null;
  label_hint: string;
  route_hint: string | null;
  candidate_component_ids: string[];
  confidence: number;
}

interface ValidationRule {
  type: ValidationType;
  target: string;
  expected: string;
  inferred: boolean;
  confidence: number;
}

interface FallbackRule {
  on_failure: string;
  recovery_action: string;
  message: string;
  confidence: number;
}

interface WorkflowStep {
  step_id: string;
  title: string;
  user_goal: string;
  action_type: ActionType;
  instruction: string;
  expected_page_or_route: string | null;
  component_ref: ComponentRef;
  input_fields: Array<{ label: string; required: boolean; confidence: number }>;
  validation_rule: ValidationRule;
  completion_signal: string;
  fallback: FallbackRule;
  risk_level: RiskLevel;
  requires_confirmation: boolean;
  confidence: number;
  source_quote_or_source_span: string;
}

interface WorkflowBranch {
  condition: string;
  from_step_id: string | null;
  to_step_id: string | null;
  branch_label: string;
  confidence: number;
  unresolved_if_ambiguous: boolean;
}

interface WorkflowDraft {
  schema_version: 'workflow-draft-v1';
  workflow: {
    workflow_id: string;
    workflow_name: string;
    description: string;
    business_goal: string;
    domain: string;
    target_user_roles: string[];
    intent_aliases: string[];
    source: {
      document_path: string;
      document_title: string;
      extracted_at: string;
      extractor_version: string;
      [key: string]: unknown;
    };
    prerequisites: string[];
    steps: WorkflowStep[];
    branches: WorkflowBranch[];
    global_risks: Array<Record<string, unknown>>;
    unresolved_questions: string[];
  };
  quality: {
    overall_confidence: number;
    mapped_component_ratio: number;
    steps_missing_verification: string[];
    high_risk_steps: string[];
    unmapped_components: Array<{ step_id: string; label_hint: string }>;
    needs_human_review: boolean;
  };
  validation_report: {
    schema_valid: boolean;
    errors: string[];
  };
}

const STORAGE_KEY = 'showme.workflowDraft.editor';

const SAMPLE_DRAFT: WorkflowDraft = {
  schema_version: 'workflow-draft-v1',
  workflow: {
    workflow_id: 'wf_create_project_and_submit_for_approval',
    workflow_name: 'Create Project and Submit for Approval',
    description: 'Create a new project record and send it to the manager for approval.',
    business_goal: 'Create a new project record and send it to the manager for approval.',
    domain: 'project_management',
    target_user_roles: ['requester', 'manager'],
    intent_aliases: ['Create Project and Submit for Approval', 'create project and submit for approval'],
    source: {
      document_path: 'examples/sop/create-project-approval.md',
      document_title: 'Create Project and Submit for Approval',
      extracted_at: '2026-01-01T00:00:00+00:00',
      extractor_version: 'sop-to-workflow-v1'
    },
    prerequisites: ['User is signed in.', 'User has requester permission.', 'Required budget code is available.'],
    steps: [
      {
        step_id: 'step_01',
        title: 'Open Projects page',
        user_goal: 'Open the Projects page',
        action_type: 'navigate',
        instruction: 'Go to `/projects` and open the Projects page.',
        expected_page_or_route: '/projects',
        component_ref: {
          status: 'mapped',
          component_id: 'project.nav',
          label_hint: 'Projects',
          route_hint: '/projects',
          candidate_component_ids: [],
          confidence: 0.94
        },
        input_fields: [],
        validation_rule: {
          type: 'route_changed',
          target: '/projects',
          expected: '/projects',
          inferred: true,
          confidence: 0.72
        },
        completion_signal: 'Expected page or route is active.',
        fallback: {
          on_failure: 'wrong_page',
          recovery_action: 'show_manual_instruction',
          message: 'Show the SOP instruction and ask the user how to proceed if the expected UI state is not reached.',
          confidence: 0.62
        },
        risk_level: 'low',
        requires_confirmation: false,
        confidence: 0.88,
        source_quote_or_source_span: 'Go to `/projects` and open the Projects page.'
      },
      {
        step_id: 'step_02',
        title: 'Create new project',
        user_goal: 'Start a project request',
        action_type: 'click',
        instruction: 'Click "New Project" to start a project request.',
        expected_page_or_route: null,
        component_ref: {
          status: 'mapped',
          component_id: 'project.create_button',
          label_hint: 'New Project',
          route_hint: '/projects',
          candidate_component_ids: [],
          confidence: 0.9
        },
        input_fields: [],
        validation_rule: {
          type: 'component_visible',
          target: 'project.create_button',
          expected: 'expected control/state appears',
          inferred: true,
          confidence: 0.62
        },
        completion_signal: 'Expected UI state is reached.',
        fallback: {
          on_failure: 'unknown',
          recovery_action: 'show_manual_instruction',
          message: 'Show the SOP instruction and ask the user how to proceed if the expected UI state is not reached.',
          confidence: 0.62
        },
        risk_level: 'low',
        requires_confirmation: false,
        confidence: 0.88,
        source_quote_or_source_span: 'Click "New Project" to start a project request.'
      },
      {
        step_id: 'step_03',
        title: 'Submit for approval',
        user_goal: 'Send the project to approval',
        action_type: 'submit',
        instruction: 'Click "Submit for Approval".',
        expected_page_or_route: '/projects/new',
        component_ref: {
          status: 'mapped',
          component_id: 'project.submit_approval_button',
          label_hint: 'Submit for Approval',
          route_hint: '/projects/new',
          candidate_component_ids: [],
          confidence: 0.9
        },
        input_fields: [],
        validation_rule: {
          type: 'business_status',
          target: 'project.status_badge',
          expected: 'Pending Approval',
          inferred: false,
          confidence: 0.82
        },
        completion_signal: 'No validation errors and a success/status confirmation is visible.',
        fallback: {
          on_failure: 'validation_failed',
          recovery_action: 'show_manual_instruction',
          message: 'Stop before retrying the high-risk action and request human confirmation.',
          confidence: 0.8
        },
        risk_level: 'high',
        requires_confirmation: true,
        confidence: 0.88,
        source_quote_or_source_span: 'Click "Submit for Approval".'
      }
    ],
    branches: [
      {
        condition: 'If the project budget is over 10000, attach the budget justification document',
        from_step_id: 'step_02',
        to_step_id: null,
        branch_label: 'budget_attachment_required',
        confidence: 0.64,
        unresolved_if_ambiguous: true
      }
    ],
    global_risks: [
      {
        risk_level: 'high',
        reason: 'Workflow contains externally visible or approval/submission actions.',
        requires_human_review: true
      }
    ],
    unresolved_questions: [
      'Which UI component corresponds to the budget attachment control?',
      'What is the exact target step for the budget attachment condition?'
    ]
  },
  quality: {
    overall_confidence: 0.78,
    mapped_component_ratio: 1,
    steps_missing_verification: [],
    high_risk_steps: ['step_03'],
    unmapped_components: [],
    needs_human_review: true
  },
  validation_report: {
    schema_valid: true,
    errors: []
  }
};

@Component({
  selector: 'app-workflow',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workflow.component.html',
  styleUrls: ['./workflow.component.scss']
})
export class WorkflowComponent {
  readonly actionTypes: ActionType[] = [
    'navigate',
    'click',
    'fill',
    'select',
    'upload',
    'review',
    'submit',
    'confirm',
    'wait',
    'verify',
    'ask_user',
    'handoff',
    'unknown'
  ];

  readonly riskLevels: RiskLevel[] = ['low', 'medium', 'high'];
  readonly componentStatuses: ComponentStatus[] = ['mapped', 'candidate', 'unmapped'];
  readonly validationTypes: ValidationType[] = [
    'route_changed',
    'component_visible',
    'field_valid',
    'business_status',
    'toast_visible',
    'api_state',
    'manual_check',
    'unknown'
  ];

  draft: WorkflowDraft = this.loadInitialDraft();
  selectedStepId = this.draft.workflow.steps[0]?.step_id ?? '';
  importText = '';
  exportText = this.toPrettyJson(this.draft);
  validationErrors: string[] = [];
  dirty = false;
  statusMessage = 'Draft loaded';

  get selectedStep(): WorkflowStep | undefined {
    return this.draft.workflow.steps.find((step) => step.step_id === this.selectedStepId);
  }

  get unresolvedText(): string {
    return this.draft.workflow.unresolved_questions.join('\n');
  }

  set unresolvedText(value: string) {
    this.draft.workflow.unresolved_questions = this.linesFromText(value);
    this.markDirty();
  }

  get prerequisitesText(): string {
    return this.draft.workflow.prerequisites.join('\n');
  }

  set prerequisitesText(value: string) {
    this.draft.workflow.prerequisites = this.linesFromText(value);
    this.markDirty();
  }

  get aliasesText(): string {
    return this.draft.workflow.intent_aliases.join('\n');
  }

  set aliasesText(value: string) {
    this.draft.workflow.intent_aliases = this.linesFromText(value);
    this.markDirty();
  }

  selectStep(stepId: string): void {
    this.selectedStepId = stepId;
  }

  addStep(): void {
    const nextIndex = this.draft.workflow.steps.length + 1;
    const step = this.createStep(nextIndex);
    this.draft.workflow.steps.push(step);
    this.selectedStepId = step.step_id;
    this.markDirty();
  }

  duplicateStep(step: WorkflowStep): void {
    const clone = this.deepClone(step);
    clone.step_id = this.nextStepId();
    clone.title = `${clone.title} copy`;
    this.draft.workflow.steps.splice(this.stepIndex(step.step_id) + 1, 0, clone);
    this.renumberSteps();
    this.selectedStepId = clone.step_id;
    this.markDirty();
  }

  deleteStep(stepId: string): void {
    if (this.draft.workflow.steps.length <= 1) {
      this.statusMessage = 'At least one step is required';
      return;
    }

    const index = this.stepIndex(stepId);
    this.draft.workflow.steps.splice(index, 1);
    this.draft.workflow.branches = this.draft.workflow.branches.filter(
      (branch) => branch.from_step_id !== stepId && branch.to_step_id !== stepId
    );
    this.renumberSteps();
    this.selectedStepId = this.draft.workflow.steps[Math.max(0, index - 1)]?.step_id ?? '';
    this.markDirty();
  }

  moveStep(stepId: string, direction: -1 | 1): void {
    const index = this.stepIndex(stepId);
    const target = index + direction;
    if (target < 0 || target >= this.draft.workflow.steps.length) {
      return;
    }

    const [step] = this.draft.workflow.steps.splice(index, 1);
    this.draft.workflow.steps.splice(target, 0, step);
    this.renumberSteps();
    this.selectedStepId = this.draft.workflow.steps[target].step_id;
    this.markDirty();
  }

  addBranch(): void {
    const firstStep = this.draft.workflow.steps[0]?.step_id ?? null;
    this.draft.workflow.branches.push({
      condition: 'If condition is true',
      from_step_id: firstStep,
      to_step_id: null,
      branch_label: `branch_${this.draft.workflow.branches.length + 1}`,
      confidence: 0.5,
      unresolved_if_ambiguous: true
    });
    this.markDirty();
  }

  deleteBranch(index: number): void {
    this.draft.workflow.branches.splice(index, 1);
    this.markDirty();
  }

  onRiskChange(step: WorkflowStep): void {
    if (step.risk_level === 'high') {
      step.requires_confirmation = true;
    }
    this.markDirty();
  }

  onComponentStatusChange(step: WorkflowStep): void {
    if (step.component_ref.status !== 'mapped') {
      step.component_ref.component_id = null;
    }
    this.markDirty();
  }

  addInputField(step: WorkflowStep): void {
    step.input_fields.push({ label: 'Field', required: false, confidence: 0.5 });
    this.markDirty();
  }

  deleteInputField(step: WorkflowStep, index: number): void {
    step.input_fields.splice(index, 1);
    this.markDirty();
  }

  loadSample(): void {
    this.draft = this.deepClone(SAMPLE_DRAFT);
    this.selectedStepId = this.draft.workflow.steps[0]?.step_id ?? '';
    this.refreshDerivedState('Sample draft loaded');
  }

  loadSaved(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      this.statusMessage = 'No saved draft';
      return;
    }

    this.applyJson(saved, 'Saved draft loaded');
  }

  saveDraft(): void {
    this.recalculateQuality();
    this.validateDraft();
    localStorage.setItem(STORAGE_KEY, this.toPrettyJson(this.draft));
    this.dirty = false;
    this.statusMessage = 'Draft saved locally';
  }

  importDraft(): void {
    this.applyJson(this.importText, 'Imported draft loaded');
  }

  exportDraft(): void {
    this.recalculateQuality();
    this.validateDraft();
    this.exportText = this.toPrettyJson(this.draft);
    const blob = new Blob([this.exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.draft.workflow.workflow_id || 'workflow'}.draft.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.statusMessage = 'Draft exported';
  }

  validateDraft(): void {
    const errors: string[] = [];
    if (this.draft.schema_version !== 'workflow-draft-v1') {
      errors.push('schema_version must be workflow-draft-v1');
    }
    if (!this.draft.workflow.workflow_id.trim()) {
      errors.push('workflow.workflow_id is required');
    }
    if (!this.draft.workflow.workflow_name.trim()) {
      errors.push('workflow.workflow_name is required');
    }
    if (!this.draft.workflow.steps.length) {
      errors.push('workflow.steps must contain at least one step');
    }

    const stepIds = new Set<string>();
    this.draft.workflow.steps.forEach((step, index) => {
      if (!step.step_id.trim()) {
        errors.push(`steps[${index}].step_id is required`);
      }
      if (stepIds.has(step.step_id)) {
        errors.push(`Duplicate step_id: ${step.step_id}`);
      }
      stepIds.add(step.step_id);

      if (!step.title.trim()) {
        errors.push(`${step.step_id}.title is required`);
      }
      if (!step.instruction.trim()) {
        errors.push(`${step.step_id}.instruction is required`);
      }
      if (step.risk_level === 'high' && !step.requires_confirmation) {
        errors.push(`${step.step_id} is high risk and must require confirmation`);
      }
      if (step.component_ref.status === 'mapped' && !step.component_ref.component_id) {
        errors.push(`${step.step_id} has mapped component status but no component_id`);
      }
      if (step.component_ref.status !== 'mapped' && step.component_ref.component_id) {
        errors.push(`${step.step_id} cannot keep component_id unless status is mapped`);
      }
      if (step.validation_rule.type === 'unknown') {
        errors.push(`${step.step_id} needs a concrete validation rule`);
      }
      if (!step.fallback.message.trim()) {
        errors.push(`${step.step_id}.fallback.message is required`);
      }
    });

    this.draft.workflow.branches.forEach((branch, index) => {
      if (branch.from_step_id && !stepIds.has(branch.from_step_id)) {
        errors.push(`branches[${index}].from_step_id does not exist`);
      }
      if (branch.to_step_id && !stepIds.has(branch.to_step_id)) {
        errors.push(`branches[${index}].to_step_id does not exist`);
      }
    });

    this.validationErrors = errors;
    this.draft.validation_report = {
      schema_valid: errors.length === 0,
      errors
    };
    this.statusMessage = errors.length ? `${errors.length} validation issue(s)` : 'Draft is valid';
    this.exportText = this.toPrettyJson(this.draft);
  }

  markDirty(): void {
    this.dirty = true;
    this.recalculateQuality();
    this.exportText = this.toPrettyJson(this.draft);
  }

  trackStep(_index: number, step: WorkflowStep): string {
    return step.step_id;
  }

  private applyJson(raw: string, message: string): void {
    try {
      const parsed = JSON.parse(raw) as WorkflowDraft;
      this.ensureDraftShape(parsed);
      this.draft = parsed;
      this.selectedStepId = this.draft.workflow.steps[0]?.step_id ?? '';
      this.refreshDerivedState(message);
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : 'Invalid JSON';
    }
  }

  private refreshDerivedState(message: string): void {
    this.recalculateQuality();
    this.validateDraft();
    this.importText = '';
    this.dirty = false;
    this.statusMessage = message;
  }

  private recalculateQuality(): void {
    const steps = this.draft.workflow.steps;
    const mapped = steps.filter((step) => step.component_ref.status === 'mapped').length;
    const highRisk = steps.filter((step) => step.risk_level === 'high').map((step) => step.step_id);
    const missingVerification = steps
      .filter((step) => step.validation_rule.type === 'unknown')
      .map((step) => step.step_id);
    const unmapped = steps
      .filter((step) => step.component_ref.status === 'unmapped')
      .map((step) => ({ step_id: step.step_id, label_hint: step.component_ref.label_hint }));
    const averageConfidence = steps.length
      ? steps.reduce((sum, step) => sum + Number(step.confidence || 0), 0) / steps.length
      : 0;

    this.draft.quality = {
      overall_confidence: this.round(averageConfidence),
      mapped_component_ratio: this.round(mapped / Math.max(steps.length, 1)),
      steps_missing_verification: missingVerification,
      high_risk_steps: highRisk,
      unmapped_components: unmapped,
      needs_human_review: true
    };
  }

  private ensureDraftShape(draft: WorkflowDraft): void {
    if (draft.schema_version !== 'workflow-draft-v1' || !draft.workflow || !Array.isArray(draft.workflow.steps)) {
      throw new Error('JSON is not a workflow-draft-v1 document');
    }

    draft.workflow.steps.forEach((step, index) => {
      step.component_ref = step.component_ref ?? this.createStep(index + 1).component_ref;
      step.validation_rule = step.validation_rule ?? this.createStep(index + 1).validation_rule;
      step.fallback = step.fallback ?? this.createStep(index + 1).fallback;
      step.input_fields = step.input_fields ?? [];
    });
    draft.workflow.branches = draft.workflow.branches ?? [];
    draft.workflow.prerequisites = draft.workflow.prerequisites ?? [];
    draft.workflow.intent_aliases = draft.workflow.intent_aliases ?? [];
    draft.workflow.unresolved_questions = draft.workflow.unresolved_questions ?? [];
  }

  private createStep(index: number): WorkflowStep {
    return {
      step_id: `step_${String(index).padStart(2, '0')}`,
      title: 'New step',
      user_goal: 'Describe user goal',
      action_type: 'unknown',
      instruction: 'Describe the UI action.',
      expected_page_or_route: null,
      component_ref: {
        status: 'unmapped',
        component_id: null,
        label_hint: '',
        route_hint: null,
        candidate_component_ids: [],
        confidence: 0
      },
      input_fields: [],
      validation_rule: {
        type: 'manual_check',
        target: '',
        expected: '',
        inferred: true,
        confidence: 0.5
      },
      completion_signal: 'Expected UI state is reached.',
      fallback: {
        on_failure: 'unknown',
        recovery_action: 'show_manual_instruction',
        message: 'Show the manual instruction and ask the user how to proceed.',
        confidence: 0.5
      },
      risk_level: 'low',
      requires_confirmation: false,
      confidence: 0.5,
      source_quote_or_source_span: ''
    };
  }

  private nextStepId(): string {
    return `step_${String(this.draft.workflow.steps.length + 1).padStart(2, '0')}`;
  }

  private renumberSteps(): void {
    const idMap = new Map<string, string>();
    this.draft.workflow.steps.forEach((step, index) => {
      const nextId = `step_${String(index + 1).padStart(2, '0')}`;
      idMap.set(step.step_id, nextId);
      step.step_id = nextId;
    });

    this.draft.workflow.branches.forEach((branch) => {
      branch.from_step_id = branch.from_step_id ? idMap.get(branch.from_step_id) ?? branch.from_step_id : null;
      branch.to_step_id = branch.to_step_id ? idMap.get(branch.to_step_id) ?? branch.to_step_id : null;
    });
  }

  private loadInitialDraft(): WorkflowDraft {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return this.deepClone(SAMPLE_DRAFT);
    }

    try {
      const parsed = JSON.parse(saved) as WorkflowDraft;
      this.ensureDraftShape(parsed);
      return parsed;
    } catch {
      return this.deepClone(SAMPLE_DRAFT);
    }
  }

  private stepIndex(stepId: string): number {
    return this.draft.workflow.steps.findIndex((step) => step.step_id === stepId);
  }

  private linesFromText(value: string): string[] {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private toPrettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

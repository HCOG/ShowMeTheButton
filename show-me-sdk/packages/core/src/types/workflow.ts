/**
 * Workflow schema v2 — node-based, DAG-structured.
 *
 * See docs/workflow-design.md for the full design rationale. v1 (linear
 * `{steps: [...]}`) workflows are auto-migrated by `journey/workflow.ts`.
 *
 * Backward compatibility: a v1 workflow keeps its original `steps` field
 * alongside the auto-generated `nodes`; runtime executes v1 via the same
 * migration path.
 */

// ── Shared primitives ───────────────────────────────────────────────────────

/** Any JSON-serializable value used in params, conditions, and outputs. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

/** Node types supported by v2. */
export type NodeType =
  | 'action'        // single UI interaction
  | 'wait'          // block until a condition is met
  | 'branch'        // conditional routing
  | 'parallel'      // run multiple sub-nodes concurrently
  | 'loop'          // iterate over a collection
  | 'subworkflow'   // nest another workflow
  | 'note';         // informational, no UI action

/** Base fields every node carries. */
export interface WorkflowNodeBase {
  id: string;
  type: NodeType;
  title: string;
  description?: string;
  /** UI hint only — does not affect execution. */
  position?: { x: number; y: number };
}

// ── Condition DSL (used by branch + loop) ───────────────────────────────────

export type Condition =
  | { kind: 'param-equals'; name: string; value: JsonValue }
  | { kind: 'param-exists'; name: string }
  | { kind: 'param-truthy'; name: string }
  | { kind: 'param-numeric-gt'; name: string; value: number }
  | { kind: 'param-contains'; name: string; substr: string }
  | { kind: 'url-matches'; pattern: string }
  | { kind: 'selector-exists'; selector: string }
  | { kind: 'selector-text-matches'; selector: string; text: string }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] }
  | { kind: 'not'; of: Condition };

// ── Output extractors (how an action/wait node produces a param) ──────────

export type OutputExtractor =
  | { kind: 'attr'; selector: string; attr: string }
  | { kind: 'text'; selector: string }
  | { kind: 'value'; selector: string }
  | { kind: 'count'; selector: string };

// ── Node types ────────────────────────────────────────────────────────────

/** Single UI interaction — the workhorse node. */
export interface ActionNode extends WorkflowNodeBase {
  type: 'action';
  description: string;
  /** Free-form phrase the SDK uses to locate the target element. */
  query: string;
  hint?: string;
  /** Auto-advance trigger; default 'clicked' is the most common. */
  successOn?: 'clicked' | 'input' | 'navigated' | 'mutated' | 'done';
  /** When true, a failure does not block the rest of the workflow. */
  optional?: boolean;
  /** Seconds before forcing advancement; default 60. */
  timeout?: number;
  /** Named outputs this action produces for downstream nodes. */
  output?: Record<string, OutputExtractor>;
}

/** Block until a condition becomes true. */
export interface WaitNode extends WorkflowNodeBase {
  type: 'wait';
  description: string;
  until:
    | { kind: 'selector-exists'; selector: string }
    | { kind: 'url-matches'; pattern: string }
    | { kind: 'text-appears'; text: string }
    | { kind: 'network-idle'; timeoutMs: number }
    | { kind: 'duration'; ms: number };
  timeout?: number;
  optional?: boolean;
}

/** Conditional routing — first matching branch wins, else default. */
export interface BranchNode extends WorkflowNodeBase {
  type: 'branch';
  description: string;
  branches: Array<{ when: Condition; goto: string }>;
  default: string;
}

/** Run sub-nodes concurrently. */
export interface ParallelNode extends WorkflowNodeBase {
  type: 'parallel';
  description: string;
  all: string[];
  waitFor?: 'all' | 'any';
  failFast?: boolean;
}

/** Iterate body over a source collection. */
export interface LoopNode extends WorkflowNodeBase {
  type: 'loop';
  description: string;
  source:
    | { kind: 'selector-list'; selector: string }
    | { kind: 'param-list'; name: string };
  body: string;
  itemParam: string;
  maxIterations?: number;
  breakWhen?: Condition;
}

/** Reference another workflow by id. */
export interface SubworkflowNode extends WorkflowNodeBase {
  type: 'subworkflow';
  ref: string;
  inputs?: Record<string, JsonValue>;
  outputs?: string[];
}

/** Informational — does not interact with the UI. */
export interface NoteNode extends WorkflowNodeBase {
  type: 'note';
  description: string;
  severity?: 'info' | 'warning' | 'success';
}

/** Discriminated union of all node types. */
export type WorkflowNode =
  | ActionNode
  | WaitNode
  | BranchNode
  | ParallelNode
  | LoopNode
  | SubworkflowNode
  | NoteNode;

// ── Top-level workflow ───────────────────────────────────────────────────

/** v1 (legacy) step shape — kept for backward-compat. */
export interface LegacyStep {
  step: number;
  title: string;
  description: string;
  query: string;
  hint?: string;
}

export interface Workflow {
  id: string;
  title: string;
  description: string;
  page: string;
  estimatedTime?: string;
  /** Schema version. 2 = node-based DAG. Omitted = legacy v1. */
  version?: 2;
  /** Required in v2; omitted in v1. */
  entry?: string;
  nodes?: Record<string, WorkflowNode>;
  /** Optional. v1 workflows still carry this; v2 may omit it. */
  steps?: LegacyStep[];
  metadata?: {
    tags?: string[];
    author?: string;
    updatedAt?: string;
  };
}

/** Returned by `migrateV1ToV2`. A guaranteed-shape v2 Workflow. */
export interface WorkflowV2 {
  id: string;
  title: string;
  description: string;
  page: string;
  estimatedTime?: string;
  version: 2;
  entry: string;
  nodes: Record<string, WorkflowNode>;
  steps?: LegacyStep[];
  metadata?: Workflow['metadata'];
}

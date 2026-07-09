/**
 * Workflow v2 runtime executor.
 *
 * Walks a {@link WorkflowV2} DAG and runs each node against the live page,
 * reusing the AI cursor + ProgressionDetector via JourneyRunner. Emits
 * `workflow:state` events on the EventBus for the widget to render.
 *
 * Node semantics — see docs/workflow-design.md:
 *   action     — flyTo + wait for user progression
 *   wait       — block until a DOM / URL / time condition
 *   branch     — conditional routing
 *   parallel   — concurrent sub-nodes
 *   loop       — iterate over a DOM or param list
 *   subworkflow — nest another workflow
 *   note       — informational, no UI action
 */
import type {
  ActionNode,
  BranchNode,
  Condition,
  ExecContext,
  JsonValue,
  LoopNode,
  NoteNode,
  ParallelNode,
  SubworkflowNode,
  WaitNode,
  WorkflowNode,
  WorkflowRunStatus,
  WorkflowState,
  WorkflowV2,
} from '../types/workflow';
import type { CursorEngine } from '../cursor/CursorEngine';
import type { EventBus } from '../bus/EventBus';
import type { JourneyRunner } from './JourneyRunner';
import { evaluateCondition } from './condition-evaluator';
import { extractOutput } from './output-extractor';

const DEFAULT_NODE_TIMEOUT_S = 60;
const DEFAULT_LOOP_MAX = 100;

export interface WorkflowExecutorDeps {
  cursorEngine: CursorEngine;
  journeyRunner: JourneyRunner;
  eventBus: EventBus;
}

export class WorkflowExecutor {
  private status: WorkflowRunStatus = 'idle';
  private currentNode: string | null = null;
  private stepIndex = 0;
  private nodeStatus: Record<string, 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'> = {};
  private params: Record<string, JsonValue> = {};
  private cancelled = false;
  private workflows: Record<string, WorkflowV2> = {};

  constructor(private deps: WorkflowExecutorDeps) {}

  /** Register a workflow so `subworkflow` nodes can resolve by id. */
  registerWorkflow(wf: WorkflowV2): void {
    this.workflows[wf.id] = wf;
  }

  /** Run a workflow from its entry node. Resolves on terminal status. */
  async run(wf: WorkflowV2, opts: { silent?: boolean } = {}): Promise<void> {
    this.registerWorkflow(wf);
    this.status = 'running';
    this.currentNode = null;
    this.stepIndex = 0;
    this.nodeStatus = {};
    this.params = {};
    this.cancelled = false;

    // Pre-seed the legacy `step` so widget can render descriptions.
    const totalReachable = countReachable(wf);
    this.emitState(wf.id, undefined, totalReachable);

    try {
      await this.executeNode(wf, wf.entry, totalReachable);
      this.status = 'succeeded';
      this.emitState(wf.id, undefined, totalReachable);
    } catch (err: any) {
      this.status = this.cancelled ? 'cancelled' : 'failed';
      this.emitState(wf.id, err?.message ?? String(err), totalReachable);
      throw err;
    } finally {
      if (opts.silent === false) {
        // The JourneyPill / JourneyOverview is intentionally NOT touched here;
        // the widget is the sole HUD in silent mode.
      }
    }
  }

  /** Cooperative cancel. The current node will throw on its next progress check. */
  cancel(): void {
    this.cancelled = true;
  }

  // ── Node dispatch ─────────────────────────────────────────────────────

  private async executeNode(
    wf: WorkflowV2,
    nodeId: string,
    totalNodes: number,
  ): Promise<void> {
    const node = wf.nodes[nodeId];
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (this.cancelled) throw new Error('cancelled');

    this.currentNode = nodeId;
    this.stepIndex += 1;
    this.nodeStatus[nodeId] = 'running';
    this.emitState(wf.id, undefined, totalNodes);

    try {
      switch (node.type) {
        case 'action':      return await this.runAction(wf, node, totalNodes);
        case 'wait':        return await this.runWait(wf, node, totalNodes);
        case 'branch':      return await this.runBranch(wf, node, totalNodes);
        case 'parallel':    return await this.runParallel(wf, node, totalNodes);
        case 'loop':        return await this.runLoop(wf, node, totalNodes);
        case 'subworkflow': return await this.runSubworkflow(wf, node, totalNodes);
        case 'note':        return await this.runNote(wf, node, totalNodes);
      }
    } catch (err) {
      const optional = (node as any).optional === true;
      if (optional) {
        this.nodeStatus[nodeId] = 'skipped';
        this.emitState(wf.id, undefined, totalNodes);
        return;
      }
      this.nodeStatus[nodeId] = 'failed';
      this.emitState(wf.id, (err as Error)?.message, totalNodes);
      throw err;
    }
  }

  private async runAction(
    wf: WorkflowV2,
    node: ActionNode,
    totalNodes: number,
  ): Promise<void> {
    const ctx: ExecContext = { params: this.params };
    await this.deps.journeyRunner.flyToAndWaitForProgression(node.query, {
      timeout: node.timeout ?? DEFAULT_NODE_TIMEOUT_S,
      optional: node.optional === true,
    });
    if (node.output) {
      for (const [name, ext] of Object.entries(node.output)) {
        this.params[name] = extractOutput(ext);
      }
    }
    this.nodeStatus[node.id] = 'succeeded';
    this.emitState(wf.id, undefined, totalNodes);
  }

  private async runWait(
    wf: WorkflowV2,
    node: WaitNode,
    totalNodes: number,
  ): Promise<void> {
    const timeoutMs = (node.timeout ?? DEFAULT_NODE_TIMEOUT_S) * 1000;
    const deadline = Date.now() + timeoutMs;
    const poll = () => waitPoll(deadline, node.until, () => this.cancelled);
    await poll();
    this.nodeStatus[node.id] = 'succeeded';
    this.emitState(wf.id, undefined, totalNodes);
  }

  private async runBranch(
    wf: WorkflowV2,
    node: BranchNode,
    totalNodes: number,
  ): Promise<void> {
    const ctx: ExecContext = { params: this.params };
    let target: string | null = null;
    for (const b of node.branches) {
      if (evaluateCondition(b.when as Condition, ctx)) {
        target = b.goto;
        break;
      }
    }
    if (target == null) target = node.default;
    this.nodeStatus[node.id] = 'succeeded';
    this.emitState(wf.id, undefined, totalNodes);
    await this.executeNode(wf, target, totalNodes);
  }

  private async runParallel(
    wf: WorkflowV2,
    node: ParallelNode,
    totalNodes: number,
  ): Promise<void> {
    const children = node.all;
    if (node.waitFor === 'any') {
      // Resolve on first success, ignoring other children's outcomes.
      // Implemented with a deferred resolve so a sibling failure doesn't
      // reject the race.
      const firstSuccess = new Promise<string>((resolve) => {
        children.forEach((id) => {
          this.executeNode(wf, id, totalNodes)
            .then(() => resolve(id))
            .catch(() => undefined);
        });
      });
      await firstSuccess;
    } else {
      if (node.failFast) {
        await Promise.all(children.map((id) => this.executeNode(wf, id, totalNodes)));
      } else {
        const results = await Promise.allSettled(
          children.map((id) => this.executeNode(wf, id, totalNodes)),
        );
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length) {
          throw failures[0].reason;
        }
      }
    }
    this.nodeStatus[node.id] = 'succeeded';
    this.emitState(wf.id, undefined, totalNodes);
  }

  private async runLoop(
    wf: WorkflowV2,
    node: LoopNode,
    totalNodes: number,
  ): Promise<void> {
    const items = await resolveLoopSource(node, this.params);
    const max = Math.min(items.length, node.maxIterations ?? DEFAULT_LOOP_MAX);
    const ctx: ExecContext = { params: this.params };
    for (let i = 0; i < max; i++) {
      if (this.cancelled) break;
      ctx.item = items[i];
      ctx.params[node.itemParam] = items[i];
      if (node.breakWhen && evaluateCondition(node.breakWhen, ctx)) break;
      await this.executeNode(wf, node.body, totalNodes);
    }
    this.nodeStatus[node.id] = 'succeeded';
    this.emitState(wf.id, undefined, totalNodes);
  }

  private async runSubworkflow(
    wf: WorkflowV2,
    node: SubworkflowNode,
    totalNodes: number,
  ): Promise<void> {
    const sub = this.workflows[node.ref];
    if (!sub) throw new Error(`Subworkflow not found: ${node.ref}`);
    if (node.inputs) {
      for (const [k, v] of Object.entries(node.inputs)) {
        this.params[k] = v;
      }
    }
    // Recurse by re-running through the same executor instance — we
    // temporarily re-enter from sub.entry with shared params.
    const prevNode = this.currentNode;
    await this.executeNode(sub, sub.entry, totalNodes);
    this.currentNode = prevNode;
    this.nodeStatus[node.id] = 'succeeded';
    this.emitState(wf.id, undefined, totalNodes);
  }

  private async runNote(
    wf: WorkflowV2,
    node: NoteNode,
    totalNodes: number,
  ): Promise<void> {
    // Informational — no side effects on the page.
    this.deps.eventBus.emit('workflow:note', {
      workflowId: wf.id,
      nodeId: node.id,
      title: node.title,
      description: node.description,
      severity: node.severity ?? 'info',
    });
    this.nodeStatus[node.id] = 'succeeded';
    this.emitState(wf.id, undefined, totalNodes);
  }

  // ── State emit ───────────────────────────────────────────────────────

  private emitState(
    workflowId: string,
    error: string | undefined,
    totalNodes: number,
  ): void {
    const state: WorkflowState = {
      workflowId,
      status: this.status,
      currentNode: this.currentNode,
      totalNodes,
      stepIndex: this.stepIndex,
      error,
      nodeStatus: { ...this.nodeStatus },
      params: { ...this.params },
    };
    this.deps.eventBus.emit('workflow:state', state);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Count nodes reachable from `wf.entry` (single source of truth for "total"). */
function countReachable(wf: WorkflowV2): number {
  const visited = new Set<string>();
  const queue: string[] = [wf.entry];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = wf.nodes[id];
    if (!node) continue;
    if (node.type === 'branch') {
      queue.push(node.default, ...node.branches.map((b) => b.goto));
    } else if (node.type === 'parallel') {
      queue.push(...node.all);
    } else if (node.type === 'loop') {
      queue.push(node.body);
    } else if (node.type === 'subworkflow') {
      queue.push(node.ref);
    }
  }
  return visited.size;
}

async function waitPoll(
  deadline: number,
  until: WaitNode['until'],
  isCancelled: () => boolean,
): Promise<void> {
  // Different `until` kinds need different intervals. 200 ms is a good
  // compromise between responsiveness and CPU.
  const interval = 200;
  while (Date.now() < deadline) {
    if (isCancelled()) throw new Error('cancelled');
    if (await checkCondition(until)) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('wait timeout');
}

async function checkCondition(until: WaitNode['until']): Promise<boolean> {
  switch (until.kind) {
    case 'duration':
      // Handled by deadline; treat as immediate.
      return new Promise<boolean>((r) => setTimeout(() => r(true), until.ms));
    case 'selector-exists':
      return !!document.querySelector(until.selector);
    case 'url-matches':
      return new RegExp(until.pattern).test(window.location.href);
    case 'text-appears': {
      const bodyText = (document.body.textContent ?? '') as string;
      const target = until.text as string;
      return bodyText.includes(target);
    }
    case 'network-idle': {
      // Without a real PerformanceObserver signal, fall back to "no recent fetches"
      // by waiting until the deadline. Kept simple.
      const ms = until.timeoutMs as number;
      return new Promise<boolean>((r) => setTimeout(() => r(true), ms));
    }
  }
}

async function resolveLoopSource(
  node: LoopNode,
  params: Record<string, JsonValue>,
): Promise<JsonValue[]> {
  if (node.source.kind === 'selector-list') {
    const nodes = Array.from(document.querySelectorAll(node.source.selector));
    return nodes.map((el, i) => (el as HTMLElement).dataset.id ?? i);
  }
  const list = params[node.source.name];
  if (Array.isArray(list)) return list;
  return [];
}

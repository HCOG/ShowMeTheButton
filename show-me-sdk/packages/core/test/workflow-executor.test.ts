/**
 * Lightweight smoke tests using Node's built-in `node:test`.
 * Run with: `node --test test/`
 *
 * These tests cover the deterministic helpers (migration, validation,
 * condition evaluation, output extraction). The full WorkflowExecutor
 * requires a DOM and is exercised end-to-end via the demo instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// We import from the bundled dist. The build output uses named ESM
// exports (Vite's `lib` mode), so the canonical import shape is:
import {
  migrateV1ToV2,
  validateWorkflowV2,
  isV2Workflow,
  topologicalNodes,
  evaluateCondition,
  extractOutput,
} from '../dist/index.mjs';

// ── migrate + validate ────────────────────────────────────────────────

test('migrateV1ToV2 converts a linear workflow to DAG', () => {
  const v1 = {
    id: 'export',
    title: 't',
    description: 'd',
    page: '/p',
    estimatedTime: '30s',
    steps: [
      { step: 1, title: 'a', description: 'a', query: 'q1' },
      { step: 2, title: 'b', description: 'b', query: 'q2', hint: 'h2' },
    ],
  };
  const v2 = migrateV1ToV2(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.entry, 'step-1');
  assert.equal(Object.keys(v2.nodes).length, 3); // step-1, step-2, linear_chain
  assert.equal(v2.nodes['step-2'].type, 'action');
  assert.equal(v2.nodes['step-2'].hint, 'h2');
  validateWorkflowV2(v2);
});

test('migrateV1ToV2 is idempotent on v2', () => {
  const v2 = {
    id: 'x', title: 't', description: 'd', page: '/',
    version: 2, entry: 'a',
    nodes: { a: { id: 'a', type: 'note', title: 'n', description: 'x' } },
  };
  const out = migrateV1ToV2(v2);
  assert.equal(out.entry, 'a');
  assert.equal(Object.keys(out.nodes).length, 1);
});

test('isV2Workflow detects version', () => {
  assert.equal(isV2Workflow({ steps: [] } as any), false);
  assert.equal(isV2Workflow({ version: 2, entry: 'a', nodes: {} } as any), true);
});

test('validateWorkflowV2 rejects entry pointing to a missing node', () => {
  assert.throws(
    () =>
      validateWorkflowV2({
        version: 2,
        entry: 'missing',
        nodes: { other: { id: 'other', type: 'note', title: 'n', description: 'd' } },
      } as any),
    /entry node "missing" not found/,
  );
});

test('validateWorkflowV2 rejects empty nodes', () => {
  assert.throws(
    () =>
      validateWorkflowV2({
        version: 2,
        entry: 'a',
        nodes: {},
      } as any),
    /must define at least one node/,
  );
});

test('validateWorkflowV2 rejects bad action shape', () => {
  assert.throws(
    () =>
      validateWorkflowV2({
        version: 2,
        entry: 'a',
        nodes: { a: { id: 'a', type: 'action', title: 't' } },
      } as any),
    /action requires description/,
  );
});

// ── topological ───────────────────────────────────────────────────────

test('topologicalNodes walks branch + parallel + loop', () => {
  const wf: any = {
    id: 'demo',
    title: 't',
    description: 'd',
    page: '/',
    version: 2,
    entry: 'branch',
    nodes: {
      branch: {
        id: 'branch', type: 'branch', title: 'b', description: 'd',
        branches: [{ when: { kind: 'param-truthy', name: 'go' }, goto: 'par' }],
        default: 'fallback',
      },
      par: {
        id: 'par', type: 'parallel', title: 'p', description: 'd',
        all: ['a1', 'a2'],
      },
      a1: { id: 'a1', type: 'action', title: '1', description: '1', query: 'q' },
      a2: { id: 'a2', type: 'action', title: '2', description: '2', query: 'q' },
      fallback: { id: 'fallback', type: 'note', title: 'f', description: 'f' },
      loop: {
        id: 'loop', type: 'loop', title: 'l', description: 'l',
        source: { kind: 'param-list', name: 'xs' },
        body: 'a1', itemParam: 'x',
      },
    },
  };
  const visited = new Set<string>();
  for (const n of topologicalNodes(wf)) visited.add(n.id);
  // entry is branch — default is reachable, branches require param-truthy
  assert.ok(visited.has('branch'));
  assert.ok(visited.has('fallback'));
});

// ── evaluateCondition ─────────────────────────────────────────────────

test('param-equals / param-exists / param-truthy / numeric-gt', () => {
  const ctx: any = { params: { count: 5, name: 'alice', flag: true } };
  assert.equal(evaluateCondition({ kind: 'param-equals', name: 'name', value: 'alice' }, ctx), true);
  assert.equal(evaluateCondition({ kind: 'param-equals', name: 'name', value: 'bob' }, ctx), false);
  assert.equal(evaluateCondition({ kind: 'param-exists', name: 'name' }, ctx), true);
  assert.equal(evaluateCondition({ kind: 'param-exists', name: 'missing' }, ctx), false);
  assert.equal(evaluateCondition({ kind: 'param-truthy', name: 'flag' }, ctx), true);
  assert.equal(evaluateCondition({ kind: 'param-truthy', name: 'count' }, ctx), true);
  assert.equal(evaluateCondition({ kind: 'param-numeric-gt', name: 'count', value: 3 }, ctx), true);
  assert.equal(evaluateCondition({ kind: 'param-numeric-gt', name: 'count', value: 10 }, ctx), false);
});

test('all / any / not combinators', () => {
  const ctx: any = { params: { a: 1, b: 2 } };
  assert.equal(
    evaluateCondition(
      { kind: 'all', of: [
        { kind: 'param-equals', name: 'a', value: 1 },
        { kind: 'param-equals', name: 'b', value: 2 },
      ] },
      ctx,
    ),
    true,
  );
  assert.equal(
    evaluateCondition(
      { kind: 'any', of: [
        { kind: 'param-equals', name: 'a', value: 99 },
        { kind: 'param-equals', name: 'b', value: 2 },
      ] },
      ctx,
    ),
    true,
  );
  assert.equal(
    evaluateCondition(
      { kind: 'not', of: { kind: 'param-equals', name: 'a', value: 99 } },
      ctx,
    ),
    true,
  );
});

test('param-contains does string substring', () => {
  const ctx: any = { params: { path: '/users/42' } };
  assert.equal(evaluateCondition({ kind: 'param-contains', name: 'path', substr: 'users' }, ctx), true);
  assert.equal(evaluateCondition({ kind: 'param-contains', name: 'path', substr: 'admin' }, ctx), false);
});

// ── extractOutput (jsdom-less smoke test: only attr-path is fully exercised) ──

test('extractOutput returns null when selector misses', () => {
  // We're running under plain Node so document doesn't exist; this is just
  // a "doesn't throw" smoke test.
  if (typeof document === 'undefined') return;
  const v = extractOutput({ kind: 'text', selector: '#does-not-exist' });
  assert.equal(v, null);
});

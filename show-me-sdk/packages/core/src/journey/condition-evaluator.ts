/**
 * Evaluate a single Condition from the workflow v2 schema against a runtime
 * context. Pure function — no DOM side effects except the three
 * selector/url cases that inherently must look at the live page.
 *
 * Branch / loop nodes use this to decide which child to run next.
 */
import type { Condition, ExecContext, JsonValue } from '../types/workflow';

function asString(v: JsonValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

function asNumber(v: JsonValue | undefined): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function evaluateCondition(cond: Condition, ctx: ExecContext): boolean {
  switch (cond.kind) {
    case 'param-equals':
      return ctx.params[cond.name] === cond.value;

    case 'param-exists':
      return Object.prototype.hasOwnProperty.call(ctx.params, cond.name);

    case 'param-truthy':
      return Boolean(ctx.params[cond.name]);

    case 'param-numeric-gt':
      return asNumber(ctx.params[cond.name]) > cond.value;

    case 'param-contains':
      return asString(ctx.params[cond.name]).includes(cond.substr);

    case 'url-matches':
      return new RegExp(cond.pattern).test(window.location.href);

    case 'selector-exists':
      return !!document.querySelector(cond.selector);

    case 'selector-text-matches': {
      const el = document.querySelector(cond.selector);
      return (el?.textContent ?? '').includes(cond.text);
    }

    case 'all':
      return cond.of.every((c) => evaluateCondition(c, ctx));

    case 'any':
      return cond.of.some((c) => evaluateCondition(c, ctx));

    case 'not':
      return !evaluateCondition(cond.of, ctx);
  }
}

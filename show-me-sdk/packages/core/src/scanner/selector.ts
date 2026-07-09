/**
 * Generate a stable CSS selector for an element. Used by the recorder to
 * persist a `query` that can re-locate the element after a page refresh.
 *
 * Strategy (in order, first hit wins):
 *   1. Element has an `id`                     → `#that-id`
 *   2. Element has `data-testid`               → `[data-testid="…"]`
 *   3. Otherwise walk up to 4 ancestors, building a tag[.class][:nth-child(N)]
 *      path. Stops early if it hits body or another stable landmark.
 *
 * The output is intentionally conservative — prefer "specific enough to
 * re-find the element" over "unique across the whole DOM". The runtime
 * executor falls back to label-substring matching if a selector misses.
 */
export function generateSelector(el: HTMLElement, maxDepth = 4): string {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }
  const testid = el.getAttribute('data-testid');
  if (testid) {
    return `[data-testid="${CSS.escape(testid)}"]`;
  }

  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && cur !== document.body && depth < maxDepth) {
    let part = cur.tagName.toLowerCase();
    if (typeof cur.className === 'string' && cur.className.length > 0) {
      const cls = cur.className
        .split(/\s+/)
        .filter((c) => c && !c.includes(':') && !c.startsWith('ng-'))
        .slice(0, 2)
        .map((c) => '.' + CSS.escape(c))
        .join('');
      part += cls;
    }
    const parent: HTMLElement | null = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName === cur!.tagName,
      );
      if (siblings.length > 1) {
        part += `:nth-child(${siblings.indexOf(cur) + 1})`;
      }
    }
    parts.unshift(part);
    cur = parent;
    depth += 1;
  }
  return parts.length > 0 ? parts.join(' > ') : el.tagName.toLowerCase();
}

/**
 * CSS selectors that match interactive elements. Mirrors the SDK's
 * DOMScanner SELECTORS but exposed separately so the recorder can iterate
 * without re-instantiating the scanner.
 */
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[role=button]',
  '[role=menuitem]',
  '[role=tab]',
  '[role=link]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Inject a `data-show-me-target-id="rec-N"` attribute on every
 * interactive element within `root` (default: document.body). Returns
 * the number of elements tagged. The recorder uses these ids to make
 * captured selectors stable across page mutations.
 */
export function injectRecorderIds(root: ParentNode = document.body): number {
  let counter = 0;
  const next = () => `rec-${++counter}`;
  const all = root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
  all.forEach((el) => {
    if (el.hasAttribute('data-show-me-target-id')) return;
    el.setAttribute('data-show-me-target-id', next());
  });
  return counter;
}

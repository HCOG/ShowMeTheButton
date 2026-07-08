// ─────────────────────────────────────────────────────────────────────────────
// ProgressionDetector — resolves when the user completes the current step.
//
// Triggers (any one of):
//   1. clicked   — pointer/touch on the highlighted target element
//   2. navigated — URL / route change
//   3. input     — value committed in the target field (typing, select, date)
//   4. mutated   — significant DOM change elsewhere (e.g. an overlay opening)
//   5. done      — the pill's "Done" button (manual fallback)
// ─────────────────────────────────────────────────────────────────────────────

export type ProgressionReason = 'clicked' | 'navigated' | 'input' | 'mutated' | 'done';

/** Ids of the SDK's own overlay hosts — mutations within these are ignored. */
const SDK_OVERLAY_IDS = [
  'show-me-sdk-cursor',
  'smt-target-ring',
  'smt-journey-pill',
  'smt-journey-overview',
];

export class ProgressionDetector {
  private cleanup: Array<() => void> = [];

  /**
   * Returns a promise that resolves once the user completes the current step.
   * See file header for the list of triggers.
   */
  waitForAction(target: HTMLElement | null): Promise<ProgressionReason> {
    return new Promise<ProgressionReason>((resolve) => {
      let settled = false;
      const settle = (reason: ProgressionReason) => {
        if (settled) return;
        settled = true;
        this._teardown();
        resolve(reason);
      };

      // 1. Click / tap on target element (capture phase so we see it before it
      //    disappears). touchend covers mobile where the click may be swallowed.
      if (target) {
        const onPointer = (e: Event) => {
          const hit = e.target as Node;
          if (target.contains(hit) || target === hit) {
            // Slight delay so the click's own effect (e.g. modal opening) can settle
            setTimeout(() => settle('clicked'), 400);
          }
        };
        document.addEventListener('click', onPointer, true);
        document.addEventListener('touchend', onPointer, true);
        this.cleanup.push(() => {
          document.removeEventListener('click', onPointer, true);
          document.removeEventListener('touchend', onPointer, true);
        });

        // 3. Value committed inside the target (covers typing / select / date).
        //    `change` is a strong commit signal; `input` is debounced until the
        //    user pauses typing.
        let inputTimer: ReturnType<typeof setTimeout> | null = null;
        const onChange = () => settle('input');
        const onInput = () => {
          if (inputTimer) clearTimeout(inputTimer);
          inputTimer = setTimeout(() => settle('input'), 1200);
        };
        target.addEventListener('change', onChange, true);
        target.addEventListener('input', onInput, true);
        this.cleanup.push(() => {
          if (inputTimer) clearTimeout(inputTimer);
          target.removeEventListener('change', onChange, true);
          target.removeEventListener('input', onInput, true);
        });
      }

      // 2. URL change (popstate / hashchange / SPA navigation via polling)
      const initialHref = location.href;
      const urlPoll = setInterval(() => {
        if (location.href !== initialHref) settle('navigated');
      }, 300);
      const onPop = () => settle('navigated');
      window.addEventListener('popstate', onPop);
      window.addEventListener('hashchange', onPop);
      this.cleanup.push(() => {
        clearInterval(urlPoll);
        window.removeEventListener('popstate', onPop);
        window.removeEventListener('hashchange', onPop);
      });

      // 4. Significant DOM mutation — covers actions that don't click the target
      //    or change the URL (e.g. an action opens a panel/overlay elsewhere).
      //    Conservative to avoid false positives from background activity:
      //      • only added/removed ELEMENT nodes count (not attribute/text noise)
      //      • mutations inside our own overlays are ignored
      //      • a grace period skips the initial render settling after flyTo
      //      • debounced until the DOM goes quiet before resolving
      //    Note: MutationObserver does not cross shadow-DOM boundaries, so the
      //    cursor / ring / pill internals are invisible here by construction.
      const isOurNode = (n: Node): boolean => {
        const el = n.nodeType === Node.ELEMENT_NODE
          ? (n as HTMLElement)
          : (n.parentElement ?? null);
        return !!el?.closest?.(SDK_OVERLAY_IDS.map(id => `#${id}`).join(','));
      };
      let graceElapsed = false;
      const graceTimer = setTimeout(() => { graceElapsed = true; }, 900);
      let mutSettleTimer: ReturnType<typeof setTimeout> | null = null;
      const observer = new MutationObserver((records) => {
        if (!graceElapsed) return;
        const relevant = records.some(r =>
          r.type === 'childList' &&
          [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)]
            .some(n => n.nodeType === Node.ELEMENT_NODE && !isOurNode(n)),
        );
        if (!relevant) return;
        if (mutSettleTimer) clearTimeout(mutSettleTimer);
        mutSettleTimer = setTimeout(() => settle('mutated'), 600);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      this.cleanup.push(() => {
        clearTimeout(graceTimer);
        if (mutSettleTimer) clearTimeout(mutSettleTimer);
        observer.disconnect();
      });

      // 5. "Done" button click inside the pill (dispatched as a custom event)
      const onDone = () => settle('done');
      document.addEventListener('smt:done', onDone);
      this.cleanup.push(() => document.removeEventListener('smt:done', onDone));
    });
  }

  abort(): void {
    this._teardown();
  }

  private _teardown(): void {
    this.cleanup.forEach(fn => fn());
    this.cleanup = [];
  }
}

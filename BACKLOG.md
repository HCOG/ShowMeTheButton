# ShowMeTheButton — Backlog

Gaps and improvements identified during development.
Updated as items are resolved or new ones are found.

**Resolved so far:** B1–B5 (all bugs), C1–C2 (housekeeping). See commit history.

---

## 🔴 Bugs / Functional Gaps

### ✅ B1 — No cancellation guard in `sdk.guide()`  *(RESOLVED)*
**File:** `show-me-sdk/packages/core/src/sdk.ts` → `guide()`  
If the user submits a second query while a journey is already running, a new
`journey.start()` fires without cancelling the first. Two pill HUDs appear simultaneously.  
**Fix:** call `this.journey.cancel()` before starting a new journey inside `guide()`.

### ✅ B2 — `mode: 'cors'` placed inside headers object  *(RESOLVED)*
**File:** `show-me-sdk/packages/core/src/client/AgentClient.ts`  
`mode` is a top-level fetch option, not a header. Currently it silently does nothing.
```typescript
// Wrong (no effect):
headers: { 'Content-Type': 'application/json', mode: 'cors' }
// Correct:
headers: { 'Content-Type': 'application/json' },
mode: 'cors',
```

### ✅ B3 — Journey error state is silent  *(RESOLVED — pill now shows an error message via `_fail()` before auto-dismissing)*
**File:** `show-me-sdk/packages/core/src/journey/JourneyRunner.ts` → `startSmart()`  
If the backend returns no steps, the pill unmounts and `status = 'error'` is set
internally, but nothing is shown to the user — the widget just closes with no feedback.  
**Fix:** emit a visible toast or re-open the widget with an error message.

### ✅ B4 — Auto-progression misses non-click interactions  *(RESOLVED — added `input`/`change` listeners on the target + a conservative `MutationObserver`)*
**File:** `show-me-sdk/packages/core/src/journey/JourneyRunner.ts` → `ProgressionDetector`  
Only watches for `click` events and URL changes. Steps requiring typing, dragging,
or date-picking always fall back to the manual "Done" button.  
**Fix:** add a `MutationObserver` on `document.body` to detect significant subtree
changes (new overlay, element count shift) as an additional progression trigger.

### ✅ B5 — `ProgressionDetector` doesn't handle touch events  *(RESOLVED — `touchend` now mirrors the `click` listener)*
**File:** `show-me-sdk/packages/core/src/journey/JourneyRunner.ts`  
`click` listener works on mobile but `touchend` may fire first and the click may
be swallowed, causing the detector to miss the action on some mobile browsers.  
**Fix:** also listen for `touchend` on the target element.

---

## 🟡 UX Improvements

### ✅ U1 — No visual gap between widget closing and pill appearing  *(RESOLVED — the journey pill mounts synchronously (planning state) before guide() returns, so it is already visible when the widget closes)*
When `guide()` returns `type: 'journey'`, the widget closes immediately but the
pill takes 1–2 s to appear (planning + first scan). Brief "nothing is happening" gap.  
**Fix:** keep the widget in a "planning…" loading state until the pill's first update
fires, then close it.

### ✅ U2 — Step hint/tooltip removed in new runner  *(RESOLVED — TargetRing now renders a popover with the step hint/description, anchored above/below the target)*
The old runner called `cursorEngine.hover(element, hint, 4500)` showing a tooltip
near the cursor. The new runner relies solely on the bottom-left pill for context,
which is far from where the user is looking.  
**Fix:** render a small popover anchored near the target ring (above/below the element)
showing the step description, in addition to the pill.

### ✅ U3 — Low-confidence single results act without confirmation  *(RESOLVED — guide() returns needsConfirmation when confidence < 0.5 without moving the cursor; the widget shows a confirm prompt and only flies via flyToElement() on confirm)*
`guide()` always flies the cursor even when confidence is low (e.g. 0.3). A wrong
target is more confusing than asking the user to clarify.  
**Fix:** if `confidence < 0.5`, show the result in the widget with a "Is this what
you meant?" prompt rather than flying immediately.

### ✅ U4 — No feedback when journey planning fails mid-session  *(RESOLVED — all journey errors route through the pill's error state via _fail(); the iterative runner surfaces the backend error message)*
Related to B3. The user experience on any error (planning failure, network timeout,
agent down) should be a consistent error state in the widget, not a silent close.

---

## 🟠 Architecture Improvements

### ✅ A1 — Journey planner is single-page-only  *(RESOLVED — added POST /api/v1/journey/next-step + JourneyRunner.startIterative(); the agent plans one step at a time against the live DOM, re-scanning after each step. guide() journeys now run iteratively, seeded by the up-front plan.)*
**File:** `show-me-sdk/packages/core/src/journey/JourneyRunner.ts` → `startSmart()`  
`planJourney()` sends the current page's elements once before execution starts.
Multi-page goals ("create a new user account") produce inaccurate plans because
the agent can't see elements on pages it hasn't navigated to yet.  
**Fix:** switch to **iterative planning** — after each step completes, re-scan the DOM
and ask the agent "what's next?" until the goal is achieved or the agent signals done.
New backend endpoint: `POST /api/v1/journey/next-step` (goal + completed steps + current DOM).

### ✅ A2 — Wiki workflows still use static `JourneyConfig`  *(RESOLVED — startGuidedTour() now calls startIterativeJourney(workflow.description, …, seedSteps) so curated steps prime the run but the agent adapts/extends against the live DOM)*
**File:** `angular-demo/src/app/pages/wiki/wiki.component.ts` → `startGuidedTour()`  
Hardcoded steps loaded from the backend YAML. Steps go stale when the UI changes.  
**Fix:** migrate to `startSmart(workflow.description)` so steps are generated
dynamically from the live DOM.

### ✅ A3 — Double DOM scan on navigation  *(RESOLVED — the router rescan is now debounced and skipped while a journey is active, since the runner re-scans per step)*
**File:** `angular-demo/src/app/services/show-me.service.ts`  
`routerSub` calls `rescan()` on every `NavigationEnd`. The journey runner also calls
`domScanner.refresh()` at the start of each step. On step transitions that involve
navigation, the DOM is scanned twice in quick succession.  
**Fix:** debounce the router-triggered rescan, or skip it if a journey is running
(the runner handles its own rescans).

---

## 🔵 Code Quality / Housekeeping

### ✅ C1 — Dead code in demo component  *(RESOLVED — removed unused fields, methods, and the orphaned SCSS)*
**File:** `angular-demo/src/app/pages/demo/demo.component.ts`  
Fields `smartGoal`, `isJourneyRunning`, `journeyStep`, `journeyTotal`, `journeyStatusMsg`
and methods `startSmartJourney()`, `cancelJourney()`, `onSmartGoalKeydown()` were
added for the smart journey UI section that was subsequently removed.  
**Fix:** delete the dead fields and methods.

### ✅ C2 — `startSmartJourney()` still exposed on service and SDK  *(RESOLVED — removed the unused Angular service passthrough; kept + documented the SDK method as a power-user API)*
**File:** `show-me.service.ts`, `sdk.ts`  
The method still exists as a public API even though the widget now uses the unified
`guide()`. Either document it as an explicit power-user API or remove it to reduce
surface area.

---

## 🟣 Polish / Accessibility

### P1 — Pill and ring have no ARIA attributes
The pill HUD and target ring are invisible to screen readers.  
**Fix:** add `role="status"` + `aria-live="polite"` to the pill so step changes are
announced; add `aria-label` to the cancel and done buttons.

### P2 — No keyboard path to advance/cancel a journey
Users cannot interact with the pill or dismiss a journey via keyboard alone.  
**Fix:** register a global `keydown` listener during an active journey:
`Escape` → cancel, `Enter` → Done (same as clicking the Done button).

### P3 — Pill overlaps mobile keyboard
The pill is anchored at `bottom: 24px left: 24px`. On mobile, the soft keyboard
pushes viewport content up, and the pill can end up behind the keyboard.  
**Fix:** use `env(safe-area-inset-bottom)` and listen for `visualViewport.resize`
to reposition the pill above the keyboard.

### P4 — No journey history or log
There is no record of what journeys were run, which steps succeeded, or why
a step failed. Useful for debugging and for surfacing popular workflows.  
**Fix:** emit structured events to the `EventBus` at each step transition;
add an optional `onStep` callback to `JourneyRunner` for the host app to log.

---

## Priority Order (remaining)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | **P2** — keyboard navigation for pill (Esc cancel / Enter done) | small | medium |
| 2 | **P1** — ARIA roles on pill/ring for screen readers | small | medium |
| 3 | **P3** — reposition pill above the mobile soft keyboard | small | low |
| 4 | **P4** — journey history / step event log | medium | low |

_Done: B1–B5 (bugs), C1–C2 (housekeeping), U1–U4 (UX), A1–A3 (architecture).
Only Polish/accessibility (P1–P4) remains._

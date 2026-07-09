/**
 * Build-time environment configuration.
 *
 * Production builds substitute this file with `environment.prod.ts` via
 * `fileReplacements` in angular.json. Anything sensitive (feature flags,
 * internal URLs) should live here so it can be replaced at build time.
 */
export const environment = {
  production: false,

  /**
   * Show the workflow recorder UI (🎙 button on the widget, left-side
   * recorder panel, annotation popovers, summary dialog).
   *
   * Recorder mode is intentionally a developer / demo feature — it is OFF
   * in production builds via `environment.prod.ts`. End users see a clean
   * widget with no recorder affordances.
   */
  recorderEnabled: true,
};

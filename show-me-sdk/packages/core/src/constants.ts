/**
 * Shared constants for the SDK.
 *
 * z-index values use the max 32-bit int so SDK overlays always sit on top
 * of host application content, regardless of the host's z-index scale.
 * Override per-instance via CursorConfig.zIndex if you need to integrate
 * with another high-z-index system.
 */
export const Z_INDEX = {
  /** Top of the stack: the AI cursor itself, always above our own overlays. */
  CURSOR: 2147483647,
  /** Pill / target ring / plan overview. Below the cursor so the cursor
   *  stays visible when they overlap. */
  OVERLAY: 2147483646,
} as const;

/** Default cursor visual size in pixels (overridable via CursorConfig.size). */
export const DEFAULT_CURSOR_SIZE = 24;

/** Default flyTo() animation duration in milliseconds. */
export const DEFAULT_FLY_TO_MS = 800;

/** Default hover() tooltip duration in milliseconds. */
export const DEFAULT_HOVER_MS = 4000;

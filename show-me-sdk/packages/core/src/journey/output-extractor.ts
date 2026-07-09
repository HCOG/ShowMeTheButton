/**
 * Extract a JSON value from the live DOM using an OutputExtractor.
 *
 * Returns null if the selector doesn't match anything — the executor treats
 * null as "param not set" rather than an error.
 */
import type { JsonValue, OutputExtractor } from '../types/workflow';

export function extractOutput(ext: OutputExtractor): JsonValue {
  try {
    if (ext.kind === 'count') {
      return document.querySelectorAll(ext.selector).length;
    }
    const el = document.querySelector(ext.selector) as HTMLElement | null;
    if (!el) return null;

    switch (ext.kind) {
      case 'attr':
        return el.getAttribute(ext.attr ?? '');
      case 'text':
        return el.textContent ?? '';
      case 'value':
        // Works for <input>, <textarea>, <select>
        return (el as HTMLInputElement).value ?? '';
    }
  } catch {
    return null;
  }
}

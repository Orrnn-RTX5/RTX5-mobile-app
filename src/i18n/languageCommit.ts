import type { LanguageCode } from '../state/userPreferences/types';
import { normalizeLanguageCode } from './translations';

type LanguageCommit = (language: LanguageCode) => void;

let pendingLanguage: LanguageCode | null = null;
let pendingCommit: LanguageCommit | null = null;
let commitScheduled = false;
let commitHandle: { cancel: () => void } | null = null;

/**
 * Queue a language preference write for the next paint, not the press frame.
 *
 * Every `useTranslation()` consumer re-renders when preferences.language changes
 * (tabs, sidebar, chart, settings hosts, etc.). Doing that in the same turn as
 * a Language Preference row tap freezes the checkmark and makes the switch feel
 * multi-frame slow. Optimistic UI paints first; the global re-translate follows.
 */
export function scheduleLanguagePreferenceCommit(
  language: unknown,
  commit: LanguageCommit,
): void {
  pendingLanguage = normalizeLanguageCode(language);
  pendingCommit = commit;
  if (commitScheduled) {
    return;
  }
  commitScheduled = true;

  const runCommit = () => {
    commitScheduled = false;
    commitHandle = null;
    const next = pendingLanguage;
    const apply = pendingCommit;
    pendingLanguage = null;
    pendingCommit = null;
    if (!next || !apply) {
      return;
    }
    apply(next);
  };

  const scheduleAfterFrame =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (callback: FrameRequestCallback) =>
          setTimeout(() => callback(Date.now()), 16) as unknown as number;

  // One paint frame so the language list can flip the checkmark, then commit
  // on a macrotask so React finishes the press-frame render first.
  const frameId = scheduleAfterFrame(() => {
    const timerId = setTimeout(runCommit, 0);
    commitHandle = {
      cancel: () => {
        clearTimeout(timerId);
      },
    };
  });

  commitHandle = {
    cancel: () => {
      if (typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(frameId as number);
      }
    },
  };
}

/** Drop a queued commit without applying it (e.g. user re-selected current lang). */
export function cancelPendingLanguagePreferenceCommit(): void {
  pendingLanguage = null;
  pendingCommit = null;
  commitScheduled = false;
  commitHandle?.cancel();
  commitHandle = null;
}

/** Apply any queued language now (call on unmount so a fast back still persists). */
export function flushPendingLanguagePreferenceCommit(): void {
  const next = pendingLanguage;
  const apply = pendingCommit;
  cancelPendingLanguagePreferenceCommit();
  if (next && apply) {
    apply(next);
  }
}

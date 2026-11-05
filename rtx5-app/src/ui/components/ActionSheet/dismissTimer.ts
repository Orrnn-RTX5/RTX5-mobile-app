/**
 * Schedule a callback after the action sheet has started the closed render
 * path. One frame keeps route work out of the opening/closing gesture frame
 * without adding a visible delay.
 */
const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 1;
const ACTION_SHEET_VISUAL_HANDOFF_CLOSE_FRAMES = 2;
const ACTION_SHEET_FRAME_FALLBACK_MS = 16;

function scheduleAfterFrames(callback: () => void, frameCount: number): () => void {
  let cancelled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let frameHandle: number | null = null;
  let framesRemaining = frameCount;

  const step = () => {
    if (cancelled) {
      return;
    }

    if (framesRemaining <= 0) {
      callback();
      return;
    }

    framesRemaining -= 1;

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameHandle = globalThis.requestAnimationFrame(step);
      return;
    }

    timeoutHandle = setTimeout(step, ACTION_SHEET_FRAME_FALLBACK_MS);
  };

  step();

  return () => {
    cancelled = true;

    if (frameHandle !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(frameHandle);
    }

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  };
}

export function scheduleDismissSettledAction(callback: () => void): () => void {
  return scheduleAfterFrames(callback, ACTION_SHEET_DISMISS_SETTLE_FRAMES);
}

/**
 * A route-shaped retained shell must paint before closing the React-owned
 * ActionSheet state. The native sheet host is already hidden synchronously;
 * these two frames only postpone its heavier reconciliation cleanup.
 */
export function scheduleActionSheetVisualHandoffCloseCommit(
  callback: () => void,
): () => void {
  return scheduleAfterFrames(callback, ACTION_SHEET_VISUAL_HANDOFF_CLOSE_FRAMES);
}

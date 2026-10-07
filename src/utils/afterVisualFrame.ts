/** Yield past paint, with a bounded fallback if the native frame queue stalls. */
export function scheduleAfterVisualFrame(action: () => void, fallbackMs = 100): () => void {
  return scheduleAfterVisualFrames(action, 1, fallbackMs);
}

/** Keep multi-frame visual handoffs bounded even if either frame is dropped. */
export function scheduleAfterVisualFrames(action: () => void, frameCount = 2, fallbackMs = 100): () => void {
  let finished = false;
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    finished = true;
    if (frame !== undefined) globalThis.cancelAnimationFrame?.(frame);
    if (timer !== undefined) clearTimeout(timer);
    if (fallback !== undefined) clearTimeout(fallback);
  };
  const run = () => {
    if (finished) return;
    cancel();
    action();
  };
  if (typeof globalThis.requestAnimationFrame === 'function') {
    fallback = setTimeout(run, fallbackMs);
    let remainingFrames = Math.max(1, frameCount);
    const requestNextFrame = () => {
      frame = globalThis.requestAnimationFrame(() => {
        frame = undefined;
        if (finished) return;
        if (--remainingFrames > 0) requestNextFrame();
        else timer = setTimeout(run, 0);
      });
    };
    requestNextFrame();
  } else {
    timer = setTimeout(run, 0);
  }
  return cancel;
}

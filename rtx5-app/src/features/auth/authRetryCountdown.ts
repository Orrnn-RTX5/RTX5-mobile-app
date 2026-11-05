/** Update a visible Retry-After label only until its authoritative deadline. */
export function scheduleAuthRetryCountdown(
  retryAt: number,
  publishNow: (now: number) => void,
): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = () => {
    if (!active) return;
    const now = Date.now();
    publishNow(now);
    const remaining = retryAt - now;
    if (remaining > 0) timer = setTimeout(tick, Math.min(remaining, 1000));
  };
  tick();

  return () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
  };
}

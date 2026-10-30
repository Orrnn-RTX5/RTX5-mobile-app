type Schedule = (work: () => void) => () => void;

type TimeframeTransition<T> = {
  isCurrent: () => boolean;
  activateCached: (settle: (activated: boolean) => void) => boolean;
  prepare: () => Promise<T>;
  activatePrepared: (data: T, settle: (activated: boolean) => void) => boolean;
  commit: (activated: boolean) => void;
};

/** Keep the confirmed chart visible until its replacement is ready to paint. */
export function createChartTimeframeTransition<T>(schedule: Schedule, timeoutMs = 10_000) {
  let revision = 0;
  let cancelFrame: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    revision += 1;
    cancelFrame?.();
    cancelFrame = undefined;
    clearTimeout(timeout);
    timeout = undefined;
  };

  const request = (transition: TimeframeTransition<T>) => {
    cancel();
    const requestedRevision = revision;
    let finished = false;
    let preparing = false;
    const current = () => !finished && revision === requestedRevision && transition.isCurrent();
    const finish = (activated: boolean) => {
      if (!current()) return;
      finished = true;
      clearTimeout(timeout);
      timeout = undefined;
      transition.commit(activated);
    };
    // A failed transport must still reach the normal chart error/retry path.
    timeout = setTimeout(() => finish(false), timeoutMs);
    const prepare = () => {
      if (!current() || preparing) return;
      preparing = true;
      Promise.resolve().then(() => current() ? transition.prepare() : undefined).then(
        data => {
          if (!current() || data === undefined) return;
          if (!transition.activatePrepared(data, finish)) finish(false);
        },
      ).catch(() => finish(false));
    };
    // Let the native picker dismissal paint before mapping/serializing candles.
    cancelFrame = schedule(() => {
      cancelFrame = undefined;
      if (!current()) return;
      try {
        if (!transition.activateCached(activated => activated ? finish(true) : prepare())) prepare();
      } catch (_error) {
        prepare();
      }
    });
  };

  return { request, cancel };
}

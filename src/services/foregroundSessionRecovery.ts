type RecoveryOptions<Identity> = {
  captureIdentity: () => Identity | undefined;
  isCurrent: (identity: Identity) => boolean;
  isForeground: () => boolean;
  validate: () => Promise<string | null | undefined>;
  resume: () => void;
  refresh: (identity: Identity) => Promise<unknown>;
  onError: (error: unknown) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};

/** Retain recovery demand across offline failures; fence late work after logout/background. */
export function createForegroundSessionRecovery<Identity>(options: RecoveryOptions<Identity>) {
  const schedule = options.schedule ?? ((callback: () => void, delay: number) =>
    setTimeout(callback, delay) as ReturnType<typeof setTimeout>);
  const cancel = options.cancel ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let inFlight: number | undefined;
  let pending = true;
  let disposed = false;
  let failures = 0;

  const clearRetry = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const suspend = () => {
    generation += 1;
    pending = true;
    inFlight = undefined;
    failures = 0;
    clearRetry();
  };
  const request = () => {
    if (disposed || !pending || inFlight !== undefined || !options.isForeground()) return;
    const identity = options.captureIdentity();
    if (!identity) return;
    clearRetry();
    const attempt = generation;
    inFlight = attempt;
    const current = () => !disposed && generation === attempt
      && options.isForeground() && options.isCurrent(identity);
    void Promise.resolve().then(() => current() ? options.validate() : undefined).then((token) => {
      if (!current()) return;
      if (!token) throw new Error('Session validation did not return an access token');
      options.resume();
      pending = false;
      failures = 0;
      return options.refresh(identity);
    }).catch((error) => {
      if (!current()) return;
      options.onError(error);
      if (pending) {
        const delay = Math.min(1_000 * 2 ** Math.min(failures++, 5), 30_000);
        timer = schedule(() => { timer = undefined; request(); }, delay);
      }
    }).finally(() => {
      if (inFlight === attempt) inFlight = undefined;
    });
  };

  return {
    request,
    suspend,
    dispose: () => { disposed = true; suspend(); },
  };
}

/** A short-lived process cache of successful reads from approved directory origins. */
export function createBrokerDirectoryReadCache<T>(ttlMs: number, now = Date.now) {
  const successful = new Map<string, { value: T; readAt: number }>();
  const inFlight = new Map<string, Promise<T>>();

  const read = (key: string, load: () => Promise<T>, forceRefresh = false): Promise<T> => {
    const pending = inFlight.get(key);
    if (pending) return pending;
    const cached = successful.get(key);
    const age = cached ? now() - cached.readAt : Infinity;
    if (!forceRefresh && cached && age >= 0 && age < ttlMs) {
      return Promise.resolve(cached.value);
    }
    successful.delete(key);
    const request = Promise.resolve().then(load).then((value) => {
      successful.set(key, { value, readAt: now() });
      return value;
    });
    inFlight.set(key, request);
    const release = () => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    };
    void request.then(release, release);
    return request;
  };

  return { read, clear: () => successful.clear() };
}

export type SavedAccountBrokerHealthCheck = (serverUrl: string) => Promise<void>;

export type SavedAccountSwitchHealthCache = Readonly<{
  ensureHealthy: (serverUrl: string) => Promise<void>;
  clear: () => void;
}>;

type SavedAccountSwitchHealthCacheOptions = Readonly<{
  checkHealth: SavedAccountBrokerHealthCheck;
  ttlMs: number;
  now?: () => number;
}>;

/**
 * Shares one exact-server health preflight between row expansion, touch-down,
 * and the eventual account-switch request. Only successful checks receive a
 * TTL; failures are evicted so the next attempt still fails closed and retries.
 */
export function createSavedAccountSwitchHealthCache({
  checkHealth,
  ttlMs,
  now = Date.now,
}: SavedAccountSwitchHealthCacheOptions): SavedAccountSwitchHealthCache {
  const verifiedAtByServer = new Map<string, number>();
  const inFlightByServer = new Map<string, Promise<void>>();
  let generation = 0;

  const ensureHealthy = (serverUrl: string): Promise<void> => {
    const existingRequest = inFlightByServer.get(serverUrl);
    if (existingRequest) {
      return existingRequest;
    }

    const verifiedAt = verifiedAtByServer.get(serverUrl);
    if (verifiedAt !== undefined && now() - verifiedAt < ttlMs) {
      return Promise.resolve();
    }

    // An expired success must not survive a failed refresh.
    verifiedAtByServer.delete(serverUrl);
    const requestGeneration = generation;
    const request = Promise.resolve()
      .then(() => checkHealth(serverUrl))
      .then(() => {
        if (requestGeneration === generation) {
          verifiedAtByServer.set(serverUrl, now());
        }
      })
      .catch((error) => {
        verifiedAtByServer.delete(serverUrl);
        throw error;
      })
      .finally(() => {
        if (inFlightByServer.get(serverUrl) === request) {
          inFlightByServer.delete(serverUrl);
        }
      });

    inFlightByServer.set(serverUrl, request);
    return request;
  };

  return Object.freeze({
    ensureHealthy,
    clear: () => {
      generation += 1;
      verifiedAtByServer.clear();
      inFlightByServer.clear();
    },
  });
}

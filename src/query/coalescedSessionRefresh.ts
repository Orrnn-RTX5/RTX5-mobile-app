type RefreshTask = () => Promise<unknown> | unknown;

type RefreshState = {
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  dirty: boolean;
  cancelled: boolean;
  refresh: RefreshTask;
  onError?: (error: unknown) => void;
};

export type CoalescedSessionRefreshScheduler = Readonly<{
  schedule: (
    owner: object,
    namespace: string,
    refresh: RefreshTask,
    onError?: (error: unknown) => void,
  ) => void;
  cancel: (owner: object, namespace?: string) => void;
}>;

/**
 * Coalesces refresh side effects only. The mutation calls that request a
 * refresh are never queued, delayed, or concurrency-limited by this scheduler.
 */
export function createCoalescedSessionRefreshScheduler(
  delayMs = 75,
): CoalescedSessionRefreshScheduler {
  const statesByOwner = new WeakMap<object, Map<string, RefreshState>>();
  const normalizedDelayMs = Math.max(0, delayMs);

  const getOwnerStates = (owner: object) => {
    const existing = statesByOwner.get(owner);
    if (existing) return existing;
    const created = new Map<string, RefreshState>();
    statesByOwner.set(owner, created);
    return created;
  };

  const removeState = (owner: object, namespace: string, state: RefreshState) => {
    const ownerStates = statesByOwner.get(owner);
    if (!ownerStates || ownerStates.get(namespace) !== state) return;
    ownerStates.delete(namespace);
    if (ownerStates.size === 0) statesByOwner.delete(owner);
  };

  const arm = (owner: object, namespace: string, state: RefreshState) => {
    if (state.cancelled || state.inFlight) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      if (state.cancelled || state.inFlight) return;
      state.inFlight = true;
      state.dirty = false;
      const refresh = state.refresh;

      void Promise.resolve()
        .then(refresh)
        .catch((error) => {
          state.onError?.(error);
        })
        .finally(() => {
          state.inFlight = false;
          if (state.cancelled) return;
          if (state.dirty) {
            state.dirty = false;
            arm(owner, namespace, state);
          } else {
            removeState(owner, namespace, state);
          }
        });
    }, normalizedDelayMs);
  };

  return {
    schedule: (owner, namespace, refresh, onError) => {
      const ownerStates = getOwnerStates(owner);
      let state = ownerStates.get(namespace);
      if (!state) {
        state = {
          timer: null,
          inFlight: false,
          dirty: false,
          cancelled: false,
          refresh,
          onError,
        };
        ownerStates.set(namespace, state);
      } else {
        state.refresh = refresh;
        state.onError = onError;
      }

      if (state.inFlight) {
        state.dirty = true;
        return;
      }
      arm(owner, namespace, state);
    },
    cancel: (owner, namespace) => {
      const ownerStates = statesByOwner.get(owner);
      if (!ownerStates) return;
      const keys = namespace === undefined ? [...ownerStates.keys()] : [namespace];
      keys.forEach((key) => {
        const state = ownerStates.get(key);
        if (!state) return;
        state.cancelled = true;
        state.dirty = false;
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        ownerStates.delete(key);
      });
      if (ownerStates.size === 0) statesByOwner.delete(owner);
    },
  };
}

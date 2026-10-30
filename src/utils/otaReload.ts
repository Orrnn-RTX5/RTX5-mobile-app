/** Coalesce concurrent native reloads and release the guard after failure. */
export function createOtaReloadCoordinator(reload: () => Promise<void>) {
  let pending: Promise<void> | null = null;
  return (): Promise<void> => {
    if (!pending) pending = Promise.resolve().then(reload).finally(() => { pending = null; });
    return pending;
  };
}

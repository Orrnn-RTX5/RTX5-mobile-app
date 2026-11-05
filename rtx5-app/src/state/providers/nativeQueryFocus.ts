type NativeAppState = {
  currentState: string | null;
  addEventListener: (event: 'change', listener: (state: string) => void) => { remove: () => void };
};

type QueryFocusManager = {
  setFocused: (focused?: boolean) => void;
};

/** Connect native app visibility to Query's polling/retry lifecycle. */
export function bindNativeQueryFocus(
  platform: string,
  appState: NativeAppState,
  manager: QueryFocusManager,
): () => void {
  // TanStack's browser visibility listener remains authoritative on web.
  if (platform === 'web') return () => {};

  let disposed = false;
  const updateFocus = (state: string | null) => {
    // React Native can briefly have no initial state. Wait for a concrete
    // lifecycle event rather than marking a visible startup as backgrounded.
    if (disposed || !state || state === 'unknown') return;
    manager.setFocused(state === 'active');
  };
  const subscription = appState.addEventListener('change', updateFocus);
  updateFocus(appState.currentState);

  return () => {
    if (disposed) return;
    disposed = true;
    subscription.remove();
    // Release the native override when this provider is replaced/disposed.
    manager.setFocused(undefined);
  };
}

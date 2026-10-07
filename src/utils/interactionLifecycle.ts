export type InteractionLifecyclePhase = 'suspend' | 'resume';
type LifecycleHandler = (phase: InteractionLifecyclePhase) => void;

/** One native subscription resets transient interaction state without remounting screens. */
export function createInteractionLifecycle() {
  const handlers = new Set<LifecycleHandler>();
  let active = true;
  let foreground = true;
  let epoch = 0;
  return {
    isActive: () => active,
    isForeground: () => foreground,
    getEpoch: () => epoch,
    register: (handler: LifecycleHandler) => {
      handlers.add(handler);
      return () => { handlers.delete(handler); };
    },
    setActive: (nextActive: boolean, nextForeground = nextActive) => {
      if (active === nextActive && foreground === nextForeground) return;
      foreground = nextForeground;
      active = nextActive;
      epoch++;
      const phase = active ? 'resume' : 'suspend';
      handlers.forEach(handler => {
        try { handler(phase); }
        catch (error) { console.error('[InteractionLifecycle] Recovery failed', error); }
      });
    },
  };
}

export const interactionLifecycle = createInteractionLifecycle();
export const registerInteractionLifecycleHandler = interactionLifecycle.register;

type NativeLifecycleSource = {
  currentState: string | null;
  addEventListener: (event: 'change' | 'blur' | 'focus', listener: (state?: string) => void) => { remove: () => void };
};

export function bindNativeInteractionLifecycle(
  platform: string,
  source: NativeLifecycleSource,
  lifecycle = interactionLifecycle,
): () => void {
  if (platform === 'web') return () => {};
  let disposed = false;
  const sync = (state?: string | null) => {
    if (disposed || !state || state === 'unknown') return;
    lifecycle.setActive(state === 'active');
  };
  const subscriptions = [source.addEventListener('change', sync)];
  if (platform === 'android') {
    // Android's notification shade/app switcher can cancel touches without
    // changing AppState. Recover those blur/focus cycles too.
    subscriptions.push(source.addEventListener('blur', () => {
      // Native dialogs can blur the Activity while their own controls remain
      // in the foreground. Reset interrupted gestures without disabling them.
      if (!disposed) lifecycle.setActive(false, source.currentState !== 'background' && source.currentState !== 'inactive');
    }));
    subscriptions.push(source.addEventListener('focus', () => {
      if (!disposed && source.currentState === 'active') lifecycle.setActive(true);
    }));
  }
  sync(source.currentState);
  return () => {
    disposed = true;
    subscriptions.forEach(subscription => subscription.remove());
  };
}

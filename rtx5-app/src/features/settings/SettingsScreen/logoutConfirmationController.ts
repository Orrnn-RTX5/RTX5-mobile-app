/** A logout confirmation belongs to exactly one active account session. */
export function createLogoutConfirmationController() {
  let sessionNamespace: string | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: string | null) => {
    if (sessionNamespace === next) return;
    sessionNamespace = next;
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => sessionNamespace,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    open: (activeNamespace: string | null | undefined) => {
      if (!activeNamespace) return false;
      publish(activeNamespace);
      return true;
    },
    dismiss: () => publish(null),
    reconcileSession: (activeNamespace: string | null | undefined) => {
      if (sessionNamespace !== activeNamespace) publish(null);
    },
    consume: (activeNamespace: string | null | undefined) => {
      const confirmedNamespace = sessionNamespace;
      // Close synchronously before invalidation or navigation can render.
      publish(null);
      return Boolean(confirmedNamespace && confirmedNamespace === activeNamespace);
    },
  };
}

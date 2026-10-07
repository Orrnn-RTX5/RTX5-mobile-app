type RegisterScreenReadyListener = (launchRevision?: number) => void;

const registerScreenReadyListeners = new Set<RegisterScreenReadyListener>();

export function subscribeRegisterScreenReady(listener: RegisterScreenReadyListener) {
  registerScreenReadyListeners.add(listener);

  return () => {
    registerScreenReadyListeners.delete(listener);
  };
}

export function notifyRegisterScreenReady(launchRevision?: number) {
  registerScreenReadyListeners.forEach((listener) => {
    listener(launchRevision);
  });
}

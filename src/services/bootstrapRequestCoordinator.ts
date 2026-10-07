export type BootstrapRun<T> = Readonly<{
  ready: Promise<T>;
  complete: Promise<T>;
}>;

/** Shares current work without turning completed account snapshots into a cache. */
export function createBootstrapRequestCoordinator<T>() {
  const inFlight = new Map<string, BootstrapRun<T>>();

  return (
    key: string,
    waitFor: 'trading' | 'complete',
    start: () => BootstrapRun<T>,
  ): Promise<T> => {
    let run = inFlight.get(key);
    if (!run) {
      try {
        run = start();
      } catch (error) {
        return Promise.reject(error);
      }
      inFlight.set(key, run);
      const ownedRun = run;
      const release = () => {
        if (inFlight.get(key) === ownedRun) inFlight.delete(key);
      };
      // A caller may await only one stage. Handle both branches without hiding
      // their original rejection from callers that do await that stage.
      void run.ready.catch(() => undefined);
      void run.complete.then(release, release);
    }

    return waitFor === 'trading' ? run.ready : run.complete;
  };
}

export const allowsStartupBackgroundWork = (
  appState: string | null,
  authScreen: string,
  hasVerifiedBroker: boolean,
): boolean => hasVerifiedBroker
  && (appState === null || appState === 'active')
  && (authScreen === 'guest' || authScreen === 'ready');

type StartupWork = () => void | Promise<unknown>;

/** At most one module evaluation per idle turn; completed work survives pauses. */
export function createStartupWorkQueue({ tasks, canRun, schedule, onError }: {
  tasks: readonly StartupWork[];
  canRun: () => boolean;
  schedule: (work: () => void, index: number) => () => void;
  onError?: (error: unknown) => void;
}) {
  let nextIndex = 0;
  let active = false;
  let running = false;
  let generation = 0;
  let cancelScheduled: (() => void) | null = null;

  const cancel = () => {
    generation += 1;
    cancelScheduled?.();
    cancelScheduled = null;
  };
  const refresh = () => {
    if (!active || !canRun()) {
      cancel();
      return;
    }
    if (running || cancelScheduled || nextIndex >= tasks.length) return;
    const scheduledGeneration = ++generation;
    cancelScheduled = schedule(() => {
      if (scheduledGeneration !== generation) return;
      cancelScheduled = null;
      if (!active || !canRun()) return;
      running = true;
      const run = async () => {
        try {
          await tasks[nextIndex]();
        } catch (error) {
          onError?.(error);
        } finally {
          nextIndex += 1;
          running = false;
          refresh();
        }
      };
      void run();
    }, nextIndex);
  };
  return {
    refresh,
    setActive(value: boolean) {
      active = value;
      refresh();
    },
  };
}

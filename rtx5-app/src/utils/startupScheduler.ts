import { scheduleAfterVisualFrame } from './afterVisualFrame';

type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallbackHandle = number;

type IdleCapableGlobal = typeof globalThis & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadline) => void,
    options?: { timeout?: number },
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

type ScheduledWork = () => void | Promise<void>;

const runWork = (work: ScheduledWork): void => {
  try {
    const result = work();
    const maybePromise = result as Promise<void> | undefined;
    if (maybePromise && typeof maybePromise.catch === 'function') {
      void maybePromise.catch((error) => {
        console.error('[StartupScheduler] Scheduled work failed', error);
      });
    }
  } catch (error) {
    console.error('[StartupScheduler] Scheduled work failed', error);
  }
};

export function scheduleAfterFirstFrame(work: ScheduledWork): () => void {
  return scheduleAfterVisualFrame(() => runWork(work));
}

// Optional warmups share one queue so several mounted screens cannot start
// their module loads/cache work in the same frame. Yield between each job.
const readyIdleWork = new Map<symbol, { work: ScheduledWork; deadline: number }>();
let cancelIdleTurn: (() => void) | null = null;
let scheduledIdleDeadline = Infinity;

function scheduleIdleTurn(): void {
  if (readyIdleWork.size === 0) return;
  const idleGlobal = globalThis as IdleCapableGlobal;
  if (typeof idleGlobal.requestIdleCallback !== 'function') {
    if (cancelIdleTurn) return;
    cancelIdleTurn = scheduleAfterFirstFrame(runIdleTurn);
    return;
  }
  let deadline = Infinity;
  readyIdleWork.forEach(job => { deadline = Math.min(deadline, job.deadline); });
  if (cancelIdleTurn && deadline >= scheduledIdleDeadline) return;
  cancelIdleTurn?.();
  scheduledIdleDeadline = deadline;
  const timeoutMs = Math.max(1, deadline - Date.now());
  let finished = false;
  let idleHandle: IdleCallbackHandle | undefined;
  const timer = setTimeout(run, timeoutMs);
  function cancel() {
    finished = true;
    clearTimeout(timer);
    if (idleHandle !== undefined) idleGlobal.cancelIdleCallback?.(idleHandle);
  }
  function run() {
    if (finished) return;
    cancel();
    runIdleTurn();
  }
  cancelIdleTurn = cancel;
  idleHandle = idleGlobal.requestIdleCallback(run, { timeout: timeoutMs });
}

function runIdleTurn(): void {
  cancelIdleTurn = null;
  const entry = readyIdleWork.entries().next().value;
  if (!entry) return;
  const [key, job] = entry;
  readyIdleWork.delete(key);
  runWork(job.work);
  scheduleIdleTurn();
}

export function scheduleIdleWork(
  work: ScheduledWork,
  options: { delayMs?: number; timeoutMs?: number } = {},
): () => void {
  const { delayMs = 0, timeoutMs = 1500 } = options;
  const key = Symbol();
  let cancelled = false;
  let delayHandle: ReturnType<typeof setTimeout> | null = null;

  const request = () => {
    delayHandle = null;
    if (cancelled) {
      return;
    }

    readyIdleWork.set(key, { work, deadline: Date.now() + Math.max(1, timeoutMs) });
    scheduleIdleTurn();
  };

  if (delayMs > 0) {
    delayHandle = setTimeout(request, delayMs);
  } else {
    request();
  }

  return () => {
    cancelled = true;
    if (delayHandle) {
      clearTimeout(delayHandle);
      delayHandle = null;
    }
    readyIdleWork.delete(key);
    if (readyIdleWork.size === 0) {
      cancelIdleTurn?.();
      cancelIdleTurn = null;
    }
  };
}

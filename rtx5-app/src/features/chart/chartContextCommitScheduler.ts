import { scheduleAfterFirstFrame } from '../../utils/startupScheduler';

type ScheduleCommit = (work: () => void) => () => void;

type ChartContextCommitRequest = {
  prepare: () => void;
  commit: () => void;
};

export type ChartContextCommitScheduler = {
  request: (request: ChartContextCommitRequest) => void;
  cancelPending: () => void;
};

export function createChartContextCommitScheduler(
  schedule: ScheduleCommit = scheduleAfterFirstFrame,
): ChartContextCommitScheduler {
  let revision = 0;
  let pendingCancel: (() => void) | null = null;

  const cancelPending = () => {
    revision += 1;
    const cancel = pendingCancel;
    pendingCancel = null;
    cancel?.();
  };

  const request = ({ prepare, commit }: ChartContextCommitRequest) => {
    revision += 1;
    const requestRevision = revision;
    const cancelPrevious = pendingCancel;
    pendingCancel = null;
    cancelPrevious?.();

    // Starting the request before scheduling is the important boundary: React
    // Native can dispatch it while the symbol-changing Chart render is deferred.
    prepare();
    if (requestRevision !== revision) {
      return;
    }

    let callbackRan = false;
    const cancel = schedule(() => {
      if (callbackRan) {
        return;
      }
      callbackRan = true;
      if (requestRevision !== revision) {
        return;
      }

      pendingCancel = null;
      commit();
    });

    // The production scheduler is asynchronous, but keep this safe for injected
    // schedulers and for a re-entrant cancellation during scheduling.
    if (callbackRan) {
      return;
    }
    if (requestRevision !== revision) {
      cancel();
      return;
    }
    pendingCancel = cancel;
  };

  return {
    request,
    cancelPending,
  };
}

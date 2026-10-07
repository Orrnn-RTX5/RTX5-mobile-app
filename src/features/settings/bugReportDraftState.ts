import type { BugReportDraft } from '../../api/bugReports';

// Process-memory drafts survive login recovery; account scope never leaves the device.
const drafts = new Map<string, BugReportDraft>();
export const readBugReportDraft = (scope: string) => drafts.get(scope);
export const saveBugReportDraft = (scope: string, draft: BugReportDraft) => drafts.set(scope, draft);
export const clearBugReportDraft = (scope: string) => drafts.delete(scope);

/** Acquires synchronously, before network preflight. A failed/cancelled operation releases it. */
export function createBugReportSubmissionGate() {
  let busy = false;
  return {
    isBusy: () => busy,
    async run(task: () => Promise<void>): Promise<boolean> {
      if (busy) return false;
      busy = true;
      try { await task(); return true; } finally { busy = false; }
    },
  };
}

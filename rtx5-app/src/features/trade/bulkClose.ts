/**
 * Sequential bulk close runner. Never retries a position mutation.
 *
 * Backend contract v3 (6.2): accounts on the new engine answer EVERY close
 * with `503 ENGINE_CLOSE_UNAVAILABLE` (BACKEND PENDING). The app must show
 * "Closing is temporarily unavailable, please contact support" and must not
 * retry in a loop. Account-wide and transport failures stop the remaining
 * requests; a rejection specific to one position does not stop other tickets.
 */
import {
  classifyTradingError,
  getTradingErrorCode,
  type TradingErrorFeedback,
} from '../../api/tradingErrors';

/** Codes that make every further close in the batch pointless. */
export const BULK_CLOSE_STOP_CODES: ReadonlySet<string> = new Set([
  'ENGINE_CLOSE_UNAVAILABLE',
  'INVESTOR_READ_ONLY',
  'ORDER_CONFIRMATION_PENDING',
]);

export type BulkCloseResult =
  | Readonly<{ status: 'fulfilled' }>
  | Readonly<{ status: 'rejected'; reason: unknown; skipped: boolean }>;

export type BulkCloseSummary = Readonly<{
  results: readonly BulkCloseResult[];
  failed: number;
  /** The error that stopped the batch, if any. */
  stopError: unknown | null;
}>;

const shouldStopBulkClose = (error: unknown): boolean => {
  if (BULK_CLOSE_STOP_CODES.has(getTradingErrorCode(error) ?? '')) return true;
  if (error instanceof Error && error.name === 'StaleBrokerSessionError') return true;
  const feedback = classifyTradingError(error, { action: 'close-position' });
  return feedback.kind === 'session-expired'
    || feedback.kind === 'rate-limit'
    || feedback.kind === 'backend-unavailable'
    || (feedback.status !== undefined && feedback.status >= 500);
};

/** Keep the original status, code and message when presenting a batch failure. */
export const resolveBulkCloseFeedback = (summary: BulkCloseSummary): TradingErrorFeedback | null => {
  const failure = summary.results.find((result) => result.status === 'rejected' && !result.skipped);
  if (!failure || failure.status !== 'rejected') return null;
  return classifyTradingError(summary.stopError ?? failure.reason, { action: 'close-position' });
};

export const runBulkClose = async <T>(
  items: readonly T[],
  close: (item: T) => Promise<unknown>,
  options: Readonly<{ assertCurrent?: () => void }> = {},
): Promise<BulkCloseSummary> => {
  if (items.length === 0) {
    return Object.freeze({ results: [], failed: 0, stopError: null });
  }

  const settle = async (item: T): Promise<BulkCloseResult> => {
    try {
      options.assertCurrent?.();
      await close(item);
      return { status: 'fulfilled' };
    } catch (reason) {
      return { status: 'rejected', reason, skipped: false };
    }
  };

  const results: BulkCloseResult[] = [];
  let stopError: unknown | null = null;
  for (let index = 0; index < items.length; index += 1) {
    const result = await settle(items[index]);
    results.push(result);
    if (result.status === 'rejected' && shouldStopBulkClose(result.reason)) {
      stopError = result.reason;
      for (let skippedIndex = index + 1; skippedIndex < items.length; skippedIndex += 1) {
        results.push({ status: 'rejected', reason: stopError, skipped: true });
      }
      break;
    }
  }

  return Object.freeze({
    results,
    failed: results.filter((result) => result.status === 'rejected').length,
    stopError,
  });
};

/**
 * Bulk close runner with a stop rule for engine-wide close outages.
 *
 * Backend contract v3 (6.2): accounts on the new engine answer EVERY close
 * with `503 ENGINE_CLOSE_UNAVAILABLE` (BACKEND PENDING). The app must show
 * "Closing is temporarily unavailable, please contact support" and must not
 * retry in a loop. The first close therefore runs alone; if it hits a
 * non-retryable engine outage, the remaining closes are not sent at all.
 */
import { getTradingErrorCode } from '../../api/tradingErrors';

/** Codes that make every further close in the batch pointless. */
export const BULK_CLOSE_STOP_CODES: ReadonlySet<string> = new Set([
  'ENGINE_CLOSE_UNAVAILABLE',
  'INVESTOR_READ_ONLY',
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

export const runBulkClose = async <T>(
  items: readonly T[],
  close: (item: T) => Promise<unknown>,
): Promise<BulkCloseSummary> => {
  if (items.length === 0) {
    return Object.freeze({ results: [], failed: 0, stopError: null });
  }

  const settle = async (item: T): Promise<BulkCloseResult> => {
    try {
      await close(item);
      return { status: 'fulfilled' };
    } catch (reason) {
      return { status: 'rejected', reason, skipped: false };
    }
  };

  const first = await settle(items[0]);
  let stopError: unknown | null = null;
  let rest: BulkCloseResult[];
  if (
    first.status === 'rejected' &&
    BULK_CLOSE_STOP_CODES.has(getTradingErrorCode(first.reason) ?? '')
  ) {
    stopError = first.reason;
    rest = items.slice(1).map(() => ({
      status: 'rejected' as const,
      reason: first.reason,
      skipped: true,
    }));
  } else {
    rest = await Promise.all(items.slice(1).map(settle));
    const stopping = rest.find((result) => (
      result.status === 'rejected' &&
      BULK_CLOSE_STOP_CODES.has(getTradingErrorCode(result.reason) ?? '')
    ));
    if (stopping && stopping.status === 'rejected') stopError = stopping.reason;
  }

  const results = [first, ...rest];
  return Object.freeze({
    results,
    failed: results.filter((result) => result.status === 'rejected').length,
    stopError,
  });
};

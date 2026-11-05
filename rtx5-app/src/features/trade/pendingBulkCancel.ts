import type { PendingOrderReadModel } from '../../api/orders/pendingOrders';
import { classifyTradingError, getTradingErrorCode } from '../../api/tradingErrors';

export const PENDING_BULK_OPTIONS = [
  { mode: 'all', label: 'Delete All Pending Orders', icon: 'trash-outline' },
  { mode: 'buy', label: 'Delete All Buy Pending Orders', icon: 'arrow-up-circle-outline' },
  { mode: 'sell', label: 'Delete All Sell Pending Orders', icon: 'arrow-down-circle-outline' },
] as const;
export type PendingBulkMode = typeof PENDING_BULK_OPTIONS[number]['mode'];

export const parsePendingBulkMode = (value: unknown): PendingBulkMode | null =>
  value === 'all' || value === 'buy' || value === 'sell' ? value : null;

const PENDING_TYPES = new Set(['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop', 'buy_stop_limit', 'sell_stop_limit']);

export function selectPendingOrdersForBulk(
  orders: readonly PendingOrderReadModel[], mode: PendingBulkMode, accountLogin: string | number,
): PendingOrderReadModel[] {
  const seen = new Set<number>();
  return orders.filter(order => {
    if (!Number.isSafeInteger(order.ticket) || order.ticket <= 0 || seen.has(order.ticket)
      || String(order.accountLogin) !== String(accountLogin) || order.status.toLowerCase() !== 'pending'
      || !PENDING_TYPES.has(order.type) || (mode !== 'all' && !order.type.startsWith(mode + '_'))) return false;
    seen.add(order.ticket);
    return true;
  });
}

export type PendingBulkResult = Readonly<{
  ticket: number;
  outcome: 'cancelled' | 'failed' | 'skipped' | 'not-attempted';
  reason?: unknown;
}>;
export type PendingBulkSummary = Readonly<{
  results: readonly PendingBulkResult[];
  cancelled: number;
  failed: number;
  skipped: number;
  notAttempted: number;
  stopError: unknown | null;
}>;

const runningNamespaces = new Set<string>();
const stopsBatch = (error: unknown): boolean => {
  if (error instanceof Error && ['StaleBrokerSessionError', 'PendingBulkCancelledError'].includes(error.name)) return true;
  if (['INVESTOR_READ_ONLY', 'ORDER_CONFIRMATION_PENDING', 'COMMAND_COMMIT_UNCERTAIN'].includes(getTradingErrorCode(error) ?? '')) return true;
  const feedback = classifyTradingError(error, { action: 'cancel-pending-order' });
  return ['session-expired', 'rate-limit', 'backend-unavailable'].includes(feedback.kind)
    || (feedback.status !== undefined && (feedback.status >= 500 || feedback.status === 401 || feedback.status === 403 || feedback.status === 429));
};

/** Only reviewed tickets are considered; mutations are sequential and never replayed. */
export async function runBulkPendingCancellation(
  reviewedOrders: readonly PendingOrderReadModel[],
  options: Readonly<{
    namespace: string;
    accountLogin: string | number;
    assertCurrent: () => void;
    getPendingOrders: () => readonly PendingOrderReadModel[];
    cancel: (ticket: number) => Promise<unknown>;
    onProgress?: (completed: number, total: number) => void;
  }>,
): Promise<PendingBulkSummary> {
  if (!options.namespace || runningNamespaces.has(options.namespace)) {
    throw new Error('Another pending-order bulk operation is still running. Wait for it to finish.');
  }
  const orders = selectPendingOrdersForBulk(reviewedOrders, 'all', options.accountLogin);
  runningNamespaces.add(options.namespace);
  const results: PendingBulkResult[] = [];
  let stopError: unknown | null = null;
  try {
    for (const order of orders) {
      if (stopError !== null) {
        results.push({ ticket: order.ticket, outcome: 'not-attempted' });
        continue;
      }
      try {
        options.assertCurrent();
      } catch (reason) {
        stopError = reason;
        results.push({ ticket: order.ticket, outcome: 'not-attempted', reason });
        continue;
      }
      const current = selectPendingOrdersForBulk(options.getPendingOrders(), 'all', options.accountLogin)
        .find(row => row.ticket === order.ticket);
      if (!current) {
        results.push({ ticket: order.ticket, outcome: 'skipped' });
      } else {
        try {
          await options.cancel(order.ticket);
          results.push({ ticket: order.ticket, outcome: 'cancelled' });
        } catch (reason) {
          results.push({ ticket: order.ticket, outcome: 'failed', reason });
          if (stopsBatch(reason)) stopError = reason;
        }
      }
      options.onProgress?.(results.length, orders.length);
    }
    return {
      results,
      cancelled: results.filter(row => row.outcome === 'cancelled').length,
      failed: results.filter(row => row.outcome === 'failed').length,
      skipped: results.filter(row => row.outcome === 'skipped').length,
      notAttempted: results.filter(row => row.outcome === 'not-attempted').length,
      stopError,
    };
  } finally {
    runningNamespaces.delete(options.namespace);
  }
}

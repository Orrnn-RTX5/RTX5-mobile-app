/**
 * Core module: positions.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { positionsApi, Position, ClosedPosition } from '../api/positions';
import { PositionItem } from '../dev/mock/tradingData';
import {
  getSessionQueryCacheNamespace,
  invalidateSessionQueryRoots,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const POSITIONS_KEY = 'positions';
export const POSITION_HISTORY_KEY = 'positionHistory';

export const getPositionsQueryKey = (
  cacheNamespace: string,
  login?: number,
) => [POSITIONS_KEY, cacheNamespace, login] as const;

export const getPositionHistoryQueryKey = (
  cacheNamespace: string,
  login?: number,
  pageLimit?: number,
  maxPages?: number,
  from?: number,
  to?: number,
) => pageLimit === undefined && maxPages === undefined && from === undefined && to === undefined
  ? [POSITION_HISTORY_KEY, cacheNamespace, login] as const
  : [
    POSITION_HISTORY_KEY,
    cacheNamespace,
    login,
    pageLimit ?? null,
    maxPages ?? null,
    from ?? null,
    to ?? null,
  ] as const;

type PollingQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnMount?: boolean | 'always';
  staleTime?: number;
  subscribed?: boolean;
  /**
   * @deprecated The v3 history endpoint ignores limit/offset. Kept only so
   * existing callers keep an isolated cache entry; it is not sent.
   */
  pageLimit?: number;
  /** Maximum number of from/to time windows to walk (see closedHistory.ts). */
  maxPages?: number;
  /** Optional history range in unix seconds. */
  from?: number;
  to?: number;
};

const resolvePollingRefetchInterval = (
  enabled: boolean,
  fallbackMs: number,
  override?: number | false,
) => (enabled ? (override ?? fallbackMs) : false);

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hooks for the Positions API.
// These hooks wrap the positionsApi functions and provide:
//   • Automatic caching & background refetch
//   • Optimistic cache invalidation on mutations
//   • Consistent query key namespacing for cross-component cache sharing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a raw Position DTO from the API into the app's PositionItem model.
 * Centralizes the DTO → UI transformation so all consumers get consistent data.
 */
function mapPositionToItem(dto: Position): PositionItem {
  return {
    id: String(dto.ticket),
    symbol: dto.symbol,
    side: dto.side,
    volume: dto.volume,
    openPrice: dto.price_open,
    currentPrice: dto.price_current,
    // Backend `profit` is price profit. The row P/L shown to users is net P/L,
    // so swap and commission must be included exactly once. The v3 gateway
    // does not send `commission`; a missing value means 0.
    pnl: dto.profit + (dto.swap || 0) + (dto.commission || 0),
    swap: dto.swap || 0,
    commission: dto.commission || 0,
    openTime: new Date(dto.time_create * 1000).toISOString(),
    sl: dto.price_sl || 0,
    tp: dto.price_tp || 0,
  };
}

/**
 * Fetch open positions for a trading account.
 * Auto-refreshes every 5 seconds while the component is mounted.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function usePositionsQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: getPositionsQueryKey(cacheNamespace, login),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => positionsApi.getPositions(login!),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 5000, options.refetchInterval),
    select: (data: Position[]) => data.map(mapPositionToItem),
  });
}

/**
 * Fetch closed position history for a trading account.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function usePositionHistoryQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: getPositionHistoryQueryKey(
      cacheNamespace,
      login,
      options.pageLimit,
      options.maxPages,
      options.from,
      options.to,
    ),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => positionsApi.getPositionHistory(login!, {
        maxWindows: options.maxPages,
        from: options.from,
        to: options.to,
      }),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 30000, options.refetchInterval),
    refetchOnMount: options.refetchOnMount,
    staleTime: options.staleTime,
    subscribed: options.subscribed,
  });
}

/**
 * Mutation to close an open position by its ticket ID.
 * On success, invalidates positions, account summary, exposure, and transactions caches.
 */
export function useClosePositionMutation() {
  const queryClient = useQueryClient();
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);

  return useMutation({
    mutationFn: (ticketId: string | number) => runSessionBoundQuery(
      cacheNamespace,
      () => positionsApi.closePosition(ticketId),
    ),
    onSuccess: () => {
      // Invalidate all caches that could be affected by closing a position
      void invalidateSessionQueryRoots(queryClient, cacheNamespace, [
        POSITIONS_KEY,
        POSITION_HISTORY_KEY,
        'deals',
        'accountDeals',
        'accountSummary',
        'transactions',
      ]);
    },
  });
}

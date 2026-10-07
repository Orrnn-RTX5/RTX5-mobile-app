/**
 * Core module: candles.ts
 */

import { useQuery } from '@tanstack/react-query';
import { commitCandleHistoryResponse, getCandleHistory } from '../api/candles';
import { mergeHistoryIntoCandleCache } from '../state/candleCache';
import {
  CANDLE_HISTORY_QUERY_GC_MS,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  LATEST_DAILY_CANDLE_HISTORY_LIMIT,
  normalizeCandleHistoryTimeframeStrict,
  normalizeSymbol,
} from '../core/candles';
import {
  getSessionQueryCacheNamespace,
  useActiveBrokerQuerySession,
} from '../../../query/authenticatedQueryScope';

// ─── Query Keys ─────────────────────────────────────────────────────────────

/**
 * Standardized TanStack Query cache keys for candlestick data.
 * Used for invalidating or prefetching queries.
 */
export const candleKeys = {
  root: ['candles'] as const,
  all: (cacheNamespace: string) => [...candleKeys.root, cacheNamespace] as const,
  history: (cacheNamespace: string, symbol: string, timeframe: string) =>
    [...candleKeys.all(cacheNamespace), 'history', symbol, timeframe] as const,
  latestDaily: (cacheNamespace: string, symbol: string) =>
    [...candleKeys.all(cacheNamespace), 'latestDaily', symbol] as const,
};

// ─── Candle History Query Hook ──────────────────────────────────────────────

/**
 * Fetches initial candle history from the REST API and populates the
 * Zustand store. Live candle snapshots are handled separately by the
 * dedicated candle WebSocket layer.
 */
export function useCandleHistory(symbol: string, timeframe: string) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);

  return useQuery({
    queryKey: candleKeys.history(cacheNamespace, normalizedSymbol, normalizedTimeframe ?? ''),
    queryFn: async () => {
      if (!normalizedTimeframe) {
        return [];
      }
      const res = await getCandleHistory(
        normalizedSymbol,
        normalizedTimeframe,
        DEFAULT_CANDLE_HISTORY_LIMIT,
        { cacheNamespace },
      );
      return commitCandleHistoryResponse(res, (current) => {
        mergeHistoryIntoCandleCache(normalizedSymbol, normalizedTimeframe, current.candles, {
          provenance: current.provenance,
        });
        return current.candles;
      });
    },
    enabled: Boolean(session) && !!normalizedSymbol && !!normalizedTimeframe,
    staleTime: 30_000,       // 30s — candles update via WS after initial fetch
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
    retry: 2,
    retryDelay: 1000,
  });
}

/**
 * Fetches only the most recent D1 (Daily) candle for a given symbol.
 * Useful for calculating simple 24h price changes or daily highs/lows in UI components
 * (e.g., watchlists or account summaries) without subscribing to a full streaming chart.
 */
export function useLatestDailyCandle(symbol: string, enabled = true) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const normalizedSymbol = normalizeSymbol(symbol);

  return useQuery({
    queryKey: candleKeys.latestDaily(cacheNamespace, normalizedSymbol),
    queryFn: async () => {
      const res = await getCandleHistory(
        normalizedSymbol,
        'D1',
        LATEST_DAILY_CANDLE_HISTORY_LIMIT,
        { cacheNamespace },
      );
      return commitCandleHistoryResponse(
        res,
        (current) => current.currentCandle ?? current.candles[current.candles.length - 1] ?? null,
      );
    },
    enabled: enabled && Boolean(session) && !!normalizedSymbol,
    staleTime: 30_000,
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
    retry: 2,
    retryDelay: 1000,
  });
}

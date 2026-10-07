import { getAccountSummary } from '../api/account';
import {
  commitCandleHistoryResponse,
  getCandleHistory,
} from '../domain/candles/api/candles';
import { fetchInstrumentMeta } from '../api/instruments';
import { fetchMarketStatus, type MarketStatusDTO } from '../api/marketStatus';
import {
  CANDLE_HISTORY_QUERY_GC_MS,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  LATEST_DAILY_CANDLE_HISTORY_LIMIT,
  normalizeCandleHistoryTimeframeStrict,
} from '../domain/candles/core/candles';
import { normalizeSymbol } from '../domain/symbols';
import { appQueryClient } from '../state/providers/AppProviders';
import { captureActiveBrokerSession } from '../state/activeBrokerSession';
import { getAccountSummaryQueryKey } from '../query/account';
import {
  isSessionQueryCacheNamespaceCurrent,
  runSessionBoundQuery,
} from '../query/authenticatedQueryScope';
import { getMarketStatusQueryKey } from '../query/marketStatus';
import { INSTRUMENT_META_QUERY_VERSION } from '../query/instruments';
import { candleKeys } from '../domain/candles/query/candles';
import {
  getOrrnnDemoPublicCandleQueryOptions,
  resolveOrrnnDemoPublicCandleSelection,
} from '../domain/candles/query/orrnnDemoPublicCandles';
import { mergeHistoryIntoCandleCache } from '../domain/candles/state/candleCache';
import { liveCandlesEngine } from '../api/ws/liveCandlesEngine';
import { resolveChartSelectionHistoryWarmLimit } from '../market/chartHistoryWarmupPolicy';
import { isOrrnnDemoPublicMarketSelection } from '../api/orrnnDemoPublicMarket';
import { useUserPreferences } from '../state/userPreferences';

export function prefetchAccountSummary(login?: string) {
  const capture = captureActiveBrokerSession();
  if (!login || !capture) return;
  const cacheNamespace = capture.session.cacheNamespace;

  void appQueryClient.prefetchQuery({
    queryKey: getAccountSummaryQueryKey(cacheNamespace, login),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getAccountSummary(login),
    ),
    staleTime: 2_000,
  }).catch(() => {});
}

export function prefetchInstrument(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const capture = captureActiveBrokerSession();
  const cacheNamespace = capture?.session.cacheNamespace ?? '';

  if (!normalizedSymbol || !capture) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: ['instrument', cacheNamespace, INSTRUMENT_META_QUERY_VERSION, normalizedSymbol],
    queryFn: () => fetchInstrumentMeta(symbol, cacheNamespace),
    staleTime: 60 * 60_000,
  }).catch(() => {});
}

export function prefetchChartCandles(symbol: string, timeframe: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);
  const capture = captureActiveBrokerSession();
  const cacheNamespace = capture?.session.cacheNamespace ?? '';

  if (!normalizedSymbol || !normalizedTimeframe || !capture) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: candleKeys.history(cacheNamespace, normalizedSymbol, normalizedTimeframe),
    queryFn: async () => {
      const response = await getCandleHistory(
        normalizedSymbol,
        normalizedTimeframe,
        DEFAULT_CANDLE_HISTORY_LIMIT,
        { cacheNamespace },
      );
      return commitCandleHistoryResponse(response, (current) => {
        mergeHistoryIntoCandleCache(normalizedSymbol, normalizedTimeframe, current.candles, {
          provenance: current.provenance,
        });
        return current.candles;
      });
    },
    staleTime: 30_000,
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
  }).catch(() => {});
}

/** Starts or joins anonymous REST history without attaching the live socket. */
export function prefetchOrrnnDemoPublicCandles(
  symbol: string,
  timeframe: string,
): Promise<number> {
  const selection = resolveOrrnnDemoPublicCandleSelection(symbol, timeframe);
  if (!selection) {
    return Promise.resolve(0);
  }

  return appQueryClient.fetchQuery(
    getOrrnnDemoPublicCandleQueryOptions(selection.symbol, selection.timeframe),
  ).then((candles) => candles.length).catch(() => 0);
}

/**
 * Warms the exact chart history for an explicit symbol selection.
 *
 * Open/unknown symbols keep the small 120-bar first request. Only an explicit
 * backend `quote_open: false` response upgrades that same session-scoped warm-
 * up to 500 bars, which avoids a second request when a broken adapter leaves a
 * long frozen tail after market close. No symbol class or trading calendar is
 * guessed here, so 24x7 crypto remains on the normal path unless its backend
 * explicitly reports maintenance closure.
 */
export function prefetchChartSelectionHistory(symbol: string, timeframe: string): Promise<number> {
  const requestedSymbol = symbol.trim();
  const normalizedSymbol = normalizeSymbol(requestedSymbol);
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);
  if (!requestedSymbol || !normalizedSymbol || !normalizedTimeframe) {
    return Promise.resolve(0);
  }

  const preferences = useUserPreferences.getState();
  if (isOrrnnDemoPublicMarketSelection({
    brokerId: preferences.brokerId,
    isLoggedIn: preferences.isLoggedIn,
  })) {
    // QueryClient owns the exact-key cache and in-flight request. The focused
    // public candle hook uses these same options, so it can synchronously read
    // a completed warm-up or join one still in progress without starting a
    // hidden WebSocket subscription.
    return prefetchOrrnnDemoPublicCandles(normalizedSymbol, normalizedTimeframe);
  }

  const capture = captureActiveBrokerSession();
  const cacheNamespace = capture?.session.cacheNamespace ?? '';
  if (!capture) {
    return Promise.resolve(0);
  }

  const statusQueryKey = getMarketStatusQueryKey(cacheNamespace, requestedSymbol);
  const cachedStatus = appQueryClient.getQueryData<MarketStatusDTO>(statusQueryKey);
  const initialLimit = resolveChartSelectionHistoryWarmLimit(cachedStatus);
  const initialHistoryPromise = liveCandlesEngine.prefetchHistory(
    normalizedSymbol,
    normalizedTimeframe,
    initialLimit,
  );

  const statusPromise = appQueryClient.fetchQuery({
    queryKey: statusQueryKey,
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => fetchMarketStatus(requestedSymbol),
    ),
    staleTime: 30_000,
  });

  return statusPromise
    .then((status) => {
      if (
        status.quote_open !== false ||
        !isSessionQueryCacheNamespaceCurrent(cacheNamespace)
      ) {
        return initialHistoryPromise;
      }
      return liveCandlesEngine.prefetchHistory(
        normalizedSymbol,
        normalizedTimeframe,
        resolveChartSelectionHistoryWarmLimit(status),
      );
    })
    .catch(() => initialHistoryPromise);
}

export function prefetchLatestDailyCandle(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const capture = captureActiveBrokerSession();
  const cacheNamespace = capture?.session.cacheNamespace ?? '';

  if (!normalizedSymbol || !capture) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: candleKeys.latestDaily(cacheNamespace, normalizedSymbol),
    queryFn: async () => {
      const response = await getCandleHistory(
        normalizedSymbol,
        'D1',
        LATEST_DAILY_CANDLE_HISTORY_LIMIT,
        { cacheNamespace },
      );
      return commitCandleHistoryResponse(
        response,
        (current) => current.currentCandle ?? current.candles[current.candles.length - 1] ?? null,
      );
    },
    staleTime: 30_000,
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
  }).catch(() => {});
}

export async function prefetchChartContext(symbol: string, timeframe: string) {
  await Promise.allSettled([
    prefetchInstrument(symbol),
    prefetchChartCandles(symbol, timeframe),
  ]);
}

export function prefetchDailyCandles(symbol: string) {
  prefetchLatestDailyCandle(symbol);
}

export function prefetchQuoteDetails(symbol: string) {
  prefetchInstrument(symbol);
  prefetchDailyCandles(symbol);
}

export function prefetchOrderTicketData(login?: string, symbol?: string) {
  prefetchAccountSummary(login);
  if (symbol) {
    prefetchInstrument(symbol);
  }
}

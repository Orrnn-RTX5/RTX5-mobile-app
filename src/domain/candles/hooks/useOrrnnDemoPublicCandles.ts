import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { orrnnDemoPublicMarketSocket } from '../../../api/ws/orrnnDemoPublicMarketSocket';
import {
  getOrrnnDemoPublicCandleQueryOptions,
  getOrrnnDemoPublicCandleQueryKey,
  fetchOrrnnDemoPublicCandleSeries,
  ORRNN_DEMO_PUBLIC_CANDLE_LIMIT,
  resolveOrrnnDemoPublicCandleSelection,
} from '../query/orrnnDemoPublicCandles';
import type { CandleParams } from '../stream/liveCandleStream';
import { ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE } from '../../../config/orrnnDemoPublicMarket';
import { mergePublicBars } from '../series/publicCandleMerge';

const EMPTY_PUBLIC_CANDLES = Object.freeze([]) as readonly CandleParams[];

// Matches the signed-in chart's candle commit cadence
// (CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS). Every commit re-renders the whole
// Chart screen, so per-message commits competed with WebView startup and paint.
const PUBLIC_LIVE_CANDLE_COMMIT_INTERVAL_MS = 400;

type PublicCandleLiveState = {
  contextKey: string;
  candles: readonly CandleParams[];
};

const INACTIVE_PUBLIC_CANDLE_LIVE_STATE: PublicCandleLiveState = {
  contextKey: '',
  candles: EMPTY_PUBLIC_CANDLES,
};

const mergePublicCandle = (
  candles: readonly CandleParams[],
  incoming: CandleParams,
): CandleParams[] => {
  const nextCandle: CandleParams = { ...incoming, source: 'live_candle' };
  return mergePublicBars(candles, [nextCandle], ORRNN_DEMO_PUBLIC_CANDLE_LIMIT);
};

const mergePublicHistoryWithRetainedLiveCandles = (
  historyCandles: readonly CandleParams[],
  currentCandles: readonly CandleParams[],
): CandleParams[] => {
  const retainedLiveCandles = currentCandles.filter(
    (candle) => candle.source === 'live_candle',
  );
  return mergePublicBars(historyCandles, retainedLiveCandles, ORRNN_DEMO_PUBLIC_CANDLE_LIMIT);
};

export function useOrrnnDemoPublicCandles(
  symbol: string,
  timeframe: string,
  active: boolean,
) {
  const selection = useMemo(
    () => resolveOrrnnDemoPublicCandleSelection(symbol, timeframe),
    [symbol, timeframe, ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE],
  );
  const queryOptions = useMemo(
    () => getOrrnnDemoPublicCandleQueryOptions(symbol, timeframe, active),
    [active, symbol, timeframe, ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE],
  );
  const queryClient = useQueryClient();
  const historyQuery = useQuery(queryOptions);
  const refetchHistory = historyQuery.refetch;
  // Read the exact shared key directly as a fallback. The disabled hidden
  // observer is allowed one `data` notification so the retained WebView can
  // paint REST history before navigation, without attaching its live socket.
  const resolvedHistoryCandles = historyQuery.data ?? (
    selection
      ? queryClient.getQueryData<CandleParams[]>(
        getOrrnnDemoPublicCandleQueryKey(selection.symbol, selection.timeframe),
      )
      : undefined
  );
  const contextKey = selection
    ? `${ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE}:${selection.symbol}:${selection.timeframe}`
    : '';
  const [liveState, setLiveState] = useState<PublicCandleLiveState>(
    INACTIVE_PUBLIC_CANDLE_LIVE_STATE,
  );
  const paginationRequestRef = useRef<{ contextKey: string } | null>(null);

  useEffect(() => {
    // A resolved empty array is still an authoritative REST baseline. Attach
    // the live stream only after the query has settled, never while navigation
    // is merely prefetching this hidden chart context.
    if (!active || !selection || resolvedHistoryCandles === undefined) {
      setLiveState(INACTIVE_PUBLIC_CANDLE_LIVE_STATE);
      return;
    }

    let cancelled = false;
    const restCandles = resolvedHistoryCandles;
    setLiveState((current) => ({
      contextKey,
      candles: mergePublicHistoryWithRetainedLiveCandles(
        restCandles,
        current.contextKey === contextKey ? current.candles : EMPTY_PUBLIC_CANDLES,
      ),
    }));

    // Live candle messages are coalesced (last update per bar time wins) and
    // committed at most once per interval; the first message after a quiet
    // interval still commits immediately.
    const pendingIncoming = new Map<number, CandleParams>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFlushAt = 0;
    const flushPendingCandles = () => {
      flushTimer = null;
      if (cancelled || pendingIncoming.size === 0) {
        return;
      }
      const batch = [...pendingIncoming.values()];
      pendingIncoming.clear();
      lastFlushAt = Date.now();
      setLiveState((current) => {
        let candles: readonly CandleParams[] =
          current.contextKey === contextKey ? current.candles : restCandles;
        for (const incoming of batch) {
          candles = mergePublicCandle(candles, incoming);
        }
        return { contextKey, candles };
      });
    };

    // REST establishes the initial series before the anonymous live stream is
    // attached. A navigation-only prefetch never reaches this subscription.
    const unsubscribe = orrnnDemoPublicMarketSocket.subscribeCandle(
      selection.symbol,
      selection.timeframe,
      (incoming) => {
        if (cancelled) {
          return;
        }
        pendingIncoming.set(incoming.time, incoming);
        if (flushTimer !== null) {
          return;
        }
        const delayMs = Math.max(
          0,
          PUBLIC_LIVE_CANDLE_COMMIT_INTERVAL_MS - (Date.now() - lastFlushAt),
        );
        if (delayMs === 0) {
          flushPendingCandles();
          return;
        }
        flushTimer = setTimeout(flushPendingCandles, delayMs);
      },
    );

    return () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      // A re-run for the same context (REST refetch, refresh, pagination)
      // must not drop coalesced bar updates; a different context discards
      // them via the contextKey check on the next run.
      flushPendingCandles();
      cancelled = true;
      unsubscribe();
    };
  }, [
    active,
    contextKey,
    resolvedHistoryCandles,
    selection,
  ]);

  const refresh = useCallback(() => {
    if (active) {
      void refetchHistory();
    }
  }, [active, refetchHistory]);
  const paginate = useCallback(() => {
    if (!active || !selection) {
      return;
    }

    const queryKey = getOrrnnDemoPublicCandleQueryKey(
      selection.symbol,
      selection.timeframe,
    );
    const cachedHistory = queryClient.getQueryData<CandleParams[]>(queryKey);
    if (
      (cachedHistory?.length ?? 0) >= ORRNN_DEMO_PUBLIC_CANDLE_LIMIT
      || paginationRequestRef.current?.contextKey === contextKey
    ) {
      return;
    }

    paginationRequestRef.current = { contextKey };
    void fetchOrrnnDemoPublicCandleSeries(
      selection.symbol,
      selection.timeframe,
      ORRNN_DEMO_PUBLIC_CANDLE_LIMIT,
    ).then((expandedHistory) => {
      queryClient.setQueryData<CandleParams[]>(queryKey, (currentHistory = []) => (
        mergePublicBars(expandedHistory, currentHistory, ORRNN_DEMO_PUBLIC_CANDLE_LIMIT)
      ));
    }).catch(() => undefined).finally(() => {
      if (paginationRequestRef.current?.contextKey === contextKey) {
        paginationRequestRef.current = null;
      }
    });
  }, [active, contextKey, queryClient, selection]);

  const cachedRestCandles = resolvedHistoryCandles ?? EMPTY_PUBLIC_CANDLES;
  const candles = active && liveState.contextKey === contextKey
    ? liveState.candles
    : cachedRestCandles;
  const error = active && resolvedHistoryCandles === undefined && historyQuery.error
    ? historyQuery.error instanceof Error
      ? historyQuery.error.message
      : 'Unable to load public demo candles.'
    : null;

  return {
    candles: candles as CandleParams[],
    hasHistoryCandles: cachedRestCandles.length > 0,
    loading: active && resolvedHistoryCandles === undefined && historyQuery.isFetching,
    error,
    refresh,
    paginate,
    seededFromCache: cachedRestCandles.length > 0,
  };
}

export { mergePublicCandle, mergePublicHistoryWithRetainedLiveCandles };

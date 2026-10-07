import { queryOptions } from '@tanstack/react-query';
import {
  getOrrnnDemoPublicCandles,
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
  resolveOrrnnDemoPublicCandleTimeframe,
} from '../../../api/orrnnDemoPublicMarket';
import {
  normalizeCandleSeries,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/candles';
import type { CandleParams } from '../stream/liveCandleStream';
import { candleKeys } from './candles';

export const ORRNN_DEMO_PUBLIC_CANDLE_INITIAL_LIMIT = 120;
export const ORRNN_DEMO_PUBLIC_CANDLE_LIMIT = 500;
export const ORRNN_DEMO_PUBLIC_CANDLE_STALE_MS = 30_000;
// Preserve visited public-chart histories for the lifetime of this QueryClient
// (the app session). Staleness still triggers background refreshes, while an
// inactive symbol is no longer discarded and forced through a cold load.
export const ORRNN_DEMO_PUBLIC_CANDLE_GC_MS = Number.POSITIVE_INFINITY;
const PUBLIC_CANDLE_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;

export type OrrnnDemoPublicCandleSelection = Readonly<{
  symbol: string;
  timeframe: string;
}>;

export const resolveOrrnnDemoPublicCandleSelection = (
  symbol: string,
  timeframe: string,
): OrrnnDemoPublicCandleSelection | null => {
  const normalizedSymbol = String(symbol).trim();
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (
    !normalizedSymbol
    || !normalizedTimeframe
    || !resolveOrrnnDemoPublicCandleTimeframe(normalizedTimeframe)
  ) {
    return null;
  }

  return {
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  };
};

export const getOrrnnDemoPublicCandleQueryKey = (
  symbol: string,
  timeframe: string,
) => {
  const selection = resolveOrrnnDemoPublicCandleSelection(symbol, timeframe);
  return candleKeys.history(
    ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
    selection?.symbol ?? '',
    selection?.timeframe ?? '',
  );
};

export const fetchOrrnnDemoPublicCandleSeries = async (
  symbol: string,
  timeframe: string,
  limit = ORRNN_DEMO_PUBLIC_CANDLE_INITIAL_LIMIT,
  signal?: AbortSignal,
): Promise<CandleParams[]> => {
  const selection = resolveOrrnnDemoPublicCandleSelection(symbol, timeframe);
  if (!selection) {
    throw new Error(`Unsupported public candle selection: ${symbol} ${timeframe}.`);
  }

  const response = await getOrrnnDemoPublicCandles(
    selection.symbol,
    selection.timeframe,
    limit,
    signal,
  );
  return normalizeCandleSeries(
    response.candles,
    selection.timeframe,
  ).map((candle) => ({ ...candle, source: 'rest' as const }));
};

export const getOrrnnDemoPublicCandleQueryOptions = (
  symbol: string,
  timeframe: string,
  enabled = true,
) => {
  const selection = resolveOrrnnDemoPublicCandleSelection(symbol, timeframe);

  return queryOptions({
    queryKey: getOrrnnDemoPublicCandleQueryKey(symbol, timeframe),
    queryFn: async ({ signal }): Promise<CandleParams[]> => {
      return fetchOrrnnDemoPublicCandleSeries(
        selection?.symbol ?? symbol,
        selection?.timeframe ?? timeframe,
        ORRNN_DEMO_PUBLIC_CANDLE_INITIAL_LIMIT,
        signal,
      );
    },
    enabled: enabled && Boolean(selection),
    // A hidden public Chart receives exactly the prefetched REST snapshot so it
    // can paint the warmed WebView before the first tap. Only `data` may wake
    // that retained tree; fetch-status churn and the live socket stay gated by
    // route activation in useOrrnnDemoPublicCandles.
    notifyOnChangeProps: enabled ? undefined : ['data'],
    staleTime: ORRNN_DEMO_PUBLIC_CANDLE_STALE_MS,
    gcTime: ORRNN_DEMO_PUBLIC_CANDLE_GC_MS,
    retry: 4,
    retryDelay: (attemptIndex) => PUBLIC_CANDLE_RETRY_DELAYS_MS[
      Math.min(attemptIndex, PUBLIC_CANDLE_RETRY_DELAYS_MS.length - 1)
    ],
  });
};

import type { Candle, MutableCandle } from '../core/candleTypes';
import { bucketCandle } from '../core/candleUtils';
import { materializeCandleMap, sortAndDedupeCandles } from './candleSeriesMerger';
import { areCandlePricesCoherent, isPriceCoherentWithCandle } from './priceCoherence';

const putHistoryCandle = (
  map: Map<number, MutableCandle>,
  candle: Candle,
  timeframe: string,
) => {
  const bucketed = bucketCandle(candle, timeframe);
  if (!bucketed) {
    return;
  }

  const existing = map.get(bucketed.time);
  if (!existing) {
    map.set(bucketed.time, { ...bucketed, source: 'history', closed: true });
    return;
  }

  map.set(bucketed.time, {
    ...existing,
    high: Math.max(existing.high, bucketed.high),
    low: Math.min(existing.low, bucketed.low),
    close: bucketed.close,
    volume: Math.max(existing.volume ?? 0, bucketed.volume ?? 0),
    source: 'history',
    closed: true,
  });
};

const getLiveMetadata = (
  candle: Candle,
  existing?: MutableCandle,
): Partial<MutableCandle> => {
  const runtime = candle as Candle & Partial<MutableCandle>;
  return {
    firstUpdateTime: runtime.firstUpdateTime ?? existing?.firstUpdateTime,
    lastUpdateTime: runtime.lastUpdateTime ?? existing?.lastUpdateTime,
    lastBackendUpdateTime: runtime.lastBackendUpdateTime ?? existing?.lastBackendUpdateTime,
    lastQuoteTime: runtime.lastQuoteTime ?? existing?.lastQuoteTime,
  };
};

const putLiveCandle = (
  map: Map<number, MutableCandle>,
  candle: Candle,
  timeframe: string,
  closedHistoryLastTime?: number | null,
) => {
  const bucketed = bucketCandle(candle, timeframe);
  if (!bucketed) {
    return;
  }
  if (
    typeof closedHistoryLastTime === 'number' &&
    Number.isFinite(closedHistoryLastTime) &&
    bucketed.time <= closedHistoryLastTime
  ) {
    return;
  }

  const existing = map.get(bucketed.time);
  const metadata = getLiveMetadata(candle, existing);
  if (!existing || !areCandlePricesCoherent(existing, bucketed)) {
    map.set(bucketed.time, { ...bucketed, ...metadata, source: 'live_candle', closed: false });
    return;
  }

  map.set(bucketed.time, {
    ...existing,
    ...bucketed,
    ...metadata,
    time: bucketed.time,
    high: Math.max(existing.high, bucketed.high, bucketed.open, bucketed.close),
    low: Math.min(existing.low, bucketed.low, bucketed.open, bucketed.close),
    volume: Math.max(existing.volume ?? 0, bucketed.volume ?? 0),
    source: 'live_candle',
    closed: false,
  });
};

export const buildFreshHistoryLiveCandleSeries = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  timeframe: string,
  limit?: number,
  options: { closedHistoryLastTime?: number | null; preserveProvenance?: boolean } = {},
): Candle[] => {
  const map = new Map<number, MutableCandle>();

  for (const candle of sortAndDedupeCandles(historyCandles)) {
    putHistoryCandle(map, candle, timeframe);
  }

  for (const candle of sortAndDedupeCandles(liveCandles)) {
    putLiveCandle(map, candle, timeframe, options.closedHistoryLastTime);
  }

  return materializeCandleMap(map, limit, { preserveMetadata: options.preserveProvenance === true });
};

export const materializeLiveCandleMap = (
  liveCandleMap: Map<number, MutableCandle>,
  closedHistoryLastTime: number | null,
  options: { preserveProvenance?: boolean } = {},
): Candle[] => {
  const liveCandles = materializeCandleMap(liveCandleMap, undefined, {
    preserveMetadata: options.preserveProvenance === true,
  });
  if (closedHistoryLastTime === null) {
    return liveCandles;
  }

  return liveCandles.filter((candle) => candle.time > closedHistoryLastTime);
};

/**
 * Live→history finalization stability.
 *
 * A forming candle is built from backend live OHLC snapshots, so it shows broker
 * wicks while live. When the backend's closed-history cutoff advances past that bucket, the
 * live candle is pruned and the bucket is owned by the authoritative REST/WS
 * history candle. If that history candle's range is NARROWER than what was shown
 * live (e.g. while the `/ws/v2` finalized-candle channel is degraded), the candle
 * visibly loses its wick / changes shape the instant it finalizes.
 *
 * This folds the observed live high/low into the matching history candle BEFORE
 * the live candle is pruned, so a finalized candle never renders a narrower range
 * than it did at the last moment of formation. It is intentionally conservative:
 *   - widen-only: high = max, low = min (never narrows authoritative data);
 *   - open/close are left untouched (the broker's values stay authoritative);
 *   - the live extreme is only folded when it is price-coherent with the history
 *     candle, so a single incoherent live snapshot cannot inject a giant fake wick;
 *   - same price basis (both bid), so no basis-mixing.
 * When the backend is healthy its candle already covers the live range, so
 * max/min is a no-op — there is no regression.
 */
export const foldCoveredLiveExtremesIntoHistory = (
  historyCandles: readonly Candle[],
  liveCandleMap: Map<number, MutableCandle>,
  closedHistoryLastTime: number | null,
  timeframe: string,
): Candle[] => {
  if (closedHistoryLastTime === null || liveCandleMap.size === 0) {
    return historyCandles as Candle[];
  }

  // bucket-aligned time -> index in historyCandles
  const indexByBucket = new Map<number, number>();
  historyCandles.forEach((candle, index) => {
    const bucketed = bucketCandle(candle, timeframe);
    if (bucketed) {
      indexByBucket.set(bucketed.time, index);
    }
  });

  let result: Candle[] | null = null;
  for (const [time, live] of liveCandleMap.entries()) {
    if (time > closedHistoryLastTime) {
      continue; // still live — not yet finalized into history
    }
    const index = indexByBucket.get(time);
    if (index === undefined) {
      continue; // history has no candle for this bucket (genuine gap) — leave it
    }
    const target = (result ?? historyCandles)[index];
    // Fold each extreme independently and only when it is price-coherent with the
    // authoritative candle, so a single incoherent live snapshot on one side cannot
    // inject a giant fake wick — yet a genuine extreme on the other side is kept.
    const mergedHigh = isPriceCoherentWithCandle(target, live.high)
      ? Math.max(target.high, live.high)
      : target.high;
    const mergedLow = isPriceCoherentWithCandle(target, live.low)
      ? Math.min(target.low, live.low)
      : target.low;
    if (mergedHigh === target.high && mergedLow === target.low) {
      continue; // authoritative candle already covers the observed range
    }
    if (!result) {
      result = historyCandles.slice();
    }
    result[index] = { ...target, high: mergedHigh, low: mergedLow };
  }

  return result ?? (historyCandles as Candle[]);
};

export const pruneLiveCandleMapCoveredByHistory = (
  liveCandleMap: Map<number, MutableCandle>,
  closedHistoryLastTime: number | null,
): Map<number, MutableCandle> => {
  if (closedHistoryLastTime === null) {
    return new Map(liveCandleMap);
  }

  const next = new Map<number, MutableCandle>();
  for (const [time, candle] of liveCandleMap.entries()) {
    if (time > closedHistoryLastTime) {
      next.set(time, { ...candle });
    }
  }
  return next;
};

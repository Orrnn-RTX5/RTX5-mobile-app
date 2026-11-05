import type { Candle, LiveCandle, MutableCandle } from '../core/candleTypes';
import {
  getBucketStart,
  getExpectedNextCandleTime,
  normalizeTimestampToSeconds,
} from '../core/timeframeUtils';
import { validateCandle } from '../core/candleValidator';
import {
  areCandleValuesEqual,
  bucketCandle,
  toPublicCandle,
} from '../core/candleUtils';
import { isPriceCoherentWithCandle } from './priceCoherence';

export type ApplyCandleOptions = {
  historyCutoffTime?: number | null;
};

export type ApplyCandleResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
};

export type ApplyQuoteTickExtensionOptions = {
  historyCutoffTime?: number | null;
  latestHistoryCandle?: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'> | null;
  /** False when receipt-time fallback cannot prove that a flat boundary quote is fresh. */
  allowFlatNewBucket?: boolean;
};

export type ApplyQuoteTickExtensionResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
};

const getMapTailTime = (candleMap: Map<number, MutableCandle>): number | null => {
  let tail: number | null = null;
  for (const time of candleMap.keys()) {
    if (tail === null || time > tail) {
      tail = time;
    }
  }
  return tail;
};

const getLatestKnownBucket = (...times: Array<number | null>): number | null =>
  times
    .filter((time): time is number => typeof time === 'number' && Number.isFinite(time))
    .reduce<number | null>((latest, time) => (latest === null || time > latest ? time : latest), null);

const finiteOrNull = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const arePricesEffectivelyEqual = (left: number, right: number): boolean => {
  const tolerance = Math.max(Math.abs(left), Math.abs(right), 1) * 1e-12;
  return Math.abs(left - right) <= tolerance;
};

const getLastBackendUpdateTime = (candle: MutableCandle | undefined): number | null => {
  if (!candle) {
    return null;
  }
  return finiteOrNull(candle.lastBackendUpdateTime) ?? (
    candle.lastQuoteTime === undefined ? finiteOrNull(candle.lastUpdateTime) : null
  );
};

const getLastRealtimeUpdateTime = (candle: MutableCandle | undefined): number | null => {
  if (!candle) {
    return null;
  }
  const backendTime = getLastBackendUpdateTime(candle);
  const quoteTime = finiteOrNull(candle.lastQuoteTime);
  if (backendTime === null) {
    return quoteTime;
  }
  if (quoteTime === null) {
    return backendTime;
  }
  return Math.max(backendTime, quoteTime);
};

const seedFromTick = (bucketStart: number, price: number): MutableCandle => ({
  time: bucketStart,
  open: price,
  high: price,
  low: price,
  close: price,
  volume: 0,
  source: 'live_candle',
  closed: false,
});

const seedFromHistoryBucket = (
  bucketStart: number,
  historyCandle: Pick<Candle, 'open' | 'high' | 'low' | 'close' | 'volume'>,
  price: number,
): MutableCandle => ({
  time: bucketStart,
  open: historyCandle.open,
  high: Math.max(historyCandle.high, historyCandle.open, historyCandle.close, price),
  low: Math.min(historyCandle.low, historyCandle.open, historyCandle.close, price),
  close: price,
  volume: historyCandle.volume ?? 0,
  source: 'live_candle',
  closed: false,
});

export const applyLiveCandleToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  liveCandle: LiveCandle,
  timeframe?: string,
  options: ApplyCandleOptions = {},
): ApplyCandleResult => {
  const incoming = bucketCandle(liveCandle, timeframe);
  if (!incoming) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_live_candle' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && incoming.time <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const existing = candleMap.get(incoming.time);
  const isClosingSnapshot = liveCandle.closed === true;
  if (existing?.source === 'live_candle' && existing.closed === true && !isClosingSnapshot) {
    return { candle: toPublicCandle(existing), changed: false, ignored: true, reason: 'closed_live_candle' };
  }

  const eventTime =
    finiteOrNull(liveCandle.updateTime) ??
    normalizeTimestampToSeconds(liveCandle.time) ??
    incoming.time;
  const lastQuoteUpdateTime = finiteOrNull(existing?.lastQuoteTime);
  if (
    existing?.source === 'live_candle' &&
    lastQuoteUpdateTime !== null &&
    eventTime < lastQuoteUpdateTime
  ) {
    return {
      candle: toPublicCandle(existing),
      changed: false,
      ignored: true,
      reason: 'stale_server_candle_after_quote',
    };
  }
  if (existing && areCandleValuesEqual(toPublicCandle(existing), incoming)) {
    const next: MutableCandle = {
      ...existing,
      source: 'live_candle',
      closed: liveCandle.closed ?? existing.closed ?? false,
      firstUpdateTime: existing.firstUpdateTime ?? eventTime,
      lastUpdateTime: Math.max(existing.lastUpdateTime ?? eventTime, eventTime),
      lastBackendUpdateTime: Math.max(existing.lastBackendUpdateTime ?? eventTime, eventTime),
      lastQuoteTime: existing.lastQuoteTime,
    };
    candleMap.set(incoming.time, next);
    return {
      candle: toPublicCandle(next),
      changed:
        existing.source !== next.source ||
        existing.closed !== next.closed ||
        existing.firstUpdateTime !== next.firstUpdateTime ||
        existing.lastUpdateTime !== next.lastUpdateTime ||
        existing.lastBackendUpdateTime !== next.lastBackendUpdateTime,
      ignored: false,
    };
  }

  const lastBackendUpdateTime = getLastBackendUpdateTime(existing);
  const outOfOrderSameBucket =
    existing?.source === 'live_candle' &&
    lastBackendUpdateTime !== null &&
    eventTime < lastBackendUpdateTime;

  let next: MutableCandle;
  if (!existing || existing.source === 'history' || isClosingSnapshot) {
    next = {
      ...incoming,
      source: 'live_candle',
      closed: liveCandle.closed ?? false,
      firstUpdateTime: existing?.firstUpdateTime ?? eventTime,
      lastUpdateTime: eventTime,
      lastBackendUpdateTime: eventTime,
      lastQuoteTime: existing?.lastQuoteTime,
    };
  } else if (outOfOrderSameBucket) {
    next = {
      time: incoming.time,
      open: existing.open,
      high: Math.max(existing.high, incoming.high, incoming.open, incoming.close, existing.open, existing.close),
      low: Math.min(existing.low, incoming.low, incoming.open, incoming.close, existing.open, existing.close),
      close: existing.close,
      volume: Math.max(existing.volume ?? 0, incoming.volume ?? 0),
      source: 'live_candle',
      closed: existing.closed ?? false,
      firstUpdateTime: Math.min(existing.firstUpdateTime ?? eventTime, eventTime),
      lastUpdateTime: existing.lastUpdateTime,
      lastBackendUpdateTime: existing.lastBackendUpdateTime,
      lastQuoteTime: existing.lastQuoteTime,
    };
  } else {
    next = {
      ...incoming,
      source: 'live_candle',
      closed: false,
      firstUpdateTime: Math.min(existing.firstUpdateTime ?? eventTime, eventTime),
      lastUpdateTime: eventTime,
      lastBackendUpdateTime: eventTime,
      lastQuoteTime: existing.lastQuoteTime,
    };
  }

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_live_candle' };
  }

  candleMap.set(incoming.time, next);
  const result: ApplyCandleResult = {
    candle: toPublicCandle(next),
    changed: !existing || !areCandleValuesEqual(toPublicCandle(existing), toPublicCandle(next)),
    ignored: false,
  };
  if (outOfOrderSameBucket) {
    result.reason = 'merged_out_of_order_live_candle';
  }
  return result;
};

export const applyQuoteTickExtensionToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  tick: {
    price: number;
    time: unknown;
    volume?: number | null;
    high?: number | null;
    low?: number | null;
  },
  timeframe: string,
  options: ApplyQuoteTickExtensionOptions = {},
): ApplyQuoteTickExtensionResult => {
  if (!Number.isFinite(tick.price) || tick.price <= 0) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_price' };
  }

  const tickTime = normalizeTimestampToSeconds(tick.time);
  if (tickTime === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_timestamp' };
  }

  const tickHigh = Number.isFinite(tick.high) && (tick.high as number) > 0
    ? Math.max(tick.price, tick.high as number)
    : tick.price;
  const tickLow = Number.isFinite(tick.low) && (tick.low as number) > 0
    ? Math.min(tick.price, tick.low as number)
    : tick.price;

  const bucketStart = getBucketStart(tickTime, timeframe);
  if (bucketStart === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_bucket' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && bucketStart <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const hadExistingBucket = candleMap.has(bucketStart);
  let existing = candleMap.get(bucketStart);
  if (existing?.closed === true) {
    return { candle: toPublicCandle(existing), changed: false, ignored: true, reason: 'closed_live_candle' };
  }
  const hasPositiveTickVolume =
    typeof tick.volume === 'number' && Number.isFinite(tick.volume) && tick.volume > 0;
  const lastRealtimeUpdateTime = getLastRealtimeUpdateTime(existing);
  // Same-second quote bursts must still update OHLC. Only reject strictly older
  // feed clocks so the forming candle does not freeze into a flat line.
  if (
    existing?.source === 'live_candle' &&
    lastRealtimeUpdateTime !== null &&
    tickTime < lastRealtimeUpdateTime
  ) {
    return { candle: toPublicCandle(existing), changed: false, ignored: true, reason: 'stale_quote_tick' };
  }

  if (!existing) {
    const restTail = options.latestHistoryCandle ?? null;
    const restTailBucket = restTail ? (getBucketStart(restTail.time, timeframe) ?? restTail.time) : null;
    const liveTailTime = getMapTailTime(candleMap);
    const latestKnownBucket = getLatestKnownBucket(restTailBucket, liveTailTime);
    const latestKnownCandle =
      liveTailTime !== null && liveTailTime === latestKnownBucket
        ? candleMap.get(liveTailTime)
        : restTailBucket !== null && restTailBucket === latestKnownBucket
          ? restTail
          : null;

    if (
      options.allowFlatNewBucket === false &&
      latestKnownBucket !== null &&
      bucketStart > latestKnownBucket &&
      latestKnownCandle &&
      !hasPositiveTickVolume &&
      arePricesEffectivelyEqual(latestKnownCandle.close, tick.price) &&
      arePricesEffectivelyEqual(latestKnownCandle.high, tickHigh) &&
      arePricesEffectivelyEqual(latestKnownCandle.low, tickLow)
    ) {
      return {
        candle: toPublicCandle(latestKnownCandle),
        changed: false,
        ignored: true,
        reason: 'untrusted_flat_quote_after_tail',
      };
    }

    if (restTail && restTailBucket === bucketStart) {
      if (!isPriceCoherentWithCandle(restTail, tick.price)) {
        existing = seedFromTick(bucketStart, tick.price);
      } else {
        existing = seedFromHistoryBucket(bucketStart, restTail, tick.price);
      }
      existing = {
        ...existing,
        high: Math.max(existing.high, tickHigh),
        low: Math.min(existing.low, tickLow),
        close: tick.price,
      };
    } else if (latestKnownBucket !== null && bucketStart < latestKnownBucket) {
      return {
        candle: null,
        changed: false,
        ignored: true,
        reason: restTailBucket !== null && restTailBucket > bucketStart
          ? 'tick_older_than_history'
          : 'tick_older_than_live_tail',
      };
    } else if (latestKnownBucket !== null && bucketStart === getExpectedNextCandleTime(latestKnownBucket, timeframe)) {
      // A timeframe boundary does not itself create price movement. The first
      // accepted tick owns the new candle's open, matching standard tick-built
      // OHLC semantics: O=H=L=C=tick price until a later Bid tick moves it.
      existing = seedFromTick(bucketStart, tick.price);
      existing = {
        ...existing,
        high: Math.max(existing.high, tickHigh),
        low: Math.min(existing.low, tickLow),
        close: tick.price,
      };
    } else if (latestKnownBucket === null) {
      existing = {
        ...seedFromTick(bucketStart, tick.price),
        high: tickHigh,
        low: tickLow,
      };
    } else {
      // The backend candle channel may be behind the quote feed by several
      // buckets. Do not fabricate the missing buckets; open only the current
      // tick bucket so the chart keeps forming live while preserving the gap.
      existing = {
        ...seedFromTick(bucketStart, tick.price),
        high: tickHigh,
        low: tickLow,
      };
    }
  }

  // Do not invent tick volume when the broker did not send volume. Besides
  // being synthetic data, a fabricated +1 made identical Bid heartbeats report
  // a candle change and schedule a paint even though OHLC had not moved.
  const volumeContribution = hasPositiveTickVolume ? tick.volume as number : 0;
  const next: MutableCandle = {
    ...existing,
    high: Math.max(existing.high, tickHigh, tick.price),
    low: Math.min(existing.low, tickLow, tick.price),
    close: tick.price,
    volume: (existing.volume ?? 0) + volumeContribution,
    source: 'live_candle',
    closed: false,
    firstUpdateTime:
      existing.firstUpdateTime === undefined
        ? tickTime
        : Math.min(existing.firstUpdateTime, tickTime),
    lastUpdateTime: Math.max(existing.lastUpdateTime ?? tickTime, tickTime),
    lastQuoteTime: Math.max(existing.lastQuoteTime ?? tickTime, tickTime),
  };

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_tick' };
  }

  candleMap.set(bucketStart, next);
  return {
    candle: toPublicCandle(next),
    changed: !hadExistingBucket ||
      next.high !== existing.high ||
      next.low !== existing.low ||
      next.close !== existing.close ||
      next.volume !== existing.volume,
    ignored: false,
  };
};

import { normalizeQuoteTickTimestampToMs } from '../../api/ws/quoteTimestamp';
import type { Candle } from '../../domain/candles/core/candleTypes';
import { getBucketStart, normalizeTimeframe } from '../../domain/candles/core/timeframeUtils';
import type { ExactChartQuoteSnapshot } from './exactChartQuote';

const FRESH_FEED_CLOCK_WINDOW_MS = 5_000;

export type ChartLiveTickAccumulator = Readonly<{
  contextKey: string;
  timeframe: string;
  quoteOrderMs: number | null;
  quoteMonotonicOrderMs: number | null;
  candle: Candle;
  bid: number;
}>;

type AccumulateChartBidTickInput = {
  contextKey: string;
  timeframe: string;
  canonicalTail?: Candle | null;
  quote: ExactChartQuoteSnapshot;
};

export type ChartLiveTickProjection = Readonly<{
  candles: Candle[];
  activeCandle: Candle | null;
  usedAccumulator: boolean;
  quoteOnlyBootstrap: boolean;
}>;

const getQuoteOrderMs = (quote: ExactChartQuoteSnapshot): number | null =>
  normalizeQuoteTickTimestampToMs(quote.receivedAt) ??
  normalizeQuoteTickTimestampToMs(quote.feedTickAt);

const getQuoteMonotonicOrderMs = (quote: ExactChartQuoteSnapshot): number | null =>
  typeof quote.receiptMonotonicAt === 'number' &&
  Number.isFinite(quote.receiptMonotonicAt) &&
  quote.receiptMonotonicAt > 0
    ? quote.receiptMonotonicAt
    : null;

const getQuoteCandleTimeMs = (quote: ExactChartQuoteSnapshot): number | null => {
  const receivedAtMs = normalizeQuoteTickTimestampToMs(quote.receivedAt);
  const feedTickAtMs = normalizeQuoteTickTimestampToMs(quote.feedTickAt);
  if (
    feedTickAtMs !== null &&
    (receivedAtMs === null || Math.abs(receivedAtMs - feedTickAtMs) <= FRESH_FEED_CLOCK_WINDOW_MS)
  ) {
    return feedTickAtMs;
  }
  return receivedAtMs ?? feedTickAtMs;
};

const makeTickCandle = (time: number, bid: number): Candle => ({
  time,
  open: bid,
  high: bid,
  low: bid,
  close: bid,
  volume: 0,
});

const mergeBidIntoCandle = (
  base: Candle,
  bid: number,
  canonicalTail?: Candle | null,
): Candle => {
  const sameBucketTail = canonicalTail?.time === base.time ? canonicalTail : null;
  return {
    time: base.time,
    // A history/candle frame can arrive after quote-only public traffic has
    // already opened this bucket locally. Once available, its canonical open
    // is authoritative; Bid still owns only the forming close.
    open: sameBucketTail?.open ?? base.open,
    high: Math.max(base.high, sameBucketTail?.high ?? base.high, bid),
    low: Math.min(base.low, sameBucketTail?.low ?? base.low, bid),
    close: bid,
    volume: Math.max(base.volume ?? 0, sameBucketTail?.volume ?? 0),
  };
};

/**
 * Synchronously projects one normalized backend Bid into the selected forming
 * candle. The context key already contains cache namespace/account, symbol,
 * and timeframe, so this path is independent of broker names and transports.
 */
export const accumulateChartBidTick = (
  previous: ChartLiveTickAccumulator | null | undefined,
  input: AccumulateChartBidTickInput,
): ChartLiveTickAccumulator | null => {
  const contextKey = input.contextKey.trim();
  const timeframe = normalizeTimeframe(input.timeframe);
  const bid = input.quote.bid;
  if (!contextKey || !Number.isFinite(bid) || bid <= 0) {
    return previous ?? null;
  }

  const quoteTimeMs = getQuoteCandleTimeMs(input.quote);
  let bucketTime = quoteTimeMs === null ? null : getBucketStart(quoteTimeMs, timeframe);
  if (bucketTime === null) {
    return previous?.contextKey === contextKey ? previous : null;
  }

  const receiptBucketTime = getBucketStart(input.quote.receivedAt, timeframe);
  const currentKnownBucket =
    input.canonicalTail?.time ??
    (previous?.contextKey === contextKey ? previous.candle.time : null);
  if (
    currentKnownBucket !== null &&
    currentKnownBucket > bucketTime &&
    receiptBucketTime === currentKnownBucket
  ) {
    // Near rollover, an otherwise-fresh broker timestamp can still trail the
    // locally received/canonical bucket by a few seconds. Once the canonical
    // series has opened that bucket, keep accepting newer Bids into it instead
    // of freezing the marker until the feed clock crosses the boundary.
    bucketTime = currentKnownBucket;
  }

  const sameContext =
    previous?.contextKey === contextKey && previous.timeframe === timeframe;
  const quoteOrderMs = getQuoteOrderMs(input.quote);
  const quoteMonotonicOrderMs = getQuoteMonotonicOrderMs(input.quote);
  const bothHaveMonotonicOrder =
    previous?.quoteMonotonicOrderMs !== null &&
    previous?.quoteMonotonicOrderMs !== undefined &&
    quoteMonotonicOrderMs !== null;
  const isOlderQuote = sameContext && (
    bothHaveMonotonicOrder
      ? quoteMonotonicOrderMs < previous.quoteMonotonicOrderMs!
      : previous?.quoteOrderMs !== null &&
        previous?.quoteOrderMs !== undefined &&
        (quoteOrderMs === null || quoteOrderMs < previous.quoteOrderMs)
  );
  if (isOlderQuote) {
    return previous;
  }

  if (sameContext && previous && bucketTime < previous.candle.time) {
    return previous;
  }
  if (input.canonicalTail && input.canonicalTail.time > bucketTime) {
    return sameContext ? previous ?? null : null;
  }

  let base: Candle;
  if (sameContext && previous?.candle.time === bucketTime) {
    base = previous.candle;
  } else if (input.canonicalTail?.time === bucketTime) {
    base = input.canonicalTail;
  } else {
    base = makeTickCandle(bucketTime, bid);
  }

  return {
    contextKey,
    timeframe,
    quoteOrderMs,
    quoteMonotonicOrderMs,
    candle: mergeBidIntoCandle(base, bid, input.canonicalTail),
    bid,
  };
};

/** Build the exact series sent to the WebView without mutating canonical data. */
export const projectChartLiveTickCandles = (
  canonicalCandles: readonly Candle[],
  accumulator: ChartLiveTickAccumulator | null | undefined,
  contextKey: string,
): ChartLiveTickProjection => {
  if (!accumulator || accumulator.contextKey !== contextKey) {
    const candles = canonicalCandles as Candle[];
    return {
      candles,
      activeCandle: candles[candles.length - 1] ?? null,
      usedAccumulator: false,
      quoteOnlyBootstrap: false,
    };
  }

  const accumulated = accumulator.candle;
  if (canonicalCandles.length === 0) {
    return {
      candles: [accumulated],
      activeCandle: accumulated,
      usedAccumulator: true,
      quoteOnlyBootstrap: true,
    };
  }

  const tail = canonicalCandles[canonicalCandles.length - 1];
  if (tail.time > accumulated.time) {
    const candles = canonicalCandles as Candle[];
    return { candles, activeCandle: tail, usedAccumulator: false, quoteOnlyBootstrap: false };
  }

  if (tail.time < accumulated.time) {
    const candles = [...canonicalCandles, accumulated];
    return { candles, activeCandle: accumulated, usedAccumulator: true, quoteOnlyBootstrap: false };
  }

  const merged: Candle = {
    time: accumulated.time,
    open: tail.open,
    high: Math.max(accumulated.high, tail.high, accumulator.bid),
    low: Math.min(accumulated.low, tail.low, accumulator.bid),
    close: accumulator.bid,
    volume: Math.max(accumulated.volume ?? 0, tail.volume ?? 0),
  };
  const candles = [...canonicalCandles.slice(0, -1), merged];
  return { candles, activeCandle: merged, usedAccumulator: true, quoteOnlyBootstrap: false };
};

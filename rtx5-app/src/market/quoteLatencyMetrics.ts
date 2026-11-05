/**
 * Session-scoped, aggregate-only latency diagnostics for live quote delivery.
 *
 * This module deliberately never accepts or exports broker, account, symbol,
 * URL, or credential values. A caller-provided opaque session key is used only
 * to detect an epoch switch and is never included in diagnostics.
 */

export type QuoteLatencyStage =
  | 'sourceToReceipt'
  | 'receiptToCache'
  | 'cacheToVisibleRow'
  | 'receiptToVisibleRow'
  | 'sourceToVisibleRow';

export type QuoteLatencyPercentiles = Readonly<{
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}>;

export type QuoteLatencyMetricsSnapshot = Readonly<{
  schemaVersion: 1;
  sessionActive: boolean;
  sampleCapacityPerStage: number;
  pendingVisibilitySamples: number;
  rejectedSampleCount: number;
  liveCacheCommitCount: number;
  quoteListCommitCount: number;
  stages: Readonly<Record<QuoteLatencyStage, QuoteLatencyPercentiles>>;
}>;

export type QuoteCacheCommitTiming = Readonly<{
  sessionKey: string;
  updateSeq: number;
  sourceTimestampMs?: number;
  receivedTimestampMs: number;
  receiptMonotonicTimestampMs?: number;
  cacheTimestampMs?: number;
  cacheMonotonicTimestampMs?: number;
}>;

export type QuoteRowVisibleTiming = Readonly<{
  sessionKey: string;
  updateSeq: number;
  visibleMonotonicTimestampMs?: number;
}>;

/** A storage bound, not a performance target or release SLO. */
export const QUOTE_LATENCY_SAMPLE_CAPACITY = 512;

// Reject deltas large enough to indicate incompatible clocks/corrupt input.
// This is a data-quality guard only; it is not an application latency target.
const MAX_VALID_CLOCK_DELTA_MS = 24 * 60 * 60 * 1_000;

class BoundedSamples {
  private readonly values = new Array<number>(QUOTE_LATENCY_SAMPLE_CAPACITY);
  private count = 0;
  private nextIndex = 0;

  public push(value: number): void {
    this.values[this.nextIndex] = value;
    this.nextIndex = (this.nextIndex + 1) % QUOTE_LATENCY_SAMPLE_CAPACITY;
    this.count = Math.min(this.count + 1, QUOTE_LATENCY_SAMPLE_CAPACITY);
  }

  public clear(): void {
    this.count = 0;
    this.nextIndex = 0;
  }

  public toArray(): number[] {
    if (this.count < QUOTE_LATENCY_SAMPLE_CAPACITY) {
      return this.values.slice(0, this.count);
    }
    return [
      ...this.values.slice(this.nextIndex),
      ...this.values.slice(0, this.nextIndex),
    ];
  }
}

type PendingVisibilityTiming = Readonly<{
  cacheMonotonicTimestampMs: number;
  receiptToCacheMs?: number;
  sourceToCacheMs?: number;
}>;

const samples: Record<QuoteLatencyStage, BoundedSamples> = {
  sourceToReceipt: new BoundedSamples(),
  receiptToCache: new BoundedSamples(),
  cacheToVisibleRow: new BoundedSamples(),
  receiptToVisibleRow: new BoundedSamples(),
  sourceToVisibleRow: new BoundedSamples(),
};

const pendingVisibilityByUpdateSeq = new Map<number, PendingVisibilityTiming>();
let activeSessionKey = '';
let rejectedSampleCount = 0;
let liveCacheCommitCount = 0;
let quoteListCommitCount = 0;

export const quoteLatencyMonotonicNow = (): number => {
  const performanceNow = globalThis.performance?.now;
  if (typeof performanceNow === 'function') {
    return performanceNow.call(globalThis.performance);
  }
  return Date.now();
};

const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const validDelta = (end: number, start: number): number | null => {
  if (!isValidTimestamp(end) || !isValidTimestamp(start)) {
    return null;
  }
  const delta = end - start;
  return delta >= 0 && delta <= MAX_VALID_CLOCK_DELTA_MS ? delta : null;
};

const addSample = (stage: QuoteLatencyStage, value: number | null): boolean => {
  if (value === null || !Number.isFinite(value) || value < 0) {
    rejectedSampleCount += 1;
    return false;
  }
  samples[stage].push(value);
  return true;
};

const clearSamples = (): void => {
  (Object.keys(samples) as QuoteLatencyStage[]).forEach((stage) => samples[stage].clear());
  pendingVisibilityByUpdateSeq.clear();
  rejectedSampleCount = 0;
  liveCacheCommitCount = 0;
  quoteListCommitCount = 0;
};

const bindSession = (sessionKey: string): boolean => {
  if (!sessionKey) {
    return false;
  }
  if (activeSessionKey !== sessionKey) {
    clearSamples();
    activeSessionKey = sessionKey;
  }
  return true;
};

const isValidUpdateSeq = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const storePendingVisibility = (
  updateSeq: number,
  timing: PendingVisibilityTiming,
): void => {
  if (pendingVisibilityByUpdateSeq.has(updateSeq)) {
    pendingVisibilityByUpdateSeq.delete(updateSeq);
  }
  pendingVisibilityByUpdateSeq.set(updateSeq, timing);
  while (pendingVisibilityByUpdateSeq.size > QUOTE_LATENCY_SAMPLE_CAPACITY) {
    const oldest = pendingVisibilityByUpdateSeq.keys().next().value as number | undefined;
    if (oldest === undefined) break;
    pendingVisibilityByUpdateSeq.delete(oldest);
  }
};

/** Records one accepted websocket tick after it has been committed to the row cache. */
export const recordQuoteCacheCommit = (timing: QuoteCacheCommitTiming): void => {
  if (!bindSession(timing.sessionKey) || !isValidUpdateSeq(timing.updateSeq)) {
    rejectedSampleCount += 1;
    return;
  }
  liveCacheCommitCount += 1;

  const cacheTimestampMs = timing.cacheTimestampMs ?? Date.now();
  const cacheMonotonicTimestampMs =
    timing.cacheMonotonicTimestampMs ?? quoteLatencyMonotonicNow();

  const monotonicReceiptToCache =
    timing.receiptMonotonicTimestampMs === undefined
      ? null
      : validDelta(cacheMonotonicTimestampMs, timing.receiptMonotonicTimestampMs);
  const wallReceiptToCache = validDelta(cacheTimestampMs, timing.receivedTimestampMs);
  const receiptToCacheMs = monotonicReceiptToCache ?? wallReceiptToCache;
  const receiptRecorded = addSample('receiptToCache', receiptToCacheMs);

  const sourceToReceiptMs =
    timing.sourceTimestampMs === undefined
      ? null
      : validDelta(timing.receivedTimestampMs, timing.sourceTimestampMs);
  const sourceRecorded =
    timing.sourceTimestampMs === undefined
      ? false
      : addSample('sourceToReceipt', sourceToReceiptMs);

  storePendingVisibility(timing.updateSeq, {
    cacheMonotonicTimestampMs,
    ...(receiptRecorded ? { receiptToCacheMs: receiptToCacheMs as number } : {}),
    ...(sourceRecorded && receiptRecorded
      ? { sourceToCacheMs: (sourceToReceiptMs as number) + (receiptToCacheMs as number) }
      : {}),
  });
};

/** Counts committed QuotesScreen list renders without creating a React subscription. */
export const recordQuoteListCommit = (sessionKey: string): void => {
  if (sessionKey && sessionKey === activeSessionKey) {
    quoteListCommitCount += 1;
  }
};

/** Records the first animation frame after a row observes a new cache update sequence. */
export const recordQuoteRowVisible = (timing: QuoteRowVisibleTiming): void => {
  if (!timing.sessionKey || timing.sessionKey !== activeSessionKey) {
    return;
  }
  if (!isValidUpdateSeq(timing.updateSeq)) {
    rejectedSampleCount += 1;
    return;
  }
  const pending = pendingVisibilityByUpdateSeq.get(timing.updateSeq);
  if (!pending) {
    return;
  }
  pendingVisibilityByUpdateSeq.delete(timing.updateSeq);

  const visibleAt = timing.visibleMonotonicTimestampMs ?? quoteLatencyMonotonicNow();
  const cacheToVisibleMs = validDelta(visibleAt, pending.cacheMonotonicTimestampMs);
  if (!addSample('cacheToVisibleRow', cacheToVisibleMs)) {
    return;
  }
  if (pending.receiptToCacheMs !== undefined) {
    addSample('receiptToVisibleRow', pending.receiptToCacheMs + (cacheToVisibleMs as number));
  }
  if (pending.sourceToCacheMs !== undefined) {
    addSample('sourceToVisibleRow', pending.sourceToCacheMs + (cacheToVisibleMs as number));
  }
};

const percentile = (sorted: readonly number[], rank: number): number | null => {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(rank * sorted.length) - 1);
  return Math.round(sorted[index] * 1_000) / 1_000;
};

const summarize = (stage: QuoteLatencyStage): QuoteLatencyPercentiles => {
  const sorted = samples[stage].toArray().sort((a, b) => a - b);
  return Object.freeze({
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  });
};

/** Returns aggregate-only diagnostics; session identity and per-symbol data are never exposed. */
export const getQuoteLatencyMetricsSnapshot = (): QuoteLatencyMetricsSnapshot =>
  Object.freeze({
    schemaVersion: 1,
    sessionActive: Boolean(activeSessionKey),
    sampleCapacityPerStage: QUOTE_LATENCY_SAMPLE_CAPACITY,
    pendingVisibilitySamples: pendingVisibilityByUpdateSeq.size,
    rejectedSampleCount,
    liveCacheCommitCount,
    quoteListCommitCount,
    stages: Object.freeze({
      sourceToReceipt: summarize('sourceToReceipt'),
      receiptToCache: summarize('receiptToCache'),
      cacheToVisibleRow: summarize('cacheToVisibleRow'),
      receiptToVisibleRow: summarize('receiptToVisibleRow'),
      sourceToVisibleRow: summarize('sourceToVisibleRow'),
    }),
  });

/** Clears all aggregates and the opaque session binding on logout/epoch transition. */
export const resetQuoteLatencyMetrics = (): void => {
  clearSamples();
  activeSessionKey = '';
};

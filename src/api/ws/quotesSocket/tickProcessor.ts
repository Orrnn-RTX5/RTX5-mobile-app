/**
 * Tick processing extracted from `QuotesWebSocketService` to keep the service
 * class under the 500-line ceiling.
 *
 * `processIncomingPayload` does the upstream-shape demux (array vs object vs
 * nested `data`); `processTick` does the heavy work: normalize the wire-shape
 * tick, fan it out to quote listeners and the candle stream, and stage the
 * merged record into `pendingUpdates` for the next flush. Both depend on a small
 * `TickProcessorBridge` interface so they can be unit-tested without the full
 * service.
 */
import { liveCandleStream } from '../../../domain/candles/stream/liveCandleStream';
import {
  extractCandlePayloadContext,
  getCandlePayloadItems,
  hasBackendCandleShape,
} from '../../../domain/candles/ws/candlesSocketProtocol';
import { shouldRouteBackendCandlePayloads } from '../../../domain/candles/ws/liveCandlesEnginePolicy';
import { isCryptoSymbol } from '../../../domain/symbols';
import { quoteLatencyMonotonicNow } from '../../../market/quoteLatencyMetrics';
import { recordMarketDataEvent } from '../../../market/marketDataTelemetry';
import { normalizeQuoteTickPayload } from '../quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from '../quoteTimestamp';
import type { QuoteTickEvent } from '../quoteTickNormalizer';
import type { NormalizedQuoteFeedUpdate } from '../quoteTickNormalizer';

export interface TickProcessorBridge {
  readonly pendingUpdates: Map<string, any>;
  emitTick(tick: QuoteTickEvent): void;
  emitSymbolTick(symbol: string, tick: QuoteTickEvent): void;
  shouldStageQuoteUpdate(): boolean;
  logCandleFeed(event: string, details?: Record<string, unknown>, limit?: number): void;
  acceptNormalizedTick?(
    raw: unknown,
    update: NormalizedQuoteFeedUpdate,
    receivedAt: number,
  ): boolean;
  acceptCandlePayload?(raw: unknown): boolean;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const parseJsonStringPayload = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const pickString = (record: Record<string, unknown> | null, keys: readonly string[]): string | null => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const hasNestedCandleEnvelope = (record: Record<string, unknown>): boolean => {
  const data = asRecord(record.data);
  const payload = asRecord(record.payload);
  const result = asRecord(record.result);
  return Boolean(
    record.candle ||
    record.bar ||
    data?.candle ||
    data?.bar ||
    payload?.candle ||
    payload?.bar ||
    result?.candle ||
    result?.bar,
  );
};

/**
 * `/ws/feed` control frames. They carry `symbols` lists or error text but no
 * price, so they must never reach the quote normalizer (which would record
 * them as dropped quotes).
 */
const FEED_CONTROL_FRAME_TYPES = new Set([
  'subscribed',
  'unsubscribed',
  'subscribed_candles',
  'unsubscribed_candles',
  'error',
  'pong',
]);

const getFrameType = (payload: unknown): string => {
  const record = asRecord(payload);
  return typeof record?.type === 'string' ? record.type.trim().toLowerCase() : '';
};

export const isFeedControlFrame = (payload: unknown): boolean =>
  FEED_CONTROL_FRAME_TYPES.has(getFrameType(payload));

/** `{"type":"candle","symbol","tf","open","high","low","close","time",...}` */
export const isFeedCandleFrame = (payload: unknown): boolean =>
  getFrameType(payload) === 'candle' && hasBackendCandleShape(payload);

const isFeedSnapshotFrame = (record: Record<string, unknown>): boolean =>
  getFrameType(record) === 'snapshot' && Array.isArray(record.symbols);

const isExplicitCandlePayload = (payload: unknown): boolean => {
  const record = asRecord(payload);
  if (!record) {
    return false;
  }

  const channel = pickString(record, ['channel', 'topic', 'stream']);
  if (channel && /(?:^|[.:/])candles?(?:[.:/]|$)/i.test(channel)) {
    return true;
  }

  if (hasNestedCandleEnvelope(record)) {
    return true;
  }

  const type = pickString(record, ['type', 'event', 'name']);
  return Boolean(
    type &&
    /^(?:update|candle|bar|ohlc|candle\.update|candles\.update)$/i.test(type) &&
    hasBackendCandleShape(record),
  );
};

const mergeCandleEnvelopeContext = (
  payload: unknown,
  item: unknown,
  symbol: string | null,
  tf: string | null,
): unknown => {
  const itemRecord = asRecord(item);
  if (!itemRecord) {
    return item;
  }

  const payloadRecord = asRecord(payload);
  return {
    ...(payloadRecord?.time === undefined ? {} : { time: payloadRecord.time }),
    ...(payloadRecord?.timestamp === undefined ? {} : { timestamp: payloadRecord.timestamp }),
    ...(payloadRecord?.t === undefined ? {} : { t: payloadRecord.t }),
    ...(payloadRecord?.serverTime === undefined ? {} : { serverTime: payloadRecord.serverTime }),
    ...(payloadRecord?.server_time === undefined ? {} : { server_time: payloadRecord.server_time }),
    ...itemRecord,
    ...(symbol ? { symbol } : {}),
    ...(tf ? { timeframe: tf } : {}),
  };
};

const QUOTE_ENVELOPE_CONTEXT_KEYS = [
  'channel',
  'topic',
  'stream',
  'event',
  'type',
  'time',
  'time_ms',
  'timeMs',
  'timestamp',
  'timestamp_ms',
  'timestampMs',
  't',
  'server_time',
  'server_time_ms',
  'serverTime',
  'serverTimeMs',
  'tick_time',
  'tick_time_ms',
  'tickTime',
  'tickTimeMs',
  'sequence',
  'seq',
  'source_seq',
  'sourceSeq',
  'sequenceId',
  'tick_id',
  'tickId',
  'source_tick_id',
  'sourceTickId',
  'broker_id',
  'brokerId',
  'account_login',
  'accountLogin',
  'session_epoch',
  'sessionEpoch',
] as const;

const mergeQuoteEnvelopeContext = (
  envelope: Record<string, unknown> | null,
  candidate: unknown,
): unknown => {
  const candidateRecord = asRecord(parseJsonStringPayload(candidate));
  if (!candidateRecord || !envelope) {
    return candidateRecord ?? candidate;
  }

  const context: Record<string, unknown> = {};
  for (const key of QUOTE_ENVELOPE_CONTEXT_KEYS) {
    if (envelope[key] !== undefined && candidateRecord[key] === undefined) {
      context[key] = envelope[key];
    }
  }

  return Object.keys(context).length > 0
    ? { ...context, ...candidateRecord }
    : candidateRecord;
};

const routeBackendCandleUpdates = (bridge: TickProcessorBridge, payload: unknown): boolean => {
  if (Array.isArray(payload)) {
    let routedAny = false;
    for (const item of payload) {
      routedAny = routeBackendCandleUpdates(bridge, item) || routedAny;
    }
    return routedAny;
  }
  if (!isExplicitCandlePayload(payload)) {
    return false;
  }

  if (bridge.acceptCandlePayload?.(payload) === false) {
    recordMarketDataEvent('payload_dropped', {
      transport: 'quotes_ws',
      payloadType: 'candle',
      reason: 'identity_mismatch',
    });
    bridge.logCandleFeed('feed_candle_update_dropped_identity_mismatch', undefined, 20);
    return false;
  }

  // `/ws/feed` `{"type":"candle"}` frames answer our own `subscribe_candles`
  // request and are the contract's live-candle source (they fill the gap left
  // by lagging REST history). Other candle shapes stay behind the opt-in flag.
  if (!isFeedCandleFrame(payload) && !shouldRouteBackendCandlePayloads()) {
    bridge.logCandleFeed('feed_candle_update_ignored_unverified', {
      reason: 'server_candle_source_disabled',
    }, 20);
    return false;
  }

  const items = getCandlePayloadItems(payload);
  if (items.length === 0) {
    return false;
  }

  const outerContext = extractCandlePayloadContext(payload);
  let routed = false;

  for (const item of items) {
    if (!hasBackendCandleShape(item)) {
      continue;
    }

    const itemContext = extractCandlePayloadContext(item);
    const symbol = itemContext.symbol ?? outerContext.symbol;
    const tf = itemContext.tf ?? outerContext.tf;
    const routedItem = mergeCandleEnvelopeContext(payload, item, symbol, tf);

    liveCandleStream.ingestLiveCandle(routedItem, symbol ?? undefined, tf ?? undefined);
    bridge.logCandleFeed('feed_candle_update_routed', {
      symbol,
      tf,
    }, 20);
    routed = true;
  }

  return routed;
};

export const processTick = (bridge: TickProcessorBridge, raw: any): boolean => {
  const receivedAt = Date.now();
  const receiptMonotonicAt = quoteLatencyMonotonicNow();
  const normalized = normalizeQuoteTickPayload(raw, receivedAt);
  if (!normalized.ok && normalized.reason === 'no_quote') {
    // Snapshot entry for a symbol the hub has no price for. Not an error.
    return false;
  }
  if (!normalized.ok) {
    recordMarketDataEvent('payload_dropped', {
      transport: 'quotes_ws',
      payloadType: 'quote',
      reason: normalized.reason,
    });
    bridge.logCandleFeed('tick_dropped_before_store', {
      reason: normalized.reason,
      rawKeys: normalized.rawKeys,
    });
    return false;
  }
  if (bridge.acceptNormalizedTick?.(raw, normalized.update, receivedAt) === false) {
    return false;
  }

  const normalizedUpdate = normalized.update;
  const normalizedTimestamp = normalizedUpdate.timestamp;
  const normalizedTimestampMs = normalizeQuoteTickTimestampToMs(normalizedTimestamp);
  const sourceTimestampMs = normalizedUpdate.timestampSource === 'feed'
    ? normalizedTimestampMs ?? undefined
    : undefined;
  const liveListenerTimestamp = normalizedTimestamp ?? receivedAt;
  // Quote-driven candles must keep forming on the current bucket. MyProp (and
  // similar hubs) can attach a lagging feed clock while still streaming prices
  // (age_ms / stale=true). Using that lagging clock puts the tick behind
  // historyCutoff and freezes the active candle while only the price line moves.
  const CANDLE_FEED_TIME_MAX_AGE_MS = 5_000;
  const feedAgeMs = Number.isFinite(normalizedUpdate.ageMs)
    ? Number(normalizedUpdate.ageMs)
    : Number.isFinite(normalizedUpdate.ageSec)
      ? Number(normalizedUpdate.ageSec) * 1000
      : sourceTimestampMs !== undefined
        ? Math.max(0, receivedAt - sourceTimestampMs)
        : null;
  const feedTimeTooOld =
    normalizedUpdate.stale === true ||
    (feedAgeMs !== null && feedAgeMs > CANDLE_FEED_TIME_MAX_AGE_MS);
  const candleExtensionTimestamp =
    normalizedUpdate.timestampSource === 'feed' &&
    normalizedTimestamp !== null &&
    !feedTimeTooOld
      ? normalizedTimestamp
      : receivedAt;
  const feedClockOffsetMs = sourceTimestampMs === undefined
    ? null
    : receivedAt - sourceTimestampMs;
  const hasFreshFeedClock =
    normalizedUpdate.timestampSource === 'feed' &&
    normalizedTimestamp !== null &&
    feedClockOffsetMs !== null &&
    Math.abs(feedClockOffsetMs) <= CANDLE_FEED_TIME_MAX_AGE_MS;
  const hasFreshReceiptClock = normalizedUpdate.timestampSource === 'received_at';
  const allowFlatNewCandleBucket =
    !feedTimeTooOld &&
    normalizedUpdate.degraded !== true &&
    normalizedUpdate.tradable !== false &&
    (hasFreshFeedClock || hasFreshReceiptClock);
  if (normalizedUpdate.timestampSource !== 'feed' || feedTimeTooOld) {
    bridge.logCandleFeed('tick_candle_time_receipt_fallback', {
      symbol: normalizedUpdate.symbol,
      timestampSource: normalizedUpdate.timestampSource,
      feedAgeMs,
      stale: normalizedUpdate.stale === true,
      cryptoSymbol: isCryptoSymbol(normalizedUpdate.symbol),
      rawKeys: normalizedUpdate.rawKeys,
    }, 20);
  }
  let data: any = {
    ...(raw && typeof raw === 'object' ? raw : {}),
    symbol: normalizedUpdate.symbol,
    rawSymbol: normalizedUpdate.rawSymbol,
    bid: normalizedUpdate.bid,
    ask: normalizedUpdate.ask,
    ...(normalizedUpdate.last === undefined ? {} : { last: normalizedUpdate.last }),
    ...(normalizedUpdate.high === undefined ? {} : { high: normalizedUpdate.high }),
    ...(normalizedUpdate.low === undefined ? {} : { low: normalizedUpdate.low }),
    ...(normalizedUpdate.open === undefined ? {} : { open: normalizedUpdate.open }),
    ...(normalizedUpdate.dailyOpen === undefined ? {} : { dailyOpen: normalizedUpdate.dailyOpen }),
    ...(normalizedUpdate.previousClose === undefined ? {} : { previousClose: normalizedUpdate.previousClose }),
    ...(normalizedUpdate.changePct === undefined ? {} : { changePct: normalizedUpdate.changePct }),
    ...(normalizedUpdate.spread === undefined ? {} : { spread: normalizedUpdate.spread }),
    volume: normalizedUpdate.volume,
    ...(normalizedUpdate.volume === undefined ? {} : { volumeSource: 'backend' }),
    ...(normalizedUpdate.digits === undefined ? {} : { digits: normalizedUpdate.digits }),
    ...(normalizedUpdate.point === undefined ? {} : { point: normalizedUpdate.point }),
    ...(normalizedUpdate.tickSize === undefined ? {} : { tickSize: normalizedUpdate.tickSize }),
    ...(normalizedUpdate.sequence === undefined ? {} : { sequence: normalizedUpdate.sequence }),
    ...(normalizedUpdate.tickId === undefined ? {} : { tickId: normalizedUpdate.tickId }),
    ...(normalizedUpdate.source === undefined ? {} : { source: normalizedUpdate.source }),
    ...(normalizedUpdate.authority === undefined ? {} : { authority: normalizedUpdate.authority }),
    ...(normalizedUpdate.marketState === undefined ? {} : { marketState: normalizedUpdate.marketState }),
    transport: 'websocket',
    ...(normalizedUpdate.stale === undefined ? {} : { stale: normalizedUpdate.stale }),
    ...(normalizedUpdate.tradable === undefined ? {} : { tradable: normalizedUpdate.tradable }),
    ...(normalizedUpdate.ageMs === undefined ? {} : { ageMs: normalizedUpdate.ageMs }),
    ...(normalizedUpdate.ageSec === undefined ? {} : { ageSec: normalizedUpdate.ageSec }),
    ...(normalizedUpdate.degraded === undefined ? {} : { degraded: normalizedUpdate.degraded }),
    ...(normalizedUpdate.degradationReason === undefined
      ? {}
      : { degradationReason: normalizedUpdate.degradationReason }),
    feedTickAt: sourceTimestampMs,
    lastReceivedAt: receivedAt,
    ...(normalizedTimestamp === null
      ? {}
      : {
          time: normalizedTimestamp,
          timestamp: normalizedTimestamp,
          t: normalizedTimestamp,
        }),
  };

  const tickEvent: QuoteTickEvent = {
    symbol: normalizedUpdate.symbol,
    rawSymbol: normalizedUpdate.rawSymbol,
    bid: normalizedUpdate.bid,
    ask: normalizedUpdate.ask,
    last: normalizedUpdate.last,
    high: normalizedUpdate.high,
    low: normalizedUpdate.low,
    open: normalizedUpdate.open,
    dailyOpen: normalizedUpdate.dailyOpen,
    previousClose: normalizedUpdate.previousClose,
    changePct: normalizedUpdate.changePct,
    spread: normalizedUpdate.spread,
    volume: normalizedUpdate.volume,
    digits: normalizedUpdate.digits,
    point: normalizedUpdate.point,
    tickSize: normalizedUpdate.tickSize,
    sequence: normalizedUpdate.sequence,
    tickId: normalizedUpdate.tickId,
    source: normalizedUpdate.source,
    authority: normalizedUpdate.authority,
    marketState: normalizedUpdate.marketState,
    transport: 'websocket',
    stale: normalizedUpdate.stale,
    tradable: normalizedUpdate.tradable,
    ageMs: normalizedUpdate.ageMs,
    ageSec: normalizedUpdate.ageSec,
    degraded: normalizedUpdate.degraded,
    degradationReason: normalizedUpdate.degradationReason,
    feedTickAt: sourceTimestampMs,
    receiptMonotonicAt,
    receivedAt,
    timestamp: liveListenerTimestamp,
  };
  bridge.emitTick(tickEvent);
  // Fan out to per-symbol listeners synchronously. This is the path the
  // Quotes screen relies on for live bid/ask updates — it doesn't need to
  // wait for the rAF/setTimeout-driven Zustand flush.
  bridge.emitSymbolTick(normalizedUpdate.rawSymbol || normalizedUpdate.symbol, tickEvent);
  // Quote-driven active candle: RTX5 renders one Bid price line, so the live
  // candle must use that exact same Bid basis for O/H/L/C. Mixing Ask/Last into
  // the candle makes spread changes look like candle ticks even when Bid did
  // not move.
  const bidPrice = Number.isFinite(normalizedUpdate.bid) ? normalizedUpdate.bid : null;
  const tickPriceForCandle = bidPrice;
  const useServerCandleStream = shouldRouteBackendCandlePayloads();
  if (
    !useServerCandleStream &&
    tickPriceForCandle !== null &&
    candleExtensionTimestamp !== null
  ) {
    try {
      liveCandleStream.extendActiveCandlesFromQuoteTick(normalizedUpdate.symbol, {
        price: tickPriceForCandle,
        high: tickPriceForCandle,
        low: tickPriceForCandle,
        time: candleExtensionTimestamp,
        volume: normalizedUpdate.volume,
        allowFlatNewBucket: allowFlatNewCandleBucket,
      });
    } catch (_error) {
      // Defensive: under hot-module-reload the singleton may pre-date this
      // method on its prototype. Skip silently — the chart still receives
      // backend candle snapshots via the dedicated candle WS.
    }
  }
  bridge.logCandleFeed('tick_emitted_to_quote_listeners', {
    symbol: normalizedUpdate.symbol,
    bid: normalizedUpdate.bid,
    ask: normalizedUpdate.ask,
    timestamp: liveListenerTimestamp,
    feedTickAt: sourceTimestampMs,
    receivedAt,
    rawKeys: normalizedUpdate.rawKeys,
    degraded: normalizedUpdate.degraded,
    degradationReason: normalizedUpdate.degradationReason,
  }, 8);

  if (!bridge.shouldStageQuoteUpdate()) {
    return false;
  }

  // Preserve intra-flush quote extremes. When several ticks arrive within
  // the same event-loop turn, naively overwriting the pending entry would
  // discard any spike high or dip low before quote consumers can render it.
  const existing = bridge.pendingUpdates.get(normalizedUpdate.symbol);
  if (existing) {
    const prevHigh = typeof existing.bidHigh === 'number' ? existing.bidHigh : existing.bid;
    const prevLow = typeof existing.bidLow === 'number' ? existing.bidLow : existing.bid;
    data = {
      ...data,
      bidHigh: Math.max(prevHigh, data.bid),
      bidLow: Math.min(prevLow, data.bid),
    };
  } else {
    data = { ...data, bidHigh: data.bid, bidLow: data.bid };
  }

  bridge.pendingUpdates.set(normalizedUpdate.symbol, data);
  return true;
};

const getQuoteCandidateItems = (payload: unknown): unknown[] => {
  const parsed = parseJsonStringPayload(payload);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  const record = asRecord(parsed);
  if (!record) {
    return [parsed];
  }

  // `{"type":"snapshot","symbols":[{symbol,bid,ask,...}]}` is sent right after
  // the subscribe ack. Each entry is a quote; entries with has_quote:false are
  // skipped by the normalizer.
  if (isFeedSnapshotFrame(record)) {
    return (record.symbols as unknown[]).map((item) => mergeQuoteEnvelopeContext(record, item));
  }

  for (const key of ['data', 'ticks', 'prices', 'quotes', 'items', 'payload', 'message']) {
    const value = parseJsonStringPayload(record[key]);
    if (Array.isArray(value)) {
      return value.map((item) => mergeQuoteEnvelopeContext(record, item));
    }
  }

  for (const key of ['data', 'tick', 'quote', 'price', 'payload', 'message']) {
    const value = parseJsonStringPayload(record[key]);
    if (asRecord(value)) {
      return [mergeQuoteEnvelopeContext(record, value)];
    }
  }

  return [record];
};

export const processIncomingPayload = (bridge: TickProcessorBridge, payload: any): boolean => {
  const parsedPayload = parseJsonStringPayload(payload);
  if (isFeedControlFrame(parsedPayload)) {
    // Acks are handled by the service; `unsupported_request` errors (for
    // example a stray ping) leave the socket open and are ignored here.
    return false;
  }
  let hasUpdates = routeBackendCandleUpdates(bridge, parsedPayload);
  if (isFeedCandleFrame(parsedPayload)) {
    return hasUpdates;
  }

  for (const candidate of getQuoteCandidateItems(parsedPayload)) {
    if (processTick(bridge, candidate)) {
      hasUpdates = true;
    }
  }

  return hasUpdates;
};

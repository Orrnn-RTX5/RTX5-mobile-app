/**
 * Pins the /ws/feed pipeline to the real frames from Backend Contract v3
 * (MOBILE_APP_PROMPT_FROM_BACKEND.md, section 5.1).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { liveCandleStream } from '../../../domain/candles/stream/liveCandleStream';
import { normalizeLiveCandle } from '../../../domain/candles/normalization/candleNormalizer';
import { evaluateQuoteStreamTick } from '../../../market/quoteStreamIntegrity';
import { normalizeQuoteTickPayload, parseQuoteSequence, type QuoteTickEvent } from '../quoteTickNormalizer';
import {
  isFeedCandleFrame,
  isFeedControlFrame,
  processIncomingPayload,
  type TickProcessorBridge,
} from './tickProcessor';

const ACK_FRAME = {
  type: 'subscribed', symbols: ['EURUSD', 'BTCUSD', 'NOSUCHSYM'], broker_id: 'Orrnn',
  requested_symbols: ['EURUSD', 'BTCUSD', 'NOSUCHSYM'], wildcard: false, resolved_symbol_count: 3,
  server_time: 1790241466944, snapshot_follows: true,
};

const SNAPSHOT_FRAME = {
  type: 'snapshot', broker_id: 'Orrnn', requested_symbols: ['EURUSD', 'BTCUSD', 'NOSUCHSYM'], symbol_count: 3,
  quoted_symbol_count: 2, server_time_ms: 1790241466944, authority: 'rtx5_hub',
  symbols: [
    {
      symbol: 'EURUSD', broker_id: 'Orrnn', bid: 1.13736, ask: 1.13751, spread: 0.00015, daily_open: 1.13838,
      quote_time_ms: 1790241466611, quote_time_unix: 1790241466, age_ms: 333, age_sec: 0, has_quote: true, fresh: true,
      stale: false, tradable: true, market_state: 'live', state_reason: 'quoting normally', source: 'cserver',
      expected_source: 'cserver', source_mismatch: false, sequence: '293894', authority: 'rtx5_hub',
    },
    {
      symbol: 'BTCUSD', broker_id: 'Orrnn', bid: 83380.1, ask: 83440.1, has_quote: true, fresh: false,
      stale: true, tradable: false, market_state: 'delayed', quote_time_ms: 1790241400000, sequence: '293890',
    },
    { symbol: 'NOSUCHSYM', broker_id: 'Orrnn', has_quote: false, fresh: false, stale: true, market_state: 'no_quote' },
  ],
};

const TICK_FRAME = {
  symbol: 'BTCUSD', broker_id: 'Orrnn', bid: 83385.56, ask: 83445.56, spread: 60, daily_change_pct: -0.98,
  daily_open: 84305.69, previous_close: 84212.04,
  session: { high_bid: 83720.82, low_bid: 83200.08, high_ask: 83764.75, low_ask: 83265.36 },
  time: 1790241467, timestamp: 1790241467000, time_ms: 1790241467000, timestamp_ms: 1790241467000,
  provider_timestamp: 1790241467000, hub_ingest_timestamp: 1790241467000, hub_publish_timestamp: 1790241467000,
  age_ms: 0, source_seq: '293935', sequence: '293935', authority: 'rtx5_hub', expected_source: 'cserver',
  source_mismatch: false, age_sec: 0, stale: false, tradable: true, source: 'cserver',
};

const CANDLE_FRAME = {
  type: 'candle', symbol: 'EURUSD', tf: '1m', open: 1.1376, high: 1.137625, low: 1.137205, close: 1.137205,
  time: 1790241360, volume: 12, closed: false,
};

const UNSUPPORTED_PING_ERROR = {
  type: 'error', code: 'unsupported_request',
  message: 'unsupported request type; supported: subscribe, unsubscribe, subscribe_candles, unsubscribe_candles',
  request: 'ping',
};

const createBridge = () => {
  const ticks: QuoteTickEvent[] = [];
  const dropped: unknown[] = [];
  const bridge: TickProcessorBridge = {
    pendingUpdates: new Map(),
    emitTick: (tick) => ticks.push(tick),
    emitSymbolTick: () => {},
    shouldStageQuoteUpdate: () => true,
    logCandleFeed: (event, details) => {
      if (event === 'tick_dropped_before_store') dropped.push(details);
    },
    acceptNormalizedTick: () => true,
    acceptCandlePayload: () => true,
  };
  return { bridge, ticks, dropped };
};

const withStubbedCandleStream = <T>(run: (calls: { ingested: unknown[]; extended: unknown[] }) => T): T => {
  const calls = { ingested: [] as unknown[], extended: [] as unknown[] };
  const originalIngest = liveCandleStream.ingestLiveCandle;
  const originalExtend = liveCandleStream.extendActiveCandlesFromQuoteTick;
  (liveCandleStream as any).ingestLiveCandle = (candle: unknown) => calls.ingested.push(candle);
  (liveCandleStream as any).extendActiveCandlesFromQuoteTick = (_symbol: string, options: unknown) =>
    calls.extended.push(options);
  try {
    return run(calls);
  } finally {
    (liveCandleStream as any).ingestLiveCandle = originalIngest;
    (liveCandleStream as any).extendActiveCandlesFromQuoteTick = originalExtend;
  }
};

test('subscribe ack and unsupported_request error frames are control frames, not dropped quotes', () => {
  assert.equal(isFeedControlFrame(ACK_FRAME), true);
  assert.equal(isFeedControlFrame(UNSUPPORTED_PING_ERROR), true);
  assert.equal(isFeedControlFrame({ type: 'subscribed_candles', symbols: ['EURUSD'], tf: '1m' }), true);
  assert.equal(isFeedControlFrame(TICK_FRAME), false);

  const { bridge, ticks, dropped } = createBridge();
  assert.equal(processIncomingPayload(bridge, ACK_FRAME), false);
  assert.equal(processIncomingPayload(bridge, UNSUPPORTED_PING_ERROR), false);
  assert.equal(processIncomingPayload(bridge, { type: 'subscribed_candles', symbols: ['EURUSD'], tf: '1m' }), false);
  assert.equal(ticks.length, 0);
  assert.equal(dropped.length, 0);
});

test('snapshot frame yields quotes, skips has_quote:false and keeps stale + market_state', () => {
  withStubbedCandleStream(() => {
    const { bridge, ticks, dropped } = createBridge();
    assert.equal(processIncomingPayload(bridge, SNAPSHOT_FRAME), true);

    assert.deepEqual(ticks.map((tick) => tick.symbol), ['EURUSD', 'BTCUSD']);
    assert.equal(dropped.length, 0, 'NOSUCHSYM (has_quote:false) is skipped silently');

    const [eurusd, btcusd] = ticks;
    assert.equal(eurusd.bid, 1.13736);
    assert.equal(eurusd.ask, 1.13751);
    assert.equal(eurusd.sequence, 293894);
    assert.equal(eurusd.marketState, 'live');
    assert.equal(eurusd.stale, false);
    assert.equal(eurusd.feedTickAt, 1790241466611, 'quote_time_ms is the quote clock');

    assert.equal(btcusd.stale, true, 'stale entries are marked stale (greyed)');
    assert.equal(btcusd.marketState, 'delayed');
    assert.equal(bridge.pendingUpdates.get('BTCUSD')?.stale, true);
  });
});

test('bare tick frame: string sequence, timestamp_ms, session high/low, previous_close', () => {
  const result = normalizeQuoteTickPayload(TICK_FRAME);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const update = result.update;
  assert.equal(update.symbol, 'BTCUSD');
  assert.equal(update.sequence, 293935);
  assert.equal(update.timestamp, 1790241467000);
  assert.equal(update.timestampSource, 'feed');
  assert.equal(update.high, 83720.82);
  assert.equal(update.low, 83200.08);
  assert.equal(update.previousClose, 84212.04);
  assert.equal(update.dailyOpen, 84305.69);
  assert.equal(update.changePct, -0.98);
});

test('previous_close: 0 is treated as unknown (Trivanta)', () => {
  const result = normalizeQuoteTickPayload({ ...TICK_FRAME, previous_close: 0 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.update.previousClose, undefined);
});

test('`time` alone is Unix seconds and is scaled to milliseconds downstream', () => {
  const { timestamp_ms, timestamp, time_ms, provider_timestamp, hub_ingest_timestamp, hub_publish_timestamp, ...secondsOnly } =
    TICK_FRAME;
  void timestamp_ms; void timestamp; void time_ms; void provider_timestamp; void hub_ingest_timestamp; void hub_publish_timestamp;
  const result = normalizeQuoteTickPayload(secondsOnly);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.update.timestamp, 1790241467);
  const { bridge, ticks } = createBridge();
  withStubbedCandleStream(() => processIncomingPayload(bridge, secondsOnly));
  assert.equal(ticks[0]?.feedTickAt, 1790241467000);
});

test('ask < bid and missing bid/ask ticks are still dropped', () => {
  assert.equal(normalizeQuoteTickPayload({ ...TICK_FRAME, ask: 83000 }).ok, false);
  const { bid, ...noBid } = TICK_FRAME;
  void bid;
  assert.equal(normalizeQuoteTickPayload(noBid).ok, false);
});

test('string sequences are compared numerically, including "293935"', () => {
  assert.equal(parseQuoteSequence('293935'), 293935);
  assert.equal(parseQuoteSequence(' 42 '), 42);
  assert.equal(parseQuoteSequence(7), 7);
  assert.equal(parseQuoteSequence('abc-1'), 'abc-1');
  assert.equal(parseQuoteSequence(''), undefined);

  const identity = { brokerId: 'Orrnn', accountLogin: '200074', sessionEpoch: 1 };
  const first = normalizeQuoteTickPayload(TICK_FRAME);
  assert.ok(first.ok);
  if (!first.ok) return;
  const accepted = evaluateQuoteStreamTick(TICK_FRAME, first.update, identity);
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  assert.equal(accepted.cursor.sequence, 293935);

  // "99999" < "293935" numerically even though it is larger as a string.
  const lower = normalizeQuoteTickPayload({ ...TICK_FRAME, sequence: '99999', source_seq: '99999', bid: 83386 });
  assert.ok(lower.ok);
  if (!lower.ok) return;
  assert.deepEqual(
    evaluateQuoteStreamTick(TICK_FRAME, lower.update, identity, accepted.cursor),
    { accepted: false, reason: 'lower_sequence' },
  );

  const next = normalizeQuoteTickPayload({
    ...TICK_FRAME, sequence: '293936', source_seq: '293936', timestamp_ms: 1790241467100, bid: 83386,
  });
  assert.ok(next.ok);
  if (!next.ok) return;
  assert.equal(evaluateQuoteStreamTick(TICK_FRAME, next.update, identity, accepted.cursor).accepted, true);
});

test('broker_id is compared to the session ignoring case', () => {
  const result = normalizeQuoteTickPayload(TICK_FRAME);
  assert.ok(result.ok);
  if (!result.ok) return;
  for (const brokerId of ['Orrnn', 'orrnn', 'ORRNN']) {
    assert.equal(
      evaluateQuoteStreamTick(TICK_FRAME, result.update, { brokerId, accountLogin: '1', sessionEpoch: 1 }).accepted,
      true,
      brokerId,
    );
  }
  assert.equal(
    evaluateQuoteStreamTick(TICK_FRAME, result.update, { brokerId: 'trivanta-markets', accountLogin: '1', sessionEpoch: 1 }).accepted,
    false,
  );
});

test('/ws/feed candle frames are routed to the live candle stream in the default quote mode', () => {
  const previousMode = process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE;
  delete process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE;
  try {
    assert.equal(isFeedCandleFrame(CANDLE_FRAME), true);
    withStubbedCandleStream((calls) => {
      const { bridge, ticks, dropped } = createBridge();
      assert.equal(processIncomingPayload(bridge, CANDLE_FRAME), true);
      assert.equal(calls.ingested.length, 1);
      assert.equal((calls.ingested[0] as Record<string, unknown>).time, 1790241360);
      assert.equal((calls.ingested[0] as Record<string, unknown>).timeframe, 'M1');
      const liveCandle = normalizeLiveCandle(calls.ingested[0]);
      assert.ok(liveCandle, 'the routed feed candle is a valid live candle');
      assert.equal(liveCandle?.close, 1.137205);
      assert.equal(ticks.length, 0, 'a candle frame is not a quote');
      assert.equal(dropped.length, 0);

      // Quote-driven extension of the active candle is kept.
      processIncomingPayload(bridge, TICK_FRAME);
      assert.equal(calls.extended.length, 1);
    });
  } finally {
    if (previousMode === undefined) delete process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE;
    else process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE = previousMode;
  }
});

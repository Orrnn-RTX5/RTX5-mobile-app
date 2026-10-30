import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { liveCandleStream } from '../../../domain/candles/stream/liveCandleStream';
import { processIncomingPayload, processTick, type TickProcessorBridge } from './tickProcessor';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('staged quote updates carry only backend daily changes and clear a missing percentage', () => {
  const bridge: TickProcessorBridge = {
    pendingUpdates: new Map(), emitTick: () => {}, emitSymbolTick: () => {},
    shouldStageQuoteUpdate: () => true, logCandleFeed: () => {}, acceptNormalizedTick: () => true,
  };
  const quote = { symbol: 'XAUUSD', bid: 105, ask: 105.1, previous_close: 100, daily_open: 95 };
  assert.equal(processTick(bridge, { ...quote, daily_change_pct: -1.25 }), true);
  assert.equal(bridge.pendingUpdates.get('XAUUSD').changePct, -1.25);
  assert.equal(processTick(bridge, { ...quote, daily_change_pct: 0 }), true);
  assert.equal(bridge.pendingUpdates.get('XAUUSD').changePct, 0);
  assert.equal(processTick(bridge, quote), true);
  const staged = bridge.pendingUpdates.get('XAUUSD');
  assert.equal(Object.hasOwn(staged, 'changePct'), true);
  assert.equal(staged.changePct, undefined);
});

test('quote tick processor carries websocket envelope context into nested tick payloads', () => {
  const source = readSource('src/api/ws/quotesSocket/tickProcessor.ts');

  assert.match(source, /const parseJsonStringPayload = \(value: unknown\): unknown =>/);
  assert.match(source, /const QUOTE_ENVELOPE_CONTEXT_KEYS = \[/);
  assert.match(source, /'channel'/);
  assert.match(source, /'timestamp_ms'/);
  assert.match(source, /'time_ms'/);
  assert.match(source, /'tick_time'/);
  assert.match(source, /'sequenceId'/);
  assert.match(source, /const mergeQuoteEnvelopeContext = \(/);
  assert.match(source, /\{ \.\.\.context, \.\.\.candidateRecord \}/);
  assert.match(source, /for \(const key of \['data', 'ticks', 'prices', 'quotes', 'items', 'payload', 'message'\]\)/);
  assert.match(source, /return value\.map\(\(item\) => mergeQuoteEnvelopeContext\(record, item\)\)/);
  assert.match(source, /for \(const key of \['data', 'tick', 'quote', 'price', 'payload', 'message'\]\)/);
  assert.match(source, /return \[mergeQuoteEnvelopeContext\(record, value\)\]/);
  assert.match(source, /const parsedPayload = parseJsonStringPayload\(payload\)/);
  assert.match(source, /for \(const candidate of getQuoteCandidateItems\(parsedPayload\)\)/);
  assert.match(source, /const tickEvent: QuoteTickEvent = \{[\s\S]*transport: 'websocket'/);
  assert.match(source, /let data: any = \{[\s\S]*transport: 'websocket'/);
});

test('quote tick processor builds Bid-only live candles and uses fresh receipt time when feed clock lags', () => {
  const source = readSource('src/api/ws/quotesSocket/tickProcessor.ts');

  assert.match(source, /const CANDLE_FEED_TIME_MAX_AGE_MS = 5_000/);
  assert.match(source, /const feedTimeTooOld =/);
  assert.match(source, /normalizedUpdate\.stale === true/);
  assert.match(
    source,
    /hasFreshFeedClock =[\s\S]*normalizedUpdate\.timestampSource === 'feed'[\s\S]*Math\.abs\(feedClockOffsetMs\) <= CANDLE_FEED_TIME_MAX_AGE_MS[\s\S]*hasFreshReceiptClock = normalizedUpdate\.timestampSource === 'received_at'[\s\S]*allowFlatNewCandleBucket =[\s\S]*!feedTimeTooOld[\s\S]*normalizedUpdate\.degraded !== true[\s\S]*normalizedUpdate\.tradable !== false[\s\S]*hasFreshFeedClock \|\| hasFreshReceiptClock/,
  );
  assert.match(
    source,
    /candleExtensionTimestamp =[\s\S]*normalizedUpdate\.timestampSource === 'feed' &&[\s\S]*!feedTimeTooOld[\s\S]*\? normalizedTimestamp[\s\S]*: receivedAt/,
  );
  assert.match(source, /const bidPrice = Number\.isFinite\(normalizedUpdate\.bid\) \? normalizedUpdate\.bid : null/);
  assert.match(source, /const tickPriceForCandle = bidPrice/);
  assert.doesNotMatch(source, /const tickPriceForCandle = lastPrice \?\? bidPrice \?\? askPrice/);
  assert.doesNotMatch(source, /const tickHighForCandle = Math\.max/);
  assert.doesNotMatch(source, /const tickLowForCandle = Math\.min/);
  assert.match(source, /const useServerCandleStream = shouldRouteBackendCandlePayloads\(\)/);
  assert.match(source, /!useServerCandleStream &&[\s\S]*tickPriceForCandle !== null &&[\s\S]*candleExtensionTimestamp !== null/);
  assert.match(
    source,
    /extendActiveCandlesFromQuoteTick\(normalizedUpdate\.symbol,[\s\S]*price: tickPriceForCandle,[\s\S]*high: tickPriceForCandle,[\s\S]*low: tickPriceForCandle,[\s\S]*time: candleExtensionTimestamp/,
  );
  assert.match(source, /allowFlatNewBucket: allowFlatNewCandleBucket/);
  assert.match(source, /tick_candle_time_receipt_fallback/);
});

test('flat boundary trust accepts healthy timestamp-less websocket quotes and rejects unhealthy metadata', () => {
  const originalExtend = liveCandleStream.extendActiveCandlesFromQuoteTick;
  const captured: Array<{ allowFlatNewBucket?: boolean }> = [];
  (liveCandleStream as any).extendActiveCandlesFromQuoteTick = (
    _symbol: string,
    options: { allowFlatNewBucket?: boolean },
  ) => {
    captured.push(options);
  };
  const bridge: TickProcessorBridge = {
    pendingUpdates: new Map(),
    emitTick: () => {},
    emitSymbolTick: () => {},
    shouldStageQuoteUpdate: () => true,
    logCandleFeed: () => {},
    acceptNormalizedTick: () => true,
  };

  try {
    const quote = { symbol: 'EURUSD', bid: 1.17121, ask: 1.17141 };
    assert.equal(processTick(bridge, quote), true);
    assert.equal(processTick(bridge, { ...quote, stale: true }), true);
    assert.equal(processTick(bridge, { ...quote, degraded: true }), true);
    assert.equal(processTick(bridge, { ...quote, tradable: false }), true);
    assert.equal(processTick(bridge, { ...quote, age_ms: 6_000 }), true);

    assert.deepEqual(
      captured.map((options) => options.allowFlatNewBucket),
      [true, false, false, false, false],
    );
  } finally {
    (liveCandleStream as any).extendActiveCandlesFromQuoteTick = originalExtend;
  }
});

test('quote-socket candle payloads cannot bypass the captured identity gate', () => {
  const previousMode = process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE;
  const previousProven = process.env.EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE;
  process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE = 'server';
  process.env.EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE = 'true';

  const originalIngest = liveCandleStream.ingestLiveCandle.bind(liveCandleStream);
  let ingested = false;
  (liveCandleStream as any).ingestLiveCandle = () => {
    ingested = true;
  };
  const bridge: TickProcessorBridge = {
    pendingUpdates: new Map(),
    emitTick: () => {},
    emitSymbolTick: () => {},
    shouldStageQuoteUpdate: () => false,
    logCandleFeed: () => {},
    acceptNormalizedTick: () => false,
    acceptCandlePayload: () => false,
  };

  try {
    const accepted = processIncomingPayload(bridge, {
      type: 'candle',
      broker_id: 'wrong-broker',
      account_login: '999',
      session_epoch: 999,
      time: 1_700_000_000,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    });
    assert.equal(accepted, false);
    assert.equal(ingested, false);
  } finally {
    (liveCandleStream as any).ingestLiveCandle = originalIngest;
    if (previousMode === undefined) delete process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE;
    else process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE = previousMode;
    if (previousProven === undefined) delete process.env.EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE;
    else process.env.EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE = previousProven;
  }
});

test('row-only delivery skips unused store payload copies while staged ticks retain metadata', () => {
  const originalExtend = liveCandleStream.extendActiveCandlesFromQuoteTick;
  let extended = 0;
  (liveCandleStream as any).extendActiveCandlesFromQuoteTick = () => { extended++; };
  let stage = false;
  let metadataReads = 0;
  const events: string[] = [];
  const raw = {
    symbol: 'EURUSD', bid: 1.2, ask: 1.3,
    get brokerMetadata() { metadataReads++; return 'retained'; },
  };
  const bridge: TickProcessorBridge = {
    pendingUpdates: new Map(),
    emitTick: () => { events.push('global'); assert.equal(metadataReads, 0); },
    emitSymbolTick: () => { events.push('row'); assert.equal(metadataReads, 0); },
    shouldStageQuoteUpdate: () => stage,
    logCandleFeed: () => {},
    acceptNormalizedTick: () => true,
  };
  try {
    for (let i = 0; i < 500; i++) assert.equal(processTick(bridge, raw), false);
    assert.equal(events.length, 1_000);
    assert.equal(extended, 500);
    assert.equal(metadataReads, 0, 'no store consumer means no copied raw envelope');
    assert.equal(bridge.pendingUpdates.size, 0);

    stage = true;
    assert.equal(processTick(bridge, raw), true);
    assert.equal(metadataReads, 1);
    const pending = bridge.pendingUpdates.get('EURUSD');
    assert.equal(pending.brokerMetadata, 'retained');
    assert.equal(pending.bid, 1.2); assert.equal(pending.ask, 1.3);
    assert.equal(pending.transport, 'websocket');
    assert.equal(pending.bidHigh, 1.2); assert.equal(pending.bidLow, 1.2);
  } finally {
    (liveCandleStream as any).extendActiveCandlesFromQuoteTick = originalExtend;
  }
});

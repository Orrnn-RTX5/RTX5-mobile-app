import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORTED_TIMEFRAMES, getBucketStart } from '../../domain/candles/core/timeframeUtils';
import { captureExactChartQuote } from './exactChartQuote';
import {
  accumulateChartBidTick,
  projectChartLiveTickCandles,
} from './chartLiveTickAccumulator';

const quote = (scopeKey: string, bid: number, receivedAt: number) => {
  const snapshot = captureExactChartQuote(scopeKey, {
    bid,
    ask: bid + 0.12,
    receivedAt,
    feedTickAt: receivedAt - 5,
  });
  assert.ok(snapshot);
  return snapshot;
};

test('same-bucket Bid atomically owns candle close while retaining both wick extremes', () => {
  const contextKey = 'broker-a:account-1:XAUUSD:M1';
  const tail = { time: 1_785_000_000, open: 100, high: 105, low: 98, close: 102, volume: 7 };
  const first = accumulateChartBidTick(null, {
    contextKey,
    timeframe: 'M1',
    canonicalTail: tail,
    quote: quote(contextKey, 104, 1_785_000_010_000),
  });
  const second = accumulateChartBidTick(first, {
    contextKey,
    timeframe: 'M1',
    canonicalTail: tail,
    quote: quote(contextKey, 97, 1_785_000_020_000),
  });
  const projected = projectChartLiveTickCandles([tail], second, contextKey);

  assert.equal(projected.activeCandle?.close, 97);
  assert.equal(second?.bid, 97);
  assert.equal(projected.activeCandle?.high, 105);
  assert.equal(projected.activeCandle?.low, 97);
  assert.equal(projected.quoteOnlyBootstrap, false);
});

test('quote-only public traffic forms a candle without waiting for a candle frame', () => {
  const contextKey = 'orrnn-public:XAUUSD:M1';
  const state = accumulateChartBidTick(null, {
    contextKey,
    timeframe: 'M1',
    canonicalTail: null,
    quote: quote(contextKey, 4397.35, 1_785_000_010_000),
  });
  const projected = projectChartLiveTickCandles([], state, contextKey);

  assert.equal(projected.candles.length, 1);
  assert.equal(projected.quoteOnlyBootstrap, true);
  assert.deepEqual(projected.activeCandle, {
    time: getBucketStart(1_785_000_010_000, 'M1'),
    open: 4397.35,
    high: 4397.35,
    low: 4397.35,
    close: 4397.35,
    volume: 0,
  });
});

test('a delayed canonical candle restores the real open without taking close away from Bid', () => {
  const contextKey = 'orrnn-public:XAUUSD:M1';
  const state = accumulateChartBidTick(null, {
    contextKey,
    timeframe: 'M1',
    canonicalTail: null,
    quote: quote(contextKey, 4397.35, 1_785_000_010_000),
  });
  const canonicalTail = {
    time: getBucketStart(1_785_000_010_000, 'M1')!,
    open: 4396.8,
    high: 4397.1,
    low: 4396.5,
    close: 4396.95,
    volume: 12,
  };
  const projected = projectChartLiveTickCandles([canonicalTail], state, contextKey);

  assert.equal(projected.activeCandle?.open, canonicalTail.open);
  assert.equal(projected.activeCandle?.close, state?.bid);
  assert.equal(projected.activeCandle?.high, state?.bid);
  assert.equal(projected.activeCandle?.low, canonicalTail.low);
  assert.equal(projected.activeCandle?.volume, canonicalTail.volume);
  assert.equal(projected.quoteOnlyBootstrap, false);
});

test('minute rollover starts O=H=L=C at the first accepted Bid', () => {
  const contextKey = 'broker-a:account-1:XAUUSD:M1';
  const first = accumulateChartBidTick(null, {
    contextKey,
    timeframe: 'M1',
    quote: quote(contextKey, 100, 1_785_000_059_000),
  });
  const next = accumulateChartBidTick(first, {
    contextKey,
    timeframe: 'M1',
    quote: quote(contextKey, 101, 1_785_000_061_000),
  });

  assert.ok(first && next && next.candle.time > first.candle.time);
  assert.deepEqual(next.candle, {
    time: getBucketStart(1_785_000_061_000, 'M1'),
    open: 101,
    high: 101,
    low: 101,
    close: 101,
    volume: 0,
  });
});

test('all supported timeframes use the canonical bucket contract', () => {
  for (const timeframe of SUPPORTED_TIMEFRAMES) {
    const contextKey = `future-broker-x:future-account:XAUUSD:${timeframe}`;
    const receivedAt = 1_785_123_456_789;
    const state = accumulateChartBidTick(null, {
      contextKey,
      timeframe,
      quote: quote(contextKey, 123.45, receivedAt),
    });
    assert.equal(state?.candle.time, getBucketStart(receivedAt, timeframe));
    assert.equal(state?.candle.close, state?.bid);
  }
});

test('older ticks and other contexts cannot rewind or leak the current candle', () => {
  const contextA = 'broker-a:account-1:XAUUSD:M1';
  const current = accumulateChartBidTick(null, {
    contextKey: contextA,
    timeframe: 'M1',
    quote: quote(contextA, 200, 1_785_000_020_000),
  });
  const older = accumulateChartBidTick(current, {
    contextKey: contextA,
    timeframe: 'M1',
    quote: quote(contextA, 190, 1_785_000_010_000),
  });
  const contextB = 'future-broker-x:account-9:XAUUSD:M1';
  const isolated = accumulateChartBidTick(current, {
    contextKey: contextB,
    timeframe: 'M1',
    quote: quote(contextB, 300, 1_785_000_021_000),
  });

  assert.equal(older, current);
  assert.equal(isolated?.contextKey, contextB);
  assert.equal(isolated?.candle.close, 300);
  assert.equal(projectChartLiveTickCandles([], current, contextB).usedAccumulator, false);
});

test('monotonic receipt order survives a backward device wall-clock adjustment', () => {
  const contextKey = 'broker-a:account-1:XAUUSD:M1';
  const makeMonotonicQuote = (bid: number, receivedAt: number, receiptMonotonicAt: number) => {
    const snapshot = captureExactChartQuote(contextKey, {
      bid,
      ask: bid + 0.12,
      receivedAt,
      receiptMonotonicAt,
    });
    assert.ok(snapshot);
    return snapshot;
  };
  const current = accumulateChartBidTick(null, {
    contextKey,
    timeframe: 'M1',
    quote: makeMonotonicQuote(100, 1_785_000_020_000, 20_000),
  });
  const afterClockRollback = accumulateChartBidTick(current, {
    contextKey,
    timeframe: 'M1',
    quote: makeMonotonicQuote(101, 1_785_000_010_000, 20_001),
  });

  assert.equal(afterClockRollback?.bid, 101);
});

test('public direct monotonic ticks remain comparable after a wall-clock-only cached seed', () => {
  const contextKey = 'orrnn-public:XAUUSD:M1';
  const cached = captureExactChartQuote(contextKey, {
    bid: 100,
    ask: 100.12,
    receivedAt: 1_785_000_010_000,
  });
  const direct = captureExactChartQuote(contextKey, {
    bid: 101,
    ask: 101.12,
    receivedAt: 1_785_000_010_001,
    receiptMonotonicAt: 12_345,
  });
  assert.ok(cached && direct);
  const seeded = accumulateChartBidTick(null, {
    contextKey,
    timeframe: 'M1',
    quote: cached,
  });
  const advanced = accumulateChartBidTick(seeded, {
    contextKey,
    timeframe: 'M1',
    quote: direct,
  });

  assert.equal(advanced?.bid, 101);
  assert.equal(advanced?.quoteMonotonicOrderMs, 12_345);
});

test('canonical next bucket accepts a newer Bid whose feed clock trails rollover', () => {
  const contextKey = 'orrnn-public:XAUUSD:M1';
  const canonicalTail = {
    time: 1_785_000_060,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
  };
  const snapshot = captureExactChartQuote(contextKey, {
    bid: 101,
    ask: 101.12,
    feedTickAt: 1_785_000_059_500,
    receivedAt: 1_785_000_060_500,
  });
  assert.ok(snapshot);
  const state = accumulateChartBidTick(null, {
    contextKey,
    timeframe: 'M1',
    canonicalTail,
    quote: snapshot,
  });

  assert.equal(state?.candle.time, canonicalTail.time);
  assert.equal(state?.candle.open, canonicalTail.open);
  assert.equal(state?.candle.close, 101);
});

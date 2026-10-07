import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveChartTradeButtonDisplayQuote,
  resolveChartTradeButtonQuote,
} from './quoteFallback';

test('resolveChartTradeButtonQuote prefers live websocket bid and ask', () => {
  assert.deepEqual(
    resolveChartTradeButtonQuote({
      liveBid: 79595.51,
      liveAsk: 79620.51,
      fallbackBid: 79000,
      fallbackAsk: 79025,
    }),
    { bid: 79595.51, ask: 79620.51 },
  );
});

test('resolveChartTradeButtonQuote rejects candle fallback prices while websocket quote is unavailable', () => {
  assert.deepEqual(
    resolveChartTradeButtonQuote({
      liveBid: undefined,
      liveAsk: Number.NaN,
      fallbackBid: 79595.51,
      fallbackAsk: 79620.51,
    }),
    { bid: 0, ask: 0 },
  );
});

test('resolveChartTradeButtonQuote keeps placeholders when neither source has usable prices', () => {
  assert.deepEqual(
    resolveChartTradeButtonQuote({
      liveBid: 0,
      liveAsk: -1,
      fallbackBid: undefined,
      fallbackAsk: null,
    }),
    { bid: 0, ask: 0 },
  );
});

test('display quote may use chart bid/ask fallbacks so tiles stay bright while live warms', () => {
  assert.deepEqual(
    resolveChartTradeButtonDisplayQuote({
      liveBid: undefined,
      liveAsk: undefined,
      fallbackBid: 79595.51,
      fallbackAsk: 79620.51,
    }),
    { bid: 79595.51, ask: 79620.51 },
  );
  assert.deepEqual(
    resolveChartTradeButtonDisplayQuote({
      liveBid: 1.1,
      liveAsk: 1.1002,
      fallbackBid: 79595.51,
      fallbackAsk: 79620.51,
    }),
    { bid: 1.1, ask: 1.1002 },
  );
});

test('quote resolvers never throw when input is null or undefined', () => {
  assert.deepEqual(resolveChartTradeButtonQuote(undefined), { bid: 0, ask: 0 });
  assert.deepEqual(resolveChartTradeButtonQuote(null), { bid: 0, ask: 0 });
  assert.deepEqual(resolveChartTradeButtonDisplayQuote(undefined), { bid: 0, ask: 0 });
  assert.deepEqual(resolveChartTradeButtonDisplayQuote(null), { bid: 0, ask: 0 });
});

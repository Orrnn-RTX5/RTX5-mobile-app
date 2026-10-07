import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateMarketSentiment, resolveQuoteDayRange } from './marketSentiment';

test('prefers the authoritative daily candle range when available', () => {
  const snapshot = calculateMarketSentiment(
    { bid: 1.105, ask: 1.106, high: 1.25, low: 0.95 },
    { high: 1.11, low: 1.1 },
  );

  assert.equal(snapshot.dayHigh, 1.11);
  assert.equal(snapshot.dayLow, 1.1);
  assert.equal(snapshot.buyPct, 55);
  assert.equal(snapshot.sellPct, 45);
});

test('falls back to quote high and low when no daily candle is available', () => {
  const range = resolveQuoteDayRange({ bid: 100, ask: 102, high: 110, low: 90 });

  assert.equal(range.dayHigh, 110);
  assert.equal(range.dayLow, 90);
});

test('returns a neutral split when a usable range is unavailable', () => {
  const snapshot = calculateMarketSentiment({ bid: 0, ask: 0, high: 0, low: 0 });

  assert.equal(snapshot.buyPct, 50);
  assert.equal(snapshot.sellPct, 50);
  assert.equal(snapshot.rangePositionPct, 50);
});

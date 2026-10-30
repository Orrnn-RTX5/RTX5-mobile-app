import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeQuoteTickPayload } from '../api/ws/quoteTickNormalizer';
import { buildRestQuoteTickEvent } from '../query/restQuoteTick';
import { applyLiveQuoteTickToSnapshot } from '../features/quotes/liveQuoteSnapshot';
import { formatBackendDailyChange } from './backendDailyChange';

test('backend daily percentages keep their sign and explicit zero', () => {
  assert.equal(formatBackendDailyChange(1.19), '+1.19%');
  assert.equal(formatBackendDailyChange(-1.25), '-1.25%');
  assert.equal(formatBackendDailyChange(0), '+0.00%');
  for (const value of [undefined, null, NaN, Infinity, '', {}]) {
    assert.equal(formatBackendDailyChange(value), '--');
  }
});

test('REST and WebSocket daily changes use backend calculations even when prices suggest a different result', () => {
  for (const daily_change_pct of [1.19, -1.25, 0]) {
    const raw = { symbol: 'XAUUSD', bid: 105, ask: 105.1, previous_close: 100, daily_open: 95, daily_change_pct };
    const normalized = normalizeQuoteTickPayload(raw);
    assert.equal(normalized.ok, true);
    const rest = buildRestQuoteTickEvent('XAUUSD', raw);
    assert.ok(rest);
    for (const tick of [rest, { ...normalized.update, receivedAt: 1_777_410_001_000, timestamp: 1_777_410_001_000 }]) {
      const snapshot = applyLiveQuoteTickToSnapshot('XAUUSD', undefined, tick, 1);
      assert.equal(snapshot?.changePct, daily_change_pct);
      assert.equal(formatBackendDailyChange(snapshot?.changePct), formatBackendDailyChange(daily_change_pct));
    }
  }
});

test('price-only backend payloads show an unavailable daily change through both transports', () => {
  const raw = { symbol: 'XAUUSD', bid: 105, ask: 105.1, previous_close: 100, daily_open: 95 };
  const normalized = normalizeQuoteTickPayload(raw);
  assert.equal(normalized.ok, true);
  const rest = buildRestQuoteTickEvent('XAUUSD', raw);
  assert.ok(rest);
  for (const tick of [rest, { ...normalized.update, receivedAt: 1_777_410_001_000, timestamp: 1_777_410_001_000 }]) {
    const snapshot = applyLiveQuoteTickToSnapshot('XAUUSD', undefined, tick, 1);
    assert.equal(snapshot?.changePct, undefined);
    assert.equal(formatBackendDailyChange(snapshot?.changePct), '--');
  }
});

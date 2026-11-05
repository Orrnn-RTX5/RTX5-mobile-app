import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QUOTE_WS_SILENT_RECONNECT_MS,
  QUOTE_WS_SILENT_STALE_MS,
  classifyQuoteSocketClose,
  decideQuoteSocketSilenceAction,
  isMarketOpenForSymbols,
} from './quoteSocketFailurePolicy';

test('former auth close codes are ordinary retryable transport closes on /ws/feed', () => {
  // Contract v3: no auth, no 401, no special close codes on the quote feed.
  for (const code of [1000, 1006, 1008, 1011, 4001, 4401, 4403]) {
    assert.equal(classifyQuoteSocketClose({ code, reason: '', didOpen: true }), 'transport');
    assert.equal(classifyQuoteSocketClose({ code, reason: '', didOpen: false }), 'transport');
  }
});

test('pre-open HTTP rejections (401, 403, 503 restart) retry with backoff instead of latching', () => {
  for (const reason of [
    "Expected HTTP 101 response but was '401 Unauthorized'",
    'WebSocket upgrade failed with HTTP 403 Forbidden',
    "Expected HTTP 101 response but was '503 Service Unavailable'",
  ]) {
    assert.equal(classifyQuoteSocketClose({ code: 1006, reason, didOpen: false }), 'transport');
  }
});

test('silence marks prices stale after 8 s and asks for a market check only after 60 s', () => {
  assert.equal(QUOTE_WS_SILENT_STALE_MS, 8_000);
  assert.equal(QUOTE_WS_SILENT_RECONNECT_MS, 60_000);
  assert.equal(decideQuoteSocketSilenceAction(0), 'none');
  assert.equal(decideQuoteSocketSilenceAction(8_000), 'none');
  assert.equal(decideQuoteSocketSilenceAction(8_001), 'mark_stale');
  assert.equal(decideQuoteSocketSilenceAction(59_999), 'mark_stale');
  assert.equal(decideQuoteSocketSilenceAction(60_000), 'check_market_then_reconnect');
  assert.equal(decideQuoteSocketSilenceAction(Number.NaN), 'none');
});

test('silence reconnect needs the market open; unknown status counts as open', () => {
  const rows = [
    { symbol: 'EURUSD', status: 'open' as const, quote_open: true, trade_open: true },
    { symbol: 'EURJPY', status: 'closed' as const, quote_open: false, trade_open: false },
  ];
  assert.equal(isMarketOpenForSymbols(rows, ['EURUSD']), true);
  assert.equal(isMarketOpenForSymbols(rows, ['EURJPY']), false);
  assert.equal(isMarketOpenForSymbols(rows, ['EURJPY', 'EURUSD']), true);
  // Unknown: request failed, empty list, or no row for the subscribed symbol.
  assert.equal(isMarketOpenForSymbols(null, ['EURUSD']), true);
  assert.equal(isMarketOpenForSymbols([], ['EURUSD']), true);
  assert.equal(isMarketOpenForSymbols(rows, ['BTCUSD']), true);
  assert.equal(
    isMarketOpenForSymbols([{ symbol: 'XAUUSD', status: 'unknown' }], ['XAUUSD']),
    true,
  );
});

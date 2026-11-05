import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeMarketStatusListPayload,
  normalizeMarketStatusPayload,
  resolveMarketStatusClosedMessage,
} from './marketStatus';

// Real rows from Backend Contract v3 (GET /market/status is a bare array).
const CONTRACT_V3_STATUS_ROWS = [
  { symbol: 'EURUSD', quote_open: true, trade_open: true, message: 'open', server_time: 1790241419 },
  { symbol: 'EURJPY', quote_open: false, trade_open: false, message: 'schedule unavailable', server_time: 1790241419 },
];

test('contract v3 rows map trade_open to open/closed and expose the closed message', () => {
  const [eurusd, eurjpy] = normalizeMarketStatusListPayload(CONTRACT_V3_STATUS_ROWS);
  assert.equal(eurusd.symbol, 'EURUSD');
  assert.equal(eurusd.status, 'open');
  assert.equal(eurusd.quote_open, true);
  assert.equal(resolveMarketStatusClosedMessage(eurusd), null);

  assert.equal(eurjpy.symbol, 'EURJPY');
  assert.equal(eurjpy.status, 'closed');
  assert.equal(eurjpy.trade_open, false);
  assert.equal(eurjpy.server_time, 1790241419);
  assert.equal(resolveMarketStatusClosedMessage(eurjpy), 'schedule unavailable');
});

test('market status list tolerates envelopes and drops rows without a symbol', () => {
  assert.equal(normalizeMarketStatusListPayload({ data: CONTRACT_V3_STATUS_ROWS }).length, 2);
  assert.deepEqual(normalizeMarketStatusListPayload([{ trade_open: true }]), []);
  assert.deepEqual(normalizeMarketStatusListPayload(null), []);
});

test('normalizes the live closed payload even when session boundaries are absent', () => {
  assert.deepEqual(
    normalizeMarketStatusPayload({
      symbol: 'XAUUSD',
      status: 'closed',
      quote_open: false,
      trade_open: false,
      server_time: 1_785_000_000,
      message: 'weekend',
    }),
    {
      symbol: 'XAUUSD',
      status: 'closed',
      session_open: undefined,
      session_close: undefined,
      quote_open: false,
      trade_open: false,
      server_time: 1_785_000_000,
      message: 'weekend',
    },
  );
});

test('normalizes broker aliases, milliseconds, numeric booleans, and nested data', () => {
  const normalized = normalizeMarketStatusPayload({
    data: {
      instrument: 'US30.pro',
      marketStatus: 'after-hours',
      quotesOpen: 0,
      tradingOpen: 'false',
      sessionOpen: 1_785_000_000_000,
      closeTime: '1785003600',
      serverTime: '2026-07-25T10:00:00.000Z',
    },
  });

  assert.equal(normalized.symbol, 'US30.pro');
  // trade_open is authoritative when present (contract v3): false => closed.
  assert.equal(normalized.status, 'closed');
  assert.equal(
    normalizeMarketStatusPayload({ marketStatus: 'after-hours' }).status,
    'after_hours',
    'legacy status strings still apply when trade_open is absent',
  );
  assert.equal(normalized.quote_open, false);
  assert.equal(normalized.trade_open, false);
  assert.equal(normalized.session_open, 1_785_000_000);
  assert.equal(normalized.session_close, 1_785_003_600);
  assert.equal(normalized.server_time, 1_784_973_600);
});

test('keeps unknown or missing fields unknown instead of guessing a schedule', () => {
  assert.deepEqual(normalizeMarketStatusPayload({}, 'AAPL'), {
    symbol: 'AAPL',
    status: 'unknown',
    session_open: undefined,
    session_close: undefined,
    quote_open: undefined,
    trade_open: undefined,
    server_time: undefined,
    message: undefined,
  });
});

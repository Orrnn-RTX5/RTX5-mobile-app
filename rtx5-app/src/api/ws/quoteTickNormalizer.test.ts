import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeQuoteTickPayload } from './quoteTickNormalizer';

test('normalizeQuoteTickPayload maps bid ask aliases and broker symbol suffixes', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'XAUUSDm',
    bidPrice: '2300.10',
    askPrice: '2300.40',
    serverTime: 1713705000,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'XAUUSDM');
  assert.equal(result.update.rawSymbol, 'XAUUSDM');
  assert.equal(result.update.bid, 2300.1);
  assert.equal(result.update.ask, 2300.4);
  assert.equal(result.update.timestamp, 1713705000);
});

test('normalizeQuoteTickPayload accepts nested quote objects from transport payloads', () => {
  const result = normalizeQuoteTickPayload({
    quote: {
      s: 'EURUSD.c',
      b: 1.085,
      a: 1.0852,
      lastPrice: 1.0851,
      lastTickAt: '1713705060',
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'EURUSD.C');
  assert.equal(result.update.rawSymbol, 'EURUSD.C');
  assert.equal(result.update.bid, 1.085);
  assert.equal(result.update.ask, 1.0852);
  assert.equal(result.update.last, 1.0851);
  assert.equal(result.update.timestamp, 1713705060);
});

test('normalizeQuoteTickPayload accepts nested payload tick objects and createdAt timestamps', () => {
  const result = normalizeQuoteTickPayload({
    type: 'quote',
    payload: {
      tick: {
        instrumentSymbol: 'XAUUSD.c',
        bid_price: '2320.10',
        ask_price: '2320.45',
        createdAt: '2024-03-22T10:06:05.000Z',
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'XAUUSD.C');
  assert.equal(result.update.rawSymbol, 'XAUUSD.C');
  assert.equal(result.update.bid, 2320.1);
  assert.equal(result.update.ask, 2320.45);
  assert.equal(result.update.timestamp, 1711101965000);
});

test('normalizeQuoteTickPayload rejects channel-scoped quote ticks missing ask', () => {
  const result = normalizeQuoteTickPayload({
    event: 'quote.tick',
    channel: 'quotes.EURUSD',
    data: {
      bid: '1.07123',
      tick_time: '2026-06-25T10:00:00.000Z',
      sequence: '991881',
      source_tick_id: 'tick-991881',
    },
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_bid_ask',
    rawKeys: ['event', 'channel', 'data'],
  });
});

test('normalizeQuoteTickPayload accepts nested price envelopes with channel symbol fallback', () => {
  const result = normalizeQuoteTickPayload({
    channel: 'ticks.XAUUSD',
    price: {
      bid: 2331.1,
      ask: 2331.4,
      server_time: '2026-06-25T10:00:00.050Z',
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'XAUUSD');
  assert.equal(result.update.bid, 2331.1);
  assert.equal(result.update.ask, 2331.4);
  assert.equal(result.update.timestamp, 1782381600050);
});

test('normalizeQuoteTickPayload accepts explicit millisecond timestamp fields', () => {
  const result = normalizeQuoteTickPayload({
    type: 'ticks',
    data: {
      symbol: 'EURUSD',
      bid: 1.07123,
      ask: 1.07135,
      time: 1780000000,
      timestamp_ms: 1780000000123,
      source_seq: '100',
      tick_id: 'example',
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'EURUSD');
  assert.equal(result.update.timestamp, 1780000000123);
  // Decimal sequence strings are parsed to numbers for the ordering gate.
  assert.equal(result.update.sequence, 100);
  assert.equal(result.update.tickId, 'example');
});

test('normalizeQuoteTickPayload can update bid ask UI store while flagging missing candle timestamp', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'BTCUSD',
    bid: 85000,
    ask: 85025,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.bid, 85000);
  assert.equal(result.update.ask, 85025);
  assert.equal(result.update.timestamp, null);
  assert.equal(result.update.timestampSource, 'missing');
});

test('normalizeQuoteTickPayload uses receive-time fallback when socket feed omits timestamp', () => {
  const result = normalizeQuoteTickPayload(
    {
      symbol: 'BTCUSD',
      bid: 85000,
      ask: 85025,
    },
    1713705123456,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.bid, 85000);
  assert.equal(result.update.ask, 85025);
  assert.equal(result.update.timestamp, 1713705123456);
  assert.equal(result.update.timestampSource, 'received_at');
});

test('normalizeQuoteTickPayload maps verified live feed session fields', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'EURUSD',
    bid: 1.17121,
    ask: 1.17141,
    daily_open: 1.17223,
    previous_close: 1.17204,
    source: 'rtx_market_data',
    authority: 'rtx5_hub',
    stale: false,
    degraded: false,
    tradable: true,
    age_ms: 12,
    session: {
      high_bid: 1.17269,
      low_bid: 1.16773,
      high_ask: 1.17272,
      low_ask: 1.16776,
    },
    time: 1777409940,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'EURUSD');
  assert.equal(result.update.rawSymbol, 'EURUSD');
  assert.equal(result.update.bid, 1.17121);
  assert.equal(result.update.ask, 1.17141);
  assert.equal(result.update.dailyOpen, 1.17223);
  assert.equal(result.update.previousClose, 1.17204);
  assert.equal(result.update.source, 'rtx_market_data');
  assert.equal(result.update.authority, 'rtx5_hub');
  assert.equal(result.update.stale, false);
  assert.equal(result.update.degraded, false);
  assert.equal(result.update.tradable, true);
  assert.equal(result.update.ageMs, 12);
  assert.equal(result.update.high, 1.17269);
  assert.equal(result.update.low, 1.16773);
  assert.equal(result.update.timestamp, 1777409940);
});

test('normalizeQuoteTickPayload preserves degraded flag aliases', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'EURUSD',
    bid: 1.17121,
    ask: 1.17141,
    is_degraded: true,
    time: 1777409940,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.update.degraded, true);
});

test('normalizeQuoteTickPayload maps backend precision aliases', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'GBPUSD',
    bid: 1.33628,
    ask: 1.3364,
    symbol_digits: '5',
    point: '0.00001',
    tick_size: '0.00001',
    time: 1777409940,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.digits, 5);
  assert.equal(result.update.point, 0.00001);
  assert.equal(result.update.tickSize, 0.00001);
});

test('normalizeQuoteTickPayload accepts only non-negative backend volume', () => {
  const accepted = normalizeQuoteTickPayload({
    symbol: 'EURUSD',
    bid: 1.17121,
    ask: 1.17141,
    tick_volume: '0',
  });
  const rejected = normalizeQuoteTickPayload({
    symbol: 'EURUSD',
    bid: 1.17121,
    ask: 1.17141,
    volume: -1,
  });

  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.update.volume, 0);
  }

  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.update.volume, undefined);
  }
});

test('normalizeQuoteTickPayload keeps raw broker variants distinct from the base symbol', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'EURUSD.X1782',
    bid: 1.17121,
    ask: 1.17141,
    time: 1777409940,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'EURUSD.X1782');
  assert.equal(result.update.rawSymbol, 'EURUSD.X1782');
});

test('normalizeQuoteTickPayload rejects non-finite bid ask before it reaches candles', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'XAUUSD',
    bidPrice: Number.NaN,
    askPrice: 2300.4,
    serverTime: 1713705000,
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_bid_ask',
    rawKeys: ['symbol', 'bidPrice', 'askPrice', 'serverTime'],
  });
});

test('normalizeQuoteTickPayload rejects invalid ask when ask is present', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'EURUSD',
    bid: 1.07123,
    ask: 0,
    time: 1780000000,
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_bid_ask',
    rawKeys: ['symbol', 'bid', 'ask', 'time'],
  });
});

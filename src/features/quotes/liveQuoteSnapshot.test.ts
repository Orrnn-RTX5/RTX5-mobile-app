import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyLiveQuoteTickToSnapshot,
  buildInitialLiveQuoteSnapshot,
  hasDisplayableLiveQuotePrice,
  hasFreshLiveQuote,
} from './liveQuoteSnapshot';

test('initial snapshot never injects a mock/spec price', () => {
  assert.equal(buildInitialLiveQuoteSnapshot('EURUSD'), undefined);
  assert.deepEqual(
    buildInitialLiveQuoteSnapshot('EURUSD', { bid: 1.1, ask: 1.1002 }),
    { symbol: 'EURUSD', bid: 1.1, ask: 1.1002, digits: 5, spread: 20, volume: undefined, volumeSource: undefined },
  );
});

test('a websocket tick replaces REST non-tradable provenance instead of carrying it forward', () => {
  const previous = buildInitialLiveQuoteSnapshot('EURUSD', {
    bid: 1.1,
    ask: 1.1002,
    transport: 'rest_snapshot',
    tradable: false,
    degraded: true,
  });
  const next = applyLiveQuoteTickToSnapshot('EURUSD', previous, {
    symbol: 'EURUSD',
    bid: 1.1001,
    ask: 1.1003,
    transport: 'websocket',
    tradable: true,
    timestamp: 1_777_410_001,
    receivedAt: 1_777_410_003_000,
  }, 1);

  assert.equal(next?.transport, 'websocket');
  assert.equal(next?.tradable, true);
  assert.equal(next?.degraded, undefined);
});

test('live quote snapshots preserve explicit change percent and derive it from previous close', () => {
  const explicit = applyLiveQuoteTickToSnapshot('EURUSD', undefined, {
    symbol: 'EURUSD',
    bid: 1.09,
    ask: 1.0902,
    changePct: -1.25,
    previousClose: 1.1,
    timestamp: 1_777_410_001,
    receivedAt: 1_777_410_001_000,
  }, 1);
  const zero = applyLiveQuoteTickToSnapshot('GBPUSD', undefined, {
    symbol: 'GBPUSD',
    bid: 1.25,
    ask: 1.2502,
    changePct: 0,
    previousClose: 1.2,
    timestamp: 1_777_410_002,
    receivedAt: 1_777_410_002_000,
  }, 2);
  const derived = applyLiveQuoteTickToSnapshot('XAUUSD', undefined, {
    symbol: 'XAUUSD',
    bid: 105,
    ask: 105.1,
    previousClose: 100,
    timestamp: 1_777_410_003,
    receivedAt: 1_777_410_003_000,
  }, 3);

  assert.equal(explicit?.changePct, -1.25);
  assert.equal(zero?.changePct, 0);
  assert.equal(derived?.changePct, 5);
});

test('applyLiveQuoteTickToSnapshot refreshes duplicate backend snapshots', () => {
  const first = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    undefined,
    {
      symbol: 'EURUSD',
      bid: 1.17121,
      ask: 1.17141,
      dailyOpen: 1.17223,
      previousClose: 1.17204,
      high: 1.17269,
      low: 1.16773,
      timestamp: 1777409940,
      feedTickAt: 1777409940000,
      receivedAt: 1777410000000,
    },
    1,
    1777410000000,
  );

  assert.ok(first);
  assert.equal(first.bid, 1.17121);
  assert.equal(first.ask, 1.17141);
  assert.equal(first.high, 1.17269);
  assert.equal(first.low, 1.16773);
  assert.equal(first.lastReceivedAt, 1777410000000);
  assert.equal(first.lastPriceChangedAt, 1777410000000);
  assert.equal(first.updateSeq, 1);
  assert.equal(hasFreshLiveQuote(first, 1777410001000), true);

  const duplicate = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    first,
    {
      symbol: 'EURUSD',
      bid: 1.17121,
      ask: 1.17141,
      timestamp: 1777409940,
      feedTickAt: 1777409940000,
      receivedAt: 1777410002000,
    },
    2,
    1777410002000,
  );

  assert.ok(duplicate);
  assert.equal(duplicate.bid, 1.17121);
  assert.equal(duplicate.ask, 1.17141);
  assert.equal(duplicate.lastReceivedAt, 1777410002000);
  assert.equal(duplicate.lastPriceChangedAt, 1777410000000);
  assert.equal(duplicate.updateSeq, 2);
});

test('applyLiveQuoteTickToSnapshot tracks previous bid ask on real price movement', () => {
  const first = applyLiveQuoteTickToSnapshot(
    'GBPUSD.c',
    undefined,
    {
      symbol: 'GBPUSD.c',
      bid: 1.35155,
      ask: 1.35193,
      timestamp: 1777409999,
      receivedAt: 1777410000000,
    },
    1,
  );
  const moved = applyLiveQuoteTickToSnapshot(
    'GBPUSD.c',
    first,
    {
      symbol: 'GBPUSD.c',
      bid: 1.3517,
      ask: 1.352,
      timestamp: 1777410001,
      receivedAt: 1777410003000,
    },
    2,
  );

  assert.ok(moved);
  assert.equal(moved.symbol, 'GBPUSD.C');
  assert.equal(moved.prevBid, 1.35155);
  assert.equal(moved.prevAsk, 1.35193);
  assert.equal(moved.lastPriceChangedAt, 1777410003000);

  const differentBrokerInstrument = applyLiveQuoteTickToSnapshot(
    'GBPUSD.c',
    moved,
    {
      symbol: 'GBPUSD',
      bid: 1.36,
      ask: 1.3602,
      timestamp: 1777410002,
      receivedAt: 1777410004000,
    },
    3,
  );
  assert.equal(differentBrokerInstrument, moved);
});

test('applyLiveQuoteTickToSnapshot derives spread from displayed bid ask instead of feed spread', () => {
  const eurusd = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    undefined,
    {
      symbol: 'EURUSD',
      bid: 1.16345,
      ask: 1.16365,
      spread: 0,
      digits: 5,
      timestamp: 1777410001,
      receivedAt: 1777410003000,
    },
    1,
  );
  const xauusd = applyLiveQuoteTickToSnapshot(
    'XAUUSD',
    undefined,
    {
      symbol: 'XAUUSD',
      bid: 4475.11,
      ask: 4475.34,
      spread: 0.2,
      digits: 2,
      timestamp: 1777410001,
      receivedAt: 1777410003000,
    },
    2,
  );

  assert.equal(eurusd?.spread, 20);
  assert.equal(xauusd?.spread, 23);
});

test('applyLiveQuoteTickToSnapshot uses backend volume only and does not invent mock volume', () => {
  const withoutBackendVolume = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    undefined,
    {
      symbol: 'EURUSD',
      bid: 1.16345,
      ask: 1.16365,
      digits: 5,
      timestamp: 1777410001,
      receivedAt: 1777410003000,
    },
    1,
  );

  assert.equal(withoutBackendVolume?.volume, undefined);
  assert.equal(withoutBackendVolume?.volumeSource, undefined);

  const withBackendVolume = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    withoutBackendVolume,
    {
      symbol: 'EURUSD',
      bid: 1.16346,
      ask: 1.16366,
      volume: 0,
      digits: 5,
      timestamp: 1777410002,
      receivedAt: 1777410004000,
    },
    2,
  );

  assert.equal(withBackendVolume?.volume, 0);
  assert.equal(withBackendVolume?.volumeSource, 'backend');

  const carriedBackendVolume = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    withBackendVolume,
    {
      symbol: 'EURUSD',
      bid: 1.16347,
      ask: 1.16367,
      digits: 5,
      timestamp: 1777410003,
      receivedAt: 1777410005000,
    },
    3,
  );

  assert.equal(carriedBackendVolume?.volume, 0);
  assert.equal(carriedBackendVolume?.volumeSource, 'backend');
});

test('hasDisplayableLiveQuotePrice keeps stale snapshots renderable when prices exist', () => {
  const staleNow = 1777410100000;
  const staleSnapshot = {
    symbol: 'XAUUSD',
    bid: 3358.14,
    ask: 3358.55,
    lastReceivedAt: staleNow - 46_000,
  };

  assert.equal(hasFreshLiveQuote(staleSnapshot, staleNow), false);
  assert.equal(hasDisplayableLiveQuotePrice(staleSnapshot), true);
});

test('hasDisplayableLiveQuotePrice rejects snapshots without valid bid ask prices', () => {
  assert.equal(hasDisplayableLiveQuotePrice(undefined), false);
  assert.equal(hasDisplayableLiveQuotePrice({ symbol: 'EURUSD', bid: 1.17121 }), false);
  assert.equal(hasDisplayableLiveQuotePrice({ symbol: 'EURUSD', bid: 1.17121, ask: Number.NaN }), false);
});

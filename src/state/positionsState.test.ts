import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenPositionsCacheSignature,
  buildMergedPositions,
  dedupePositionsById,
  hasPositionPresenceConverged,
  isTerminalPositionUpdate,
  shouldClearPositionsForLoginSwitch,
} from './positionsState.helpers.ts';

const cachedPositionFixture = {
  id: '9101',
  symbol: 'EURUSD',
  side: 'buy' as const,
  volume: 0.1,
  openPrice: 1.14,
  currentPrice: 1.1401,
  pnl: 1,
  swap: 0,
  commission: -0.25,
  openTime: '2026-07-22T05:00:00.000Z',
  sl: 1.13,
  tp: 1.16,
};

test('open-position cache signature ignores price and PnL-only websocket ticks', () => {
  const before = buildOpenPositionsCacheSignature([cachedPositionFixture]);
  const after = buildOpenPositionsCacheSignature([
    {
      ...cachedPositionFixture,
      currentPrice: 1.145,
      pnl: 50,
    },
  ]);

  assert.equal(after, before);
});

test('open-position cache signature changes for open, close, size, and SL/TP ledger updates', () => {
  const initial = buildOpenPositionsCacheSignature([cachedPositionFixture]);

  assert.notEqual(
    buildOpenPositionsCacheSignature([{ ...cachedPositionFixture, volume: 0.05 }]),
    initial,
  );
  assert.notEqual(
    buildOpenPositionsCacheSignature([{ ...cachedPositionFixture, sl: 1.135 }]),
    initial,
  );
  assert.notEqual(
    buildOpenPositionsCacheSignature([{ ...cachedPositionFixture, tp: 1.17 }]),
    initial,
  );
  assert.notEqual(
    buildOpenPositionsCacheSignature([
      cachedPositionFixture,
      { ...cachedPositionFixture, id: '9102' },
    ]),
    initial,
  );
  assert.notEqual(buildOpenPositionsCacheSignature([]), initial);
});

test('shouldClearPositionsForLoginSwitch only clears when the account really changed', () => {
  assert.equal(shouldClearPositionsForLoginSwitch(null, '2001'), false);
  assert.equal(shouldClearPositionsForLoginSwitch('2001', '2001'), false);
  assert.equal(shouldClearPositionsForLoginSwitch('2001', '2002'), true);
});

test('buildMergedPositions replaces missing positions from a fresh snapshot so closed trades disappear', () => {
  const merged = buildMergedPositions(
    [
      {
        id: '301',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.1,
        currentPrice: 1.101,
        pnl: 4,
        swap: 0,
        openTime: '2026-04-16T10:00:00.000Z',
      },
      {
        id: '302',
        symbol: 'EURUSD',
        side: 'sell',
        volume: 0.2,
        openPrice: 1.102,
        currentPrice: 1.101,
        pnl: 7,
        swap: 0,
        openTime: '2026-04-16T10:01:00.000Z',
      },
    ],
    [
      {
        ticket: 302,
        symbol: 'EURUSD',
        side: 'sell',
        volume: 0.2,
        price_open: 1.102,
        price_current: 1.1005,
        profit: 14,
        swap: 0,
        commission: 0,
        time_create: 1_775_000_100,
      },
    ],
  );

  assert.deepEqual(merged.map((position) => position.id), ['302']);
  assert.equal(merged[0]?.currentPrice, 1.1005);
});

test('buildMergedPositions preserves recent optimistic positions that are still waiting for backend confirmation', () => {
  const optimisticCreatedAt = Date.now() - 5000;

  const merged = buildMergedPositions(
    [
      {
        id: '401',
        symbol: 'XAUUSD',
        side: 'buy',
        volume: 0.3,
        openPrice: 3240,
        currentPrice: 3241,
        pnl: 15,
        swap: 0,
        openTime: '2026-04-16T10:00:00.000Z',
        clientCreatedAt: optimisticCreatedAt,
      },
    ],
    [],
  );

  assert.deepEqual(merged.map((position) => position.id), ['401']);
});

test('buildMergedPositions clears optimistic state after backend confirmation so SL/TP closes disappear', () => {
  const optimisticCreatedAt = Date.now() - 5000;
  const confirmed = buildMergedPositions(
    [
      {
        id: '411',
        symbol: 'XAUUSD',
        side: 'buy',
        volume: 0.3,
        openPrice: 3240,
        currentPrice: 3241,
        pnl: 15,
        swap: 0,
        openTime: '2026-04-16T10:00:00.000Z',
        sl: 3230,
        tp: 3260,
        clientCreatedAt: optimisticCreatedAt,
      },
    ],
    [
      {
        ticket: 411,
        symbol: 'XAUUSD',
        side: 'buy',
        volume: 0.3,
        price_open: 3240,
        price_current: 3241,
        price_sl: 3230,
        price_tp: 3260,
        profit: 15,
        swap: 0,
        commission: 0,
        time_create: 1_775_000_000,
      },
    ],
  );

  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0]?.clientCreatedAt, undefined);

  const afterHitSnapshot = buildMergedPositions(confirmed, []);
  assert.deepEqual(afterHitSnapshot, []);
});

test('incremental websocket confirmation keeps optimistic convergence without dropping other rows', () => {
  const optimisticCreatedAt = Date.now() - 5000;
  const current = [
    {
      id: '421',
      symbol: 'EURUSD',
      side: 'buy' as const,
      volume: 0.1,
      openPrice: 1.14,
      currentPrice: 1.1401,
      pnl: 1,
      swap: 0,
      openTime: '2026-07-22T05:00:00.000Z',
      clientCreatedAt: optimisticCreatedAt,
    },
    {
      id: '422',
      symbol: 'XAUUSD',
      side: 'sell' as const,
      volume: 0.2,
      openPrice: 4120,
      currentPrice: 4119,
      pnl: 20,
      swap: 0,
      openTime: '2026-07-22T04:59:00.000Z',
    },
  ];

  const incremental = buildMergedPositions(
    current,
    [
      {
        ticket: 421,
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.14,
        price_current: 1.1402,
        profit: 2,
        time_create: 1_779_252_400,
      },
    ],
    { preserveMissingExisting: true },
  );

  assert.equal(incremental.find((position) => position.id === '421')?.clientCreatedAt, optimisticCreatedAt);
  assert.deepEqual(incremental.map((position) => position.id).sort(), ['421', '422']);

  const laterEmptyIncremental = buildMergedPositions(
    incremental,
    [],
    { preserveMissingExisting: true },
  );
  assert.deepEqual(laterEmptyIncremental.map((position) => position.id).sort(), ['421', '422']);
});

test('position presence converges only after authoritative confirmation or actual removal', () => {
  const optimisticPosition = {
    id: '431',
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.1,
    openPrice: 1.14,
    currentPrice: 1.1401,
    pnl: 1,
    swap: 0,
    openTime: '2026-07-22T05:00:00.000Z',
    clientCreatedAt: Date.now(),
  };

  assert.equal(hasPositionPresenceConverged([optimisticPosition], '431', true), false);
  assert.equal(
    hasPositionPresenceConverged(
      [{ ...optimisticPosition, clientCreatedAt: undefined }],
      '431',
      true,
    ),
    true,
  );
  assert.equal(hasPositionPresenceConverged([optimisticPosition], '431', false), false);
  assert.equal(hasPositionPresenceConverged([], '431', false), true);
});

test('dedupePositionsById keeps the newest optimistic row when a ticket collides', () => {
  const firstCreatedAt = Date.now();
  const deduped = dedupePositionsById([
    {
      id: '1774502954924',
      symbol: 'GBPUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.342,
      currentPrice: 1.342,
      pnl: 0,
      swap: 0,
      openTime: '2026-05-20T14:27:53.000Z',
      clientCreatedAt: firstCreatedAt,
    },
    {
      id: '1774502954924',
      symbol: 'GBPUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.341,
      currentPrice: 1.341,
      pnl: 0,
      swap: 0,
      openTime: '2026-05-20T14:27:52.000Z',
    },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.id, '1774502954924');
  assert.equal(deduped[0]?.clientCreatedAt, firstCreatedAt);
});

test('buildMergedPositions deduplicates duplicate ticket records from websocket snapshots', () => {
  const merged = buildMergedPositions(
    [],
    [
      {
        order_ticket: 1774502954924,
        symbol: 'GBPUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.3419,
        price_current: 1.3421,
        profit: 0,
        time_create: 1_779_285_473,
      },
      {
        position_ticket: 1774502954924,
        symbol: 'GBPUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.3419,
        price_current: 1.3421,
        profit: 0,
        time_create: 1_779_285_473,
      },
    ],
  );

  assert.deepEqual(merged.map((position) => position.id), ['1774502954924']);
});

test('buildMergedPositions can merge scoped websocket batches without dropping other symbols', () => {
  const merged = buildMergedPositions(
    [
      {
        id: '601',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.1,
        currentPrice: 1.101,
        pnl: 4,
        swap: 0,
        openTime: '2026-04-16T10:00:00.000Z',
      },
      {
        id: '602',
        symbol: 'XAUUSD',
        side: 'sell',
        volume: 0.2,
        openPrice: 3245,
        currentPrice: 3241,
        pnl: 80,
        swap: 0,
        openTime: '2026-04-16T10:01:00.000Z',
      },
    ],
    [
      {
        ticket: 601,
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.1,
        price_current: 1.102,
        profit: 20,
        swap: 0,
        commission: 0,
        time_create: 1_775_000_000,
      },
    ],
    { preserveMissingExisting: true },
  );

  assert.deepEqual(merged.map((position) => position.id).sort(), ['601', '602']);
  assert.equal(merged.find((position) => position.id === '601')?.currentPrice, 1.102);
  assert.equal(merged.find((position) => position.id === '602')?.symbol, 'XAUUSD');
});

test('buildMergedPositions does not create visible placeholder positions from symbol-less updates', () => {
  const merged = buildMergedPositions(
    [],
    [
      {
        ticket: 701,
        profit: 11.5,
      },
    ],
    { preserveMissingExisting: true },
  );

  assert.deepEqual(merged, []);
});

test('isTerminalPositionUpdate detects close-like lifecycle payloads so stale trades can be removed immediately', () => {
  assert.equal(isTerminalPositionUpdate({ ticket: 501, status: 'closed' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 502, action: 'closed_by' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 503, event: 'position.close' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 504, event: 'sl_hit' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 505, event: 'position.sl_hit' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 506, event: 'position.tp_hit' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 507, status: 'take_profit_hit' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 507, type: 'position.tp_hit' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 508, status: 'open' }), false);
});

test('buildMergedPositions removes terminal rows from incremental batches', () => {
  const hitPosition = { ...cachedPositionFixture, id: '507' };
  const openPosition = { ...cachedPositionFixture, id: '508', symbol: 'XAUUSD' };

  const merged = buildMergedPositions(
    [hitPosition, openPosition],
    [
      { ticket: 507, status: 'take_profit_hit' },
      { ticket: 508, profit: 12 },
    ],
    { preserveMissingExisting: true },
  );

  assert.deepEqual(merged.map((position) => position.id), ['508']);
});

test('buildMergedPositions distinguishes authoritative protection omission from sparse updates', () => {
  const existing = { ...cachedPositionFixture, id: '509' };
  const row = {
    ticket: 509,
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.1,
    price_open: 1.14,
    price_current: 1.141,
    profit: 2,
    time_create: 1_775_000_000,
  };

  const sparse = buildMergedPositions([existing], [row], { preserveMissingExisting: true });
  assert.equal(sparse[0]?.sl, existing.sl);
  assert.equal(sparse[0]?.tp, existing.tp);

  const authoritative = buildMergedPositions([existing], [row], {
    preserveMissingExisting: false,
    preserveModifiedMs: 0,
  });
  assert.equal(authoritative[0]?.sl, 0);
  assert.equal(authoritative[0]?.tp, 0);
});

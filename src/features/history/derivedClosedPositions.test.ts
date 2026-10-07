import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Deal } from '../../api/deals';
import type { ClosedPosition } from '../../api/positions';
import {
  deriveClosedPositionsFromDeals,
  mergeClosedPositionSources,
} from './derivedClosedPositions';

function makeDeal(overrides: Partial<Deal>): Deal {
  return {
    ticket: 1,
    order_ticket: 1,
    position_ticket: 1,
    account_login: 200074,
    symbol: 'BTCUSD',
    action: 'deal_buy',
    entry: 'entry_in',
    volume: 0.1,
    price: 30000,
    profit: 0,
    swap: 0,
    commission: 0,
    fee: 0,
    magic: 0,
    comment: '',
    time: 1_700_000_000,
    ...overrides,
  };
}

test('deriveClosedPositionsFromDeals pairs entry_in/entry_out into a closed BUY position', () => {
  const deals: Deal[] = [
    makeDeal({ ticket: 10, position_ticket: 100, action: 'deal_buy', entry: 'entry_in', price: 30_000, time: 1_700_000_100 }),
    makeDeal({ ticket: 11, position_ticket: 100, action: 'deal_sell', entry: 'entry_out', price: 30_500, time: 1_700_000_900, profit: 50, swap: -1, commission: -2 }),
  ];

  const result = deriveClosedPositionsFromDeals(deals);

  assert.equal(result.length, 1);
  const closed = result[0];
  assert.equal(closed.ticket, 100);
  assert.equal(closed.side, 'buy');
  assert.equal(closed.price_open, 30_000);
  assert.equal(closed.price_close, 30_500);
  assert.equal(closed.time_create, 1_700_000_100);
  assert.equal(closed.time_close, 1_700_000_900);
  assert.equal(closed.profit, 50);
  assert.equal(closed.swap, -1);
  assert.equal(closed.commission, -2);
});

test('deriveClosedPositionsFromDeals derives a SELL position from entry_in deal_sell', () => {
  const deals: Deal[] = [
    makeDeal({ position_ticket: 200, action: 'deal_sell', entry: 'entry_in', price: 1.1, time: 1_700_000_100 }),
    makeDeal({ position_ticket: 200, action: 'deal_buy', entry: 'entry_out', price: 1.05, time: 1_700_000_500, profit: 25 }),
  ];

  const [closed] = deriveClosedPositionsFromDeals(deals);
  assert.equal(closed.side, 'sell');
  assert.equal(closed.price_open, 1.1);
  assert.equal(closed.price_close, 1.05);
});

test('deriveClosedPositionsFromDeals emits one synthetic record per partial close', () => {
  const deals: Deal[] = [
    makeDeal({ position_ticket: 300, action: 'deal_buy', entry: 'entry_in', price: 100, volume: 1, time: 1_700_000_000 }),
    makeDeal({ position_ticket: 300, action: 'deal_sell', entry: 'entry_out', price: 101, volume: 0.4, time: 1_700_000_500, profit: 4 }),
    makeDeal({ position_ticket: 300, action: 'deal_sell', entry: 'entry_out', price: 102, volume: 0.6, time: 1_700_001_000, profit: 12 }),
  ];

  const result = deriveClosedPositionsFromDeals(deals);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((r) => r.volume), [0.4, 0.6]);
  assert.deepEqual(result.map((r) => r.price_close), [101, 102]);
  assert.deepEqual(result.map((r) => r.time_close), [1_700_000_500, 1_700_001_000]);
});

test('deriveClosedPositionsFromDeals tolerates a missing entry_in deal', () => {
  const deals: Deal[] = [
    // Only entry_out exists (e.g. entry_in fell off the date window)
    makeDeal({ position_ticket: 400, action: 'deal_sell', entry: 'entry_out', price: 50, time: 1_700_000_500 }),
  ];

  const result = deriveClosedPositionsFromDeals(deals);
  assert.equal(result.length, 1);
  // Closing a deal_sell means a BUY position was flattened
  assert.equal(result[0].side, 'buy');
  assert.equal(result[0].price_open, 0); // unknown without entry_in
  assert.equal(result[0].price_close, 50);
});

test('deriveClosedPositionsFromDeals returns [] for empty/null input', () => {
  assert.deepEqual(deriveClosedPositionsFromDeals(undefined), []);
  assert.deepEqual(deriveClosedPositionsFromDeals(null), []);
  assert.deepEqual(deriveClosedPositionsFromDeals([]), []);
});

test('deriveClosedPositionsFromDeals propagates fee from the closing deal', () => {
  const deals: Deal[] = [
    makeDeal({ position_ticket: 500, action: 'deal_buy', entry: 'entry_in', price: 100, time: 1_700_000_000, fee: 0 }),
    makeDeal({ position_ticket: 500, action: 'deal_sell', entry: 'entry_out', price: 105, time: 1_700_000_500, profit: 10, swap: -0.5, commission: -0.25, fee: -0.05 }),
  ];

  const [closed] = deriveClosedPositionsFromDeals(deals);
  // fee is duck-typed onto the record so resolveClosedPositionNetProfit picks it up.
  assert.equal((closed as unknown as { fee?: number }).fee, -0.05);
  // Net P/L (profit + swap + commission + fee) totals 10 + (-0.5) + (-0.25) + (-0.05) = 9.20
  const net = (closed.profit ?? 0) + (closed.swap ?? 0) + (closed.commission ?? 0) + ((closed as unknown as { fee?: number }).fee ?? 0);
  assert.equal(Number(net.toFixed(2)), 9.20);
});

test('deriveClosedPositionsFromDeals pairs by symbol (FIFO) when position_ticket is absent', () => {
  // The orrnn demo backend ships deals with no usable position_ticket. Without
  // a per-symbol fallback, every closed row inherited one arbitrary open price
  // (e.g. a USDJPY 160.256 open stamped onto a GBPUSD close).
  const deals: Deal[] = [
    makeDeal({ ticket: 1, position_ticket: 0, symbol: 'USDJPY', action: 'deal_buy', entry: 'entry_in', price: 160.256, time: 1_700_000_010 }),
    makeDeal({ ticket: 2, position_ticket: 0, symbol: 'GBPUSD', action: 'deal_buy', entry: 'entry_in', price: 1.32358, time: 1_700_000_020 }),
    makeDeal({ ticket: 3, position_ticket: 0, symbol: 'GBPUSD', action: 'deal_sell', entry: 'entry_out', price: 1.32310, time: 1_700_000_100, profit: -0.05 }),
    makeDeal({ ticket: 4, position_ticket: 0, symbol: 'USDJPY', action: 'deal_sell', entry: 'entry_out', price: 160.138, time: 1_700_000_110, profit: 0.2 }),
  ];

  const result = deriveClosedPositionsFromDeals(deals);
  const gbp = result.find((r) => r.symbol === 'GBPUSD');
  const jpy = result.find((r) => r.symbol === 'USDJPY');

  assert.ok(gbp && jpy);
  // Each close inherits its own instrument's open price — no cross-contamination.
  assert.equal(gbp!.price_open, 1.32358);
  assert.equal(jpy!.price_open, 160.256);
  assert.equal(gbp!.side, 'buy');
  assert.equal(jpy!.side, 'buy');
});

test('deriveClosedPositionsFromDeals never inherits a cross-symbol open via a colliding ticket', () => {
  // Even if a position_ticket collides across instruments, the open price must
  // come from the matching symbol (or be left unknown), never the other pair.
  const deals: Deal[] = [
    makeDeal({ ticket: 1, position_ticket: 777, symbol: 'USDJPY', action: 'deal_buy', entry: 'entry_in', price: 160.256, time: 1_700_000_010 }),
    makeDeal({ ticket: 2, position_ticket: 777, symbol: 'GBPUSD', action: 'deal_sell', entry: 'entry_out', price: 1.32310, time: 1_700_000_100 }),
  ];

  const [closed] = deriveClosedPositionsFromDeals(deals);
  assert.equal(closed.symbol, 'GBPUSD');
  assert.notEqual(closed.price_open, 160.256);
  assert.equal(closed.price_open, 0); // no GBPUSD open available → unknown, not USDJPY's
});

test('mergeClosedPositionSources dedupes across ms-vs-seconds time mismatches', () => {
  // History returns time_close in ms, deals returns it in seconds — same close
  const fromHistory: ClosedPosition[] = [
    { ticket: 500, account_login: 1, symbol: 'BTCUSD', side: 'buy', volume: 0.1, price_open: 100, price_close: 105, profit: 10, swap: 0, time_create: 1, time_update: 2, time_close: 1_700_000_500_000 } as ClosedPosition,
  ];
  const fromDeals: ClosedPosition[] = [
    { ticket: 500, account_login: 1, symbol: 'BTCUSD', side: 'buy', volume: 0.1, price_open: 100, price_close: 105, profit: 10, swap: 0, time_create: 1, time_update: 2, time_close: 1_700_000_500 } as ClosedPosition,
  ];

  const merged = mergeClosedPositionSources(fromHistory, fromDeals);
  assert.equal(merged.length, 1, 'expected ms and seconds variants of the same close to dedupe');
});

test('mergeClosedPositionSources prefers history records when (ticket, time_close) collide', () => {
  const fromHistory: ClosedPosition[] = [
    { ticket: 100, account_login: 1, symbol: 'BTCUSD', side: 'buy', volume: 0.1, price_open: 30_000, price_close: 30_500, profit: 50, swap: 0, time_create: 1, time_update: 2, time_close: 1_700_000_900 } as ClosedPosition,
  ];
  const fromDeals: ClosedPosition[] = [
    { ticket: 100, account_login: 1, symbol: 'BTCUSD', side: 'buy', volume: 0.1, price_open: 0, price_close: 30_500, profit: 50, swap: 0, time_create: 1, time_update: 2, time_close: 1_700_000_900 } as ClosedPosition,
    { ticket: 200, account_login: 1, symbol: 'EURUSD', side: 'sell', volume: 0.2, price_open: 1.1, price_close: 1.05, profit: 25, swap: 0, time_create: 1, time_update: 2, time_close: 1_700_000_500 } as ClosedPosition,
  ];

  const merged = mergeClosedPositionSources(fromHistory, fromDeals);

  // Two unique closed positions
  assert.equal(merged.length, 2);
  // The history record (with real price_open=30000) wins over the synthetic one
  const collision = merged.find((r) => r.ticket === 100);
  assert.ok(collision);
  assert.equal(collision!.price_open, 30_000);
  // The deal-only record is preserved
  assert.ok(merged.some((r) => r.ticket === 200));
});

// Contract v3 6.4: deal rows have no position_ticket; /positions/{login}/history
// may be missing closes made by the new close path (BACKEND PENDING).
const v3Deal = (overrides: Partial<Deal>): Deal => {
  const { position_ticket: _dropped, ...rest } = makeDeal(overrides);
  return rest as Deal;
};

const historyRecord = (overrides: Partial<ClosedPosition>): ClosedPosition => ({
  ticket: 2002,
  account_login: 200074,
  symbol: 'EURUSD',
  side: 'buy',
  volume: 0.01,
  price_open: 1.13745,
  price_close: 1.1376,
  profit: 0.15,
  swap: 0,
  time_create: 1790241500,
  time_update: 1790241600,
  time_close: 1790241600,
  ...overrides,
});

test('entry_out fallback fills closes missing from history and merges on the close execution', () => {
  const deals = [
    v3Deal({ ticket: 5001, symbol: 'EURUSD', action: 'deal_buy', entry: 'entry_in', volume: 0.01, price: 1.13745, time: 1790241500 }),
    v3Deal({ ticket: 5005, symbol: 'EURUSD', action: 'deal_sell', entry: 'entry_out', volume: 0.01, price: 1.1376, profit: 0.15, time: 1790241600 }),
    v3Deal({ ticket: 5006, symbol: 'XAUUSD', action: 'deal_buy', entry: 'entry_in', volume: 0.02, price: 2400, time: 1790241700 }),
    v3Deal({ ticket: 5007, symbol: 'XAUUSD', action: 'deal_sell', entry: 'entry_out', volume: 0.02, price: 2410, profit: 20, time: 1790241800 }),
  ];
  const derived = deriveClosedPositionsFromDeals(deals);
  assert.equal(derived.length, 2);

  // History has the EURUSD close (position ticket 2002, 1 s rounding apart)
  // but is missing the XAUUSD close.
  const merged = mergeClosedPositionSources(
    [historyRecord({ time_close: 1790241601, time_update: 1790241601 })],
    derived,
  );
  assert.equal(merged.length, 2, 'EURUSD is not duplicated; XAUUSD is filled from deals');
  assert.ok(merged.some((record) => record.ticket === 2002 && record.symbol === 'EURUSD'));
  assert.ok(merged.some((record) => record.symbol === 'XAUUSD' && record.profit === 20));
});

test('two same-size closes in the same second are not collapsed when history has only one', () => {
  const derived = deriveClosedPositionsFromDeals([
    v3Deal({ ticket: 1, symbol: 'EURUSD', action: 'deal_buy', entry: 'entry_in', volume: 0.01, time: 1790241000 }),
    v3Deal({ ticket: 2, symbol: 'EURUSD', action: 'deal_buy', entry: 'entry_in', volume: 0.01, time: 1790241001 }),
    v3Deal({ ticket: 3, symbol: 'EURUSD', action: 'deal_sell', entry: 'entry_out', volume: 0.01, time: 1790241600 }),
    v3Deal({ ticket: 4, symbol: 'EURUSD', action: 'deal_sell', entry: 'entry_out', volume: 0.01, time: 1790241600 }),
  ]);
  const merged = mergeClosedPositionSources([historyRecord({})], derived);
  assert.equal(merged.length, 2);
});

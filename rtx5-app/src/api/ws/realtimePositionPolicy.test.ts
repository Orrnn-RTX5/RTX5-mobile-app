import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMergedPositions } from '../../state/positionsState.helpers.ts';
import { mapPositionToItem } from '../../state/positionsMapper.ts';
import {
  filterRealtimePositionRows,
  isAuthoritativeRealtimePositionsBatch,
  resolveProtectionChangeHintTickets,
} from './realtimePositionPolicy.ts';

const makePositionRow = (identity: Record<string, unknown>, index: number) => ({
  ...identity,
  symbol: 'EURUSD',
  side: 'buy',
  volume: 0.01,
  price_open: 1.08,
  price_current: 1.081,
  profit: 0,
  time_create: 1_779_000_000 + index,
});

test('realtime generic event ids cannot reproduce the 808-position accumulation', () => {
  const canonicalRows = Array.from({ length: 8 }, (_, index) =>
    makePositionRow({ ticket: 81_000 + index }, index));
  const canonicalLedger = buildMergedPositions([], canonicalRows);
  const genericEventRows = Array.from({ length: 800 }, (_, index) =>
    makePositionRow({ id: `position-event-${index}` }, index + 8));

  // This is the observed failure mode before the realtime boundary guard.
  const unsafeMerge = buildMergedPositions(canonicalLedger, genericEventRows, {
    preserveMissingExisting: true,
  });
  assert.equal(unsafeMerge.length, 808);
  assert.equal(Number(unsafeMerge.reduce((sum, row) => sum + row.volume, 0).toFixed(2)), 8.08);

  const filtered = filterRealtimePositionRows(genericEventRows, canonicalLedger);
  assert.equal(filtered.acceptedRows.length, 0);
  assert.equal(filtered.rejectedRows, 800);

  const guardedMerge = buildMergedPositions(canonicalLedger, filtered.acceptedRows, {
    preserveMissingExisting: true,
  });
  assert.equal(guardedMerge.length, 8);
  assert.equal(Number(guardedMerge.reduce((sum, row) => sum + row.volume, 0).toFixed(2)), 0.08);
});

test('realtime creates only canonical position tickets while generic aliases may update known rows', () => {
  const knownLedger = buildMergedPositions([], [makePositionRow({ ticket: 91_001 }, 1)]);
  const filtered = filterRealtimePositionRows(
    [
      makePositionRow({ ticket: 91_002 }, 2),
      makePositionRow({ position_ticket: '91003' }, 3),
      makePositionRow({ id: 91_001 }, 4),
      makePositionRow({ id: 'unseen-event-id' }, 5),
      makePositionRow({ order_ticket: 91_004 }, 6),
      makePositionRow({ ticket: 0 }, 7),
    ],
    knownLedger,
  );

  assert.deepEqual(
    filtered.acceptedRows.map((row) => row.ticket ?? row.position_ticket ?? row.id),
    [91_002, '91003', 91_001],
  );
  assert.equal(filtered.rejectedRows, 3);
});

test('modify reconciliation hints ignore ordinary ticks and unchanged protection rows', () => {
  const current = [{ id: '91001', sl: 1.07, tp: 1.1 }];
  assert.deepEqual(resolveProtectionChangeHintTickets([
    { ticket: 91_001, price_current: 1.081, profit: 1.25 },
    { ticket: 91_001, price_sl: 1.07, price_tp: 1.1, profit: 1.5 },
  ], current), []);

  assert.deepEqual(resolveProtectionChangeHintTickets([
    { ticket: 91_001, price_sl: 1.071, price_tp: 1.1 },
    { ticket: 91_001, sl: 1.071, tp: 1.1 },
  ], current), [91_001]);
  assert.deepEqual(resolveProtectionChangeHintTickets([
    { ticket: 91_001, price_sl: null, price_tp: 1.1 },
  ], current), [91_001]);
  assert.deepEqual(resolveProtectionChangeHintTickets([
    { ticket: 91_001, price_sl: 'malformed' },
  ], current), [91_001]);
});

test('explicit full snapshots replace while scoped and default arrays remain incremental', () => {
  assert.equal(isAuthoritativeRealtimePositionsBatch('positions.snapshot'), true);
  assert.equal(isAuthoritativeRealtimePositionsBatch('positions.full'), true);
  assert.equal(isAuthoritativeRealtimePositionsBatch('', { snapshot: true }), true);
  assert.equal(isAuthoritativeRealtimePositionsBatch('account.snapshot'), true);
  assert.equal(isAuthoritativeRealtimePositionsBatch('positions.update'), false);
  assert.equal(isAuthoritativeRealtimePositionsBatch('positions.delta'), false);
  assert.equal(
    isAuthoritativeRealtimePositionsBatch('positions.snapshot', { scope: 'symbol.scoped' }),
    false,
  );
  assert.equal(isAuthoritativeRealtimePositionsBatch(''), false);
});

test('REST mapping remains compatible with valid id-only position rows', () => {
  const mapped = mapPositionToItem(makePositionRow({ id: 'rest-position-42' }, 42));
  assert.equal(mapped.id, 'rest-position-42');
  assert.equal(mapped.symbol, 'EURUSD');
  assert.equal(mapped.volume, 0.01);
});

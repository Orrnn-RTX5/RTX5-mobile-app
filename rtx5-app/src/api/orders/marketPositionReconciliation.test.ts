import assert from 'node:assert/strict';
import test from 'node:test';
import type { Position } from '../positions/index.ts';
import type { PlaceOrderResponse } from './types.ts';
import {
  hasMarketPositionReconciliationBatchConverged,
  hasMarketPositionReconciliationConverged,
  reconcileMarketOrderPositions,
} from './marketPositionReconciliation.ts';

const position = (ticket: number, volume = 0.1): Position => ({
  ticket,
  account_login: 10,
  symbol: 'EURUSD',
  side: 'buy',
  volume,
  price_open: 1.1,
  price_current: 1.1,
  profit: 0,
  swap: 0,
  time_create: 1,
  time_update: 1,
});

const response = (action: string, ticket = 55): PlaceOrderResponse => ({
  order_ticket: 54,
  position_ticket: ticket,
  price: 1.1,
  status: 'filled',
  time: 1,
  action,
  symbol: 'EURUSD',
  side: 'buy',
  volume: 0.1,
});

test('opened trade keeps a stale empty ledger off-screen until its ticket appears', async () => {
  const candidates: Position[][] = [[], [position(55)]];
  const commits: Position[][] = [];

  const result = await reconcileMarketOrderPositions(response('opened'), {
    readPositions: async () => candidates.shift() ?? [],
    commitPositions: (positions) => commits.push(positions),
    isOwnerCurrent: () => true,
    wait: async () => undefined,
  });

  assert.equal(result, 'committed');
  assert.deepEqual(commits.map((rows) => rows.map((row) => row.ticket)), [[55]]);
});

test('closed trade commits a genuine authoritative empty ledger', async () => {
  const candidates: Position[][] = [[position(55)], []];
  const commits: Position[][] = [];

  const result = await reconcileMarketOrderPositions(response('closed'), {
    readPositions: async () => candidates.shift() ?? [],
    commitPositions: (positions) => commits.push(positions),
    isOwnerCurrent: () => true,
    wait: async () => undefined,
  });

  assert.equal(result, 'committed');
  assert.deepEqual(commits, [[]]);
});

test('netting updates and unknown actions require the second read', () => {
  assert.equal(hasMarketPositionReconciliationConverged(response('increased'), [position(55)], 0), false);
  assert.equal(hasMarketPositionReconciliationConverged(response('increased'), [position(55, 0.2)], 1), true);
  assert.equal(hasMarketPositionReconciliationConverged(response(''), [position(55)], 0), false);
  assert.equal(hasMarketPositionReconciliationConverged(response(''), [position(55)], 1), true);
});

test('unresolved confirmed execution never commits a contradictory candidate', async () => {
  const commits: Position[][] = [];
  const result = await reconcileMarketOrderPositions(response('opened'), {
    readPositions: async () => [],
    commitPositions: (positions) => commits.push(positions),
    isOwnerCurrent: () => true,
    wait: async () => undefined,
    maxAttempts: 3,
  });

  assert.equal(result, 'unresolved');
  assert.deepEqual(commits, []);
});

test('owner change stops reconciliation without committing', async () => {
  let current = true;
  const commits: Position[][] = [];
  const result = await reconcileMarketOrderPositions(response('opened'), {
    readPositions: async () => {
      current = false;
      return [position(55)];
    },
    commitPositions: (positions) => commits.push(positions),
    isOwnerCurrent: () => current,
    wait: async () => undefined,
  });

  assert.equal(result, 'stale');
  assert.deepEqual(commits, []);
});

test('a 50-order batch cannot commit until every distinct opened ticket is present', async () => {
  const evidence = Array.from({ length: 50 }, (_, index) => response('opened', index + 1));
  const completeLedger = Array.from({ length: 50 }, (_, index) => position(index + 1));
  const candidates: Position[][] = [[position(50)], completeLedger];
  const commits: Position[][] = [];

  assert.equal(
    hasMarketPositionReconciliationBatchConverged(evidence, [position(50)], 1),
    false,
  );
  const result = await reconcileMarketOrderPositions(evidence, {
    readPositions: async () => candidates.shift() ?? [],
    commitPositions: (positions) => commits.push(positions),
    isOwnerCurrent: () => true,
    wait: async () => undefined,
  });

  assert.equal(result, 'committed');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].length, 50);
});

test('conflicting same-ticket presence falls back to the conservative second-read backstop', () => {
  assert.equal(
    hasMarketPositionReconciliationBatchConverged(
      [response('opened', 55), response('closed', 55)],
      [],
      0,
    ),
    false,
  );
  assert.equal(
    hasMarketPositionReconciliationBatchConverged(
      [response('opened', 55), response('closed', 55)],
      [],
      1,
    ),
    true,
  );
});

test('a same-ticket netting burst waits for two identical ledger-shape reads', async () => {
  const evidence = Array.from({ length: 50 }, () => response('increased', 55));
  const candidates = [
    [position(55, 0.2)],
    [position(55, 0.8)],
    [position(55, 1.5)],
    [position(55, 1.5)],
  ];
  const commits: Position[][] = [];
  let reads = 0;

  const result = await reconcileMarketOrderPositions(evidence, {
    readPositions: async () => {
      const candidate = candidates[Math.min(reads, candidates.length - 1)];
      reads += 1;
      return candidate;
    },
    commitPositions: (positions) => commits.push(positions),
    isOwnerCurrent: () => true,
    wait: async () => undefined,
  });

  assert.equal(result, 'committed');
  assert.equal(reads, 4);
  assert.equal(commits.length, 1);
  assert.equal(commits[0][0].volume, 1.5);
});

test('conflicting same-ticket actions do not commit a changing second snapshot', async () => {
  const candidates = [[position(55)], [], []];
  const commits: Position[][] = [];
  let reads = 0;

  const result = await reconcileMarketOrderPositions(
    [response('opened', 55), response('closed', 55)],
    {
      readPositions: async () => {
        const candidate = candidates[Math.min(reads, candidates.length - 1)];
        reads += 1;
        return candidate;
      },
      commitPositions: (positions) => commits.push(positions),
      isOwnerCurrent: () => true,
      wait: async () => undefined,
    },
  );

  assert.equal(result, 'committed');
  assert.equal(reads, 3);
  assert.deepEqual(commits, [[]]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { PendingOrderReadModel } from '../../api/orders/pendingOrders';
import { createTradingApiError } from '../../api/tradingErrors';
import { parsePendingBulkMode, runBulkPendingCancellation, selectPendingOrdersForBulk } from './pendingBulkCancel';

const order = (ticket: number, type: PendingOrderReadModel['type'] = 'buy_limit', extra: Partial<PendingOrderReadModel> = {}): PendingOrderReadModel => ({
  ticket, type, accountLogin: 123, symbol: 'EURUSD', status: 'pending', timeSetup: 1,
  volume: '0.01', price: '1.1', priceLimit: null, sl: null, tp: null, expiry: null,
  timeDone: null, comment: null, stateVersion: '1', triggerPhase: null, timeInForce: 'GTC', ...extra,
});
const types = ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop', 'buy_stop_limit', 'sell_stop_limit'] as const;
const rows = () => types.map((type, index) => order(index + 1, type));
const options = (orders: readonly PendingOrderReadModel[]) => ({ namespace: 'test-account', accountLogin: '123', assertCurrent() {}, getPendingOrders: () => orders, cancel: async (_ticket: number): Promise<unknown> => undefined });

test('bulk selectors include all six pending types and isolate Buy/Sell, account and lifecycle', () => {
  const orders = [...rows(), order(7, 'buy_limit', { accountLogin: 456 }), order(8, 'sell_limit', { status: 'filled' }), order(1), order(-1)];
  assert.deepEqual(selectPendingOrdersForBulk(orders, 'all', 123).map(row => row.ticket), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(selectPendingOrdersForBulk(orders, 'buy', '123').map(row => row.ticket), [1, 3, 5]);
  assert.deepEqual(selectPendingOrdersForBulk(orders, 'sell', 123).map(row => row.ticket), [2, 4, 6]);
  for (const value of [undefined, '', 'profitable', 'losing', ['all']]) assert.equal(parsePendingBulkMode(value), null);
  for (const value of ['all', 'buy', 'sell']) assert.equal(parsePendingBulkMode(value), value);
});

test('only reviewed tickets are deleted, exactly once, with one request in flight', async () => {
  let current = rows();
  const reviewed = current.slice(0, 3);
  const attempted: number[] = [], release: Array<() => void> = [], progress: number[] = [];
  let inFlight = 0, peak = 0;
  const pending = runBulkPendingCancellation([...reviewed, reviewed[0]], {
    ...options(current), getPendingOrders: () => current,
    cancel: async ticket => {
      attempted.push(ticket); inFlight++; peak = Math.max(peak, inFlight);
      await new Promise<void>(resolve => release.push(resolve));
      current = current.filter(row => row.ticket !== ticket); inFlight--;
    },
    onProgress: completed => progress.push(completed),
  });
  current = [...current, order(999)];
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(attempted, [1, 2, 3].slice(0, i + 1));
    release[i](); await new Promise(resolve => setImmediate(resolve));
  }
  const result = await pending;
  assert.equal(peak, 1); assert.equal(result.cancelled, 3); assert.equal(result.failed, 0);
  assert.deepEqual(progress, [1, 2, 3]); assert.ok(current.some(row => row.ticket === 999));
});

test('orders that fill or disappear during a batch are skipped rather than cancelled', async () => {
  let current = rows();
  const attempted: number[] = [];
  const result = await runBulkPendingCancellation(current.slice(0, 3), {
    ...options(current), getPendingOrders: () => current,
    cancel: async ticket => { attempted.push(ticket); current = current.filter(row => row.ticket !== 2).map(row => row.ticket === 3 ? { ...row, status: 'filled' } : row); },
  });
  assert.deepEqual(attempted, [1]); assert.equal(result.cancelled, 1); assert.equal(result.skipped, 2);
});

test('switching accounts or leaving the page stops unsent deletions', async () => {
  for (const name of ['StaleBrokerSessionError', 'PendingBulkCancelledError']) {
    let current = true; const attempted: number[] = [];
    const result = await runBulkPendingCancellation(rows(), {
      ...options(rows()),
      assertCurrent: () => { if (!current) { const error = new Error('Changed'); error.name = name; throw error; } },
      cancel: async ticket => { attempted.push(ticket); current = false; },
    });
    assert.deepEqual(attempted, [1]); assert.equal(result.cancelled, 1); assert.equal(result.notAttempted, 5);
  }
});

for (const [label, error] of [
  ['read-only', createTradingApiError(403, { error: 'INVESTOR_READ_ONLY' })],
  ['expired session', createTradingApiError(401)],
  ['rate limit', createTradingApiError(429, { error: 'ORDER_RATE_LIMITED' })],
  ['server error', createTradingApiError(503)],
  ['network failure', new TypeError('Network request failed')],
  ['timeout', new Error('Request timed out after 35000ms')],
  ['uncertain acknowledgement', createTradingApiError(202, { error: 'ORDER_CONFIRMATION_PENDING' })],
] as const) test(`${label} stops remaining deletions without automatic retries`, async () => {
  const attempted: number[] = [];
  const result = await runBulkPendingCancellation(rows(), {
    ...options(rows()), cancel: async ticket => { attempted.push(ticket); throw error; },
  });
  assert.deepEqual(attempted, [1]); assert.equal(result.failed, 1); assert.equal(result.notAttempted, 5);
  assert.equal(result.stopError, error);
});

test('a ticket-specific rejection is reported while unrelated reviewed orders continue', async () => {
  const attempted: number[] = [];
  const result = await runBulkPendingCancellation(rows().slice(0, 3), {
    ...options(rows()), cancel: async ticket => { attempted.push(ticket); if (ticket === 2) throw createTradingApiError(409, { error: 'ORDER_STATE_CHANGED' }); },
  });
  assert.deepEqual(attempted, [1, 2, 3]); assert.equal(result.cancelled, 2); assert.equal(result.failed, 1);
});

test('duplicate batches for an account are blocked and its lock is released after completion', async () => {
  let release!: () => void;
  const first = runBulkPendingCancellation([order(1)], { ...options(rows()), cancel: async () => new Promise<void>(resolve => { release = resolve; }) });
  await assert.rejects(runBulkPendingCancellation([order(2)], options(rows())), /still running/);
  release(); await first;
  assert.equal((await runBulkPendingCancellation([order(2)], options(rows()))).cancelled, 1);
});

test('an invalidated owner or empty selection never sends a deletion', async () => {
  const invalid = await runBulkPendingCancellation(rows(), { ...options(rows()), assertCurrent: () => { throw new Error('Account changed'); }, cancel: async () => assert.fail('must not send') });
  assert.equal(invalid.notAttempted, 6);
  const empty = await runBulkPendingCancellation([], { ...options([]), cancel: async () => assert.fail('must not send') });
  assert.equal(empty.cancelled, 0); assert.equal(empty.failed, 0);
});

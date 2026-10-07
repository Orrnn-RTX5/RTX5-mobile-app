import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Deal } from '../api/deals';
import {
  buildAccountDealsQueryKey,
  filterDealsByTimeRange,
  mergeDealHistorySources,
  shouldRetryDealsWithoutRange,
} from './dealsHistory';

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

test('account deals query key is scoped by active epoch and login', () => {
  assert.deepEqual(buildAccountDealsQueryKey('broker-a:200082:7', 200082, 1_700_000_000, 1_700_086_400), [
    'accountDeals',
    'broker-a:200082:7',
    200082,
    1_700_000_000,
    1_700_086_400,
  ]);

  assert.notDeepEqual(
    buildAccountDealsQueryKey('broker-a:200082:7', 200082, 1_700_000_000, 1_700_086_400),
    buildAccountDealsQueryKey('broker-a:300082:8', 300082, 1_700_000_000, 1_700_086_400),
  );
});

test('mergeDealHistorySources preserves account deals and appends demo login fallback deals', () => {
  const accountDeal = makeDeal({ ticket: 10, position_ticket: 100, price: 30000 });
  const duplicateLoginDeal = makeDeal({ ticket: 10, position_ticket: 100, price: 29999 });
  const demoFallbackDeal = makeDeal({ ticket: 11, position_ticket: 100, entry: 'entry_out', price: 30500, profit: 50 });

  const merged = mergeDealHistorySources([accountDeal], [duplicateLoginDeal, demoFallbackDeal]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].price, 30000, 'account endpoint remains authoritative for duplicate deals');
  assert.equal(merged[1].ticket, 11, 'login-scoped demo fallback deal is preserved');
});

test('filterDealsByTimeRange applies the selected history window to fallback deals', () => {
  const outside = makeDeal({ ticket: 20, time: 1_699_999_999 });
  const insideSeconds = makeDeal({ ticket: 21, time: 1_700_000_100 });
  const insideMs = makeDeal({ ticket: 22, time: 1_700_000_200_000 });
  const exactUpperBoundary = makeDeal({ ticket: 23, time: 1_700_000_300 });

  const filtered = filterDealsByTimeRange(
    [outside, insideSeconds, insideMs, exactUpperBoundary],
    1_700_000_000,
    1_700_000_300,
  );

  assert.deepEqual(filtered.map((deal) => deal.ticket), [21, 22]);
});

test('range fallback is limited to explicit unsupported-parameter responses', () => {
  assert.equal(shouldRetryDealsWithoutRange({
    status: 422,
    data: { detail: 'Unexpected parameter: from' },
  }), true);
  assert.equal(shouldRetryDealsWithoutRange({
    response: { status: 400, data: { message: 'Date range is not supported' } },
  }), true);
  assert.equal(shouldRetryDealsWithoutRange({ status: 400, message: 'Invalid account login' }), false);
  assert.equal(shouldRetryDealsWithoutRange({ status: 401, message: 'from parameter unauthorized' }), false);
  assert.equal(shouldRetryDealsWithoutRange({ status: 500, message: 'unsupported from parameter' }), false);
  assert.equal(shouldRetryDealsWithoutRange(new Error('Network request timed out')), false);
});

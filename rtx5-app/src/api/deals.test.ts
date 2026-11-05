import assert from 'node:assert/strict';
import test from 'node:test';

import { ACCOUNT_DEALS_PAGE_SIZE, fetchAllAccountDeals, fetchAccountDealHistory, readDealsPayload, type Deal } from './deals';

// Contract v3 6.4 deal row (note: no position_ticket).
const deal = (ticket: number): Deal => ({
  ticket,
  order_ticket: 1003,
  account_login: 200074,
  symbol: 'EURUSD',
  action: 'deal_sell',
  entry: 'entry_out',
  volume: 0.01,
  price: 1.1376,
  profit: 0.15,
  commission: 0,
  swap: 0,
  fee: 0,
  time: 1790241600 + ticket,
  comment: '',
} as unknown as Deal);

test('account deals are walked with limit=1000 offset paging until a short page', async () => {
  const total = 2_345;
  const all = Array.from({ length: total }, (_, index) => deal(index + 1));
  const calls: Array<[number, number, number | undefined, number | undefined]> = [];
  const result = await fetchAllAccountDeals({
    from: 1_790_000_000,
    to: 1_790_500_000,
    fetchPage: async (limit, offset, from, to) => {
      calls.push([limit, offset, from, to]);
      return all.slice(offset, offset + limit);
    },
  });
  assert.equal(ACCOUNT_DEALS_PAGE_SIZE, 1000);
  assert.equal(result.length, total);
  assert.deepEqual(calls, [
    [1000, 0, 1_790_000_000, 1_790_500_000],
    [1000, 1000, 1_790_000_000, 1_790_500_000],
    [1000, 2000, 1_790_000_000, 1_790_500_000],
  ]);
});

test('an exact multiple of the page size ends on the empty page', async () => {
  const all = Array.from({ length: 1000 }, (_, index) => deal(index + 1));
  let calls = 0;
  const result = await fetchAllAccountDeals({
    fetchPage: async (limit, offset) => {
      calls += 1;
      return all.slice(offset, offset + limit);
    },
  });
  assert.equal(result.length, 1000);
  assert.equal(calls, 2);
});

test('a server that ignores offset stops after the repeated page', async () => {
  const page = Array.from({ length: 1000 }, (_, index) => deal(index + 1));
  let calls = 0;
  const result = await fetchAllAccountDeals({
    fetchPage: async () => {
      calls += 1;
      return page;
    },
  });
  assert.equal(result.length, 1000);
  assert.equal(calls, 2);
});


test('malformed deal records fail visibly rather than becoming empty or zero-valued history', async () => {
  for (const invalid of [null, {}, { ...deal(1), price: 'bad' }, { ...deal(1), time: null }, { ...deal(1), ticket: NaN }]) {
    assert.throws(() => readDealsPayload([invalid]), /Invalid deal history/);
  }
  await assert.rejects(fetchAllAccountDeals({ fetchPage: async () => [null] as unknown as Deal[] }), /Invalid deal history/);
  assert.deepEqual(readDealsPayload({ data: [] }), []);
});

test('nested deal payloads normalize numeric strings and preserve optional position tickets', () => {
  const parsed = readDealsPayload({ data: { deals: [{ ...deal(1), price: '1.1376', profit: '0.15' }] } });
  assert.equal(parsed[0].price, 1.1376); assert.equal(parsed[0].profit, 0.15);
  assert.equal(parsed[0].position_ticket, undefined);
});

test('page caps and ignored offsets explicitly mark history as incomplete', async () => {
  const page = Array.from({ length: 1000 }, (_, index) => deal(index + 1));
  const capped = await fetchAccountDealHistory({ maxPages: 1, fetchPage: async () => page });
  assert.equal(capped.complete, false); assert.equal(capped.reason, 'page-limit');
  const repeated = await fetchAccountDealHistory({ fetchPage: async () => page });
  assert.equal(repeated.complete, false); assert.equal(repeated.reason, 'repeated-page');
  const complete = await fetchAccountDealHistory({ fetchPage: async () => page.slice(0, 3) });
  assert.equal(complete.complete, true); assert.equal(complete.reason, null);
});

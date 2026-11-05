import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTransactionsPath,
  parseTransactionsPage,
} from './transactions';

const headers = (values: Record<string, string>) => ({
  get: (name: string) => {
    const match = Object.keys(values).find((key) => key.toLowerCase() === name.toLowerCase());
    return match ? values[match] : null;
  },
});

test('transactions use GET /accounts/{login}/history with page/limit and optional filters', () => {
  assert.equal(
    buildTransactionsPath({ login: 200074 }),
    '/accounts/200074/history?page=1&limit=50',
  );
  assert.equal(
    buildTransactionsPath({ login: '200074', page: 2, limit: 25, from: 1790000000, to: 1790241600, type: 'deposit' }),
    '/accounts/200074/history?page=2&limit=25&from=1790000000&to=1790241600&type=deposit',
  );
  assert.throws(() => buildTransactionsPath({ login: '' }), /Login ID is required/);
});

test('transactions map contract rows and read totals from X-Total-Count / X-Page / X-Limit', () => {
  const page = parseTransactionsPage(
    [
      { id: 11, account_login: 200074, type: 'deposit', amount: 10000, time: 1789659971, balance_after: 10000, comment: 'Initial' },
      { id: 12, account_login: 200074, type: 'withdrawal', amount: -250, time: 1790241600, balance_after: 9750 },
      { account_login: 200074, amount: 1 },
    ],
    headers({ 'X-Total-Count': '137', 'X-Page': '1', 'X-Limit': '50' }),
    { login: 200074 },
  );

  assert.equal(page.total, 137);
  assert.equal(page.page, 1);
  assert.equal(page.limit, 50);
  assert.deepEqual(page.transactions, [
    { id: 11, account_login: 200074, type: 'deposit', amount: 10000, time: 1789659971, balance_after: 10000, comment: 'Initial' },
    { id: 12, account_login: 200074, type: 'withdrawal', amount: -250, time: 1790241600, balance_after: 9750 },
  ]);
});

test('missing paging headers fall back to the request and an unknown total', () => {
  const page = parseTransactionsPage([], headers({}), { login: 200074, page: 3, limit: 20 });
  assert.equal(page.total, null);
  assert.equal(page.page, 3);
  assert.equal(page.limit, 20);
  assert.deepEqual(parseTransactionsPage({ error: 'x' }, null, { login: 1 }).transactions, []);
});

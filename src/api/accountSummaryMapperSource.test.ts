import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  formatMarginLevel,
  isInvestorReadOnlySession,
  mapAccountSummaryApiResponse,
  type AccountSummaryApiResponse,
} from './account.ts';

const source = () => readFileSync(resolve(process.cwd(), 'src/api/account.ts'), 'utf8');

// Contract v3 example: GET /account/{login}
const CONTRACT_ACCOUNT = {
  login: 200074,
  name: 'John Doe',
  group: 'real\\standard',
  leverage: 100,
  currency: 'USD',
  balance: 10000,
  credit: 0,
  status: 'active',
  created_at: 1789659971,
  updated_at: 1790241500,
  equity: 10000.15,
  used_margin: 11.37,
  free_margin: 9988.78,
  margin_level: 87952.5,
  floating_pnl: 0.15,
  total_swap: 0,
} as const;

test('account summary mapper reads the contract keys, used_margin first', () => {
  const accountSource = source();
  assert.match(accountSource, /export function mapAccountSummaryApiResponse/);
  assert.match(accountSource, /raw\.used_margin,[\s\S]*raw\.margin_used,[\s\S]*raw\.margin,/);
  // Missing server metrics are never recomputed from balance/credit.
  assert.doesNotMatch(accountSource, /balance \+ credit \+ profit|equity - margin|\(equity \/ margin\) \* 100/);

  const summary = mapAccountSummaryApiResponse(CONTRACT_ACCOUNT as unknown as AccountSummaryApiResponse);
  assert.equal(summary.balance, 10000);
  assert.equal(summary.credit, 0);
  assert.equal(summary.equity, 10000.15);
  assert.equal(summary.margin, 11.37);
  assert.equal(summary.freeMargin, 9988.78);
  assert.equal(summary.marginLevel, 87952.5);
  assert.equal(summary.profit, 0.15);
  assert.equal(summary.totalSwap, 0);
  assert.equal(summary.leverage, 100);
  assert.equal(summary.name, 'John Doe');
  assert.equal(summary.group, 'real\\standard');
  assert.deepEqual(summary.staleMetrics, []);
  assert.equal('openPositions' in summary, false);
  assert.equal('pendingOrders' in summary, false);
});

test('account summary mapper normalizes margin aliases without blank-value masking', () => {
  const summary = mapAccountSummaryApiResponse({
    id: '200082',
    balance: '10000',
    credit: '25',
    equity: '10050',
    margin_used: ' ',
    used_margin: '125.5',
    free_margin: '',
    freeMargin: '9924.5',
    margin_level: null,
    marginLevel: '8007.97',
    floating: '50',
    currency: 'USD',
    leverage: '500',
  } satisfies AccountSummaryApiResponse);

  assert.equal(summary.margin, 125.5);
  assert.equal(summary.freeMargin, 9924.5);
  assert.equal(summary.marginLevel, 8007.97);
  assert.deepEqual(summary.staleMetrics, []);
});

test('account summary mapper preserves a fractional backend balance', () => {
  const summary = mapAccountSummaryApiResponse({
    id: '200082',
    balance: '1233.73',
    equity: '1233.73',
    currency: 'USD',
    leverage: 500,
  } satisfies AccountSummaryApiResponse);

  assert.equal(summary.balance, 1233.73);
});

test('missing server metrics keep the last known values and are marked stale', () => {
  const previous = mapAccountSummaryApiResponse(CONTRACT_ACCOUNT as unknown as AccountSummaryApiResponse);
  const {
    equity: _equity,
    used_margin: _usedMargin,
    free_margin: _freeMargin,
    margin_level: _marginLevel,
    floating_pnl: _floating,
    ...failedCalculation
  } = CONTRACT_ACCOUNT;

  const next = mapAccountSummaryApiResponse(
    { ...failedCalculation, balance: 10005 } as unknown as AccountSummaryApiResponse,
    previous,
  );
  assert.equal(next.balance, 10005);
  assert.equal(next.equity, 10000.15);
  assert.equal(next.margin, 11.37);
  assert.equal(next.freeMargin, 9988.78);
  assert.equal(next.marginLevel, 87952.5);
  assert.equal(next.profit, 0.15);
  assert.deepEqual([...next.staleMetrics].sort(), ['equity', 'freeMargin', 'margin', 'marginLevel', 'profit']);

  // First load with no earlier value: placeholder 0, flagged stale, not recomputed.
  const first = mapAccountSummaryApiResponse(
    { ...failedCalculation, balance: 10005, credit: 25 } as unknown as AccountSummaryApiResponse,
  );
  assert.equal(first.equity, 0);
  assert.equal(first.freeMargin, 0);
  assert.equal(first.staleMetrics.includes('equity'), true);
});

test('explicit zero values are kept and margin_level 0 displays as an em dash', () => {
  const zero = mapAccountSummaryApiResponse({
    id: '200082',
    balance: 10000,
    equity: 10000,
    used_margin: 0,
    free_margin: 10000,
    margin_level: 0,
    floating_pnl: 0,
    currency: null,
    account_currency: 'EUR',
    leverage: 500,
  } satisfies AccountSummaryApiResponse);

  assert.equal(zero.margin, 0);
  assert.equal(zero.marginLevel, 0);
  assert.equal(zero.currency, 'EUR');
  assert.deepEqual(zero.staleMetrics, []);
  assert.equal(formatMarginLevel(zero.marginLevel), '—');
  assert.equal(formatMarginLevel(Number.NaN), '—');
  assert.equal(formatMarginLevel(87952.5), '87952.50%');
  assert.equal(formatMarginLevel(150, (value) => value.toFixed(0)), '150%');
});

test('investor sessions are read-only', () => {
  assert.equal(isInvestorReadOnlySession({ login_type: 'investor' }), true);
  assert.equal(isInvestorReadOnlySession({ login_type: 'master', investor: true }), true);
  assert.equal(isInvestorReadOnlySession({ login_type: 'master', investor: false }), false);
  assert.equal(isInvestorReadOnlySession(null), false);
});

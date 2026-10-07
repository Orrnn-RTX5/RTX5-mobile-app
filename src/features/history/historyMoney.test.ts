import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Deal } from '../../api/deals';
import type { ClosedPosition } from '../../api/positions';
import {
  calculateHistoryMoneySummary,
  resolveClosedPositionNetProfit,
  resolveDealBalanceOperation,
} from './historyMoney';

function makeClosedPosition(overrides: Partial<ClosedPosition> & Record<string, unknown>): ClosedPosition {
  return {
    ticket: 1,
    account_login: 200074,
    symbol: 'GBPUSD',
    side: 'buy',
    volume: 0.02,
    price_open: 1.33,
    price_close: 1.331,
    profit: 0,
    swap: 0,
    commission: 0,
    time_create: 1_700_000_000,
    time_update: 1_700_000_100,
    time_close: 1_700_000_100,
    ...overrides,
  } as ClosedPosition;
}

function makeDeal(overrides: Partial<Deal> & Record<string, unknown>): Deal {
  return {
    ticket: 1,
    order_ticket: 1,
    position_ticket: 1,
    account_login: 200074,
    symbol: 'GBPUSD',
    action: 'deal_buy',
    entry: 'entry_in',
    volume: 0.02,
    price: 1.33,
    profit: 0,
    swap: 0,
    commission: 0,
    fee: 0,
    magic: 0,
    comment: '',
    time: 1_700_000_000,
    ...overrides,
  } as Deal;
}

test('resolveClosedPositionNetProfit includes swap, commission, and fee once', () => {
  const position = makeClosedPosition({
    profit: 10,
    swap: -0.5,
    commission: -0.25,
    fee: -0.05,
  });

  assert.equal(Number(resolveClosedPositionNetProfit(position).toFixed(2)), 9.2);
});

test('resolveClosedPositionNetProfit prefers broker-provided net profit when present', () => {
  const position = makeClosedPosition({
    net_profit: 8.75,
    profit: 10,
    swap: -0.5,
    commission: -0.25,
  });

  assert.equal(resolveClosedPositionNetProfit(position), 8.75);
});

test('calculateHistoryMoneySummary reads exact deposit from balance-operation deals', () => {
  const closedPositions = [
    makeClosedPosition({ profit: -10, swap: -1, commission: -2 }),
  ];
  const deals = [
    makeDeal({ action: 'deal_balance', entry: 'balance', symbol: '', profit: 10_000 }),
    makeDeal({ action: 'deal_sell', entry: 'entry_out', profit: -10, swap: -1, commission: -2 }),
  ];

  const summary = calculateHistoryMoneySummary({
    closedPositions,
    deals,
    balance: 9_987,
  });

  assert.equal(summary.depositSource, 'balance-operations');
  assert.equal(summary.deposit, 10_000);
  assert.equal(summary.closedSwap, -1);
  assert.equal(summary.closedCommission, -2);
  assert.equal(summary.totalClosedPnl, -13);
});

test('calculateHistoryMoneySummary does not count withdrawals as deposits', () => {
  const summary = calculateHistoryMoneySummary({
    closedPositions: [],
    deals: [
      makeDeal({ action: 'withdrawal', entry: 'balance', symbol: '', amount: 500, profit: 500 }),
    ],
    balance: 9_500,
  });

  assert.equal(summary.depositSource, 'balance-operations');
  assert.equal(summary.deposit, 0);
});

test('calculateHistoryMoneySummary keeps old fallback when deposit ledger rows are absent', () => {
  const closedPositions = [
    makeClosedPosition({ profit: -50, swap: -1, commission: -2 }),
  ];

  const summary = calculateHistoryMoneySummary({
    closedPositions,
    deals: [
      makeDeal({ action: 'deal_sell', entry: 'entry_out', profit: -50, swap: -1, commission: -2 }),
    ],
    balance: 9_947,
  });

  assert.equal(summary.depositSource, 'balance-minus-closed-pnl');
  assert.equal(summary.totalClosedPnl, -53);
  assert.equal(summary.deposit, 10_000);
});

test('calculateHistoryMoneySummary does not treat normal trade comments as deposits', () => {
  const summary = calculateHistoryMoneySummary({
    closedPositions: [],
    deals: [
      makeDeal({ action: 'deal_buy', entry: 'entry_out', comment: 'deposit setup note', profit: 20 }),
    ],
    balance: 10_020,
  });

  assert.equal(summary.depositSource, 'balance-minus-closed-pnl');
  assert.equal(summary.deposit, 10_020);
});

test('resolveDealBalanceOperation classifies deposit rows without treating them as trades', () => {
  const operation = resolveDealBalanceOperation(
    makeDeal({ action: 'deal_balance', entry: 'balance', symbol: '', profit: 10_000 }),
  );

  assert.deepEqual(operation, {
    amount: 10_000,
    kind: 'deposit',
  });
});

test('resolveDealBalanceOperation classifies positive withdrawal amounts as negative cash flow', () => {
  const operation = resolveDealBalanceOperation(
    makeDeal({ action: 'withdrawal', entry: 'balance', symbol: '', amount: 250, profit: 250 }),
  );

  assert.deepEqual(operation, {
    amount: -250,
    kind: 'withdrawal',
  });
});

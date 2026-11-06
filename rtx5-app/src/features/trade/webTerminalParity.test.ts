import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAccountAmount,
  METRIC_UNAVAILABLE,
  readBackendNumber,
  resolveAccountCurrencyDigits,
} from '../../utils/accountCurrency';
import {
  accountMetricsUnavailable,
  extractAccountMetrics,
  isBackendAccountForLogin,
  isOtherBrokerId,
  mergeAccountMetricsSnapshots,
  normalizeAccountMetrics,
  resolveTradeAccountMetrics,
} from '../../utils/accountMetrics';
import {
  applyLivePositionProfit,
  isAccountBlown,
} from './accountSummary';
import {
  BACKEND_PROFIT_ROUNDING_TOLERANCE,
  calculateLivePositionProfit,
  calculateOpenPositionsTotals,
  formatPositionProfitPoints,
  readBackendPositionMargin,
  readBackendPositionProfit,
  resolveTradeProfit,
} from './livePositionMetrics';
import {
  buildOrderTicketMarginPayload,
  formatOrderTicketRequiredMargin,
  ORDER_TICKET_MARGIN_DEBOUNCE_MS,
  resolveOrderTicketRequiredMargin,
} from './orderTicketBackendValues';
import {
  calculateHistoryFinancialSummary,
  filterHistoryByPeriodAndSymbol,
  formatHistoryBalanceMetric,
} from '../history/historyMoney';
import {
  collapseDealHistory,
  resolveClosedPositionsHistory,
} from '../history/derivedClosedPositions';
import {
  fetchAllBalanceLedgerOperations,
  normalizeBalanceLedgerOperation,
} from '../../api/transactions';
import {
  deduplicateDeals,
  fetchDealsWithFallback,
  type Deal,
} from '../../api/deals';
import { calculateAccountExposure } from './exposure';
import { compareStateVersions, mapPositionToItem } from '../../state/positionsMapper';
import {
  filterRealtimePositionRows,
  isAuthoritativeRealtimePositionsBatch,
} from '../../api/ws/realtimePositionPolicy';

test('1. Unwrapping & Provenance: normalizeAccountMetrics unwraps Money objects and nested envelopes while preserving outer publication_token', () => {
  const rawEnvelope = {
    publication_token: '00000000000000000125',
    broker_id: 'broker-alpha',
    data: {
      account: {
        login: 200074,
        balance_amount: { amount: '12,500.50', currency: 'USD', scale: 2 },
        credit_amount: { amount: 250, currency: 'USD', scale: 2 },
        equity_amount: { amount: '12,780.75', currency: 'USD', scale: 2 },
        used_margin: { amount: '150.25', currency: 'USD', scale: 2 },
        free_margin_amount: { amount: '12,630.50', currency: 'USD', scale: 2 },
        floating_pnl: { amount: '30.25', currency: 'USD', scale: 2 },
        margin_level: '8506.32',
        leverage: '500',
      },
    },
  };

  const unwrapped = extractAccountMetrics(rawEnvelope);
  assert.ok(unwrapped);
  assert.equal(unwrapped.publication_token, '00000000000000000125');
  assert.equal(unwrapped.broker_id, 'broker-alpha');

  const normalized = normalizeAccountMetrics(rawEnvelope);
  assert.equal(normalized.publicationToken, '00000000000000000125');
  assert.equal(normalized.balance, 12500.5);
  assert.equal(normalized.credit, 250);
  assert.equal(normalized.equity, 12780.75);
  assert.equal(normalized.margin, 150.25);
  assert.equal(normalized.freeMargin, 12630.5);
  assert.equal(normalized.floatingPnL, 30.25);
  assert.equal(normalized.unrealizedPL, 30.25);
  assert.equal(normalized.marginLevel, 8506.32);
  assert.equal(normalized.currency, 'USD');
  assert.equal(normalized.currencyDigits, 2);
  assert.equal(normalized.leverage, 500);
  assert.equal(normalized.hasBackendBalance, true);
  assert.equal(normalized.hasBackendMargin, true);

  // Missing or negative used_margin sets hasBackendMargin = false and renders '' (METRIC_UNAVAILABLE), never 0.00
  const negativeMarginAccount = normalizeAccountMetrics({
    balance: 1000,
    equity: 1000,
    used_margin: -10,
    currency: 'USD',
    currency_digits: 2,
  });
  assert.equal(negativeMarginAccount.hasBackendMargin, false);
  assert.equal(negativeMarginAccount.margin, 0);

  const resolvedNegativeMargin = resolveTradeAccountMetrics({
    balance: 1000,
    equity: 1000,
    used_margin: -10,
    currency: 'USD',
    currency_digits: 2,
  });
  assert.equal(resolvedNegativeMargin.margin, null);
  assert.equal(
    formatAccountAmount(resolvedNegativeMargin.margin, negativeMarginAccount.currencyDigits),
    METRIC_UNAVAILABLE,
  );

  const missingMarginResolved = resolveTradeAccountMetrics({
    balance: 1000,
    equity: 1000,
    currency: 'USD',
    currency_digits: 2,
  });
  assert.equal(missingMarginResolved.margin, null);
  assert.equal(formatAccountAmount(missingMarginResolved.margin, 2), '');
});

test('2. Publication Token & Staleness: monotonicity and validity gates', () => {
  const tokenNew = '00000000000000000200';
  const tokenOld = '00000000000000000199';

  const snapshotNew = mergeAccountMetricsSnapshots(null, {
    login: 200074,
    publication_token: tokenNew,
    balance: 5000,
    equity: 5150,
    used_margin: 100,
    free_margin: 5050,
    floating_pnl: 150,
    margin_level: 5150,
  });
  assert.ok(snapshotNew);
  assert.equal(snapshotNew.equity, 5150);

  // Older publication_token is rejected and never rolls back newer snapshot
  const afterOld = mergeAccountMetricsSnapshots(snapshotNew, {
    login: 200074,
    publication_token: tokenOld,
    balance: 4000,
    equity: 4000,
    used_margin: 50,
    free_margin: 3950,
    floating_pnl: 0,
    margin_level: 8000,
  });
  assert.equal(afterOld?.equity, 5150);
  assert.equal(afterOld?.balance, 5000);
  assert.equal(afterOld?.publicationToken, tokenNew);

  // Untokenized response after tokenized snapshot only merges profile metadata (currency, currencyDigits, leverage)
  const afterUntokenizedProfile = mergeAccountMetricsSnapshots(snapshotNew, {
    login: 200074,
    balance: 1000,
    equity: 1000,
    currency: 'JPY',
    currency_digits: 0,
    leverage: 200,
  });
  assert.equal(afterUntokenizedProfile?.balance, 5000);
  assert.equal(afterUntokenizedProfile?.equity, 5150);
  assert.equal(afterUntokenizedProfile?.currency, 'JPY');
  assert.equal(afterUntokenizedProfile?.currencyDigits, 0);
  assert.equal(afterUntokenizedProfile?.leverage, 200);

  // Cross-broker and cross-login scope guards discard mismatched packets
  assert.equal(isOtherBrokerId({ broker_id: 'broker-b' }, 'broker-a'), true);
  assert.equal(isBackendAccountForLogin({ login: 999999 }, 200074), false);

  // valid: false, stale: true, or malformed publication_token transitions all metrics to null -> ''
  for (const invalidPayload of [
    { balance: 5000, equity: 5000, valid: false, currency: 'USD' },
    { balance: 5000, equity: 5000, stale: true, currency: 'USD' },
    { balance: 5000, equity: 5000, status: 'unavailable', currency: 'USD' },
    { balance: 5000, equity: 5000, publication_token: 'bad-token', currency: 'USD' },
    { balance: 5000, equity: 5000, publication_token: '00000000000000000000', currency: 'USD' },
    { balance: 5000, equity: 5000, calculated_at: Date.now() + 60_000, currency: 'USD' },
  ]) {
    assert.equal(accountMetricsUnavailable(invalidPayload), true);
    const metrics = resolveTradeAccountMetrics(invalidPayload);
    assert.equal(metrics.balance, null);
    assert.equal(metrics.equity, null);
    assert.equal(metrics.margin, null);
    assert.equal(metrics.freeMargin, null);
    assert.equal(metrics.marginLevel, null);
    assert.equal(metrics.floatingPnL, null);
    assert.equal(formatAccountAmount(metrics.balance, 2), '');
    assert.equal(formatAccountAmount(metrics.equity, 2), '');
  }
});

test('3. Live Position Profit & Between-Snapshot Account Metrics', () => {
  const contractSizes = new Map<string, number>([
    ['EURUSD', 100_000],
    ['BTCUSD', 1],
  ]);

  // Sub-cent live profit within 0.005 of backend rounded profit uses precise value
  const posWithinTolerance = {
    symbol: 'BTCUSD',
    side: 'BUY',
    volume: 0.01,
    openPrice: 60000,
    currentPrice: 60123.456,
    profit: 1.23, // precise is (60123.456 - 60000) * 0.01 * 1 = 1.23456 (diff = 0.00456 <= 0.005)
    margin: 12,
    swap: -0.1,
    commission: -0.05,
  };
  const resolvedPrecise = resolveTradeProfit(posWithinTolerance, contractSizes);
  assert.ok(resolvedPrecise.value !== null);
  assert.ok(Math.abs(resolvedPrecise.value - 1.23456) < 1e-9);
  assert.equal(resolvedPrecise.precise, true);
  assert.ok(Math.abs(1.23456 - 1.23) <= BACKEND_PROFIT_ROUNDING_TOLERANCE);

  // Outside 0.005 tolerance (e.g., cross-currency conversion on EURJPY in USD account) falls back to backend profit
  const posCrossCurrency = {
    symbol: 'EURUSD',
    side: 'BUY',
    volume: 0.1,
    openPrice: 1.1000,
    currentPrice: 1.1010,
    contractSize: 100_000,
    profit: 8.45, // raw quote diff would be 10.00, backend converted to account currency = 8.45
    margin: 22,
  };
  const resolvedBackendFallback = resolveTradeProfit(posCrossCurrency);
  assert.equal(resolvedBackendFallback.value, 8.45);
  assert.equal(resolvedBackendFallback.precise, false);

  // White-label rule: missing contractSize never guesses 100,000; falls back to backend profit
  const posNoContractSize = {
    symbol: 'EURUSD',
    side: 'BUY',
    volume: 0.1,
    openPrice: 1.1000,
    currentPrice: 1.10004,
    profit: 0.4,
  };
  assert.equal(calculateLivePositionProfit(posNoContractSize), null);
  assert.equal(resolveTradeProfit(posNoContractSize).value, 0.4);

  // Points mode formatting
  assert.equal(
    formatPositionProfitPoints({
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.02,
      minVolume: 0.01,
      digits: 5,
      openPrice: 1.10000,
      currentPrice: 1.10015,
    }),
    '+30 pts',
  );

  // Between-snapshot derivation via applyLivePositionProfit
  const baseMetrics = resolveTradeAccountMetrics({
    balance: 1000,
    credit: 50,
    equity: 1050,
    used_margin: 20,
    free_margin: 1030,
    margin_level: 5250,
    floating_pnl: 0,
  });

  const liveMetrics = applyLivePositionProfit(
    baseMetrics,
    [
      {
        symbol: 'BTCUSD',
        side: 'BUY',
        volume: 1,
        openPrice: 50000,
        currentPrice: 50010,
        contractSize: 1,
        profit: 10,
        margin: 20,
        swap: -1,
        commission: -0.5,
      },
    ],
    contractSizes,
  );
  // floatingPnL = 10 + (-1) + (-0.5) = 8.5
  assert.equal(liveMetrics.floatingPnL, 8.5);
  assert.equal(liveMetrics.unrealizedPL, 8.5);
  // equity = 1000 + 50 + 8.5 = 1058.5
  assert.equal(liveMetrics.equity, 1058.5);
  // freeMargin = 1058.5 - 20 = 1038.5
  assert.equal(liveMetrics.freeMargin, 1038.5);
  // marginLevel = (1058.5 / 20) * 100 = 5292.5
  assert.equal(liveMetrics.marginLevel, 5292.5);

  // Zeroes floatingPnL when positions = [] while preserving snapshot validity
  const flatMetrics = applyLivePositionProfit(liveMetrics, []);
  assert.equal(flatMetrics.floatingPnL, 0);
  assert.equal(flatMetrics.unrealizedPL, 0);

  // Blown account guard
  assert.equal(isAccountBlown({ balance: 0, equity: 0 }), true);
  assert.equal(isAccountBlown({ balance: -15, equity: -15 }), true);
  assert.equal(isAccountBlown({ balance: null, equity: null }), false);
});

test('4. Order Required Margin: POST /api/v2/calculate/margin parsing, debounce constant, and fail-closed display', () => {
  assert.equal(ORDER_TICKET_MARGIN_DEBOUNCE_MS, 150);
  assert.deepEqual(buildOrderTicketMarginPayload('200074', 'XAUUSD', '0.25'), {
    account_login: 200074,
    symbol: 'XAUUSD',
    side: 'buy',
    volume: 0.25,
  });
  assert.equal(buildOrderTicketMarginPayload('200074', 'XAUUSD', 0), null);

  const account = { currency: 'USD', currency_digits: 2 };
  assert.equal(
    resolveOrderTicketRequiredMargin({ required_margin: { amount: '1250.5' } }),
    1250.5,
  );
  assert.equal(
    formatOrderTicketRequiredMargin(
      { required_margin: 1250.5, currency: 'USD' },
      account,
      { includeCurrency: true },
    ),
    '1 250.50 USD',
  );

  // Loading, error, or invalid margin resolves to null and renders ''
  assert.equal(
    resolveOrderTicketRequiredMargin({ required_margin: 1250.5 }, { isLoading: true }),
    null,
  );
  assert.equal(
    formatOrderTicketRequiredMargin({ required_margin: 1250.5 }, account, { isLoading: true }),
    '',
  );
  assert.equal(
    formatOrderTicketRequiredMargin({ required_margin: 1250.5 }, account, { isError: true }),
    '',
  );
  assert.equal(
    formatOrderTicketRequiredMargin({ required_margin: -5 }, account),
    '',
  );
});

test('5. History Financial Summary, collapseDealHistory, balance operations, and symbol filter independence', async () => {
  const deals = [
    {
      ticket: 101,
      position_id: 5001,
      symbol: 'EURUSD',
      action: 'deal_buy',
      entry: 'entry_in',
      volume: 0.1,
      price: 1.1000,
      profit: 0,
      commission: -0.35,
      swap: 0,
      fee: -0.05,
      time: 1_700_000_100,
    },
    {
      ticket: 102,
      position_id: 5001,
      symbol: 'EURUSD',
      action: 'deal_sell',
      entry: 'entry_out',
      volume: 0.1,
      price: 1.1050,
      profit: 50,
      commission: -0.35,
      swap: -1.2,
      fee: -0.05,
      time: 1_700_000_200,
    },
    {
      ticket: 103,
      position_id: 5002,
      symbol: 'XAUUSD',
      action: 'deal_sell',
      entry: 'entry_in',
      volume: 0.2,
      price: 2400,
      profit: 0,
      commission: -1.0,
      swap: 0,
      fee: 0,
      time: 1_700_000_300,
    },
    {
      ticket: 104,
      position_id: 5002,
      symbol: 'XAUUSD',
      action: 'deal_buy',
      entry: 'entry_out',
      volume: 0.2,
      price: 2410,
      profit: -20,
      commission: -1.0,
      swap: -0.5,
      fee: -0.1,
      time: 1_700_000_400,
    },
    // Non-trading cash deal in deal list must be ignored by deal profit summary
    {
      ticket: 105,
      symbol: '',
      action: 'balance',
      entry: 'balance',
      volume: 0,
      price: 0,
      profit: 10000,
      commission: 0,
      swap: 0,
      fee: 0,
      time: 1_700_000_050,
    },
  ];

  // collapseDealHistory sums commission across BOTH entry_in and entry_out deals
  const collapsed = collapseDealHistory(deals);
  assert.equal(collapsed.length, 2);
  const eurPos = collapsed.find((p) => p.symbol === 'EURUSD')!;
  const xauPos = collapsed.find((p) => p.symbol === 'XAUUSD')!;
  assert.equal(eurPos.openPrice, 1.1);
  assert.equal(eurPos.closePrice, 1.105);
  assert.equal(eurPos.profit, 50);
  assert.equal(Number(eurPos.commission?.toFixed(2)), -0.7);
  assert.equal(eurPos.swap, -1.2);
  assert.equal(Number(eurPos.fee.toFixed(2)), -0.1);
  assert.equal(xauPos.side, 'sell');
  assert.equal(xauPos.commission, -2.0);

  // Primary closed positions uses collapsed dealHistory when non-empty
  assert.equal(resolveClosedPositionsHistory(deals, []).length, 2);

  // Balance operations from /api/v2/accounts/{login}/history
  const rawBalanceOps = [
    { id: 1, type: 'deposit', amount: 10000, time: 1_700_000_000 },
    { id: 2, type: 'withdrawal', amount: 1500, time: 1_700_000_250 }, // positive withdrawal normalized to negative
    { id: 3, type: 'credit', amount: 250, time: 1_700_000_350 },
    { id: 1, type: 'deposit', amount: 10000, time: 1_700_000_000 }, // duplicate id
  ];
  const paginatedOps = await fetchAllBalanceLedgerOperations(200074, {
    fetchPage: async (_limit, offset) => (offset === 0 ? rawBalanceOps : []),
  });
  assert.equal(paginatedOps.length, 3);
  assert.equal(paginatedOps.find((o) => o.type === 'withdrawal')?.amount, -1500);

  const summary = calculateHistoryFinancialSummary(deals, paginatedOps);
  // grossProfit = 50 + (-20) = 30
  assert.equal(summary.grossProfit, 30);
  // commission = -0.35 - 0.35 - 1.0 - 1.0 = -2.7
  assert.equal(Number(summary.commission?.toFixed(2)), -2.7);
  // swap = -1.2 - 0.5 = -1.7
  assert.equal(Number(summary.swap?.toFixed(2)), -1.7);
  // fee = -0.05 - 0.05 - 0.1 = -0.2
  assert.equal(Number(summary.fee?.toFixed(2)), -0.2);
  // profit = 30 - 2.7 - 1.7 - 0.2 = 25.4
  assert.equal(Number(summary.profit?.toFixed(2)), 25.4);
  assert.equal(summary.deposit, 10000);
  assert.equal(summary.withdrawal, -1500);
  assert.equal(summary.credit, 250);

  // Symbol filter filters deals ONLY, leaving Deposit / Withdrawal / Credit intact
  const filteredForEur = filterHistoryByPeriodAndSymbol({
    deals,
    balanceOperations: paginatedOps,
    symbol: 'EURUSD',
  });
  const eurSummary = calculateHistoryFinancialSummary(
    filteredForEur.deals,
    filteredForEur.balanceOperations,
  );
  assert.equal(eurSummary.grossProfit, 50);
  assert.equal(Number(eurSummary.commission?.toFixed(2)), -0.7);
  assert.equal(eurSummary.deposit, 10000);
  assert.equal(eurSummary.withdrawal, -1500);
  assert.equal(eurSummary.credit, 250);

  // Deals pagination with 404/501 fallback to /deals/{login}
  const fallbackDeals = await fetchDealsWithFallback({
    login: 200074,
    fetchAccountPage: async () => {
      throw { response: { status: 404 } };
    },
    fetchLoginPage: async () => [
      {
        ticket: 901,
        order_ticket: 1,
        account_login: 200074,
        symbol: 'EURUSD',
        action: 'deal_buy',
        entry: 'entry_in',
        volume: 0.1,
        price: 1.1,
        profit: 0,
        swap: 0,
        commission: 0,
        fee: 0,
        magic: 0,
        comment: '',
        time: 1_700_000_000,
      } satisfies Deal,
    ],
  });
  assert.equal(fallbackDeals.length, 1);
  assert.equal(fallbackDeals[0].ticket, 901);
});

test('6. Currency Scale, Space-Grouped Formatting, Position Stream Reconciliation & Exposure', () => {
  assert.equal(resolveAccountCurrencyDigits({ currency: 'JPY' }), 0);
  assert.equal(resolveAccountCurrencyDigits({ currency: 'USD' }), 2);
  assert.equal(resolveAccountCurrencyDigits({ currency: 'USD', currency_digits: 3 }), 3);
  assert.equal(formatAccountAmount(1234567.89, 2), '1 234 567.89');
  assert.equal(formatAccountAmount(1234.5, 2, true), '+1 234.50');
  assert.equal(formatAccountAmount(-0.00001, 2, true), '0.00');
  assert.equal(formatAccountAmount(null, 2), '');

  // State version ordering with 64-bit integers beyond Number.MAX_SAFE_INTEGER
  assert.equal(
    compareStateVersions('9007199254740993001', '9007199254740993002'),
    -1,
  );
  const existingPos = mapPositionToItem({
    ticket: 7001,
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.5,
    price_open: 1.1,
    price_current: 1.102,
    profit: 100,
    price_sl: 1.09,
    price_tp: 1.12,
    state_version_text: '9007199254740993005',
    price_time_msc: 2000,
  });
  // Older state_version is discarded
  const afterStaleVersion = mapPositionToItem(
    {
      ticket: 7001,
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.1,
      price_open: 1.0,
      price_current: 1.0,
      profit: -50,
      state_version_text: '9007199254740993004',
    },
    existingPos,
  );
  assert.equal(afterStaleVersion, existingPos);

  // update_kind === 'pnl' updates only currentPrice, profit, margin, price_time_msc and preserves volume/side/openPrice/sl/tp
  const afterPnlPatch = mapPositionToItem(
    {
      ticket: 7001,
      update_kind: 'pnl',
      price_current: 1.105,
      profit: 250,
      used_margin: 110,
      price_time_msc: 2500,
      volume: 999,
      side: 'sell',
      price_open: 9.99,
      price_sl: 0,
      price_tp: 0,
    },
    existingPos,
  );
  assert.equal(afterPnlPatch.currentPrice, 1.105);
  assert.equal(afterPnlPatch.pnl, 250);
  assert.equal(afterPnlPatch.margin, 110);
  assert.equal(afterPnlPatch.volume, 0.5);
  assert.equal(afterPnlPatch.side, 'buy');
  assert.equal(afterPnlPatch.openPrice, 1.1);
  assert.equal(afterPnlPatch.sl, 1.09);
  assert.equal(afterPnlPatch.tp, 1.12);

  // Unknown ticket pnl patch is rejected by filterRealtimePositionRows (triggering REST revalidation)
  const filterResult = filterRealtimePositionRows(
    [{ ticket: 9999, update_kind: 'pnl', price_current: 1.2, profit: 10 }],
    [existingPos],
  );
  assert.equal(filterResult.acceptedRows.length, 0);
  assert.equal(filterResult.rejectedRows, 1);

  // Partial/delta batches never replace the full ledger
  assert.equal(isAuthoritativeRealtimePositionsBatch('pnl_update', { snapshot: true }), false);
  assert.equal(isAuthoritativeRealtimePositionsBatch('positions_snapshot', { partial: true }), false);
  assert.equal(isAuthoritativeRealtimePositionsBatch('positions_snapshot', { snapshot: false }), false);

  // Exposure calculation skips positions without explicit/catalog contractSize
  const exposure = calculateAccountExposure({
    positions: [
      {
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 0.1,
        currentPrice: 1.1,
        contractSize: 100_000,
      },
      {
        symbol: 'UNKNOWN_WITHOUT_CONTRACT_SIZE',
        side: 'SELL',
        volume: 1,
        currentPrice: 100,
      },
    ],
    account: {
      balance: 1000,
      equity: 1100,
      free_margin: 990,
      leverage: 100,
      currency: 'USD',
    },
  });
  assert.equal(exposure.rows.length, 2); // EUR asset row + USD cash row
  const eurExposure = exposure.rows.find((r) => r.asset === 'EUR')!;
  assert.equal(eurExposure.signedUnits, 10_000);
  assert.equal(eurExposure.marginValue, 110);
  assert.equal(exposure.cashBasis, 990);
});

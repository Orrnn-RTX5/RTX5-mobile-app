import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveChartMarketSessionPolicy,
  shouldRefreshChartHistoryOnSessionTransition,
} from './chartMarketSessionPolicy';

test('uses quote activity independently from trading activity', () => {
  assert.deepEqual(
    resolveChartMarketSessionPolicy({
      symbol: 'AAPL',
      status: 'after_hours',
      quote_open: true,
      trade_open: false,
    }),
    {
      quotePhase: 'open',
      tradeOpen: false,
      sessionOpen: null,
      sessionClose: null,
      serverTime: null,
      reason: 'quote_open',
    },
  );
});

test('applies the same per-symbol rule across asset classes and broker suffixes', () => {
  const symbols = [
    'EURUSD',
    'EURUSD.c',
    'XAUUSD',
    'XAUUSDm',
    'US30',
    'SPX500',
    'AAPL',
    'USOIL',
    'COPPER',
    'BTCUSD',
    'BTCUSDpro',
    'DOGEUSD',
  ];

  for (const symbol of symbols) {
    assert.equal(
      resolveChartMarketSessionPolicy({ symbol, status: 'closed', quote_open: false }).quotePhase,
      'closed',
      symbol,
    );
    assert.equal(
      resolveChartMarketSessionPolicy({ symbol, status: 'closed', quote_open: true }).quotePhase,
      'open',
      symbol,
    );
  }
});

test('does not guess pre-market, after-hours, or unknown quote activity', () => {
  for (const status of ['pre_market', 'after_hours', 'unknown'] as const) {
    assert.equal(
      resolveChartMarketSessionPolicy({ symbol: 'US30', status }).quotePhase,
      'unknown',
    );
  }
});

test('falls back to explicit open/closed status when quote_open is absent', () => {
  assert.equal(resolveChartMarketSessionPolicy({ symbol: 'XAUUSD', status: 'closed' }).quotePhase, 'closed');
  assert.equal(resolveChartMarketSessionPolicy({ symbol: 'BTCUSD', status: 'open' }).quotePhase, 'open');
});

test('requests one reconciliation only for a confirmed closed-to-open transition', () => {
  assert.equal(shouldRefreshChartHistoryOnSessionTransition('closed', 'open'), true);
  assert.equal(shouldRefreshChartHistoryOnSessionTransition('closed', 'unknown'), false);
  assert.equal(shouldRefreshChartHistoryOnSessionTransition('unknown', 'open'), false);
  assert.equal(shouldRefreshChartHistoryOnSessionTransition('open', 'open'), false);
});

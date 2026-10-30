import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTradeAccountSummary,
  resolveRenderableTradeAccountSummary,
  resolveTradeFloatingPnl,
  resolveTradeUsedMargin,
} from './accountSummary.ts';

test('buildTradeAccountSummary uses authoritative live websocket metrics when present', () => {
  const summary = buildTradeAccountSummary(
    {
      login: 100003,
      balance: 10450,
      equity: 10625.75,
      margin: 212.4,
      margin_free: 10413.35,
      margin_level: 5001.77,
      floating: 175.75,
    },
    {
      balance: 10450,
      credit: 0,
      floating: 9,
      equity: 10459,
      margin: 100,
      freeMargin: 10359,
      marginLevel: 10459,
      currency: 'USD',
    },
  );

  assert.equal(summary.floating, 175.75);
  assert.equal(summary.equity, 10625.75);
  assert.equal(summary.margin, 212.4);
  assert.equal(summary.freeMargin, 10413.35);
  assert.equal(summary.marginLevel, 5001.77);
});

test('buildTradeAccountSummary falls back to stored account data before live metrics hydrate', () => {
  const summary = buildTradeAccountSummary(
    {
      login: 100003,
      balance: 0,
      equity: 0,
      margin: 0,
      margin_free: 0,
      margin_level: 0,
      floating: 0,
    },
    {
      balance: 9800,
      credit: 25,
      floating: -12.5,
      equity: 9787.5,
      margin: 120,
      freeMargin: 9667.5,
      marginLevel: 8156.25,
      currency: 'USD',
    },
  );

  assert.equal(summary.balance, 9800);
  assert.equal(summary.credit, 25);
  assert.equal(summary.floating, -12.5);
  assert.equal(summary.equity, 9787.5);
  assert.equal(summary.margin, 120);
  assert.equal(summary.freeMargin, 9667.5);
  assert.equal(summary.marginLevel, 8156.25);
});

test('buildTradeAccountSummary merges partial live metrics with stored account snapshot per field', () => {
  const summary = buildTradeAccountSummary(
    {
      login: 100003,
      balance: 0,
      equity: 0,
      margin: 0,
      margin_free: 0,
      margin_level: 0,
      floating: -0.03,
      metricFlags: {
        balance: false,
        equity: false,
        margin: false,
        margin_free: false,
        margin_level: false,
        floating: true,
      },
    },
    {
      balance: 10000,
      credit: 0,
      floating: 0,
      equity: 10000,
      margin: 25,
      freeMargin: 9975,
      marginLevel: 40000,
      currency: 'USD',
    },
  );

  assert.equal(summary.balance, 10000);
  assert.equal(summary.floating, -0.03);
  assert.equal(summary.equity, 10000);
  assert.equal(summary.margin, 25);
  assert.equal(summary.freeMargin, 9975);
  assert.equal(summary.marginLevel, 40000);
});

test('buildTradeAccountSummary honors live zero metrics when readiness flags are present', () => {
  const summary = buildTradeAccountSummary(
    {
      login: 100003,
      balance: 0,
      equity: 0,
      margin: 0,
      margin_free: 0,
      margin_level: 0,
      floating: 0,
      metricFlags: {
        balance: true,
        equity: true,
        margin: true,
        margin_free: true,
        margin_level: true,
        floating: true,
      },
    },
    {
      balance: 9800,
      credit: 25,
      floating: -12.5,
      equity: 9787.5,
      margin: 120,
      freeMargin: 9667.5,
      marginLevel: 8156.25,
      currency: 'USD',
    },
  );

  assert.equal(summary.balance, 0);
  assert.equal(summary.floating, 0);
  assert.equal(summary.equity, 0);
  assert.equal(summary.margin, 0);
  assert.equal(summary.freeMargin, 0);
  assert.equal(summary.marginLevel, 0);
});

test('margin level uses a fresh backend source or zero when both sources omitted it', () => {
  const stored = {
    balance: 10000, credit: 0, floating: 0, equity: 10000,
    margin: 100, freeMargin: 9900, marginLevel: 87952.5, currency: 'USD',
  };
  assert.equal(buildTradeAccountSummary({
    margin_level: 0, metricFlags: { margin_level: false },
  }, { ...stored, staleMetrics: [] }).marginLevel, 87952.5);

  assert.equal(buildTradeAccountSummary({
    margin_level: 12345, metricFlags: { margin_level: true }, staleMetricFlags: { margin_level: true },
  }, { ...stored, staleMetrics: ['marginLevel'] }).marginLevel, 0);

  assert.equal(buildTradeAccountSummary({
    margin_level: 12345, metricFlags: { margin_level: true }, staleMetricFlags: { margin_level: true },
  }, { ...stored, staleMetrics: [] }).marginLevel, 87952.5);

  assert.equal(buildTradeAccountSummary({
    margin_level: 12345, metricFlags: { margin_level: true }, staleMetricFlags: { margin_level: false },
  }, { ...stored, staleMetrics: ['marginLevel'] }).marginLevel, 12345);

  // A latest snapshot that omitted the metric cannot revive an untracked old cache.
  assert.equal(buildTradeAccountSummary({
    margin_level: 12345, metricFlags: { margin_level: true }, staleMetricFlags: { margin_level: true },
  }, stored).marginLevel, 0);
  assert.equal(buildTradeAccountSummary({}, null).marginLevel, 0);
});

test('resolveTradeFloatingPnl uses the synced open-position total for the active login', () => {
  const floating = resolveTradeFloatingPnl(
    175.75,
    [
      {
        id: '1001',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.1,
        currentPrice: 1.101,
        pnl: 12.5,
        swap: 0,
        openTime: '2026-04-21T10:00:00.000Z',
      },
      {
        id: '1002',
        symbol: 'GBPUSD',
        side: 'sell',
        volume: 0.2,
        openPrice: 1.29,
        currentPrice: 1.288,
        pnl: -4.25,
        swap: 0,
        openTime: '2026-04-21T10:01:00.000Z',
      },
    ],
    '100003',
    100003,
    {
      EURUSD: { bid: 1.101, ask: 1.10115 },
      GBPUSD: { bid: 1.28815, ask: 1.288 },
    },
  );

  assert.equal(floating, 8.25);
});

test('resolveTradeFloatingPnl keeps the live account floating value until positions sync for the active login', () => {
  const floating = resolveTradeFloatingPnl(
    175.75,
    [
      {
        id: '1001',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.1,
        currentPrice: 1.101,
        pnl: 12.5,
        swap: 0,
        openTime: '2026-04-21T10:00:00.000Z',
      },
    ],
    null,
    100003,
  );

  assert.equal(floating, 175.75);
});

test('resolveRenderableTradeAccountSummary updates equity and free margin while preserving backend margin level', () => {
  const summary = resolveRenderableTradeAccountSummary(
    {
      balance: 9800,
      credit: 25,
      floating: -12.5,
      equity: 9787.5,
      margin: 120,
      freeMargin: 9667.5,
      marginLevel: 8156.25,
      currency: 'USD',
    },
    18.75,
  );

  assert.equal(summary.floating, 18.75);
  assert.equal(summary.equity, 9843.75);
  assert.equal(summary.freeMargin, 9723.75);
  assert.equal(summary.marginLevel, 8156.25);
});

test('resolveRenderableTradeAccountSummary keeps balance settled while deriving live equity from floating pnl', () => {
  const summary = resolveRenderableTradeAccountSummary(
    {
      balance: 10000,
      credit: 0,
      floating: -0.03,
      equity: 10000,
      margin: 0,
      freeMargin: 10000,
      marginLevel: 0,
      currency: 'USD',
    },
    -0.03,
  );

  assert.equal(summary.balance, 10000);
  assert.equal(summary.floating, -0.03);
  assert.equal(Number(summary.equity.toFixed(2)), 9999.97);
  assert.equal(Number(summary.freeMargin.toFixed(2)), 9999.97);
});

test('resolveRenderableTradeAccountSummary does not manufacture margin level from live equity', () => {
  const summary = resolveRenderableTradeAccountSummary(
    {
      balance: 10000,
      credit: 0,
      floating: -0.03,
      equity: 10000,
      margin: 25,
      freeMargin: 0,
      marginLevel: 0,
      currency: 'USD',
    },
    -0.03,
  );

  assert.equal(Number(summary.equity.toFixed(2)), 9999.97);
  assert.equal(Number(summary.freeMargin.toFixed(2)), 9974.97);
  assert.equal(summary.marginLevel, 0);
});

test('resolveRenderableTradeAccountSummary preserves a received margin level while margin is unavailable', () => {
  const summary = resolveRenderableTradeAccountSummary(
    {
      balance: 10000,
      credit: 0,
      floating: 0,
      equity: 10000,
      margin: 0,
      freeMargin: 10000,
      marginLevel: 8000,
      currency: 'USD',
    },
    0,
  );

  assert.equal(summary.marginLevel, 8000);
});

test('estimated position margin does not replace a missing backend margin level', () => {
  const usedMargin = resolveTradeUsedMargin(
    0,
    0,
    [
      {
        id: '2001',
        symbol: 'BTCUSD',
        side: 'buy',
        volume: 0.01,
        openPrice: 81600,
        currentPrice: 81620,
        pnl: 0.2,
        swap: 0,
        openTime: '2026-10-22T10:00:00.000Z',
      },
    ],
    '100003',
    100003,
    {},
    100,
  );

  assert.equal(Number(usedMargin.toFixed(2)), 8.16);
  const summary = resolveRenderableTradeAccountSummary(
    {
      balance: 10000,
      credit: 0,
      floating: 0.2,
      equity: 10000.2,
      margin: 0,
      freeMargin: 10000.2,
      marginLevel: 0,
      currency: 'USD',
    },
    0.2,
    usedMargin,
  );
  assert.equal(Number(summary.margin.toFixed(2)), 8.16);
  assert.equal(Number(summary.freeMargin.toFixed(2)), 9992.04);
  assert.equal(summary.marginLevel, 0);
});

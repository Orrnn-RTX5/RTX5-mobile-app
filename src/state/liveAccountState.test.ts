import assert from 'node:assert/strict';
import test from 'node:test';

import { useLiveAccountState } from './liveAccountState.ts';

test('1,000 identical account heartbeats preserve flag identities and publish no updates', () => {
  const data = { login: 200082, balance: 10000, equity: 10010, margin: 100, margin_free: 9910, margin_level: 10010, floating: 10 };
  useLiveAccountState.getState().resetMetrics();
  useLiveAccountState.getState().applyMetricsSnapshot(data);
  const before = useLiveAccountState.getState();
  let notifications = 0;
  const unsubscribe = useLiveAccountState.subscribe(() => notifications++);
  try {
    for (let index = 0; index < 1000; index++) useLiveAccountState.getState().applyMetricsSnapshot(data);
    assert.equal(notifications, 0);
    assert.equal(useLiveAccountState.getState(), before);
  } finally { unsubscribe(); }
});

test('account snapshots publish changed values and missing-metric flags atomically', () => {
  useLiveAccountState.getState().resetMetrics();
  useLiveAccountState.getState().applyMetricsSnapshot({ login: 200082, balance: 10000, equity: 10010 });
  const snapshots: Array<{ balance: number; equityStale: boolean }> = [];
  const unsubscribe = useLiveAccountState.subscribe(state => snapshots.push({ balance: state.balance, equityStale: state.staleMetricFlags.equity }));
  try {
    useLiveAccountState.getState().applyMetricsSnapshot({ login: 200082, balance: 10005 });
    assert.deepEqual(snapshots, [{ balance: 10005, equityStale: true }], 'consumers should receive one complete account update');
  } finally { unsubscribe(); }
});

test('login-only live account updates do not mark financial metrics as ready', () => {
  useLiveAccountState.getState().resetMetrics();

  useLiveAccountState.getState().updateMetrics({ login: 200082 });

  const state = useLiveAccountState.getState();
  assert.equal(state.login, 200082);
  assert.equal(state.balance, 0);
  assert.equal(state.hasMetrics, false);
  assert.equal(state.metricFlags.balance, false);
});

test('financial live account updates mark metrics as ready even when balance is zero', () => {
  useLiveAccountState.getState().resetMetrics();

  useLiveAccountState.getState().updateMetrics({ login: 200082, balance: 0, equity: 0 });

  const state = useLiveAccountState.getState();
  assert.equal(state.login, 200082);
  assert.equal(state.balance, 0);
  assert.equal(state.equity, 0);
  assert.equal(state.hasMetrics, true);
  assert.equal(state.metricFlags.balance, true);
  assert.equal(state.metricFlags.equity, true);
});

test('changing login clears stale financial metrics until new metrics arrive', () => {
  useLiveAccountState.getState().resetMetrics();
  useLiveAccountState.getState().updateMetrics({ login: 200082, balance: 119701.53 });

  useLiveAccountState.getState().updateMetrics({ login: 200083 });

  const state = useLiveAccountState.getState();
  assert.equal(state.login, 200083);
  assert.equal(state.balance, 0);
  assert.equal(state.hasMetrics, false);
  assert.equal(state.metricFlags.balance, false);
});

test('metric readiness is tracked per financial field', () => {
  useLiveAccountState.getState().resetMetrics();

  useLiveAccountState.getState().updateMetrics({ login: 200082, equity: 1000 });

  const state = useLiveAccountState.getState();
  assert.equal(state.hasMetrics, true);
  assert.equal(state.metricFlags.balance, false);
  assert.equal(state.metricFlags.equity, true);
});

test('contract v3: a snapshot missing server-calculated metrics keeps last values and flags them stale', () => {
  useLiveAccountState.getState().resetMetrics();
  useLiveAccountState.getState().applyMetricsSnapshot({
    login: 200074,
    balance: 10000,
    equity: 10000.15,
    margin: 11.37,
    margin_free: 9988.78,
    margin_level: 87952.5,
    floating: 0.15,
  });
  let state = useLiveAccountState.getState();
  assert.equal(state.staleMetricFlags.equity, false);

  // Server calculation failed: equity/used_margin/free_margin/margin_level/floating_pnl omitted.
  useLiveAccountState.getState().applyMetricsSnapshot({ login: 200074, balance: 10005 });
  state = useLiveAccountState.getState();
  assert.equal(state.balance, 10005);
  assert.equal(state.equity, 10000.15);
  assert.equal(state.margin, 11.37);
  assert.equal(state.margin_free, 9988.78);
  assert.equal(state.margin_level, 87952.5);
  assert.equal(state.floating, 0.15);
  assert.deepEqual(state.staleMetricFlags, {
    balance: false,
    equity: true,
    margin: true,
    margin_free: true,
    margin_level: true,
    floating: true,
  });

  // A fresh value clears only that metric's stale flag.
  useLiveAccountState.getState().updateMetrics({ equity: 10001 });
  state = useLiveAccountState.getState();
  assert.equal(state.staleMetricFlags.equity, false);
  assert.equal(state.staleMetricFlags.margin, true);

  useLiveAccountState.getState().resetMetrics();
  assert.equal(useLiveAccountState.getState().staleMetricFlags.margin, false);
});

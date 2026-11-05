import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLiveAccountMetrics,
  resolveAccountWsSession,
} from './accountSocket.helpers.ts';

const activeCapture = (overrides: Record<string, unknown> = {}) => ({
  session: {
    brokerId: 'broker-a',
    accountLogin: '200101',
    apiBase: 'https://services.broker-a.example/api/v2',
    feedWsBase: 'wss://services.broker-a.example/ws/feed',
    tradeWsBase: 'wss://services.broker-a.example/ws/v2',
    feedStatusUrl: 'https://services.broker-a.example/ws/feed/status',
    servicesDomain: 'services.broker-a.example',
    investor: false,
    cacheNamespace: 'broker-a:200101:7',
    sessionEpoch: 7,
    configVersion: 'v1',
    ...overrides,
  },
  credentials: {
    accessToken: 'jwt-token',
    refreshToken: 'refresh-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
});

test('resolveAccountWsSession uses the immutable active account identity', () => {
  const session = resolveAccountWsSession(
    activeCapture(),
  );

  assert.deepEqual(session, {
    login: '200101',
    identity: {
      brokerId: 'broker-a',
      accountLogin: '200101',
      sessionEpoch: 7,
    },
  });
});

test('resolveAccountWsSession fails closed without an explicit trading websocket', () => {
  assert.equal(resolveAccountWsSession(activeCapture({ tradeWsBase: undefined })), null);
  assert.equal(resolveAccountWsSession(null), null);
});

test('extractLiveAccountMetrics normalizes backend account aliases', () => {
  const metrics = extractLiveAccountMetrics({
    account_login: '100003',
    balance: 1250.5,
    equity: 1279.1,
    used_margin: 145.25,
    free_margin: 1133.85,
    margin_level: 880.5,
    floating_pnl: 28.6,
  });

  assert.deepEqual(metrics, {
    login: 100003,
    balance: 1250.5,
    equity: 1279.1,
    margin: 145.25,
    margin_free: 1133.85,
    margin_level: 880.5,
    floating: 28.6,
  });
});

test('extractLiveAccountMetrics unwraps nested account metric payloads', () => {
  const metrics = extractLiveAccountMetrics({
    data: {
      snapshot: {
        account: {
          login: '100003',
          balance: '1250.5',
          equity: '1279.1',
          used_margin: '145.25',
          free_margin: '1133.85',
          margin_level: '880.5',
          floating_pnl: '28.6',
        },
      },
    },
  });

  assert.deepEqual(metrics, {
    login: 100003,
    balance: 1250.5,
    equity: 1279.1,
    margin: 145.25,
    margin_free: 1133.85,
    margin_level: 880.5,
    floating: 28.6,
  });
});

test('extractLiveAccountMetrics merges top-level login with nested account metrics', () => {
  const metrics = extractLiveAccountMetrics({
    login: '100003',
    payload: {
      account: {
        balance: 1250.5,
        equity: 1279.1,
        margin: 145.25,
        margin_free: 1133.85,
        margin_level: 880.5,
        floating: 28.6,
      },
    },
  });

  assert.deepEqual(metrics, {
    login: 100003,
    balance: 1250.5,
    equity: 1279.1,
    margin: 145.25,
    margin_free: 1133.85,
    margin_level: 880.5,
    floating: 28.6,
  });
});

test('extractLiveAccountMetrics accepts websocket metric alias names', () => {
  const metrics = extractLiveAccountMetrics({
    metrics: {
      balance: '1250.5',
      equity: '1279.1',
      usedMargin: '145.25',
      freeMargin: '1133.85',
      marginLevel: '880.5',
      pnl: '28.6',
    },
  });

  assert.deepEqual(metrics, {
    balance: 1250.5,
    equity: 1279.1,
    margin: 145.25,
    margin_free: 1133.85,
    margin_level: 880.5,
    floating: 28.6,
  });
});

test('extractLiveAccountMetrics accepts margin_used and skips blank aliases', () => {
  const metrics = extractLiveAccountMetrics({
    data: {
      metrics: {
        margin_used: '   ',
        used_margin: '245.75',
        margin_free: '',
        free_margin: '9754.25',
        margin_level: null,
        marginLevel: '4077.31',
      },
    },
  });

  assert.deepEqual(metrics, {
    margin: 245.75,
    margin_free: 9754.25,
    margin_level: 4077.31,
  });
});

test('extractLiveAccountMetrics prefers explicit used-margin aliases over legacy margin placeholders', () => {
  const metrics = extractLiveAccountMetrics({
    margin: 0,
    margin_used: '125.5',
    freeMargin: '9874.5',
    marginLevel: '7968.13',
  });

  assert.deepEqual(metrics, {
    margin: 125.5,
    margin_free: 9874.5,
    margin_level: 7968.13,
  });
});

test('extractLiveAccountMetrics preserves explicit zero account metrics', () => {
  const metrics = extractLiveAccountMetrics({
    margin_used: 0,
    free_margin: 0,
    margin_level: 0,
  });

  assert.deepEqual(metrics, {
    margin: 0,
    margin_free: 0,
    margin_level: 0,
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
} from '../../../../state/activeBrokerSession';
import { getStoredAccessToken } from './authToken';

test.beforeEach(() => __resetActiveBrokerSessionForTests());

test('candle helpers read credentials only from the active session epoch', () => {
  assert.equal(getStoredAccessToken(), null);
  const transition = beginActiveBrokerSessionTransition();
  activateBrokerSession(transition, {
    brokerId: 'broker-a',
    accountLogin: '1001',
    apiBase: 'https://services.broker-a.example/api/v2',
    feedWsBase: 'wss://services.broker-a.example/ws/feed',
    tradeWsBase: 'wss://services.broker-a.example/ws/v2',
    feedStatusUrl: 'https://services.broker-a.example/ws/feed/status',
    servicesDomain: 'services.broker-a.example',
    investor: false,
    configVersion: 'v1',
  }, {
    accessToken: 'active-token',
    refreshToken: 'refresh-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  assert.equal(getStoredAccessToken(), 'active-token');

  beginActiveBrokerSessionTransition();
  assert.equal(getStoredAccessToken(), null);
});

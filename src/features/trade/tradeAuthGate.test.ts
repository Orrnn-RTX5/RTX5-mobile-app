import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearPendingTradeAuthIntent,
  consumePendingTradeAuthIntent,
  getPendingTradeAuthIntent,
  isOrrnnDemoTradeBroker,
  savePendingTradeAuthIntent,
  shouldRequestOrrnnDemoTradeAuth,
  type TradeAuthIntent,
} from './tradeAuthGate';

const authenticatedDemoSession = {
  selectedBrokerId: 'orrnn-demo',
  isLoggedIn: true,
  accountId: '900001',
  accessToken: 'store-access-token',
  activeBrokerId: 'orrnn-demo',
  activeAccountLogin: '900001',
  activeAccessToken: 'active-access-token',
} as const;

test('demo broker identity remains exact while logged-out trade auth is global', () => {
  assert.equal(isOrrnnDemoTradeBroker('orrnn-demo'), true);
  assert.equal(isOrrnnDemoTradeBroker(' ORRNN-DEMO '), false);
  assert.equal(isOrrnnDemoTradeBroker('ORRNN-DEMO'), false);
  assert.equal(isOrrnnDemoTradeBroker('orrnn'), false);
  assert.equal(isOrrnnDemoTradeBroker('my-orrnn-demo'), false);

  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({ selectedBrokerId: 'other-broker' }),
    true,
  );
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({ selectedBrokerId: 'orrnn-demo' }),
    true,
  );
});

test('trade auth gate requires a matching authenticated active broker session', () => {
  assert.equal(shouldRequestOrrnnDemoTradeAuth(authenticatedDemoSession), false);
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({ ...authenticatedDemoSession, isLoggedIn: false }),
    true,
  );
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({ ...authenticatedDemoSession, accessToken: '' }),
    true,
  );
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({ ...authenticatedDemoSession, activeBrokerId: 'other-broker' }),
    true,
  );
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({ ...authenticatedDemoSession, activeAccountLogin: '900002' }),
    true,
  );
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({ ...authenticatedDemoSession, activeAccessToken: '' }),
    true,
  );
  const authenticatedOtherBrokerSession = {
    ...authenticatedDemoSession,
    selectedBrokerId: 'other-broker',
    activeBrokerId: 'other-broker',
  } as const;
  assert.equal(shouldRequestOrrnnDemoTradeAuth(authenticatedOtherBrokerSession), false);
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({
      ...authenticatedOtherBrokerSession,
      accessToken: '',
      activeAccessToken: '',
    }),
    true,
  );
  assert.equal(
    shouldRequestOrrnnDemoTradeAuth({
      ...authenticatedOtherBrokerSession,
      isLoggedIn: false,
    }),
    true,
  );
});

test('pending trade intent keeps only allowlisted non-sensitive context', () => {
  clearPendingTradeAuthIntent();
  const untrustedIntent = {
    kind: 'market-order',
    symbol: ' eurusd ',
    side: 'buy',
    origin: 'chart',
    accessToken: 'must-not-be-saved',
    accountLogin: 'must-not-be-saved',
  } as TradeAuthIntent & Record<string, unknown>;

  savePendingTradeAuthIntent(untrustedIntent);
  assert.deepEqual(getPendingTradeAuthIntent(), {
    kind: 'market-order',
    symbol: 'eurusd',
    side: 'buy',
    origin: 'chart',
  });
  assert.deepEqual(consumePendingTradeAuthIntent(), {
    kind: 'market-order',
    symbol: 'eurusd',
    side: 'buy',
    origin: 'chart',
  });
  assert.equal(getPendingTradeAuthIntent(), null);
});

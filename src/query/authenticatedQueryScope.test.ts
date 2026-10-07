import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  updateActiveBrokerSessionCredentials,
} from '../state/activeBrokerSession.ts';
import { getActiveBrokerCredentialScopeKey } from './authenticatedQueryScope.ts';

test('market-data credential scope rotates while the account cache namespace stays stable', () => {
  __resetActiveBrokerSessionForTests();
  const capture = activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    {
      brokerId: 'achiever-financials',
      accountLogin: '10001',
      apiBase: 'https://service.achieverfinancials.com/api/v2',
      feedWsBase: 'wss://service.achieverfinancials.com/ws/feed',
      tradeWsBase: 'wss://service.achieverfinancials.com/ws/v2',
      feedStatusUrl: 'https://service.achieverfinancials.com/ws/feed/status',
      servicesDomain: 'service.achieverfinancials.com',
      configVersion: 'cfg-achiever',
    },
    {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  );
  const cacheNamespace = capture.session.cacheNamespace;
  const before = getActiveBrokerCredentialScopeKey();

  assert.equal(updateActiveBrokerSessionCredentials(
    getActiveBrokerSessionIdentity(capture.session),
    {
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: '2099-01-02T00:00:00.000Z',
    },
  ), true);

  const afterCapture = captureActiveBrokerSession();
  assert.ok(afterCapture);
  assert.equal(afterCapture.session.cacheNamespace, cacheNamespace);
  assert.notEqual(getActiveBrokerCredentialScopeKey(), before);
});

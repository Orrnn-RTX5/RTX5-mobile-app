import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetActiveBrokerSessionForTests, activateBrokerSession, beginActiveBrokerSessionTransition,
  captureActiveBrokerSessionProvenance, getActiveBrokerSessionIdentity,
  isActiveBrokerSessionProvenanceCurrent, updateActiveBrokerSessionCredentials,
} from '../../state/activeBrokerSession';
import { isMarketOrderFeedbackCurrent } from './marketOrderFeedback';

function activate(accountLogin = '10001') {
  return activateBrokerSession(beginActiveBrokerSessionTransition(), {
    brokerId: 'broker-a', accountLogin, apiBase: 'https://services.broker-a.com/api/v2',
    feedWsBase: 'wss://services.broker-a.com/ws/feed', tradeWsBase: 'wss://services.broker-a.com/ws/v2',
    feedStatusUrl: 'https://services.broker-a.com/ws/feed/status', servicesDomain: 'services.broker-a.com', configVersion: 'test',
  }, { accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: '2099-01-01T00:00:00.000Z' });
}

test('a validated market result stays visible after a same-session credential refresh', t => {
  __resetActiveBrokerSessionForTests(); t.after(__resetActiveBrokerSessionForTests);
  const capture = activate();
  const original = captureActiveBrokerSessionProvenance()!;
  assert.equal(isMarketOrderFeedbackCurrent(original.cacheNamespace), true);
  updateActiveBrokerSessionCredentials(getActiveBrokerSessionIdentity(capture.session), {
    ...capture.credentials, accessToken: 'test-rotated', refreshToken: 'test-rotated-refresh',
  });
  assert.equal(isActiveBrokerSessionProvenanceCurrent(original), false, 'the transport fence remains credential-strict');
  assert.equal(isMarketOrderFeedbackCurrent(original.cacheNamespace), true, 'UI feedback must not disappear after a valid refresh');
});

test('logout, account switches and a new login to the same account cannot reuse old feedback', t => {
  __resetActiveBrokerSessionForTests(); t.after(__resetActiveBrokerSessionForTests);
  const first = activate();
  beginActiveBrokerSessionTransition();
  assert.equal(isMarketOrderFeedbackCurrent(first.session.cacheNamespace), false);
  activate();
  assert.equal(isMarketOrderFeedbackCurrent(first.session.cacheNamespace), false);
  const next = activate('20002');
  assert.equal(isMarketOrderFeedbackCurrent(first.session.cacheNamespace), false);
  assert.equal(isMarketOrderFeedbackCurrent(next.session.cacheNamespace), true);
  assert.equal(isMarketOrderFeedbackCurrent(''), false);
});

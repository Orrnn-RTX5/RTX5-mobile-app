import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  updateActiveBrokerSessionCredentials,
} from './activeBrokerSession';
import {
  createActiveBrokerSessionManifest,
  parseActiveBrokerSessionManifest,
} from './activeBrokerSessionStorage';
import { isActiveSessionInvestorReadOnly } from './investorReadOnlySession';
import { readInvestorSessionFlag } from '../api/investorSession';
import { normalizeBrokerRefreshResponse } from '../api/brokerApi';

const sessionInput = {
  brokerId: 'broker-a',
  accountLogin: '10001',
  apiBase: 'https://services.broker-a.com/api/v2',
  feedWsBase: 'wss://services.broker-a.com/ws/feed',
  tradeWsBase: 'wss://services.broker-a.com/ws/v2',
  feedStatusUrl: 'https://services.broker-a.com/ws/feed/status',
  servicesDomain: 'services.broker-a.com',
  configVersion: 'cfg-1',
};
const credentials = {
  accessToken: 'access-a',
  refreshToken: 'refresh-a',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

test.beforeEach(() => __resetActiveBrokerSessionForTests());

test('sessions default to trading-enabled and an investor login is read-only', () => {
  activateBrokerSession(beginActiveBrokerSessionTransition(), sessionInput, credentials);
  assert.equal(captureActiveBrokerSession()?.session.investor, false);
  assert.equal(isActiveSessionInvestorReadOnly(), false);

  activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    { ...sessionInput, investor: true },
    credentials,
  );
  assert.equal(isActiveSessionInvestorReadOnly(), true);
});

test('refresh investor:true marks the same session read-only without a new namespace', () => {
  const capture = activateBrokerSession(beginActiveBrokerSessionTransition(), sessionInput, credentials);
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-b',
    refresh_token: 'refresh-b',
    expires_at: 4_102_444_800,
    investor: true,
  });
  assert.equal(normalized.investor, true);
  assert.equal(updateActiveBrokerSessionCredentials(
    getActiveBrokerSessionIdentity(capture.session),
    { ...credentials, accessToken: 'access-b' },
    { investor: normalized.investor },
  ), true);
  const current = captureActiveBrokerSession();
  assert.equal(current?.session.investor, true);
  assert.equal(current?.session.cacheNamespace, capture.session.cacheNamespace);
  assert.equal(isActiveSessionInvestorReadOnly(), true);

  // A refresh body without investor/login_type keeps the current flag.
  assert.equal(readInvestorSessionFlag({ access_token: 'x' }), undefined);
  assert.equal(readInvestorSessionFlag({ login_type: 'master' }), false);
});

test('manifest persists investor and older manifests restore as not investor', () => {
  const investorManifest = createActiveBrokerSessionManifest({ ...sessionInput, investor: true });
  assert.equal(parseActiveBrokerSessionManifest(JSON.stringify(investorManifest))?.investor, true);

  const legacy = createActiveBrokerSessionManifest(sessionInput);
  assert.equal('investor' in legacy, false);
  const restored = parseActiveBrokerSessionManifest(JSON.stringify(legacy));
  assert.ok(restored);
  assert.notEqual(restored.investor, true);
  for (const garbage of ['yes', 1, null, { nested: true }]) {
    assert.notEqual(
      parseActiveBrokerSessionManifest(JSON.stringify({ ...legacy, investor: garbage }))?.investor,
      true,
    );
  }
});

test('trade entry points consult the investor read-only hook', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
  for (const path of [
    'src/features/trade/TradeScreen/TradeScreen.tsx',
    'src/features/trade/OrderTicketScreen.tsx',
    'src/features/trade/ClosePositionScreen.tsx',
    'src/features/trade/BulkOperationScreen.tsx',
    'src/features/trade/ModifyPositionScreen.tsx',
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  ]) {
    assert.match(read(path), /useInvestorReadOnlySession\(\)/, path);
  }
});

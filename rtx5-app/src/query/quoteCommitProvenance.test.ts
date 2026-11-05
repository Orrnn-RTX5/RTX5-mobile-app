import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  getActiveBrokerSessionProvenance,
  getActiveBrokerSessionIdentity,
  updateActiveBrokerSessionCredentials,
} from '../state/activeBrokerSession';
import { commitQuoteSnapshotIfSessionCurrent } from './quoteCommitProvenance';

const activate = () => activateBrokerSession(
  beginActiveBrokerSessionTransition(),
  {
    brokerId: 'broker-a',
    accountLogin: '1001',
    apiBase: 'https://services.broker-a.com/api/v2',
    feedWsBase: 'wss://services.broker-a.com/ws/feed',
    tradeWsBase: 'wss://services.broker-a.com/ws/v2',
    feedStatusUrl: 'https://services.broker-a.com/ws/feed/status',
    servicesDomain: 'services.broker-a.com',
    investor: false,
    configVersion: 'cfg-1',
  },
  {
    accessToken: 'access-a',
    refreshToken: 'refresh-a',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
);

test.beforeEach(() => __resetActiveBrokerSessionForTests());

test('queued quote commit runs while its originating session remains current', () => {
  const capture = activate();
  const provenance = getActiveBrokerSessionProvenance(capture.session);
  let committed = 0;

  assert.equal(commitQuoteSnapshotIfSessionCurrent(provenance, () => committed += 1), true);
  assert.equal(committed, 1);
});

test('queued quote commit is discarded after an epoch transition', () => {
  const capture = activate();
  const provenance = getActiveBrokerSessionProvenance(capture.session);
  beginActiveBrokerSessionTransition();
  let committed = 0;

  assert.equal(commitQuoteSnapshotIfSessionCurrent(provenance, () => committed += 1), false);
  assert.equal(committed, 0);
});

test('queued quote commit from broker A is discarded after broker B activates', () => {
  const capture = activate();
  const provenance = getActiveBrokerSessionProvenance(capture.session);
  const transition = beginActiveBrokerSessionTransition();
  activateBrokerSession(
    transition,
    {
      brokerId: 'broker-b',
      accountLogin: '2002',
      apiBase: 'https://services.broker-b.com/api/v2',
      feedWsBase: 'wss://services.broker-b.com/ws/feed',
      feedStatusUrl: 'https://services.broker-b.com/ws/feed/status',
      servicesDomain: 'services.broker-b.com',
      investor: false,
      configVersion: 'cfg-2',
    },
    {
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  );
  let committed = 0;

  assert.equal(commitQuoteSnapshotIfSessionCurrent(provenance, () => committed += 1), false);
  assert.equal(committed, 0);
});

test('queued quote commit is discarded after credentials rotate in the same session', () => {
  const capture = activate();
  const provenance = getActiveBrokerSessionProvenance(capture.session);
  updateActiveBrokerSessionCredentials(
    getActiveBrokerSessionIdentity(capture.session),
    {
      accessToken: 'access-rotated',
      refreshToken: 'refresh-rotated',
      expiresAt: '2099-01-02T00:00:00.000Z',
    },
  );
  let committed = 0;

  assert.equal(commitQuoteSnapshotIfSessionCurrent(provenance, () => committed += 1), false);
  assert.equal(committed, 0);
});

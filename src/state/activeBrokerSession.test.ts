import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  captureActiveBrokerSessionProvenance,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  isActiveBrokerSessionOwnerStampCurrent,
  isActiveBrokerSessionProvenanceCurrent,
  subscribeActiveBrokerSession,
  updateActiveBrokerSessionCredentials,
} from './activeBrokerSession';

const sessionInput = (brokerId = 'broker-a') => ({
  brokerId,
  accountLogin: '10001',
  apiBase: `https://services.${brokerId}.com/api/v2`,
  feedWsBase: `wss://services.${brokerId}.com/ws/feed`,
  tradeWsBase: `wss://services.${brokerId}.com/ws/v2`,
  feedStatusUrl: `https://services.${brokerId}.com/ws/feed/status`,
  servicesDomain: `services.${brokerId}.com`,
  configVersion: 'cfg-1',
});

const credentials = (accessToken = 'access-a') => ({
  accessToken,
  refreshToken: 'refresh-a',
  expiresAt: '2099-01-01T00:00:00.000Z',
});

test.beforeEach(() => __resetActiveBrokerSessionForTests());

test('transition invalidates the old session before a new commit', () => {
  const first = beginActiveBrokerSessionTransition();
  const capture = activateBrokerSession(first, sessionInput(), credentials());
  const identity = getActiveBrokerSessionIdentity(capture.session);

  const second = beginActiveBrokerSessionTransition();
  assert.equal(second.sessionEpoch, first.sessionEpoch + 1);
  assert.equal(captureActiveBrokerSession(), null);
  assert.equal(isActiveBrokerSessionCurrent(identity), false);
});

test('activation commits one immutable identity, endpoint set, and cache namespace', () => {
  const transition = beginActiveBrokerSessionTransition();
  const capture = activateBrokerSession(transition, sessionInput('BROKER-A'), credentials());

  assert.equal(Object.isFrozen(capture), true);
  assert.equal(Object.isFrozen(capture.session), true);
  assert.equal(Object.isFrozen(capture.credentials), true);
  assert.equal(capture.session.brokerId, 'BROKER-A');
  assert.match(capture.session.cacheNamespace, /^broker-a:10001:[a-z0-9-]+:1$/i);
  assert.equal(capture.session.sessionEpoch, 1);
  assert.equal(capture.session.servicesDomain, 'services.broker-a.com');
  const provenance = captureActiveBrokerSessionProvenance();
  assert.equal(provenance?.cacheNamespace, capture.session.cacheNamespace);
  assert.equal(provenance ? isActiveBrokerSessionProvenanceCurrent(provenance) : false, true);
  beginActiveBrokerSessionTransition();
  assert.equal(provenance ? isActiveBrokerSessionProvenanceCurrent(provenance) : true, false);
});

test('cache namespaces remain unique when a cold-start epoch counter repeats', () => {
  const first = activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    sessionInput(),
    credentials(),
  );
  const firstNamespace = first.session.cacheNamespace;

  // A cold process starts its epoch counter from zero. The cache nonce must
  // still prevent a new authenticated activation from reopening old disk keys.
  __resetActiveBrokerSessionForTests();
  const afterRestart = activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    sessionInput(),
    credentials(),
  );

  assert.equal(first.session.sessionEpoch, afterRestart.session.sessionEpoch);
  assert.notEqual(firstNamespace, afterRestart.session.cacheNamespace);
});

test('stale or already-committed transitions cannot activate', () => {
  const stale = beginActiveBrokerSessionTransition();
  const current = beginActiveBrokerSessionTransition();

  assert.throws(
    () => activateBrokerSession(stale, sessionInput(), credentials()),
    /stale or already committed/,
  );
  activateBrokerSession(current, sessionInput(), credentials());
  assert.throws(
    () => activateBrokerSession(current, sessionInput(), credentials()),
    /stale or already committed/,
  );
});

test('credential refresh can update only the matching active identity', () => {
  const capture = activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    sessionInput(),
    credentials(),
  );
  const identity = getActiveBrokerSessionIdentity(capture.session);

  assert.equal(updateActiveBrokerSessionCredentials(identity, credentials('access-new')), true);
  assert.equal(captureActiveBrokerSession()?.credentials.accessToken, 'access-new');

  beginActiveBrokerSessionTransition();
  assert.equal(updateActiveBrokerSessionCredentials(identity, credentials('stale-write')), false);
  assert.equal(captureActiveBrokerSession(), null);
});

test('credential refresh rotates tokens in one generation and never adds feed auth', () => {
  const capture = activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    sessionInput(),
    credentials(),
  );
  const identity = getActiveBrokerSessionIdentity(capture.session);
  const previousOwner = captureActiveBrokerSessionOwnerStamp();
  assert.ok(previousOwner);

  assert.equal(updateActiveBrokerSessionCredentials(
    identity,
    {
      ...credentials('access-new'),
      // A legacy (pre-v3) caller passing a feed token is ignored.
      feedToken: 'legacy-feed-token',
    } as ReturnType<typeof credentials>,
  ), true);

  const current = captureActiveBrokerSession();
  const currentOwner = captureActiveBrokerSessionOwnerStamp();
  assert.ok(current);
  assert.ok(currentOwner);
  assert.equal(current.credentials.accessToken, 'access-new');
  assert.equal('feedToken' in current.credentials, false);
  assert.equal('feedAuthContext' in current.session, false);
  assert.equal(isActiveBrokerSessionOwnerStampCurrent(previousOwner), false);
  assert.equal(
    currentOwner.credentialGeneration,
    previousOwner.credentialGeneration + 1,
  );
});

test('strong owner stamps include endpoint and invalidate on credential rotation', () => {
  const capture = activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    sessionInput(),
    credentials(),
  );
  const identity = getActiveBrokerSessionIdentity(capture.session);
  const firstOwner = captureActiveBrokerSessionOwnerStamp();
  const firstProvenance = captureActiveBrokerSessionProvenance();
  assert.ok(firstOwner);
  assert.ok(firstProvenance);
  assert.equal(firstOwner.apiBase, capture.session.apiBase);
  assert.equal(firstOwner.cacheNamespace, capture.session.cacheNamespace);
  assert.equal(firstProvenance.apiBase, capture.session.apiBase);
  assert.equal(firstProvenance.credentialGeneration, firstOwner.credentialGeneration);
  assert.equal(isActiveBrokerSessionOwnerStampCurrent(firstOwner), true);
  assert.equal(isActiveBrokerSessionProvenanceCurrent(firstProvenance), true);

  assert.equal(updateActiveBrokerSessionCredentials(identity, credentials('access-new')), true);
  const rotatedOwner = captureActiveBrokerSessionOwnerStamp();
  const rotatedProvenance = captureActiveBrokerSessionProvenance();
  assert.ok(rotatedOwner);
  assert.ok(rotatedProvenance);
  assert.equal(isActiveBrokerSessionOwnerStampCurrent(firstOwner), false);
  assert.equal(isActiveBrokerSessionOwnerStampCurrent(rotatedOwner), true);
  assert.equal(isActiveBrokerSessionProvenanceCurrent(firstProvenance), false);
  assert.equal(isActiveBrokerSessionProvenanceCurrent(rotatedProvenance), true);
  assert.equal(rotatedOwner.credentialGeneration, firstOwner.credentialGeneration + 1);
  assert.notEqual(rotatedOwner.credentialIdentity, firstOwner.credentialIdentity);
});

test('subscribers observe invalidation before activation', () => {
  const events: string[] = [];
  const unsubscribe = subscribeActiveBrokerSession((event) => events.push(event.type));

  const transition = beginActiveBrokerSessionTransition();
  activateBrokerSession(transition, sessionInput(), credentials());
  unsubscribe();

  assert.deepEqual(events, ['transition', 'activated']);
});

test('invalid transport endpoints fail closed', () => {
  const insecure = beginActiveBrokerSessionTransition();
  assert.throws(
    () => activateBrokerSession(
      insecure,
      { ...sessionInput(), feedWsBase: 'ws://services.broker-a.com/ws/feed' },
      credentials(),
    ),
    /invalid WSS feed endpoint/,
  );

});

test('activation rejects missing versions and endpoint hosts outside approved services domain', () => {
  const missingVersion = beginActiveBrokerSessionTransition();
  assert.throws(
    () => activateBrokerSession(
      missingVersion,
      { ...sessionInput(), configVersion: '' },
      credentials(),
    ),
    /versioned endpoint provenance/,
  );

  const mismatchedHost = beginActiveBrokerSessionTransition();
  assert.throws(
    () => activateBrokerSession(
      mismatchedHost,
      { ...sessionInput(), feedWsBase: 'wss://feed.attacker.example/ws/feed' },
      credentials(),
    ),
    /endpoint host does not match services_domain/,
  );
});

test('every session uses the no-token feed, even when a legacy feed auth context is passed', () => {
  for (const legacyFeedAuthContext of [
    undefined,
    { mode: 'disabled_unconfigured' as const, reason: 'missing_contract' as const },
    {
      mode: 'query' as const,
      credential: 'feed_token' as const,
      tokenQueryParam: 'token&broker_id',
    },
  ]) {
    const capture = activateBrokerSession(
      beginActiveBrokerSessionTransition(),
      { ...sessionInput(), feedAuthContext: legacyFeedAuthContext } as ReturnType<typeof sessionInput>,
      { ...credentials(), feedToken: 'legacy-feed-token' } as ReturnType<typeof credentials>,
    );

    assert.equal('feedAuthContext' in capture.session, false);
    assert.equal('feedToken' in capture.credentials, false);
  }
});


import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FEED_LOCAL_TICK_STALE_AFTER_MS,
  feedHealthAllowsFreshQuoteFallback,
  feedHealthAllowsPriceActions,
  feedHealthBlocksSocketConnection,
  feedHealthCanSafelyRetry,
  initialFeedHealthState,
  reduceFeedHealth,
  type FeedHealthIdentity,
  type FeedHealthState,
  type FeedServerStatus,
} from './feedHealthState';

const identity = (
  brokerId = 'Orrnn',
  accountLogin = '200074',
  sessionEpoch = 1,
): FeedHealthIdentity => ({ brokerId, accountLogin, sessionEpoch });

const serverStatus = (
  observedAt: number,
  verdict: FeedServerStatus['verdict'],
): FeedServerStatus => ({
  observedAt,
  verdict,
  symbolsFresh: verdict === 'healthy' ? 57 : 0,
  providerConnected: verdict !== 'down',
});

const bind = (feedIdentity = identity()): FeedHealthState => reduceFeedHealth(initialFeedHealthState, {
  type: 'BIND_SESSION',
  identity: feedIdentity,
  transportConfigured: true,
  credentialApproved: true,
});

const tick = (
  state: FeedHealthState,
  receivedAt: number,
  changes: Partial<{ stale: boolean; degraded: boolean; transport: 'websocket' | 'rest_snapshot' }> = {},
  feedIdentity = identity(),
): FeedHealthState => reduceFeedHealth(state, {
  type: 'LOCAL_TICK',
  identity: feedIdentity,
  receivedAt,
  bid: 1.13736,
  ask: 1.13751,
  transport: changes.transport ?? 'websocket',
  stale: changes.stale,
  degraded: changes.degraded,
});

test('health is scoped to broker, account, and session epoch; broker id ignores case', () => {
  const active = bind();
  const wrongBroker = reduceFeedHealth(active, {
    type: 'SERVER_STATUS',
    identity: identity('trivanta-markets'),
    health: serverStatus(1_000, 'down'),
  });
  const oldEpoch = tick(active, 1_000, {}, identity('Orrnn', '200074', 0));

  assert.equal(wrongBroker, active);
  assert.equal(oldEpoch, active);
  // "Orrnn" from the session vs "orrnn" anywhere else is the same broker.
  assert.equal(tick(active, 1_000, {}, identity('orrnn')).lastLocalTickAt, 1_000);
});

test('a fresh websocket tick alone makes the feed healthy (no health_policy needed)', () => {
  const healthy = tick(bind(), 10_000);
  assert.equal(healthy.status, 'healthy');
  assert.equal(healthy.reasonCategory, 'live_ticks');
  assert.equal(feedHealthAllowsPriceActions(healthy, 10_500), true);
  assert.equal(feedHealthAllowsFreshQuoteFallback(healthy, identity(), 10_500), true);
});

test('8 s of silence marks prices stale without any socket-level verdict', () => {
  assert.equal(FEED_LOCAL_TICK_STALE_AFTER_MS, 8_000);
  const healthy = tick(bind(), 10_000);
  const stillFresh = reduceFeedHealth(healthy, { type: 'EVALUATE', identity: identity(), now: 17_999 });
  assert.equal(stillFresh.status, 'healthy');

  const stale = reduceFeedHealth(healthy, { type: 'EVALUATE', identity: identity(), now: 18_000 });
  assert.equal(stale.status, 'stale_or_degraded');
  assert.equal(stale.reasonCategory, 'local_tick_stale');
  assert.equal(feedHealthAllowsPriceActions(stale, 18_000), false);
  // Silence never blocks the socket.
  assert.equal(feedHealthBlocksSocketConnection(stale, identity()), false);

  assert.equal(tick(stale, 20_000).status, 'healthy');
});

test('stale:true and degraded ticks keep prices greyed', () => {
  const staleTick = tick(bind(), 10_000, { stale: true });
  assert.equal(staleTick.status, 'stale_or_degraded');
  assert.equal(feedHealthAllowsPriceActions(staleTick, 10_000), false);
  assert.equal(tick(bind(), 10_000, { degraded: true }).status, 'stale_or_degraded');
});

test('REST snapshots cannot make the feed healthy', () => {
  const afterSnapshot = tick(bind(), 20_100, { transport: 'rest_snapshot' });
  assert.equal(afterSnapshot.status, 'connecting');
  assert.equal(feedHealthAllowsPriceActions(afterSnapshot, 20_100), false);
});

test('live ticks win over a "down" or "degraded" status reading', () => {
  const healthy = tick(bind(), 30_000);
  for (const verdict of ['down', 'degraded'] as const) {
    const withStatus = reduceFeedHealth(healthy, {
      type: 'SERVER_STATUS',
      identity: identity(),
      health: serverStatus(30_500, verdict),
    });
    assert.equal(withStatus.status, 'healthy', verdict);
    assert.equal(feedHealthAllowsPriceActions(withStatus, 30_600), true, verdict);
    assert.equal(feedHealthBlocksSocketConnection(withStatus, identity()), false, verdict);
  }
});

test('without ticks the status verdict is shown, but never blocks the socket', () => {
  const down = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: serverStatus(40_000, 'down'),
  });
  assert.equal(down.status, 'provider_down');
  assert.equal(down.reasonCategory, 'provider_connectivity');
  assert.equal(feedHealthBlocksSocketConnection(down, identity()), false);

  const degraded = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: serverStatus(40_000, 'degraded'),
  });
  assert.equal(degraded.status, 'stale_or_degraded');
  assert.equal(degraded.reasonCategory, 'server_degraded');

  const healthyStatus = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: serverStatus(40_000, 'healthy'),
  });
  assert.equal(healthyStatus.status, 'connecting');
  assert.equal(healthyStatus.reasonCategory, 'awaiting_live_tick');
  assert.equal(feedHealthAllowsPriceActions(healthyStatus, 40_000), false);
});

test('a "down" reading superseded by live ticks does not relabel a later gap as provider down', () => {
  const down = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: serverStatus(40_000, 'down'),
  });
  const provedLive = tick(down, 41_000);
  assert.equal(provedLive.status, 'healthy');

  const gapAt = 41_000 + FEED_LOCAL_TICK_STALE_AFTER_MS + 1;
  const quiet = reduceFeedHealth(provedLive, { type: 'EVALUATE', identity: identity(), now: gapAt });
  assert.equal(quiet.status, 'stale_or_degraded');
  assert.equal(quiet.reasonCategory, 'local_tick_stale');
  assert.equal(feedHealthAllowsPriceActions(quiet, gapAt), false);

  const closed = reduceFeedHealth(provedLive, { type: 'SOCKET_CLOSED', identity: identity() });
  assert.equal(closed.status, 'reconnecting');

  // A newer "down" reading after the last tick is current again.
  const downAgain = reduceFeedHealth(quiet, {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: serverStatus(gapAt + 1, 'down'),
  });
  assert.equal(downAgain.status, 'provider_down');
});

test('a socket close is a transport interruption until the next tick; there is no auth latch', () => {
  const healthy = tick(bind(), 50_000);
  const closed = reduceFeedHealth(healthy, { type: 'SOCKET_CLOSED', identity: identity() });
  assert.equal(closed.status, 'reconnecting');
  assert.equal(closed.reasonCategory, 'transport_interrupted');
  assert.notEqual(closed.status, 'auth_failed');
  assert.equal(feedHealthAllowsPriceActions(closed, 50_001), false);
  assert.equal(feedHealthBlocksSocketConnection(closed, identity()), false);
  assert.equal(feedHealthCanSafelyRetry(closed), true);

  const recovered = tick(closed, 51_000);
  assert.equal(recovered.status, 'healthy');
  assert.equal(recovered.transportInterrupted, false);
});

test('credential refresh drops the old tick proof and waits for a new tick', () => {
  const healthy = tick(bind(), Date.now());
  const refreshed = reduceFeedHealth(healthy, { type: 'CREDENTIALS_REFRESHED', identity: identity() });
  assert.equal(refreshed.status, 'connecting');
  assert.equal(refreshed.serverVerdict, 'unknown');
  assert.equal(refreshed.lastLocalTickAt, undefined);
});

test('an unconfigured feed URL is the only socket-blocking state', () => {
  const unconfigured = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity: identity(),
    transportConfigured: false,
    credentialApproved: true,
  });
  assert.equal(unconfigured.status, 'disabled_unconfigured');
  assert.equal(feedHealthBlocksSocketConnection(unconfigured, identity()), true);
  assert.equal(feedHealthBlocksSocketConnection(bind(), identity()), false);
  assert.equal(feedHealthBlocksSocketConnection(bind(), identity('trivanta-markets')), true);
});

test('safe retry keeps the visible outage until the retried socket delivers a tick', () => {
  const providerDown = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: serverStatus(70_000, 'down'),
  });
  const retryRequested = reduceFeedHealth(providerDown, {
    type: 'RETRY_REQUESTED',
    identity: identity(),
  });

  assert.equal(retryRequested, providerDown);
  assert.equal(retryRequested.status, 'provider_down');
  assert.equal(feedHealthCanSafelyRetry(retryRequested), true);
});

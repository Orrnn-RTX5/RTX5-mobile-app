import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFeedHealthBannerModel,
  resolveCompactFeedStatusLabel,
} from './feedHealthPresentation';
import { initialFeedHealthState, reduceFeedHealth } from './feedHealthState';

const identity = { brokerId: 'trivanta-markets', accountLogin: '200074', sessionEpoch: 7 } as const;

const bound = () => reduceFeedHealth(initialFeedHealthState, {
  type: 'BIND_SESSION',
  identity,
  transportConfigured: true,
  credentialApproved: true,
});

test('provider outage presentation is broker-scoped, critical, and retryable', () => {
  const withTick = reduceFeedHealth(bound(), {
    type: 'LOCAL_TICK',
    identity,
    receivedAt: 1_000,
    bid: 1,
    ask: 2,
    transport: 'websocket',
  });
  // Ticks have stopped (evaluated long after) and /ws/feed/status says down.
  const providerDown = reduceFeedHealth(withTick, {
    type: 'SERVER_STATUS',
    identity,
    health: { observedAt: 100_000, verdict: 'down', symbolsFresh: 0, providerConnected: false },
  });

  const providerBanner = buildFeedHealthBannerModel(providerDown, 'trivanta-markets');
  // UI banners are suppressed on all surfaces; model still carries copy for diagnostics.
  assert.equal(providerBanner.visible, false);
  assert.equal(providerBanner.tone, 'critical');
  assert.equal(providerBanner.title, 'Market Data Unavailable');
  assert.equal(providerBanner.brokerLabel, 'Trivanta Markets');
  assert.equal(providerBanner.reasonLabel, 'Broker market-data provider is offline');
  assert.equal(providerBanner.lastSuccessAt, 1_000);
  assert.equal(providerBanner.canRetry, true);
});

test('a socket close is a retryable reconnect, never an auth failure', () => {
  const closed = reduceFeedHealth(bound(), { type: 'SOCKET_CLOSED', identity });
  const banner = buildFeedHealthBannerModel(closed, 'trivanta-markets');

  assert.equal(closed.status, 'reconnecting');
  assert.equal(banner.visible, false);
  assert.equal(banner.title, 'Prices Delayed');
  assert.equal(banner.reasonLabel, 'Live connection was interrupted');
  assert.equal(banner.canRetry, true);
});

test('healthy feed does not render an outage banner', () => {
  const healthy = reduceFeedHealth(bound(), {
    type: 'LOCAL_TICK',
    identity,
    receivedAt: Date.now(),
    bid: 1,
    ask: 2,
    transport: 'websocket',
  });

  assert.equal(healthy.status, 'healthy');
  assert.equal(healthy.reasonCategory, 'live_ticks');
  const banner = buildFeedHealthBannerModel(healthy, 'trivanta-markets');
  assert.equal(banner.visible, false);
  assert.equal(banner.reasonLabel, 'Live prices are streaming');
});

test('an unconfigured feed URL keeps a diagnostic reason and ignores legacy feed-auth input', () => {
  const unconfigured = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity,
    transportConfigured: false,
    credentialApproved: true,
  });
  const banner = buildFeedHealthBannerModel(unconfigured, 'trivanta-markets');

  assert.equal(banner.visible, false);
  assert.equal(banner.reasonLabel, 'Broker feed is not configured');
  assert.doesNotMatch(banner.reasonLabel, /feed_auth_context|Feed token/);
});

test('ticks without any health_policy are healthy, not "policy awaiting approval"', () => {
  const withTick = reduceFeedHealth(bound(), {
    type: 'LOCAL_TICK',
    identity,
    receivedAt: Date.now(),
    bid: 1,
    ask: 2,
    transport: 'websocket',
  });
  assert.notEqual(withTick.reasonCategory, 'health_policy_unconfigured');
  assert.equal(withTick.status, 'healthy');
});

test('compact feed status reports terminal states instead of endless connecting', () => {
  assert.equal(resolveCompactFeedStatusLabel('disabled_unconfigured', false), 'Unavailable');
  assert.equal(resolveCompactFeedStatusLabel('disabled_unconfigured', true), 'Unavailable');
  assert.equal(resolveCompactFeedStatusLabel('auth_failed', false), 'Unavailable');
  assert.equal(resolveCompactFeedStatusLabel('provider_down', false), 'Unavailable');
  assert.equal(resolveCompactFeedStatusLabel('market_unavailable', false), 'Unavailable');
  assert.equal(resolveCompactFeedStatusLabel('connecting', false), 'Connecting...');
  assert.equal(resolveCompactFeedStatusLabel('healthy', true), 'LIVE');
});

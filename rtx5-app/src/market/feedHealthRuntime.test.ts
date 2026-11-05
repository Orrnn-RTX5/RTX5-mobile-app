import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  __resetFeedHealthRuntimeForTests,
  bindFeedHealthSession,
  getFeedHealthRenderSnapshot,
  getFeedHealthSnapshot,
  reportFeedLocalTick,
  reportFeedSocketClosed,
  subscribeFeedHealth,
  unbindFeedHealthSession,
} from './feedHealthRuntime';

const identity = { brokerId: 'test', accountLogin: '100', sessionEpoch: 1 };
const start = 1_800_000_000_000;
const bind = (session = identity, staleAfterMs = 8_000) => bindFeedHealthSession({
  identity: session, transportConfigured: true, credentialApproved: true,
  thresholds: { localTickStaleAfterMs: staleAfterMs, serverStatusStaleAfterMs: 30_000 },
});
const tick = (session = identity) => reportFeedLocalTick(session, {
  receivedAt: Date.now(), bid: 1, ask: 2, transport: 'websocket',
});
function setup(t: TestContext) {
  __resetFeedHealthRuntimeForTests();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: start });
  const scheduled = t.mock.method(globalThis, 'setTimeout');
  t.after(() => { __resetFeedHealthRuntimeForTests(); t.mock.restoreAll(); t.mock.timers.reset(); });
  bind();
  return scheduled;
}

test('a sustained tick burst keeps one freshness timer and one healthy render snapshot', t => {
  const scheduled = setup(t);
  let notifications = 0;
  subscribeFeedHealth(() => notifications++);
  tick();
  const renderSnapshot = getFeedHealthRenderSnapshot();
  for (let i = 0; i < 400; i++) {
    t.mock.timers.tick(10);
    tick();
  }
  assert.equal(scheduled.mock.callCount(), 1);
  assert.equal(notifications, 1);
  assert.equal(getFeedHealthRenderSnapshot(), renderSnapshot);
  assert.equal(getFeedHealthSnapshot().lastLocalTickAt, start + 4_000);

  t.mock.timers.tick(4_000);
  assert.equal(getFeedHealthSnapshot().status, 'healthy');
  assert.equal(scheduled.mock.callCount(), 2, 'the original deadline only rearms for the latest tick');
  t.mock.timers.tick(3_999);
  assert.equal(getFeedHealthSnapshot().status, 'healthy');
  t.mock.timers.tick(1);
  assert.equal(getFeedHealthSnapshot().status, 'stale_or_degraded');
  assert.equal(notifications, 2);
});

test('shortening the freshness policy re-arms an earlier exact deadline', t => {
  const scheduled = setup(t);
  tick();
  t.mock.timers.tick(1_000);
  bind(identity, 2_000);
  assert.equal(scheduled.mock.callCount(), 2);
  t.mock.timers.tick(999);
  assert.equal(getFeedHealthSnapshot().status, 'healthy');
  t.mock.timers.tick(1);
  assert.equal(getFeedHealthSnapshot().status, 'stale_or_degraded');
});

test('closing and unbinding cancel pending work, and a replacement session owns its deadline', t => {
  const scheduled = setup(t);
  tick();
  reportFeedSocketClosed(identity);
  t.mock.timers.tick(8_000);
  assert.equal(getFeedHealthSnapshot().status, 'reconnecting');
  assert.equal(scheduled.mock.callCount(), 1);
  tick();
  unbindFeedHealthSession();
  const replacement = { ...identity, sessionEpoch: 2 };
  bind(replacement);
  t.mock.timers.tick(1_000);
  tick(replacement);
  t.mock.timers.tick(7_999);
  assert.equal(getFeedHealthSnapshot().status, 'healthy');
  assert.equal(getFeedHealthSnapshot().identity?.sessionEpoch, 2);
  t.mock.timers.tick(1);
  assert.equal(getFeedHealthSnapshot().status, 'stale_or_degraded');
});

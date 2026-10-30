import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as sessions from '../../state/activeBrokerSession';
import * as symbols from '../../domain/symbols';
import * as snapshots from './liveQuoteSnapshot';
import * as continuity from './quoteSnapshotContinuity';
import * as quoteVolume from '../../utils/quoteVolume';
import * as normalizer from '../../api/ws/quoteTickNormalizer';
import { readExecutionQuote, registerExecutionQuoteReader } from '../../market/executionQuoteSource';

const now = 1_800_000_000_000;
const activate = (accountLogin = '10001') => sessions.activateBrokerSession(sessions.beginActiveBrokerSessionTransition(), {
  brokerId: 'broker-a', accountLogin, apiBase: 'https://services.broker-a.com/api/v2',
  feedWsBase: 'wss://services.broker-a.com/ws/feed', tradeWsBase: 'wss://services.broker-a.com/ws/v2',
  feedStatusUrl: 'https://services.broker-a.com/ws/feed/status', servicesDomain: 'services.broker-a.com', configVersion: 'cfg-1',
}, { accessToken: 'initial-access', refreshToken: '', expiresAt: '2099-01-01T00:00:00.000Z' });

function harness(t: TestContext) {
  sessions.__resetActiveBrokerSessionForTests();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
  activate();
  const exports: Record<string, any> = {};
  const tradingState = { quotes: {} as Record<string, unknown>, setQuote: () => {} };
  const prefs = { brokerId: 'broker-a', isLoggedIn: true };
  let releaseExecutionReader = () => {};
  const dependencies: Record<string, unknown> = {
    react: {},
    '../../api/apiClient': { apiClient: () => { throw new Error('Unexpected network request'); } },
    '../../api/ws/quoteTickNormalizer': normalizer,
    '../../api/ws/quotesSocket': { quotesWsService: {} },
    '../../api/ws/orrnnDemoPublicMarketSocket': { orrnnDemoPublicMarketSocket: {} },
    '../../api/orrnnDemoPublicMarket': {
      isOrrnnDemoPublicMarketSelection: () => false,
      ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE: 'public-market:unselected',
    },
    '../../domain/symbols': symbols,
    '../../utils/quoteVolume': quoteVolume,
    '../../state/tradingState': { useTradingState: { getState: () => tradingState } },
    '../../state/userPreferences': { useUserPreferences: { getState: () => prefs, subscribe: () => () => {} } },
    '../../state/activeBrokerSession': sessions,
    '../../utils/securityRedaction': { redactDiagnosticValue: (value: unknown) => value },
    '../../market/quoteLatencyMetrics': {
      quoteLatencyMonotonicNow: () => 0, recordQuoteCacheCommit: () => {}, resetQuoteLatencyMetrics: () => {},
    },
    '../../market/quoteSnapshotReconcileRuntime': { subscribeQuoteSnapshotReconcile: () => () => {} },
    '../../market/executionQuoteSource': {
      registerExecutionQuoteReader: (reader: Parameters<typeof registerExecutionQuoteReader>[0]) => {
        releaseExecutionReader = registerExecutionQuoteReader(reader);
        return releaseExecutionReader;
      },
    },
    '../../state/publicBrokerContext': { subscribePublicBrokerContext: () => () => {} },
    '../../state/publicQuoteAvailability': { subscribePublicQuoteInvalidation: () => () => {} },
    './quoteSnapshotContinuity': continuity,
    './liveQuoteSnapshot': snapshots,
  };
  const source = readFileSync(resolve(process.cwd(), 'src/features/quotes/useLiveQuotes.ts'), 'utf8');
  const inspection = `
    exports.inspect = () => ({
      keys: [...snapshotsBySymbol.keys()], snapshots: snapshotsBySymbol.size,
      listeners: listenersBySymbol.size, pending: pendingNotifySymbols.size,
      continuity: quoteSnapshotContinuity.snapshots.size,
    });
    exports.ingestVolume = ingestRestQuoteVolumeOnly;
  `;
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText + inspection, {
    exports, Date, setTimeout, clearTimeout, cancelAnimationFrame: () => {},
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  t.after(() => { releaseExecutionReader(); exports.resetLiveQuoteSnapshotRuntimeState(); sessions.__resetActiveBrokerSessionForTests(); t.mock.timers.reset(); });
  const rotate = (generation: number) => {
    const capture = sessions.captureActiveBrokerSession()!;
    assert.equal(sessions.updateActiveBrokerSessionCredentials(sessions.getActiveBrokerSessionIdentity(capture.session), {
      ...capture.credentials, accessToken: `token-${generation}`,
    }), true);
  };
  const tick = (symbol = 'EURUSD.pro', bid = 1.1, immediate = true) => exports.ingestLiveQuoteTick({
    symbol, rawSymbol: symbol, bid, ask: bid + .0002, timestamp: Date.now(), receivedAt: Date.now(), feedTickAt: Date.now(),
    transport: 'websocket', stale: false, tradable: true, degraded: false,
  }, immediate);
  return { runtime: exports, rotate, tick, tradingState };
}

test('order guard reads the exact live symbol and session even without a batched store consumer', t => {
  const { runtime, tick, rotate, tradingState } = harness(t);
  const namespace = sessions.captureActiveBrokerSession()!.session.cacheNamespace;
  tick();
  assert.deepEqual(tradingState.quotes, {});
  assert.strictEqual(readExecutionQuote(namespace, 'EURUSD.pro'), runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro'));
  assert.equal(readExecutionQuote(namespace, 'EURUSD'), undefined, 'broker suffixes cannot borrow another symbol quote');
  assert.equal(readExecutionQuote('another-session', 'EURUSD.pro'), undefined);
  rotate(1);
  assert.equal(readExecutionQuote(namespace, 'EURUSD.pro')?.tradable, false, 'credential rotation invalidates execution');
  tick();
  assert.equal(readExecutionQuote(namespace, 'EURUSD.pro')?.tradable, true);
  activate('10002');
  assert.equal(readExecutionQuote(namespace, 'EURUSD.pro'), undefined, 'old accounts cannot read new account quotes');
  const nextNamespace = sessions.captureActiveBrokerSession()!.session.cacheNamespace;
  assert.equal(readExecutionQuote(nextNamespace, 'EURUSD.pro'), undefined);
});

test('100 credential rotations retain only current snapshots and listeners with unavailable-price continuity', t => {
  const { runtime, rotate, tick } = harness(t);
  tick(); tick('GBPUSD.pro', 1.3);
  let notifications = 0;
  let unsubscribe = runtime.subscribeLiveQuoteSnapshots(['EURUSD.pro'], () => notifications++);
  for (let generation = 1; generation <= 100; generation += 1) {
    const previous = runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro');
    rotate(generation);
    assert.equal(runtime.inspect().snapshots, 0, 'rotation eagerly releases old generation entries');
    assert.equal(runtime.inspect().listeners, 0);
    const retained = runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro');
    assert.equal(retained.bid, previous.bid);
    assert.equal(retained.lastReceivedAt, previous.lastReceivedAt);
    assert.equal(retained.feedTickAt, previous.feedTickAt);
    assert.equal(retained.stale, true); assert.equal(retained.tradable, false); assert.equal(retained.degraded, true);
    assert.strictEqual(runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro'), retained, 'same-scope reads keep snapshot identity stable');
    const nextUnsubscribe = runtime.subscribeLiveQuoteSnapshots(['EURUSD.pro'], () => notifications++);
    unsubscribe(); // A delayed old effect cleanup cannot remove the new listener.
    t.mock.timers.tick(1);
    tick('EURUSD.pro', 1.1 + generation / 10_000);
    tick('GBPUSD.pro', 1.3);
    assert.equal(notifications, generation);
    assert.equal(runtime.inspect().snapshots, 2);
    assert.equal(runtime.inspect().listeners, 1);
    assert.equal(runtime.inspect().continuity, 2);
    assert.equal(runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro').tradable, true);
    const owner = sessions.captureActiveBrokerSessionOwnerStamp()!;
    const prefix = `${owner.cacheNamespace}:${owner.credentialGeneration}:${owner.credentialIdentity}|`;
    assert.ok(runtime.inspect().keys.every((key: string) => key.startsWith(prefix)));
    unsubscribe = nextUnsubscribe;
  }
  unsubscribe();
  assert.equal(runtime.inspect().listeners, 0);
});

test('inactive rotations release old scopes without a subsequent quote read, tick or mounted row', t => {
  const { runtime, rotate, tick } = harness(t);
  tick();
  for (let generation = 1; generation <= 100; generation += 1) {
    rotate(generation);
    assert.equal(runtime.inspect().snapshots, 0);
    assert.equal(runtime.inspect().listeners, 0);
    assert.equal(runtime.inspect().continuity, 1);
  }
  assert.equal(runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro').bid, 1.1);
  assert.equal(runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro').tradable, false);
});

test('scope rotation cancels old pending notifications and preserves the established 16 ms cadence', t => {
  const { runtime, rotate, tick } = harness(t);
  let oldNotifications = 0; let currentNotifications = 0;
  const stopOld = runtime.subscribeLiveQuoteSnapshots(['EURUSD.pro'], () => oldNotifications++);
  tick('EURUSD.pro', 1.1, false);
  assert.equal(runtime.inspect().pending, 1);
  rotate(1);
  assert.equal(runtime.inspect().pending, 0);
  const stopCurrent = runtime.subscribeLiveQuoteSnapshots(['EURUSD.pro'], () => currentNotifications++);
  stopOld();
  tick('EURUSD.pro', 1.2, false);
  t.mock.timers.tick(15);
  assert.equal(currentNotifications, 0);
  t.mock.timers.tick(1);
  assert.equal(oldNotifications, 0); assert.equal(currentNotifications, 1);
  stopCurrent();
  assert.equal(runtime.inspect().listeners, 0);
});

test('account change and logout discard continuity while same-session volume repair is retained', t => {
  const { runtime, rotate, tick } = harness(t);
  tick();
  runtime.ingestVolume('EURUSD.pro', { symbol: 'EURUSD.pro', bid: 1.1, ask: 1.1002, volume: 543 });
  rotate(1);
  const retained = runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro');
  assert.equal(retained.volume, 543);
  assert.equal(retained.tradable, false);
  activate('10002');
  assert.equal(runtime.inspect().snapshots, 0); assert.equal(runtime.inspect().continuity, 0);
  assert.equal(runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro'), undefined);
  tick('EURUSD.pro', 2.2);
  assert.equal(runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro').bid, 2.2);
  sessions.clearActiveBrokerSession();
  assert.equal(runtime.inspect().snapshots, 0); assert.equal(runtime.inspect().listeners, 0);
  assert.equal(runtime.inspect().continuity, 0);
  assert.equal(runtime.getCurrentLiveQuoteSnapshot('EURUSD.pro'), undefined);
});

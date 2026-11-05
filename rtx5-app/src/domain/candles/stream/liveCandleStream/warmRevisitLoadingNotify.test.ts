import test from 'node:test';
import assert from 'node:assert/strict';

import { candleMemoryCache } from '../candleMemoryCache';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
} from '../../../../state/activeBrokerSession';
import { LiveCandleStreamManager } from './manager';
import {
  HISTORY_REQUEST_TIMEOUT_ERROR_MESSAGE,
  runLoadHistory,
  waitForHistoryPrefetchSettlement,
  type CandleHistoryFetcher,
} from './historyFetching';
import type { StreamEntry } from './types';

/**
 * Regression guard for the "revisited symbol never finishes loading" defect.
 *
 * Switching away from a symbol disposes its StreamEntry, but the module-level
 * candleMemoryCache keeps the committed series. Coming back therefore seeds the
 * new entry with the *previous* visit's series before the REST refresh lands —
 * and when that refresh returns byte-identical history, `commit()` takes the
 * `isSameSeries` early return.
 *
 * That early return runs AFTER `entry.loading` has already been recomputed, so
 * loading flips true -> false without any listener notification. The React
 * binding (useSyncExternalStore) never re-reads the snapshot, its cached key
 * still encodes `loading: 1`, and the chart's spinner stays up forever — until
 * some unrelated event happens to notify, or the app is restarted.
 *
 * The first visit is unaffected: the entry starts empty, so the series really
 * does change and the notification fires.
 */

const TIMEFRAME_SECONDS = 300;

const buildHistoryCandles = (count: number, startTime: number) =>
  Array.from({ length: count }, (_, index) => ({
    time: startTime + index * TIMEFRAME_SECONDS,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 25,
    source: 'history',
    closed: true,
  }));

const activateHistoryTestSession = (): void => {
  __resetActiveBrokerSessionForTests();
  activateBrokerSession(beginActiveBrokerSessionTransition(), {
    brokerId: 'broker-history-test',
    accountLogin: '10001',
    apiBase: 'https://services.history-test.example/api/v2',
    feedWsBase: 'wss://services.history-test.example/ws/feed',
    feedStatusUrl: 'https://services.history-test.example/ws/feed/status',
    servicesDomain: 'services.history-test.example',
    investor: false,
    configVersion: 'cfg-history-test',
  }, {
    accessToken: 'history-access',
    refreshToken: '',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
};

const createNeverSettlingHistoryFetcher = (
  observedSignals: AbortSignal[],
): CandleHistoryFetcher => (_symbol, _timeframe, _count, options) => {
  if (options) {
    const signal = 'aborted' in options ? options : options.signal;
    if (signal) {
      observedSignals.push(signal);
    }
  }
  return new Promise(() => {});
};

const createSeededEntry = (
  manager: LiveCandleStreamManager,
  onNotify: () => void,
  symbol = 'BTCUSD',
): StreamEntry => {
  const entry = {
    key: `${symbol}:M5`,
    symbol,
    timeframe: 'M5',
    streamKey: 'BTCUSD:M5',
    requestId: 1,
    historyCandles: buildHistoryCandles(40, 1_775_000_000),
    liveCandleMap: new Map(),
    historyLastTime: null,
    lastLiveEdgeGapRefreshBoundary: null,
    historyPaginationCursorTime: null,
    renderHistoryLimit: 200,
    candles: [],
    listeners: new Set([onNotify]),
    consumers: 1,
    // A revisit is mid-refresh: loadFreshHistory has already flipped the entry
    // into its loading state and notified React, so the spinner is on screen.
    loading: true,
    historyLoading: true,
    historyPageLoading: false,
    error: null,
    isLiveConnected: false,
    lastUpdateTime: null,
    abortController: null,
    historyRequestTimeoutTimer: null,
    bufferedEvents: [],
    pendingEvents: [],
    flushFrame: null,
    flushTimer: null,
    eventOrder: 0,
    historyRetryTimer: null,
    historyRetryAttempt: 0,
    seededFromCache: true,
  } as unknown as StreamEntry;

  manager.entries.set(entry.key, entry);
  return entry;
};

test('commit() notifies when a warm revisit clears loading without changing the series', () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });

  // Commit #1 — the cache seed is adopted. The series genuinely changes here
  // ([] -> 40 bars), so this notification fires today and must keep firing.
  manager.commit(entry);
  assert.equal(notifications, 1, 'seeding commit must notify');
  assert.equal(entry.loading, true, 'entry is still loading while REST is in flight');
  const seededSeriesLength = entry.candles.length;
  assert.ok(seededSeriesLength > 0, 'seeding commit must publish candles');

  // Commit #2 — REST history for a warm revisit comes back identical to the
  // cached seed, so the rebuilt series is unchanged. Only `loading` moves.
  entry.historyLoading = false;
  manager.commit(entry);

  assert.equal(entry.loading, false, 'REST completion must clear the engine loading flag');
  assert.equal(
    notifications,
    2,
    'loading true -> false must reach React even when the series is unchanged; '
      + 'without this notification the chart spinner never clears on a revisited symbol',
  );
});

test('commit() stays quiet when neither the series nor the observable state changed', () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });

  entry.historyLoading = false;
  manager.commit(entry);
  const settledNotifications = notifications;

  // A redundant commit with nothing changed must not wake React up again,
  // otherwise every buffered live flush would re-render the chart screen.
  manager.commit(entry);
  assert.equal(
    notifications,
    settledNotifications,
    'an unchanged commit must not notify',
  );
});

test('a warm revisit that joins a pending prefetch never re-enters blocking loading', async () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });
  // A revisit arrives with history already seeded from candleMemoryCache and no
  // fetch of its own in flight.
  entry.historyLoading = false;
  entry.loading = false;
  entry.abortController = null;

  // The symbol picker fires prefetchChartSelectionHistory on every selection, so
  // by the time the chart subscribes there is a warm-up record for this key.
  let resolvePrefetch: (count: number) => void = () => {};
  manager.historyPrefetches.set(entry.key, {
    limit: 200,
    promise: new Promise<number>((resolve) => {
      resolvePrefetch = resolve;
    }),
  });

  (manager as unknown as {
    loadFreshHistory: (target: StreamEntry) => void;
  }).loadFreshHistory(entry);

  assert.equal(entry.loading, false, 'cached history must stay renderable during the warm-up join');

  // The warm-up completes and commits its own history.
  resolvePrefetch(120);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(
    entry.historyLoading,
    false,
    'no real load was issued, so nothing else will recompute loading',
  );
  assert.equal(
    entry.loading,
    false,
    'the prefetch chain must settle loading; otherwise the chart spins forever on a '
      + 'symbol whose next tick never arrives',
  );
});

test('a rejected warm prefetch leaves cached history outside blocking loading', async () => {
  const manager = new LiveCandleStreamManager();
  const entry = createSeededEntry(manager, () => {});
  entry.historyLoading = false;
  entry.loading = false;
  entry.abortController = null;

  let rejectPrefetch: (reason: unknown) => void = () => {};
  manager.historyPrefetches.set(entry.key, {
    limit: 200,
    promise: new Promise<number>((_resolve, reject) => {
      rejectPrefetch = reject;
    }),
  });

  (manager as unknown as {
    loadFreshHistory: (target: StreamEntry) => void;
  }).loadFreshHistory(entry);
  assert.equal(entry.loading, false);

  rejectPrefetch(new Error('warm-up failed'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(entry.loading, false, 'a failed warm-up must not strand the spinner');
});

test('a never-settling picker prefetch is bounded instead of gating revisits until restart', async () => {
  const result = await waitForHistoryPrefetchSettlement(
    new Promise<number>(() => {}),
    5,
  );

  assert.equal(result, 'timed_out');
});

test('a completed picker prefetch clears its watchdog immediately', async () => {
  const result = await waitForHistoryPrefetchSettlement(Promise.resolve(120), 60_000);

  assert.equal(result, 'settled');
});

test('cached A -> B -> A stays renderable and aborts a never-settling freshness refresh', async (t) => {
  activateHistoryTestSession();
  candleMemoryCache.clear();
  const observedSignals: AbortSignal[] = [];
  const manager = new LiveCandleStreamManager({
    fetchHistory: createNeverSettlingHistoryFetcher(observedSignals),
    historyRequestTimeoutMs: 10,
  });
  t.after(() => {
    manager.dispose();
    candleMemoryCache.clear();
    __resetActiveBrokerSessionForTests();
  });

  candleMemoryCache.set('EURUSD', 'M5', buildHistoryCandles(120, 1_775_000_000));
  candleMemoryCache.set('BTCUSD', 'M5', buildHistoryCandles(120, 1_776_000_000));

  const leaveFirstA = manager.subscribe('EURUSD', 'M5', () => {});
  assert.equal(manager.getState('EURUSD', 'M5')?.loading, false);
  leaveFirstA();

  const leaveB = manager.subscribe('BTCUSD', 'M5', () => {});
  assert.equal(manager.getState('BTCUSD', 'M5')?.loading, false);
  leaveB();

  const leaveRevisitedA = manager.subscribe('EURUSD', 'M5', () => {});
  const revisitedEntry = manager.entries.get('EURUSD:M5');
  assert.ok(revisitedEntry);
  assert.equal(revisitedEntry.loading, false);
  assert.equal(revisitedEntry.historyLoading, false);
  assert.equal(revisitedEntry.historyCandles.length, 120);
  assert.ok(revisitedEntry.abortController, 'freshness refresh should still run in the background');

  manager.extendActiveCandlesFromQuoteTick('EURUSD', {
    price: 250,
    time: 1_775_100_000,
    allowFlatNewBucket: true,
  });
  assert.equal(revisitedEntry.bufferedEvents.length, 0, 'warm refresh must not buffer live ticks');
  assert.equal(revisitedEntry.pendingEvents.length, 1, 'live tick must stay on the normal flush path');

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(revisitedEntry.loading, false);
  assert.equal(revisitedEntry.historyLoading, false);
  assert.equal(revisitedEntry.abortController, null);
  assert.equal(revisitedEntry.historyRequestTimeoutTimer, null);
  assert.equal(revisitedEntry.error, HISTORY_REQUEST_TIMEOUT_ERROR_MESSAGE);
  assert.equal(observedSignals.length, 3);
  assert.equal(observedSignals[observedSignals.length - 1]?.aborted, true);
  leaveRevisitedA();
});

test('cold history keeps blocking semantics until its bounded request times out and self-heals', async (t) => {
  activateHistoryTestSession();
  candleMemoryCache.clear();
  const observedSignals: AbortSignal[] = [];
  const manager = new LiveCandleStreamManager({
    fetchHistory: createNeverSettlingHistoryFetcher(observedSignals),
    historyRequestTimeoutMs: 10,
  });
  t.after(() => {
    manager.dispose();
    candleMemoryCache.clear();
    __resetActiveBrokerSessionForTests();
  });

  const entry = createSeededEntry(manager, () => {}, 'USDCAD');
  entry.requestId = 0;
  entry.historyCandles = [];
  entry.candles = [];
  entry.historyLastTime = null;
  entry.loading = true;
  entry.historyLoading = false;
  entry.isLiveConnected = false;
  (manager as unknown as {
    loadFreshHistory: (target: StreamEntry) => void;
  }).loadFreshHistory(entry);

  assert.equal(entry.historyCandles.length, 0);
  assert.equal(entry.loading, true);
  assert.equal(entry.historyLoading, true);

  manager.extendActiveCandlesFromQuoteTick('USDCAD', {
    price: 1.35,
    time: 1_775_100_000,
    allowFlatNewBucket: true,
  });
  assert.equal(entry.bufferedEvents.length, 1, 'cold load must continue buffering its live tick');
  assert.equal(entry.pendingEvents.length, 0);

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(entry.loading, false);
  assert.equal(entry.historyLoading, false);
  assert.equal(entry.abortController, null);
  assert.equal(entry.historyRequestTimeoutTimer, null);
  assert.equal(entry.error, HISTORY_REQUEST_TIMEOUT_ERROR_MESSAGE);
  assert.equal(entry.bufferedEvents.length, 0, 'timeout self-heal must replay the cold-load buffer');
  assert.ok(entry.historyRetryTimer, 'an empty cold load must schedule its bounded retry loop');
  assert.equal(observedSignals[0]?.aborted, true);
});

test('commit() notifies when live connectivity is regained without changing the series', () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });

  entry.historyLoading = false;
  manager.commit(entry);
  const settledNotifications = notifications;
  assert.equal(entry.isLiveConnected, true, 'commit marks the stream connected');

  // isLiveConnected is part of the store snapshot key, and commit() owns it, so
  // a reconnect on an otherwise idle series must still reach React.
  entry.isLiveConnected = false;
  manager.commit(entry);
  assert.equal(
    notifications,
    settledNotifications + 1,
    'regained connectivity must reach React even when the series is unchanged',
  );
});

test('a cold join follows a deeper warm-up that superseded the joined one instead of issuing a third request', async (t) => {
  activateHistoryTestSession();
  candleMemoryCache.clear();
  const observedSignals: AbortSignal[] = [];
  const manager = new LiveCandleStreamManager({
    fetchHistory: createNeverSettlingHistoryFetcher(observedSignals),
  });
  t.after(() => {
    manager.dispose();
    candleMemoryCache.clear();
    __resetActiveBrokerSessionForTests();
  });

  const entry = createSeededEntry(manager, () => {}, 'GBPUSD');
  entry.requestId = 0;
  entry.historyCandles = [];
  entry.historyLoading = false;
  entry.loading = false;

  let resolveShallow: (count: number) => void = () => {};
  const shallowRecord = {
    limit: 200,
    promise: new Promise<number>((resolve) => {
      resolveShallow = resolve;
    }),
  };
  manager.historyPrefetches.set(entry.key, shallowRecord);

  (manager as unknown as {
    loadFreshHistory: (target: StreamEntry) => void;
  }).loadFreshHistory(entry);
  assert.equal(entry.loading, true, 'an empty chart waits on the warm-up behind the loader');

  // The market-status reply asks for a deeper window: that warm-up replaces
  // the shallow record, and the shallow one settles with 0 when it lands.
  let resolveDeep: (count: number) => void = () => {};
  const deepRecord = {
    limit: 500,
    promise: new Promise<number>((resolve) => {
      resolveDeep = resolve;
    }),
  };
  manager.historyPrefetches.set(entry.key, deepRecord);
  resolveShallow(0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(
    observedSignals.length,
    0,
    'the join must follow the in-flight deeper warm-up, not start its own request',
  );

  // The deeper warm-up also yields nothing and relinquishes the key: only now
  // does the chart issue its own request.
  manager.historyPrefetches.delete(entry.key);
  resolveDeep(0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(observedSignals.length, 1, 'exactly one fallback request after both warm-ups fail');
});

test('a background self-heal retry keeps the failure visible instead of flashing the loader', async (t) => {
  activateHistoryTestSession();
  candleMemoryCache.clear();
  const observedSignals: AbortSignal[] = [];
  const manager = new LiveCandleStreamManager({
    fetchHistory: createNeverSettlingHistoryFetcher(observedSignals),
  });
  t.after(() => {
    manager.dispose();
    candleMemoryCache.clear();
    __resetActiveBrokerSessionForTests();
  });

  const entry = createSeededEntry(manager, () => {}, 'AUDUSD');
  entry.requestId = 0;
  entry.historyCandles = [];
  entry.historyLoading = false;
  entry.loading = false;
  entry.error = 'API Error 503: CANDLE_HISTORY_UNAVAILABLE';

  runLoadHistory(manager, entry, 200, { isRetry: true });

  assert.equal(observedSignals.length, 1, 'the retry request is still issued');
  assert.equal(entry.loading, false, 'a retry must not re-raise the loader over the error');
  assert.equal(entry.historyLoading, false);
  assert.equal(entry.error, 'API Error 503: CANDLE_HISTORY_UNAVAILABLE');

  // A user-driven (non-retry) reload still shows the loader.
  runLoadHistory(manager, entry, 200);
  assert.equal(entry.loading, true);
  assert.equal(entry.error, null);
});

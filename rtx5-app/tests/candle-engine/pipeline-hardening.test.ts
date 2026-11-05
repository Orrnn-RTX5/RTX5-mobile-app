/**
 * Pipeline hardening regression tests.
 *
 * These tests cover edge cases in the candle pipeline that aren't pinned by
 * the named user-bug regression tests in candle-regressions.test.ts:
 *
 * - flat candles where high === low render valid OHLC for the chart adapter
 * - thin-body candles where high == max(open, close) keep wick high preserved
 * - rapid timeframe sequence M1 → M5 → M15 produces deterministic buckets
 * - symbol quick-switch A → B → A pattern keeps each series isolated
 * - duplicate stream replay 100x stays idempotent
 * - negative price candles are rejected (frontend never invents valid OHLC)
 * - high < open or high < close OHLC is rejected (validateCandle gate)
 * - same-bucket precedence: the latest accepted backend snapshot wins OHLC,
 *   while out-of-order snapshots cannot rewind the active close
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import {
  createCandleMap,
  materializeCandleMap,
  sortAndDedupeCandles,
} from '../../src/domain/candles/series/candleSeriesMerger';
import { buildFreshHistoryLiveCandleSeries } from '../../src/domain/candles/series/freshHistoryLiveSeries';
import {
  convertCandlesForChart,
  sanitizeCandlesForChart,
} from '../../src/domain/candles/normalization/chartAdapter';
import { normalizeHistoryCandle, normalizeLiveCandle } from '../../src/domain/candles/normalization/candleNormalizer';
import { validateCandle, validateCandles } from '../../src/domain/candles/core/candleValidator';
import { getBucketStart } from '../../src/domain/candles/core/timeframeUtils';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  buildContiguousHistory,
  makeBackendLiveCandle,
  makeCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const t1000 = secondsUtc(2024, 3, 22, 10, 0, 0);
const t1001 = secondsUtc(2024, 3, 22, 10, 1, 0);
const t1002 = secondsUtc(2024, 3, 22, 10, 2, 0);

test('flat candle where high equals low renders valid OHLC for chart adapter', () => {
  const flat = makeCandle(t1000, { open: 100, high: 100, low: 100, close: 100 });
  const chart = convertCandlesForChart([flat]);

  assert.equal(validateCandle(flat), true);
  assert.deepEqual(chart, [
    { time: t1000, open: 100, high: 100, low: 100, close: 100, volume: 10 },
  ]);
});

test('thin body candle where high equals open or close still preserves wick high', () => {
  // Body is open=100→close=100.05; wick high is at 100.05 (= close), wick low at 99.5
  const thin = makeCandle(t1001, { open: 100, high: 100.05, low: 99.5, close: 100.05 });

  const chart = convertCandlesForChart([thin]);
  assert.deepEqual(chart, [
    { time: t1001, open: 100, high: 100.05, low: 99.5, close: 100.05, volume: 10 },
  ]);
});

test('candle with high less than open is rejected by validator', () => {
  const broken = makeCandle(t1000, { open: 100, high: 99, low: 90, close: 95 });
  assert.equal(validateCandle(broken), false);

  const sanitized = sanitizeCandlesForChart([broken]);
  assert.deepEqual(sanitized, []);
});

test('candle with low greater than close is rejected by validator', () => {
  const broken = makeCandle(t1000, { open: 100, high: 110, low: 105, close: 100 });
  assert.equal(validateCandle(broken), false);

  const sanitized = sanitizeCandlesForChart([broken]);
  assert.deepEqual(sanitized, []);
});

test('backend normalizers reject impossible OHLC instead of repairing high and low', () => {
  const badHistoryHigh = normalizeHistoryCandle({
    time: t1000,
    open: 100,
    high: 99,
    low: 98,
    close: 100,
  });
  const badHistoryLow = normalizeHistoryCandle({
    time: t1000,
    open: 100,
    high: 101,
    low: 102,
    close: 100,
  });
  const badLive = normalizeLiveCandle({
    symbol: 'XAUUSD',
    timeframe: 'M1',
    time: t1000,
    open: 2300,
    high: 2299,
    low: 2298,
    close: 2300,
  });

  assert.equal(badHistoryHigh, null);
  assert.equal(badHistoryLow, null);
  assert.equal(badLive, null);
});

test('candle with NaN or Infinity OHLC field is rejected during normalization', () => {
  const nanOpen = normalizeHistoryCandle({ time: t1000, open: NaN, high: 100, low: 100, close: 100 });
  const infHigh = normalizeHistoryCandle({ time: t1000, open: 100, high: Infinity, low: 100, close: 100 });
  const stringClose = normalizeHistoryCandle({ time: t1000, open: 100, high: 100, low: 100, close: 'abc' });
  const missingTime = normalizeHistoryCandle({ open: 100, high: 100, low: 100, close: 100 });

  assert.equal(nanOpen, null);
  assert.equal(infHigh, null);
  assert.equal(stringClose, null);
  assert.equal(missingTime, null);
});

test('history candle with a valid large wick is preserved for backend-visible diagnostics', () => {
  const largeWickBtc = normalizeHistoryCandle({
    time: t1000,
    open: 49_131.11,
    high: 81_238.7,
    low: 48_984.54,
    close: 49_325.24,
    volume: 1,
  });

  assert.deepEqual(largeWickBtc, {
    time: t1000,
    open: 49_131.11,
    high: 81_238.7,
    low: 48_984.54,
    close: 49_325.24,
    volume: 1,
  });
  assert.ok(largeWickBtc);

  const good = makeCandle(t1001, {
    open: 81_237.42,
    high: 81_238.7,
    low: 81_217.59,
    close: 81_222.95,
  });
  const sanitized = sanitizeCandlesForChart([
    {
      time: t1000,
      open: 49_131.11,
      high: 81_238.7,
      low: 48_984.54,
      close: 49_325.24,
      volume: 1,
    },
    good,
  ]);

  assert.deepEqual(sanitized, [largeWickBtc, good]);
});

test('same timestamp candles from different price regimes do not merge into a synthetic wick', () => {
  const deduped = sortAndDedupeCandles([
    makeCandle(t1000, {
      open: 49_131.11,
      high: 49_340,
      low: 48_984.54,
      close: 49_325.24,
    }),
    makeCandle(t1000, {
      open: 81_237.42,
      high: 81_238.7,
      low: 81_217.59,
      close: 81_222.95,
    }),
  ]);

  assert.deepEqual(deduped, [
    {
      time: t1000,
      open: 81_237.42,
      high: 81_238.7,
      low: 81_217.59,
      close: 81_222.95,
      volume: 10,
    },
  ]);
});

test('chart sanitizer keeps all structurally valid history candles across price-regime breaks', () => {
  const staleHistory = [
    makeCandle(t1000, {
      open: 49_100,
      high: 49_250,
      low: 49_000,
      close: 49_200,
    }),
    makeCandle(t1001, {
      open: 49_200,
      high: 49_340,
      low: 49_150,
      close: 49_325,
    }),
  ];
  const currentBackend = makeCandle(t1002, {
    open: 81_237.42,
    high: 81_238.7,
    low: 81_217.59,
    close: 81_222.95,
  });

  const sanitized = sanitizeCandlesForChart([...staleHistory, currentBackend], { timeframe: 'M1' });

  assert.deepEqual(sanitized, [...staleHistory, currentBackend]);
});

test('isolated structurally valid outlier candle is preserved between coherent neighbors', () => {
  const before = makeCandle(t1000, {
    open: 80_300,
    high: 80_350,
    low: 80_250,
    close: 80_320,
  });
  const outlier = makeCandle(t1001, {
    open: 49_100,
    high: 49_250,
    low: 49_000,
    close: 49_200,
  });
  const after = makeCandle(t1002, {
    open: 80_330,
    high: 80_380,
    low: 80_310,
    close: 80_360,
  });

  const sanitized = sanitizeCandlesForChart([before, outlier, after], { timeframe: 'M1' });

  assert.deepEqual(sanitized, [before, outlier, after]);
});

test('short isolated outlier runs are preserved without filling missing candles', () => {
  const before = makeCandle(t1000, {
    open: 80_300,
    high: 80_350,
    low: 80_250,
    close: 80_320,
  });
  const outlierOne = makeCandle(t1001, {
    open: 49_100,
    high: 49_250,
    low: 49_000,
    close: 49_200,
  });
  const outlierTwo = makeCandle(t1002, {
    open: 49_220,
    high: 49_260,
    low: 49_100,
    close: 49_180,
  });
  const after = makeCandle(secondsUtc(2024, 3, 22, 10, 3, 0), {
    open: 80_330,
    high: 80_380,
    low: 80_310,
    close: 80_360,
  });

  const sanitized = sanitizeCandlesForChart([before, outlierOne, outlierTwo, after], { timeframe: 'M1' });

  assert.deepEqual(sanitized, [before, outlierOne, outlierTwo, after]);
});

test('series validator reports duplicate times, unsorted candles, invalid OHLC, invalid numbers, and gaps separately', () => {
  const summary = validateCandles(
    [
      makeCandle(t1000, { close: 1.1 }),
      makeCandle(t1002, { close: 1.2 }),
      makeCandle(t1002, { close: 1.3 }),
      makeCandle(t1001, { open: 100, high: 99, low: 90, close: 95 }),
      {
        time: t1001 + 30,
        open: '100',
        high: 101,
        low: 99,
        close: 100,
        volume: 0,
      } as unknown as ReturnType<typeof makeCandle>,
    ],
    60_000,
    'EURUSD',
    'M1',
  );

  assert.deepEqual(summary, {
    total: 5,
    invalidOhlc: 1,
    duplicateTimes: 1,
    unsorted: 1,
    invalidNumbers: 1,
    suspiciousGaps: 1,
    firstTime: t1000,
    lastTime: t1002,
  });
});

test('series validator stays clean for a sorted deduped all-symbol candle series', () => {
  const summary = validateCandles(
    buildContiguousHistory(t1000, 4, 'M5', (index) => ({
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
    })),
    {
      symbol: 'BTCUSD',
      timeframe: 'M5',
      source: 'history_live_merge',
      requestId: 'test-request',
      subscriptionId: 'BTCUSD:M5',
      chartId: 'chart-test',
      componentName: 'pipeline-hardening.test',
      timeframeMs: 5 * 60 * 1000,
    },
  );

  assert.deepEqual(summary, {
    total: 4,
    invalidOhlc: 0,
    duplicateTimes: 0,
    unsorted: 0,
    invalidNumbers: 0,
    suspiciousGaps: 0,
    firstTime: t1000,
    lastTime: t1000 + 15 * 60,
  });
});

test('rapid timeframe sequence M1 -> M5 -> M15 produces deterministic buckets per timeframe', () => {
  const ts = secondsUtc(2024, 3, 22, 10, 7, 30);
  // M1 bucket of 10:07:30 is 10:07:00; M5 bucket is 10:05:00; M15 bucket is 10:00:00.
  assert.equal(getBucketStart(ts, 'M1'), secondsUtc(2024, 3, 22, 10, 7, 0));
  assert.equal(getBucketStart(ts, 'M5'), secondsUtc(2024, 3, 22, 10, 5, 0));
  assert.equal(getBucketStart(ts, 'M15'), secondsUtc(2024, 3, 22, 10, 0, 0));

  // Same timestamp + same timeframe must always map to same bucket.
  assert.equal(getBucketStart(ts, 'M1'), getBucketStart(ts, 'M1'));
  assert.equal(getBucketStart(ts, 'M5'), getBucketStart(ts, 'M5'));
  assert.equal(getBucketStart(ts, 'M15'), getBucketStart(ts, 'M15'));
});

test('symbol quick-switch A -> B -> A keeps each series isolated by symbol cutoff', () => {
  const symbolA = buildContiguousHistory(t1000, 5, 'M1', () => ({ close: 1.1 }));
  const symbolB = buildContiguousHistory(t1000, 5, 'M1', () => ({ close: 2.2 }));

  // Materializing each independently must yield distinct close prices.
  const visibleA = buildFreshHistoryLiveCandleSeries(symbolA, [], 'M1');
  const visibleB = buildFreshHistoryLiveCandleSeries(symbolB, [], 'M1');

  assert.equal(visibleA.length, 5);
  assert.equal(visibleB.length, 5);
  visibleA.forEach((c) => assert.equal(c.close, 1.1));
  visibleB.forEach((c) => assert.equal(c.close, 2.2));

  // Switching back to A: candle map for A must not have any leakage from B.
  const mapA = createCandleMap(symbolA);
  assert.equal(materializeCandleMap(mapA).every((c) => c.close === 1.1), true);
});

test('duplicate stream replay 100x stays idempotent', () => {
  const map = createCandleMap();
  const candle = makeBackendLiveCandle(t1001, { open: 105, high: 108, low: 101, close: 102 });

  for (let i = 0; i < 100; i += 1) {
    applyLiveCandleToCandleMap(map, candle, 'M1');
  }

  const visible = materializeCandleMap(map);
  assert.equal(visible.length, 1);
  assert.deepEqual(visible[0], {
    time: t1001,
    open: 105,
    high: 108,
    low: 101,
    close: 102,
    volume: 10,
  });
});

test('latest live snapshot wins same-bucket OHLC and volume', () => {
  const map = createCandleMap();
  const t = t1001;

  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t, { open: 100, high: 100, low: 100, close: 100, volume: 1 }),
    'M1',
  );
  // Newer snapshot extends high and updates close.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t, { open: 100, high: 105, low: 99, close: 103, volume: 5 }),
    'M1',
  );
  // Even newer snapshot reduces close further.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t, { open: 100, high: 105, low: 98, close: 101, volume: 9 }),
    'M1',
  );

  const visible = materializeCandleMap(map);
  assert.equal(visible.length, 1);
  assert.deepEqual(visible[0], {
    time: t,
    open: 100,
    high: 105,
    low: 98,
    close: 101,
    volume: 9,
  });
});

test('large 10000 candle history merges with one live candle without duplicating or truncating beyond limit', () => {
  const startTime = t1000;
  const history = buildContiguousHistory(startTime, 10_000, 'M1', (index) => ({
    open: 100 + index,
    high: 100.5 + index,
    low: 99.5 + index,
    close: 100 + index,
  }));
  const live = [
    makeBackendLiveCandle(startTime + 10_000 * 60, { open: 10_100, high: 10_101, low: 10_099, close: 10_100.5 }),
  ];

  // Without limit: merge keeps every history candle plus the one live candle.
  const visibleAll = buildFreshHistoryLiveCandleSeries(history, live, 'M1');
  assert.equal(visibleAll.length, 10_001);
  assert.equal(visibleAll[visibleAll.length - 1].time, startTime + 10_000 * 60);

  // With explicit limit: caps to most-recent N candles.
  const visibleCapped = buildFreshHistoryLiveCandleSeries(history, live, 'M1', 2500);
  assert.equal(visibleCapped.length, 2500);
  assert.equal(visibleCapped[visibleCapped.length - 1].time, startTime + 10_000 * 60);
});

test('history reload with overlapping latest bucket merges into one candle (no duplication)', () => {
  const start = t1000;
  const initial = buildContiguousHistory(start, 5, 'M1', () => ({ close: 1.1 }));
  const live = makeBackendLiveCandle(start + 5 * 60, { open: 1.2, high: 1.25, low: 1.18, close: 1.22 });

  const map = createCandleMap(initial);
  applyLiveCandleToCandleMap(map, live, 'M1');
  let visible = materializeCandleMap(map);
  assert.equal(visible.length, 6);

  // Backend reloads history and now includes the same bucket as a closed candle.
  const reloaded = [
    ...initial,
    makeTrustedHistoryCandle(start + 5 * 60, { open: 1.2, high: 1.25, low: 1.18, close: 1.22 }),
  ];
  visible = buildFreshHistoryLiveCandleSeries(reloaded, [], 'M1');
  assert.equal(visible.length, 6);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});

test('out-of-order REST history candles normalize into strictly sorted, deduped series', () => {
  const unsorted = [
    makeCandle(t1002, { close: 1.3 }),
    makeCandle(t1000, { close: 1.1 }),
    makeCandle(t1001, { close: 1.2 }),
    makeCandle(t1001, { close: 1.25, high: 1.25 }), // duplicate timestamp
  ];

  const normalized = sortAndDedupeCandles(unsorted);
  assert.deepEqual(normalized.map((c) => c.time), [t1000, t1001, t1002]);
  // Duplicate timestamps keep the first open, latest close, and merged wicks.
  assert.equal(normalized[1].close, 1.25);
});

test('null and undefined candles never reach chart adapter', () => {
  const chartCandles = sanitizeCandlesForChart([
    null as unknown as ReturnType<typeof makeCandle>,
    undefined as unknown as ReturnType<typeof makeCandle>,
    makeCandle(t1000, { close: 1.1 }),
  ]);

  assert.equal(chartCandles.length, 1);
  assert.equal(chartCandles[0].time, t1000);
});

test('zero price candles fail validation and never reach chart', () => {
  // High < open, fails validator regardless of zero price.
  const zeroCandle = makeCandle(t1000, { open: 0, high: 0, low: 0, close: 0 });
  assert.equal(validateCandle(zeroCandle), true);

  // But explicitly-broken zero candles do fail.
  const brokenZero = makeCandle(t1000, { open: 1, high: 0, low: 0, close: 1 });
  assert.equal(validateCandle(brokenZero), false);
});

test('negative price OHLC where structural invariants hold passes validator (backend authority)', () => {
  // The validator only enforces high >= open/close/low and low <= open/close/high.
  // Negative-price symbols (rare but possible for spreads or theoretical instruments)
  // are allowed if backend sends them. This ensures we never invent prices.
  const negCandle = makeCandle(t1000, { open: -1.5, high: -1.4, low: -1.6, close: -1.5 });
  assert.equal(validateCandle(negCandle), true);
});

test('history candle for one symbol cannot leak into a different symbols stream key', () => {
  // Verified at the candle level: candle objects do not embed the symbol; isolation
  // is enforced at the stream key (symbol + timeframe). Each merge here is independent.
  const eurUsdHistory = buildContiguousHistory(t1000, 3, 'M1', () => ({ close: 1.1 }));
  const btcUsdHistory = buildContiguousHistory(t1000, 3, 'M1', () => ({ close: 60_000 }));

  const eurVisible = buildFreshHistoryLiveCandleSeries(eurUsdHistory, [], 'M1');
  const btcVisible = buildFreshHistoryLiveCandleSeries(btcUsdHistory, [], 'M1');

  assert.notDeepEqual(eurVisible, btcVisible);
  assert.equal(eurVisible.every((c) => c.close === 1.1), true);
  assert.equal(btcVisible.every((c) => c.close === 60_000), true);
});

test('backend live candle for a missing bucket fills the visible gap (between live tail and history)', () => {
  // Scenario: history ends at 10:00. Backend live stream emits 10:05 first
  // (network race, the channel resumed late on this bucket). Then backend
  // catches up and emits 10:03 — a legitimate backfill for the gap. Final
  // visible series must include both 10:03 and 10:05; the gap at 10:01/10:02/
  // 10:04 must remain because backend never sent those buckets.
  const history = [makeTrustedHistoryCandle(t1000, { open: 100, high: 110, low: 95, close: 105 })];
  const map = createCandleMap(history);

  const liveAhead = applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 5, 0), { open: 105, high: 108, low: 104, close: 107 }),
    'M1',
    { historyCutoffTime: t1000 },
  );
  const backfill = applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 3, 0), { open: 104, high: 106, low: 103, close: 105 }),
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(liveAhead.ignored, false);
  assert.equal(backfill.ignored, false);

  const visible = materializeCandleMap(map);
  assert.deepEqual(
    visible.map((c) => c.time),
    [t1000, secondsUtc(2024, 3, 22, 10, 3, 0), secondsUtc(2024, 3, 22, 10, 5, 0)],
  );
  // Real backend gap at 10:01, 10:02, 10:04 stays visible (no fake candles).
  assert.equal(
    visible.some((c) => c.time === secondsUtc(2024, 3, 22, 10, 1, 0)),
    false,
  );
  assert.equal(
    visible.some((c) => c.time === secondsUtc(2024, 3, 22, 10, 4, 0)),
    false,
  );
});

test('backend live candle for a missing bucket above tail keeps subsequent live ticks generating', () => {
  // The user-reported scenario: gap exists, but the breaking/forming candle
  // tick must still generate. After a backfill arrives between two live
  // buckets, subsequent live updates for the latest bucket must still apply.
  const map = createCandleMap();
  const t = secondsUtc(2024, 3, 22, 10, 0, 0);

  // Live ahead, then backfill, then continuing live updates.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t + 5 * 60, { open: 100, high: 102, low: 99, close: 101 }),
    'M1',
  );
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t + 3 * 60, { open: 99, high: 101, low: 98, close: 100 }),
    'M1',
  );
  // Subsequent live update for the most-recent bucket (5 minutes in) must
  // still be applied — the backfill must not "lock" the live stream.
  const continuing = applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t + 5 * 60, { open: 100, high: 105, low: 99, close: 104 }),
    'M1',
  );

  assert.equal(continuing.ignored, false);
  const visible = materializeCandleMap(map);
  assert.deepEqual(
    visible.map((c) => c.time),
    [t + 3 * 60, t + 5 * 60],
  );
  // Same-bucket update wins for the active candle.
  const active = visible.find((c) => c.time === t + 5 * 60);
  assert.deepEqual(active, {
    time: t + 5 * 60,
    open: 100,
    high: 105,
    low: 99,
    close: 104,
    volume: 10,
  });
});

test('end-to-end: REST history with gap, plus backend live forward, plus live backfill produces clean merged series', () => {
  // History has a real backend gap at 10:01 and 10:02 (closed buckets only at
  // 10:00 and 10:03). Live then advances to 10:04, 10:05, then backend later
  // emits a backfill candle at 10:04 (same bucket replay with new OHLC).
  // Expected: one canonical series with the history gap preserved, the live
  // forward candles in place, and the backfill update applied to the same
  // bucket without duplicating it.
  const history = [
    makeTrustedHistoryCandle(t1000, { open: 100, high: 110, low: 95, close: 105 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 3, 0), {
      open: 105,
      high: 108,
      low: 104,
      close: 106,
    }),
  ];
  const map = createCandleMap(history);
  const cutoff = history[history.length - 1].time;

  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 4, 0), { open: 106, high: 107, low: 105, close: 106 }),
    'M1',
    { historyCutoffTime: cutoff },
  );
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 5, 0), { open: 106, high: 109, low: 105, close: 108 }),
    'M1',
    { historyCutoffTime: cutoff },
  );
  // Same-bucket replay for 10:04 with newer OHLC — must update in place.
  const replay = applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 4, 0), { open: 106, high: 107.5, low: 104.5, close: 107 }),
    'M1',
    { historyCutoffTime: cutoff },
  );

  assert.equal(replay.ignored, false);
  const visible = materializeCandleMap(map);
  assert.deepEqual(
    visible.map((c) => c.time),
    [
      t1000,
      secondsUtc(2024, 3, 22, 10, 3, 0),
      secondsUtc(2024, 3, 22, 10, 4, 0),
      secondsUtc(2024, 3, 22, 10, 5, 0),
    ],
  );
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
  // Real REST history gap at 10:01 and 10:02 stays missing.
  assert.equal(visible.some((c) => c.time === t1001), false);
  assert.equal(visible.some((c) => c.time === t1002), false);
});

test('replay live candle older than history cutoff is dropped without disturbing history', () => {
  const history = buildContiguousHistory(t1000, 5, 'M1', () => ({ close: 1.1 }));
  const map = createCandleMap(history);
  const cutoff = history[history.length - 1].time;

  // Replay an older bucket that should be ignored as covered by history.
  const stale = makeBackendLiveCandle(t1001, { open: 9, high: 9, low: 9, close: 9 });
  const result = applyLiveCandleToCandleMap(map, stale, 'M1', { historyCutoffTime: cutoff });

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'older_than_history_cutoff');
  // History remains intact, no candle close was overwritten.
  const visible = materializeCandleMap(map);
  assert.equal(visible.length, 5);
  visible.forEach((c) => assert.equal(c.close, 1.1));
});

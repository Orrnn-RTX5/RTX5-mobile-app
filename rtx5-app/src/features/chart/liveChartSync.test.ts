import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  formatCandleGapDuration,
  getChartSeriesUpdateMode,
  RenderableChartCandle,
  resolveLatestCandleGap,
  shouldResetViewportForClosedMarketClamp,
  shouldResetViewportForHistorylessBootstrap,
} from './liveChartSync';

const makeCandle = (
  time: number,
  overrides: Partial<RenderableChartCandle> = {},
): RenderableChartCandle => ({
  time,
  open: 1.1,
  high: 1.2,
  low: 1.0,
  close: 1.15,
  volume: 10,
  ...overrides,
});

test('getChartSeriesUpdateMode uses incremental updates when only the active candle changes', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { high: 1.25, close: 1.2 }),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { high: 1.3, close: 1.22 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'incremental');
});

test('getChartSeriesUpdateMode uses incremental updates when one new candle appends cleanly', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { close: 1.2 }),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { close: 1.2 }),
    makeCandle(220, { open: 1.2, high: 1.21, low: 1.19, close: 1.205 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'incremental');
});

test('getChartSeriesUpdateMode forces a full reload when recent history changes behind the active candle', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { low: 0.99, close: 1.2 }),
    makeCandle(220, { close: 1.21 }),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { low: 0.95, close: 1.2 }),
    makeCandle(220, { close: 1.21 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'full_reload');
});

test('getChartSeriesUpdateMode forces a full reload when the rolling window shifts during long sessions', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160),
    makeCandle(220),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(160),
    makeCandle(220),
    makeCandle(280),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'full_reload');
});

test('getChartSeriesUpdateMode requests a full reload for the first synced series', () => {
  const next = buildChartSeriesSnapshot([makeCandle(100)]);

  assert.equal(getChartSeriesUpdateMode(EMPTY_CHART_SERIES_SNAPSHOT, next), 'full_reload');
});

test('closed-market tail removal requests one recent-viewport reset', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160),
    makeCandle(220),
  ]);
  const clamped = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160),
  ]);
  const appended = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160),
    makeCandle(220),
    makeCandle(280),
  ]);

  assert.equal(shouldResetViewportForClosedMarketClamp(previous, clamped, true), true);
  assert.equal(shouldResetViewportForClosedMarketClamp(previous, clamped, false), false);
  assert.equal(shouldResetViewportForClosedMarketClamp(previous, previous, true), false);
  assert.equal(shouldResetViewportForClosedMarketClamp(previous, appended, true), false);
  assert.equal(
    shouldResetViewportForClosedMarketClamp(EMPTY_CHART_SERIES_SNAPSHOT, clamped, true),
    false,
  );
});

test('history-backed data resets any historyless bootstrap viewport for the same context', () => {
  const quoteOnly = buildChartSeriesSnapshot([makeCandle(220)]);
  const twoLiveCandles = buildChartSeriesSnapshot([makeCandle(220), makeCandle(280)]);
  const firstHistoryExpansion = buildChartSeriesSnapshot([
    makeCandle(160),
    makeCandle(220),
  ]);
  const appendedCanonicalCandle = buildChartSeriesSnapshot([
    makeCandle(220),
    makeCandle(280),
  ]);
  const history = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160),
    makeCandle(220),
  ]);

  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      quoteOnly,
      history,
      true,
    ),
    true,
  );
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      quoteOnly,
      firstHistoryExpansion,
      true,
    ),
    true,
  );
  assert.equal(getChartSeriesUpdateMode(quoteOnly, appendedCanonicalCandle), 'incremental');
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      quoteOnly,
      appendedCanonicalCandle,
      true,
    ),
    true,
  );
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      twoLiveCandles,
      history,
      true,
    ),
    true,
    'two manager-created live candles must remain armed until committed history arrives',
  );
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      quoteOnly,
      twoLiveCandles,
      false,
    ),
    false,
    'a second live-only candle must not consume the pending history reset',
  );
});

test('historyless bootstrap reset is scoped to the armed context and committed history', () => {
  const quoteOnly = buildChartSeriesSnapshot([makeCandle(220)]);
  const regularHistory = buildChartSeriesSnapshot([makeCandle(160), makeCandle(220)]);
  const expandedHistory = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160),
    makeCandle(220),
  ]);

  assert.equal(
    shouldResetViewportForHistorylessBootstrap('', 'account:XAUUSD:M1', quoteOnly, expandedHistory, true),
    false,
  );
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:GBPUSD:M1',
      quoteOnly,
      expandedHistory,
      true,
    ),
    false,
  );
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      regularHistory,
      expandedHistory,
      false,
    ),
    false,
  );
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      quoteOnly,
      quoteOnly,
      false,
    ),
    false,
  );
  assert.equal(
    shouldResetViewportForHistorylessBootstrap(
      'account:XAUUSD:M1',
      'account:XAUUSD:M1',
      EMPTY_CHART_SERIES_SNAPSHOT,
      expandedHistory,
      true,
    ),
    false,
  );
});

test('resolveLatestCandleGap reports the last visible missing candle span in bars', () => {
  // Pin nowSeconds just past the most recent candle (600+60=660) so the new
  // stale-tail check doesn't fire and the test exercises the in-between gap.
  const gap = resolveLatestCandleGap(
    [
      makeCandle(60),
      makeCandle(120),
      makeCandle(600),
    ],
    'M1',
    { nowSeconds: 660 },
  );

  assert.deepEqual(gap, {
    fromTime: 120,
    expectedTime: 180,
    toTime: 600,
    missingSeconds: 420,
    missingBars: 7,
    label: '7 bars',
  });
});

test('resolveLatestCandleGap surfaces a stale tail when the last candle has fallen behind real time', () => {
  // Last bar was 12:14 UTC, now it's 12:20 UTC — 5 missing M1 bars on the tail.
  const gap = resolveLatestCandleGap(
    [
      makeCandle(60),
      makeCandle(120),
    ],
    'M1',
    { nowSeconds: 480 },
  );

  assert.ok(gap, 'expected a stale-tail gap to be reported');
  assert.equal(gap!.fromTime, 120);
  assert.equal(gap!.expectedTime, 180);
  assert.equal(gap!.missingBars, 5);
  assert.equal(gap!.label, '5 bars');
});

test('resolveLatestCandleGap formats sub-bar tail lag as duration only', () => {
  // 30s past expected on M5 — that's still less than one M5 bar (300s).
  const gap = resolveLatestCandleGap(
    [makeCandle(0), makeCandle(300)],
    'M5',
    { nowSeconds: 630 },
  );

  assert.equal(gap, null);
});

test('resolveLatestCandleGap labels in-between gaps in whole bars per timeframe', () => {
  // M5 with a 5-minute hole = exactly 1 bar.
  const m5Gap = resolveLatestCandleGap(
    [makeCandle(0), makeCandle(600)],
    'M5',
    { nowSeconds: 900 },
  );
  assert.equal(m5Gap?.missingBars, 1);
  assert.equal(m5Gap?.label, '1 bar');

  // M15 with a 30-minute hole = exactly 2 bars. Both candle times are
  // M15-aligned so the bucket-alignment guard is happy.
  const m15Gap = resolveLatestCandleGap(
    [makeCandle(0), makeCandle(2_700)],
    'M15',
    { nowSeconds: 3_600 },
  );
  assert.equal(m15Gap?.missingBars, 2);
  assert.equal(m15Gap?.label, '2 bars');
});

test('resolveLatestCandleGap reports stale-tail leftover seconds when wall clock has drifted past expected', () => {
  // Last M15 candle at 1800; expected next at 2700; now = 4400.
  // Tail span = 4400 - 2700 = 1700s = 1 whole M15 bar (900s) + 800s remainder.
  // 1700s formats as 28m 20s so the label includes both for clarity.
  const gap = resolveLatestCandleGap(
    [makeCandle(0), makeCandle(1_800)],
    'M15',
    { nowSeconds: 4_400 },
  );
  assert.equal(gap?.missingBars, 1);
  assert.equal(gap?.label, '1 bar (28m 20s)');
});

test('resolveLatestCandleGap suppresses gap when candles are not aligned to the requested timeframe', () => {
  // Candles at 0 and 60 are M1-aligned but NOT M5-aligned. This mirrors the
  // brief transient when the user changes timeframe and the candle stream
  // hasn't refilled yet. Suppressing avoids reporting a fake "4-bar" gap
  // that's just the new-timeframe expectation read against old-timeframe data.
  const gap = resolveLatestCandleGap(
    [makeCandle(0), makeCandle(60)],
    'M5',
    { nowSeconds: 90 },
  );
  assert.equal(gap, null);
});

test('formatCandleGapDuration uses day hour minute second units', () => {
  assert.equal(formatCandleGapDuration(93784), '1d 2h 3m 4s');
  assert.equal(formatCandleGapDuration(45), '45s');
});

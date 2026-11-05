import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
  CHART_CANDLE_COUNTDOWN_FIXED_SECONDS,
  formatChartCandleCountdown,
  getChartCandleCountdownSeconds,
} from '../chartCandleCountdown';
import { LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT } from './liveChartPreviewCountdownScript';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const evaluateCountdownRuntime = () => {
  const sandbox: Record<string, any> = {
    Date,
    Math,
    Number,
    Object,
    String,
    clearTimeout: () => {},
    console,
    document: { hidden: false },
    isFinite,
    setTimeout: () => 1,
  };
  vm.runInNewContext(LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT, sandbox);
  return sandbox;
};

test('split preview embeds the canonical M1 through calendar-month countdown map', () => {
  for (const [timeframe, seconds] of Object.entries(CHART_CANDLE_COUNTDOWN_FIXED_SECONDS)) {
    assert.equal(
      (LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT.match(new RegExp(`"${timeframe}":`, 'g')) ?? []).length,
      1,
    );
    assert.equal(typeof seconds === 'number' || seconds === null, true);
  }
  assert.match(LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT, /Object\.prototype\.hasOwnProperty\.call/);
});

test('split preview countdown uses exact UTC bucket boundaries for every timeframe family', () => {
  const runtime = evaluateCountdownRuntime();
  const m1OpenMs = Date.UTC(2026, 7, 13, 12, 15, 0);
  const w1BarMs = Date.UTC(2026, 7, 13, 12, 0, 0);
  const leapMonthBarMs = Date.UTC(2028, 1, 18, 12, 0, 0);

  assert.equal(runtime.resolvePreviewCountdownCloseTimeMs(m1OpenMs / 1000, 'M1'), m1OpenMs + 60_000);
  assert.equal(
    runtime.resolvePreviewCountdownBucketStartSeconds(w1BarMs / 1000, 'W1'),
    Date.UTC(2026, 7, 10, 0, 0, 0) / 1000,
  );
  assert.equal(
    runtime.resolvePreviewCountdownCloseTimeMs(leapMonthBarMs / 1000, 'MN'),
    Date.UTC(2028, 2, 1, 0, 0, 0),
  );
});

test('every divided-pane timeframe matches the default chart countdown and label', () => {
  const runtime = evaluateCountdownRuntime();
  const cases = [
    ['M1', Date.UTC(2026, 7, 10, 10, 7, 0)],
    ['M5', Date.UTC(2026, 7, 10, 10, 5, 0)],
    ['M15', Date.UTC(2026, 7, 10, 10, 0, 0)],
    ['M30', Date.UTC(2026, 7, 10, 10, 0, 0)],
    ['H1', Date.UTC(2026, 7, 10, 10, 0, 0)],
    ['H4', Date.UTC(2026, 7, 10, 8, 0, 0)],
    ['D1', Date.UTC(2026, 7, 10, 0, 0, 0)],
    ['W1', Date.UTC(2026, 7, 10, 0, 0, 0)],
    ['MN', Date.UTC(2026, 7, 1, 0, 0, 0)],
  ] as const;

  runtime.previewCountdownRequestedContextKey = 'session:BTCUSD';
  runtime.previewCountdownRequestedGeneration = 8;
  runtime.previewCountdownSeriesContextKey = runtime.previewCountdownRequestedContextKey;
  runtime.previewCountdownSeriesGeneration = runtime.previewCountdownRequestedGeneration;

  for (const [timeframe, candleOpenMs] of cases) {
    const nowMs = candleOpenMs + 17_000;
    runtime.previewCountdownTimeframe = timeframe;
    runtime.previewCountdownLastBarTime = candleOpenMs / 1000;

    const expected = getChartCandleCountdownSeconds({
      candleOpenTime: candleOpenMs / 1000,
      timeframe,
      nowMs,
    });
    const actual = runtime.getPreviewCandleCountdownRemainingSeconds(nowMs);

    assert.equal(actual, expected, `${timeframe} remaining seconds must match`);
    assert.equal(
      runtime.formatPreviewCandleCountdown(actual, timeframe),
      formatChartCandleCountdown(expected, timeframe),
      `${timeframe} label must match`,
    );
  }
});

test('countdown requires the exact painted pane context and never advances candle data', () => {
  const runtime = evaluateCountdownRuntime();
  runtime.previewCountdownRequestedContextKey = 'session:AUDCAD:M1';
  runtime.previewCountdownRequestedGeneration = 4;
  runtime.previewCountdownSeriesContextKey = 'session:XAUUSD:M1';
  runtime.previewCountdownSeriesGeneration = 3;
  runtime.previewCountdownTimeframe = 'M1';
  runtime.previewCountdownLastBarTime = Date.UTC(2026, 7, 13, 12, 15, 0) / 1000;

  assert.equal(runtime.getPreviewCandleCountdownRemainingSeconds(Date.UTC(2026, 7, 13, 12, 15, 10)), null);
  runtime.previewCountdownSeriesContextKey = runtime.previewCountdownRequestedContextKey;
  runtime.previewCountdownSeriesGeneration = runtime.previewCountdownRequestedGeneration;
  assert.equal(runtime.getPreviewCandleCountdownRemainingSeconds(Date.UTC(2026, 7, 13, 12, 15, 10)), 50);
  assert.doesNotMatch(LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT, /series\.(?:setData|update)\(/);
});

test('WebView owns a second-aligned timer and an ordered price then countdown badge', () => {
  assert.match(
    LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT,
    /Math\.max\(50, 1000 - \(Date\.now\(\) % 1000\) \+ 16\)/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT,
    /requestedKey !== previewCountdownRequestedContextKey[\s\S]*requestedGeneration !== previewCountdownRequestedGeneration/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT,
    /badge\.appendChild\(priceRow\);[\s\S]*badge\.appendChild\(countdownRow\);/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT,
    /countdownRow\.setAttribute\('data-rtx5-role', 'candle-countdown'\)/,
  );
});

test('preview live-price badge stays inside the measured right price-scale boundary', () => {
  const runtime = evaluateCountdownRuntime();
  runtime.chartHost = { clientWidth: 410 };
  runtime.chart = {
    priceScale: (id: string) => {
      assert.equal(id, 'right');
      return { width: () => 64 };
    },
  };

  const measured = runtime.resolvePreviewRightPriceScaleAxisMetrics();
  assert.equal(measured.axisLeft, 346);
  assert.equal(measured.axisWidth, 64);

  runtime.chart = null;
  runtime.chartHost = { clientWidth: 48 };
  const fallback = runtime.resolvePreviewRightPriceScaleAxisMetrics();
  assert.equal(fallback.axisLeft, 0);
  assert.equal(fallback.axisWidth, 48);
  assert.match(
    LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT,
    /badge\.style\.left = axisMetrics\.axisLeft[\s\S]*badge\.style\.right = 'auto'[\s\S]*badge\.style\.width = axisMetrics\.axisWidth/,
  );
  assert.doesNotMatch(LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT, /Math\.min\(82/);
});

test('preview bridge binds countdown to painted data and the auxiliary symbol market session', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const auxiliarySource = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');

  assert.match(previewSource, /setPreviewCountdownSeriesContext\(dataContextKey, dataGeneration, data\)/);
  assert.match(
    previewSource,
    /setPreviewCountdownSeriesContext\([\s\S]*dataContextKey,[\s\S]*dataGeneration,[\s\S]*window\._lastChartData/,
  );
  assert.match(previewSource, /setPreviewCandleCountdown\([\s\S]*timeframe[\s\S]*previewDataContextKey[\s\S]*previewDataGeneration/);
  assert.match(previewSource, /line\.role === 'live' && previewCountdownActive/);
  assert.match(auxiliarySource, /useMarketStatus\([\s\S]*symbol,[\s\S]*isScreenFocused,[\s\S]*isScreenFocused/);
  assert.match(auxiliarySource, /resolveChartMarketSessionPolicy\(marketStatus\)/);
  assert.match(
    auxiliarySource,
    /isScreenFocused[\s\S]*chartDisplay\.showLivePriceLine[\s\S]*marketSessionPolicy\.quotePhase !== 'closed'/,
  );
  assert.match(auxiliarySource, /candleCountdownActive=\{candleCountdownActive\}/);
});

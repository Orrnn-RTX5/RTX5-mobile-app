import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('missing LightweightCharts posts a fatal bridge error instead of failing silently', () => {
  assertSourceContains(
    source,
    /if \(typeof LightweightCharts === 'undefined'\)[\s\S]*type: 'ERROR'[\s\S]*FATAL: LightweightCharts library did not load/,
    'bridge must post an ERROR when LightweightCharts is unavailable',
  );
});

test('setData failures are caught and posted through updateChartData error path', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /try \{[\s\S]*series\.setData\(mapped\)[\s\S]*\} catch \(e\) \{[\s\S]*postError\('updateChartData', e\)/, 'updateChartData must catch setData failures');
});

test('incremental update failures are caught by flushPendingTick', () => {
  const body = extractFunctionBody(source, 'flushPendingTick');

  assertSourceContains(body, /try \{[\s\S]*applyTickUpdate\(tick\)[\s\S]*\} catch \(e\)/, 'flushPendingTick must catch update failures');
  assertSourceContains(body, /Cannot update oldest data[\s\S]*return; \/\/ benign race/, 'old-data update race must be treated as benign');
  assertSourceContains(body, /postError\('flushPendingTick', e\)/, 'unexpected tick update failures must be posted');
});

test('createPriceLine failures do not prevent future overlay re-sync', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');

  assertSourceContains(body, /try \{[\s\S]*series\.createPriceLine[\s\S]*\} catch \(lineErr\) \{[\s\S]*postError\('createPriceLine\[' \+ ln\.id \+ '\]'/, 'price-line creation failures must be logged');
  assertSourceContains(source, /startOverlayResync\(\)/, 'overlay resync must keep running after a missed line');
});

test('recoverChartSurface can recreate chart when chart or series is missing', () => {
  const body = extractFunctionBody(source, 'recoverChartSurface');

  assertSourceContains(body, /if \(!chart \|\| !series\)[\s\S]*_doInitChart\(/, 'surface recovery must re-init missing chart or series');
  assertSourceContains(body, /lastRawSeriesData\.slice\(\)/, 'surface recovery must reuse the last raw series snapshot');
});

test('native WebView ERROR messages are dev-only logs so watchdog can continue recovery', () => {
  assertSourceContains(
    source,
    /msg\.type === 'ERROR'[\s\S]*?if \(typeof __DEV__ !== 'undefined' && __DEV__\) \{\s*console\.log\('\[CHART WEBVIEW ERROR\]'/,
    'native handler must log recoverable WebView errors in dev only, without alerting or throwing',
  );
  assert.doesNotMatch(
    source,
    /console\.(?:warn|error)\('\[CHART WEBVIEW ERROR\]'/,
    'recoverable WebView errors must not raise LogBox toasts',
  );
});

test('native WebView render errors invalidate stale readiness and retry init', () => {
  assertSourceContains(
    source,
    /msg\.type === 'ERROR'[\s\S]*bridgeErrorMessage[\s\S]*updateChartData[\s\S]*chartInitializedRef\.current = false[\s\S]*renderedSeriesSnapshotRef\.current = EMPTY_CHART_SERIES_SNAPSHOT[\s\S]*requestChartViewportRecovery\(2\)[\s\S]*sendInit\(true\)/,
    'render-path WebView errors must force a fresh init instead of leaving a blank initialized surface',
  );
});

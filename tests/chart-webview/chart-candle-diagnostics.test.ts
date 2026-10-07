import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('ChartScreen keeps full-series diagnostics and exposes the canonical atomic live bridge path', () => {
  assertSourceContains(source, /\[CHART-CANDLES\]/, 'ChartScreen must log direct useLiveCandles output');
  assertSourceContains(source, /\[CHART-BRIDGE\] useLiveCandles_update/, 'ChartScreen must log candle hook updates');
  assertSourceContains(source, /\[CHART-BRIDGE\] candle_sync_mode/, 'ChartScreen must log update mode decisions');
  assertSourceContains(source, /\[CHART-BRIDGE\] inject_updateChartData/, 'ChartScreen must log full candle reload injections');
  assertSourceContains(source, /const exactQuote = readExactChartQuoteForScope\([\s\S]*const liveUpdate = \{[\s\S]*livePrice: exactBidLine,[\s\S]*revision,[\s\S]*updateLiveTick\(/, 'the direct live path must expose exact backend Bid and the ordered candle revision in one bridge payload');
  assert.doesNotMatch(source, /livePrice: lastCandle\.close/);
  assert.doesNotMatch(source, /\[CHART-BRIDGE\] inject_setLivePriceLine/, 'live Bid-line paints must not be logged as a separate delayed bridge call');
});

test('WebView candle bridge keeps diagnostics while the live path is one atomic queued update', () => {
  const updateDataBody = extractFunctionBody(source, 'updateChartData');
  const applyTickBody = extractFunctionBody(source, 'applyTickUpdate');
  const updateTickBody = extractFunctionBody(source, 'updateTick');
  const updateLiveTickBody = extractFunctionBody(source, 'updateLiveTick');

  assertSourceContains(updateDataBody, /\[WEBVIEW-CANDLE\] updateChartData/, 'WebView full reload must log candle data receipt');
  assertSourceContains(updateTickBody, /\[WEBVIEW-CANDLE\] updateTick_queued/, 'WebView incremental path must log queued ticks');
  assertSourceContains(
    updateLiveTickBody,
    /var acceptedCandlePrice = seriesType === 'line'[\s\S]*Number\(update\.candle\.value\)[\s\S]*Number\(update\.candle\.close\)[\s\S]*pendingTick = \{[\s\S]*tick: update\.candle[\s\S]*livePrice: acceptedCandlePrice/,
    'WebView live diagnostics must derive the queued marker from the accepted candle close/value',
  );
  assertSourceContains(applyTickBody, /\[WEBVIEW-CANDLE\] applyTickUpdate/, 'WebView must log applied candle ticks');
  assertSourceContains(applyTickBody, /tick\.time < lastBarTime[\s\S]*\[WEBVIEW-CANDLE\] applyTickUpdate_rejected/, 'WebView must log stale tick rejection');
});

test('ChartScreen prioritizes the selected candle context before chart reconciliation', () => {
  assertSourceContains(source, /import \{ INITIAL_HISTORY_LIMIT, liveCandlesEngine \} from '\.\.\/\.\.\/api\/ws\/liveCandlesEngine'/, 'ChartScreen must be able to warm the canonical candle engine and share its initial-window boundary');
  assertSourceContains(source, /const prefetchChartTimeframeHistory = useCallback[\s\S]*liveCandlesEngine\.prefetchHistory/, 'ChartScreen must prefetch through the engine, not the WebView');
  assertSourceContains(source, /handleOpenTimeframePicker[\s\S]*showChartTimeframePicker\(\)[\s\S]*scheduleIdleWork[\s\S]*prefetchChartTimeframeHistory\(chartSymbol, tf\)/, 'opening the timeframe picker must paint first, then warm alternate timeframes off the critical path');
  assert.doesNotMatch(source, /prefetchSymbolPickerHistory|CHART_SYMBOL_PICKER_PREFETCH_LIMIT|CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS/, 'opening the native symbol picker must not fan out unrelated history requests');
  assertSourceContains(source, /refreshSelectedChartHistory[\s\S]*liveCandlesEngine\.prefetchHistory\(nextSymbol, nextTimeframe\)[\s\S]*liveCandlesEngine\.refreshHistoryForContext\(nextSymbol, nextTimeframe\)/, 'same-context refreshes must stay on the canonical candle engine');
  assertSourceContains(source, /chartContextCommitScheduler\.request\(\{[\s\S]*prepare: \(\) => \{[\s\S]*prefetchChartSelectionHistory\(nextSymbol, nextTimeframe\)[\s\S]*commit: \(\) => \{[\s\S]*preferences\.setChartSymbol\(nextSymbol\)/, 'symbol selection must dispatch status-aware history before deferring its heavy Zustand commit');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('retained chart clocks stop while hidden and resume once without losing overlay repair', () => {
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, () => void>();
  let nextTimer = 0;
  let repairs = 0;
  let countdownPaints = 0;
  const context = {
    document: { hidden: false },
    chartRuntimeActive: false,
    _overlayResyncTimer: null,
    candleCountdownTimer: null,
    candleCountdownActive: true,
    candleCountdownTimeframe: 'M1',
    setInterval: (callback: () => void) => { intervals.set(++nextTimer, callback); return nextTimer; },
    clearInterval: (id: number) => intervals.delete(id),
    setTimeout: (callback: () => void) => { timeouts.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id: number) => timeouts.delete(id),
    scheduleMarketPriceScaleDomOnly: () => { countdownPaints += 1; },
    lastPostedChartTouchActive: false,
    activeTradeLineDrag: null,
    activeHorizontalScrollGesture: false,
    horizontalScrollMotionActive: false,
    verticalPricePanGestureActive: false,
    chartScaleGestureActive: false,
    pendingHorizontalOverlayApply: false,
    pendingVerticalOverlayApply: false,
    verticalGestureDomWorkPending: false,
    visibleRangeIdlePendingAfterGesture: false,
    series: {},
    _overlayPayload: { priceLines: [{}] },
    _positionLinesArr: [],
    countOverlayNativePriceLines: () => 1,
    applyOverlayPayload: () => { repairs += 1; },
    schedulePriceScaleHealthCheck: () => {},
    scheduleOverlayVisibleCandleScaleRecovery: () => {},
  };
  const functions = [
    ['stopOverlayResync', ''], ['startOverlayResync', ''],
    ['stopCandleCountdownTicker', ''], ['scheduleNextCandleCountdownTick', ''],
    ['syncChartRuntimeTimers', ''], ['setChartRuntimeActive', 'active'],
  ].map(([name, args]) => `function ${name}(${args}) {${extractFunctionBody(source, name)}}`).join('\n');
  const runtime = runInNewContext(`${functions}; ({setChartRuntimeActive, syncChartRuntimeTimers, scheduleNextCandleCountdownTick})`, context);

  runtime.scheduleNextCandleCountdownTick();
  assert.equal(timeouts.size, 0, 'prewarmed hidden documents do no clock work');
  runtime.setChartRuntimeActive(true);
  runtime.setChartRuntimeActive(true);
  assert.equal(intervals.size, 1);
  assert.equal(timeouts.size, 1);
  intervals.values().next().value!();
  assert.equal(repairs, 1, 'visible charts still repair missing overlay lines');
  const [id, tick] = timeouts.entries().next().value!;
  timeouts.delete(id);
  tick();
  assert.equal(countdownPaints, 1);
  assert.equal(timeouts.size, 1, 'one countdown tick schedules one successor');

  context.document.hidden = true;
  runtime.syncChartRuntimeTimers();
  assert.equal(intervals.size + timeouts.size, 0, 'backgrounding clears both clocks');
  context.document.hidden = false;
  runtime.syncChartRuntimeTimers();
  assert.equal(intervals.size, 1);
  assert.equal(timeouts.size, 1);
  runtime.setChartRuntimeActive(false);
  runtime.syncChartRuntimeTimers();
  assert.equal(intervals.size + timeouts.size, 0, 'a hidden native tab stays paused even when the document is visible');
});

test('setData full reload clears and recreates overlay price lines and markers', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /_positionLinesArr = \[\]/, 'full data reload must clear stale price-line refs');
  assertSourceContains(
    body,
    /Do not drop the live marker handle here: setData preserves the/,
    'full data reload must keep the live marker primitive attached to the series',
  );
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'full data reload must recreate overlays');
  assertSourceContains(
    extractFunctionBody(source, 'applyOverlayPayload'),
    /clearOverlayMarkers\(\)/,
    'overlay recreation must clear stale marker refs before creating new ones',
  );
  assertSourceContains(
    extractFunctionBody(source, 'clearOverlayMarkers'),
    /_overlayMarkers = null/,
    'marker clearing must drop the stale marker refs',
  );
});

test('applyOverlayPayload always starts from a clean slate before creating lines', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');
  const clearBody = extractFunctionBody(source, 'clearOverlayPriceLines');

  assertSourceContains(body, /clearOverlayPriceLines\(\)/, 'overlay apply must clear old line refs first');
  assertSourceContains(body, /series\.createPriceLine/, 'overlay apply must create price lines from payload');
  assertSourceContains(clearBody, /series\.removePriceLine\(_positionLinesArr\[i\]\)/, 'clear must remove every previous line');
  assertSourceContains(clearBody, /_overlayPriceLinesByDragKey = Object\.create\(null\)/, 'clear must reset drag-key lookup');
});

test('overlay price lines do not paint filled right-axis price labels', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');

  assertSourceContains(body, /axisLabelVisible: false/, 'overlay price lines must keep the right price scale clean');
  assert.doesNotMatch(body, /axisLabelVisible: axisLabelVisible/, 'overlay price lines must not opt back into native axis badges');
});

test('market price lines do not render native right-axis price badges', () => {
  const optionsBody = extractFunctionBody(source, 'makeMarketPriceLineOptions');
  const setLiveBody = extractFunctionBody(source, 'setLivePriceLine');
  const setAskBody = extractFunctionBody(source, 'setAskPriceLine');
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels');
  const refreshLiveBody = extractFunctionBody(source, 'refreshBidPriceLineColor');

  assertSourceContains(optionsBody, /axisLabelVisible: false/, 'live price line must hide native right-axis price badges');
  assertSourceContains(setLiveBody, /var liveColor = pickLivePriceColor\(\)[\s\S]*makeMarketPriceLineOptions\(normalizedPrice, liveColor\)/, 'live price line updates must keep the clean axis option with the active candle color after precision snapping');
  assertSourceContains(refreshLiveBody, /var liveColor = pickLivePriceColor\(\)[\s\S]*marketLiveColor = liveColor[\s\S]*color: liveColor[\s\S]*axisLabelColor: liveColor/, 'live price line repaint must follow bull and bear candle colors');
  assert.doesNotMatch(setAskBody, /makeMarketPriceLineOptions|createMarketPriceLine/, 'legacy Ask helper must not render a separate Ask line');
  assert.doesNotMatch(refreshBody, /renderMarketPriceBadges\(layer\)/, 'DOM refresh must not render filled native market price badges');
});

test('market price lines extend over the right price scale without filled badges', () => {
  const extensionBody = extractFunctionBody(source, 'renderMarketPriceScaleExtension');
  const extensionsBody = extractFunctionBody(source, 'renderMarketPriceScaleExtensions');
  const refreshMarketBody = extractFunctionBody(source, 'refreshMarketPriceScaleDom');

  assertSourceContains(
    extensionBody,
    /axisLeft = Math\.round\(\(metrics\.leftAxisWidth \|\| 0\) \+ \(metrics\.paneWidth \|\| 0\)\)/,
    'bid/ask extension must start exactly where the main plot hands off to the right price scale',
  );
  assertSourceContains(
    extensionBody,
    /extension\.style\.width = Math\.min\(axisWidth, Math\.max\(0, chartWidth - axisLeft\)\) \+ 'px'/,
    'live price extension must cover only the right price-scale width',
  );
  assertSourceContains(
    extensionBody,
    /extension\.style\.height = MARKET_PRICE_SCALE_EXTENSION_HEIGHT \+ 'px'/,
    'live price extension must be a thin line, not a filled price badge',
  );
  assertSourceContains(
    extensionsBody,
    /renderMarketPriceScaleExtension\(layer, lastLivePrice, marketLiveColor\)/,
    'the live price line must be extended over the right price scale',
  );
  assertSourceContains(
    refreshMarketBody,
    /renderMarketPriceScaleExtensions\(layer\)/,
    'DOM refresh must redraw the right price-scale extensions with current market prices',
  );
});

test('empty overlay payload clears old price lines, labels, values, and markers immediately', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');
  const setChartOverlaysBody = extractFunctionBody(source, 'setChartOverlays');
  const refreshLabelsBody = extractFunctionBody(source, 'refreshOverlayDomLabels(payload)');

  assertSourceContains(body, /var lines = Array\.isArray\(payload\.priceLines\) \? payload\.priceLines : \[\]/, 'empty payload must normalize priceLines to []');
  assertSourceContains(body, /var markers = Array\.isArray\(payload\.markers\) \? payload\.markers : \[\]/, 'empty payload must normalize markers to []');
  assertSourceContains(body, /clearOverlayPriceLines\(\)/, 'empty payload must clear previous price lines');
  assertSourceContains(body, /clearOverlayMarkers\(\)/, 'empty payload must clear previous markers');
  assertSourceContains(body, /refreshOverlayDomLabels\(_appliedOverlayPayload\)/, 'empty payload must refresh the DOM overlay against no trade levels');
  assertSourceContains(refreshLabelsBody, /pruneOverlayDomNodes\(liveOverlayKeys\)/, 'empty payload must prune stale line labels and right-axis values');
  assertSourceContains(body, /emptyPayloadClearConfirmed/, 'empty payload clear must be diagnostically confirmed');
  assertSourceContains(setChartOverlaysBody, /postWebViewOverlayLog\('setChartOverlays received'/, 'WebView must log received overlay payloads');
});

test('overlay injection before series exists self-heals through init, native resync, and WebView resync', () => {
  assertSourceContains(
    extractFunctionBody(source, '_doInitChart'),
    /applyOverlayPayload\(_overlayPayload\)/,
    'chart init must apply cached overlay payload once series exists',
  );
  assertSourceContains(
    source,
    /const resyncInterval = setInterval\(\(\) => \{[\s\S]*setChartOverlays\([\s\S]*\$\{JSON\.stringify\(payload\)\},[\s\S]*\$\{JSON\.stringify\(chartDataContextSig\)\}[\s\S]*\}, 5000\)/,
    'native side must periodically re-push overlays on the geometry path',
  );
  assertSourceContains(
    source,
    /empty payload[\s\S]*stale price lines, markers, and trade history/,
    'native resync must include empty payload clears',
  );
  assertSourceContains(
    extractFunctionBody(source, 'startOverlayResync'),
    /_positionLinesArr\.length !== countOverlayNativePriceLines\(_overlayPayload\.priceLines\)[\s\S]*applyOverlayPayload\(_overlayPayload\)/,
    'WebView side must recreate missing overlay lines',
  );
});

test('CHART_READY immediately pushes latest overlays and the live price line', () => {
  assertSourceContains(
    source,
    /msg\.type === 'CHART_READY'[\s\S]*const latestOverlay = overlayPayloadRef\.current \?\? \{[\s\S]*setChartOverlays\([\s\S]*\$\{JSON\.stringify\(latestOverlay\)\},[\s\S]*\$\{JSON\.stringify\(chartDataContextSig\)\}[\s\S]*setLivePriceLineForContext/,
    'CHART_READY must immediately restore overlays and the live price line',
  );
});

test('dragging SL/TP line suppresses overlay recreation until drag finishes', () => {
  assertSourceContains(
    extractFunctionBody(source, 'setChartOverlays'),
    /if \(activeTradeLineDrag\)[\s\S]*scheduleTradeLineDragDomRefresh\(\)[\s\S]*return/,
    'overlay updates must not recreate lines while trade-line drag is active',
  );
  assertSourceContains(
    extractFunctionBody(source, 'updatePositionLines'),
    /if \(activeTradeLineDrag\)[\s\S]*return/,
    'manual overlay refresh must skip active trade-line drag',
  );
});

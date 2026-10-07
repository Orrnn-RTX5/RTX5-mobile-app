import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSourceContains,
  assertSourceOmits,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

// MT5-parity contract: an open trade may be OUTSIDE the visible viewport, but
// it must never be removed from chart state because of that. Markers are
// clipped with visibility, recomputed from their real price on every render,
// and must survive stranded gesture flags.

test('trade markers reposition from their real price on every visible-range change', () => {
  const repositionBody = extractFunctionBody(source, 'repositionTradeOverlayDomNodes');

  assertSourceContains(
    repositionBody,
    /series\.priceToCoordinate\(ln\.price\)/,
    'reposition pass must derive marker y from the trade\'s REAL price every time',
  );
  assertSourceContains(
    repositionBody,
    /if \(!isOpenPosition\) \{[\s\S]*lineNode\.style\.top = Math\.round\(y\) \+ 'px'/,
    'non-position protection lines must remain at their raw price coordinate',
  );
  assertSourceContains(
    repositionBody,
    /anchoredLabelRecords\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)[\s\S]*resolveAnchoredOverlayLabelTops\(anchoredLabelRecords\)[\s\S]*record\.node\.style\.top = labelTop/,
    'reposition pass must rewrite trade labels through the shared vertical row layout',
  );
  assertSourceContains(
    repositionBody,
    /resolveAnchoredOverlayLabelLane\(_overlayLabelLayer, false\)[\s\S]*resolveAnchoredOverlayLabelLane\(_overlayLabelLayer, true\)[\s\S]*applyAnchoredOverlayLabelLane\([\s\S]*isOpenPosition \? openPositionLabelLane : anchoredLabelLane/,
    'reposition pass must keep open-position labels in the left lane and other trade labels in their existing lane',
  );
  assertSourceContains(
    repositionBody,
    /var rowY = resolveAnchoredOverlayRowY\(labelTop\)[\s\S]*record\.lineNode\.style\.top = rowY \+ 'px'[\s\S]*record\.boxNode\.style\.top = Math\.round\(rowY - OVERLAY_POSITION_BOX_HEIGHT \/ 2\) \+ 'px'/,
    'each open-position connector and right-axis box must share the displayed row center',
  );
  assertSourceOmits(
    repositionBody,
    /removeChild|createElement|pruneOverlayDomNodes/,
    'reposition pass must be position-only — never create or delete marker nodes',
  );

  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(range\) \{[\s\S]{0,900}scheduleTradeOverlayReposition\(\);/,
    'every visible-range change (pan, momentum, zoom, autoscroll, history load) must reschedule marker repositioning',
  );
});

test('trade markers keep tracking during gesture-deferred frames (pinch, right-scale drag, horizontal pan)', () => {
  const deferHorizontalBody = extractFunctionBody(source, 'deferHorizontalGestureDomWork');
  const deferVerticalBody = extractFunctionBody(source, 'deferVerticalGestureDomWork');

  assertSourceContains(
    deferHorizontalBody,
    /scheduleTradeOverlayReposition\(\)/,
    'horizontal gesture deferral must still keep marker positions glued to price',
  );
  assertSourceContains(
    deferVerticalBody,
    /scheduleTradeOverlayReposition\(\)/,
    'right-price-scale drag deferral must still keep marker positions glued to price',
  );
  assertSourceContains(
    source,
    /scheduleGestureRightPriceScaleFallbackRefresh\(\);[\s\S]{0,400}scheduleTradeOverlayReposition\(\);\s*return;/,
    'pinch/scale move frames must reposition trade markers instead of freezing them',
  );
});

test('off-viewport trades are clipped with visibility, never deleted from chart state', () => {
  const paneBoundsBody = extractFunctionBody(source, 'resolveTradeOverlayPaneBounds');
  const insidePaneBody = extractFunctionBody(source, 'isTradeOverlayYInsidePane');
  const repositionBody = extractFunctionBody(source, 'repositionTradeOverlayDomNodes');
  const anchoredLineBody = extractFunctionBody(source, 'renderAnchoredTradeLine');
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels(payload)');

  assertSourceContains(
    paneBoundsBody,
    /return null/,
    'unavailable pane metrics must never hide markers (fail open)',
  );
  assertSourceContains(
    insidePaneBody,
    /if \(!bounds\) return true/,
    'missing pane bounds must render markers as visible',
  );
  assertSourceContains(
    repositionBody,
    /isTradeOverlayYInsidePane\(y, bounds\) \? 'visible' : 'hidden'/,
    'reposition pass must clip via visibility only',
  );
  assertSourceContains(
    anchoredLineBody,
    /line\.style\.visibility = isTradeOverlayYInsidePane\(item\.y, resolveTradeOverlayPaneBounds\(\)\)/,
    'anchored trade line must clip via visibility at its true coordinate',
  );
  assertSourceContains(
    refreshBody,
    /paneVisible: isTradeOverlayYInsidePane\(y, tradeOverlayPaneBounds\)/,
    'full refresh must carry pane visibility per marker record',
  );
  assertSourceContains(
    refreshBody,
    /boxEl\.style\.visibility = isTradeOverlayYInsidePane\(box\.y, tradeOverlayPaneBounds\)/,
    'right-axis price box must gate on the RAW price coordinate, not the stacked offset',
  );
  assertSourceOmits(
    refreshBody,
    /if \(y < 0 \|\| y > [\s\S]{0,60}\) continue;/,
    'off-viewport markers must not be skipped out of the render (that deletes their DOM via prune)',
  );
});

test('trade overlay layer clips stacked rows at the pane/time-axis boundary', () => {
  const paneBoundsBody = extractFunctionBody(source, 'resolveTradeOverlayPaneBounds');
  const paneClipBody = extractFunctionBody(source, 'syncOverlayLabelLayerPaneClip');
  const ensureLayerBody = extractFunctionBody(source, 'ensureOverlayLabelLayer');

  assertSourceContains(
    paneBoundsBody,
    /var paneHeight = Math\.max\(0, Math\.round\(metrics\.paneHeight \|\| 0\)\)/,
    'trade overlay bounds must use the full pane height ending above the date/time scale',
  );
  assertSourceContains(
    paneBoundsBody,
    /return \{ top: 0, bottom: paneHeight \}/,
    'trade overlay bounds must end exactly at the pane/time-axis separator',
  );
  assertSourceOmits(
    paneBoundsBody,
    /metrics\.plotTop|metrics\.plotHeight/,
    'price-scale margins are inside the pane and must not define its clipping boundary',
  );
  assertSourceContains(
    paneClipBody,
    /var bounds = resolveTradeOverlayPaneBounds\(\)/,
    'overlay layer clipping must resolve the live pane boundary',
  );
  assertSourceContains(
    paneClipBody,
    /layer\.style\.bottom = 'auto'[\s\S]*layer\.style\.height = Math\.max\(0, Math\.round\(bounds\.bottom\)\) \+ 'px'[\s\S]*layer\.style\.overflow = 'hidden'/,
    'the shared overlay layer must physically clip stacked rows before the date/time scale',
  );
  assertSourceContains(
    ensureLayerBody,
    /if \(_overlayLabelLayer && _overlayLabelLayer\.parentNode === el\) \{[\s\S]*syncOverlayLabelLayerPaneClip\(_overlayLabelLayer\)[\s\S]*return _overlayLabelLayer/,
    'an existing overlay layer must refresh its pane clip after layout changes',
  );
  assertSourceContains(
    ensureLayerBody,
    /el\.appendChild\(_overlayLabelLayer\)[\s\S]*syncOverlayLabelLayerPaneClip\(_overlayLabelLayer\)/,
    'a newly created overlay layer must install the pane clip immediately',
  );
  assertSourceOmits(
    ensureLayerBody,
    /_overlayLabelLayer\.style\.bottom = '0'/,
    'the created overlay layer must not permanently span through the time axis',
  );
});

test('stranded gesture flags cannot permanently freeze or hide trade markers', () => {
  const resyncBody = extractFunctionBody(source, 'startOverlayResync');

  assertSourceContains(
    resyncBody,
    /overlayDeferralStranded/,
    'overlay resync must include the stranded-gesture watchdog',
  );
  assertSourceContains(
    resyncBody,
    /!lastPostedChartTouchActive/,
    'watchdog must only fire when no touch input is active',
  );
  assertSourceContains(
    resyncBody,
    /lastOverlayGestureDeferralActivityAt > OVERLAY_GESTURE_DEFERRAL_STALL_MS/,
    'watchdog must wait for deferral activity to stop (momentum frames stamp activity)',
  );
  assertSourceContains(
    resyncBody,
    /horizontalScrollMotionActive = false;[\s\S]{0,400}applyDeferredHorizontalOverlayPayload\(\);[\s\S]{0,200}applyDeferredVerticalOverlayPayload\(\);/,
    'watchdog must clear stranded flags and flush the deferred overlay payloads',
  );
  assertSourceContains(
    resyncBody,
    /refreshOverlayDomLabels\(_appliedOverlayPayload \|\| _overlayPayload\)/,
    'watchdog settle must rebuild marker DOM from the retained payload',
  );
});

test('history refresh preserves a user-owned vertical pan while an explicit context reset wins', () => {
  const updateBody = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(
    updateBody,
    /var manualRangeBeforeUpdate = isManualVerticalPanRangeLocked\(\)[\s\S]*normalizePriceRange\(manualVerticalPanLockedRange\)[\s\S]*var shouldPreserveManualPriceScale =[\s\S]*!resetVisibleRange && isValidPriceRange\(manualRangeBeforeUpdate\)/,
    'update must capture the user-owned numeric range before setData',
  );
  assertSourceContains(
    updateBody,
    /Manual vertical ownership is scoped to the current symbol and[\s\S]*timeframe\. An explicit reset \(used for context replacement\) must[\s\S]*win over an old numeric window/,
    'manual price-scale ownership must stay context-scoped with an explicit reset winning over an old window',
  );
  assertSourceContains(
    updateBody,
    /!shouldPreserveManualPriceScale &&[\s\S]*\(previousRawSeriesData\.length === 0 \|\| didReplaceVisibleSeries\)/,
    'fresh-series autoscale must stay disabled while the user owns the range',
  );
  assertSourceContains(
    updateBody,
    /if \(shouldPreserveManualPriceScale\) \{[\s\S]{0,300}rememberManualVerticalPanRange\(manualRangeBeforeUpdate\);[\s\S]{0,200}applyManualVerticalPanLockedRange\(\);/,
    'replacement must restore and reassert the locked numeric range after overlays rebuild',
  );
});

test('vertical fling glides with unbounded reach and stays interruptible', () => {
  assertSourceContains(
    source,
    /var applyVerticalPanAt = function\(clientY\) \{[\s\S]{0,900}vertPanState\.velocityPxMs =/,
    'vertical pan moves must track fling velocity',
  );
  assertSourceContains(
    source,
    /var startVerticalPanGlide = function\(velocityPxMs, pricePerPixel, startRange\) \{[\s\S]{0,4000}renderVerticalPanRange\(state\.range\)/,
    'fling glide must keep shifting the price range through the shared vertical-pan renderer',
  );
  const renderVerticalPanRangeMatch = source.match(
    /var renderVerticalPanRange = function\(nextRange\) \{[\s\S]*?\n {8}\};/,
  );
  assert.ok(renderVerticalPanRangeMatch, 'renderVerticalPanRange must exist');
  assertSourceOmits(
    renderVerticalPanRangeMatch[0],
    /Math\.max\([^)]*candle|clamp/i,
    'vertical pan range must not be clamped to candle data — old trade prices must stay reachable',
  );
  assertSourceContains(
    source,
    /startVerticalPanGlide\(flingVelocityPxMs, flingPricePerPixel, finalRange\)/,
    'finger-up with velocity must hand the pan to the kinetic glide',
  );
  assertSourceContains(
    source,
    /var onPointerDown = function\(event\) \{[\s\S]{0,400}stopVerticalPanGlide\(\)/,
    'touching the chart must catch the glide',
  );
  assertSourceContains(
    extractFunctionBody(source, 'clearManualVerticalPanRange'),
    /stopVerticalPanGlideHook/,
    'manual-range clears (auto-scale toggle, series replacement) must stop the glide',
  );
  assertSourceContains(
    source,
    /if \(Math\.abs\(state\.v\) <= VERT_PAN_GLIDE_STOP_VELOCITY_PX_MS\) \{[\s\S]{0,600}applyManualVerticalPanLockedRange\(\);/,
    'glide settle must lock the final user-owned range',
  );
});

test('trade lines never stretch the candle autoscale to keep old entries visible', () => {
  const autoscaleBody = extractFunctionBody(source, 'buildOverlayAwareAutoscaleInfo');
  const nativeLineGateBody = extractFunctionBody(source, 'shouldCreateOverlayNativePriceLine');

  assertSourceOmits(
    autoscaleBody,
    /expandPriceRangeForTradeOverlays/,
    'autoscale must not be expanded just to include far-away trade entries',
  );
  assertSourceContains(
    nativeLineGateBody,
    /isTradeOverlayScaleLine\(line\)/,
    'trade entry lines must stay out of the native price-line autoscale path',
  );
});

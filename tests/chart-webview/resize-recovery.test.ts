import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();
const radialMenuSource = (() => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/components/ChartTapRadialMenu.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/components/ChartTapRadialMenu.tsx'),
  ];
  const radialPath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(radialPath, 'ChartTapRadialMenu.tsx was not found from the test working directory');
  return readFileSync(radialPath, 'utf8');
})();
const chartViewportLayoutSource = source.slice(
  source.indexOf('ref={chartViewportRef}'),
  source.indexOf('{shouldShowChartLoadingOverlay'),
);

test('native viewport layout schedules resize and frame sync', () => {
  assertSourceContains(
    chartViewportLayoutSource,
    /onLayout=\{\(event\) => \{[\s\S]*setChartTapMenuBounds\(\{ width, height \}\)[\s\S]*scheduleChartViewportResize\(width, height, true\)[\s\S]*syncChartViewportFrame\(\)/,
    'chart viewport layout must force a fast WebView resize and update measured frame',
  );
});

test('inactive route layouts cannot overwrite the chart viewport size', () => {
  assertSourceContains(
    chartViewportLayoutSource,
    /onLayout=\{\(event\) => \{[\s\S]*const \{ width, height \} = event\.nativeEvent\.layout;[\s\S]*if \(!isScreenFocused\) \{[\s\S]*return;[\s\S]*\}[\s\S]*setChartTapMenuBounds\(\{ width, height \}\)/,
    'hidden/prewarmed chart layouts must not teach the WebView a compressed viewport before route entry',
  );
});

test('route entry retains the first focused WebView and retries viewport recovery', () => {
  const chartSurfaceActivationSource = source.slice(
    source.indexOf('const chartSurfaceActivated'),
    source.indexOf('const activeChartSession'),
  );
  const coldStartRecoverySource = source.slice(
    source.indexOf('const scheduleChartViewportColdStartRecovery'),
    source.indexOf('const chartDataActive = chartRuntimeActive'),
  );
  const routeEntryRecoverySource = source.slice(
    source.indexOf('// The chart WebView is retained only after its first real focused mount.'),
    source.indexOf('const chartDataActive = chartRuntimeActive'),
  );

  assertSourceContains(
    chartSurfaceActivationSource,
    /const chartSurfaceActivated = useDeferredActiveFlag\(isChartRouteActive, CHART_SURFACE_MOUNT_DELAY_MS\)[\s\S]*const chartSurfaceReady = useLatchedFlag\(chartSurfaceActivated \|\| chartSurfaceStartupBooted\)/,
    'the chart WebView must mount on first real focus or the idle startup boot and remain available for later route returns',
  );
  assertSourceContains(
    coldStartRecoverySource,
    /const scheduleChartViewportColdStartRecovery = useCallback\(\(\) => \{[\s\S]*requestChartViewportRecovery\(6\)[\s\S]*\[180, 650, 1400, 2600\]\.map\(\(delayMs\) =>[\s\S]*setTimeout\(\(\) => \{[\s\S]*requestChartViewportRecovery\(delayMs >= 1400 \? 4 : 5\)[\s\S]*recoveryTimers\.forEach\(\(timer\) => clearTimeout\(timer\)\)/,
    'cold route entry must retry viewport recovery across the slow first WebView boot window',
  );
  assertSourceContains(
    coldStartRecoverySource,
    /useEffect\(\(\) => \{[\s\S]*!isScreenFocused \|\| !chartRuntimeActive \|\| !chartSurfaceReady[\s\S]*const cancelColdStartRecovery = scheduleChartViewportColdStartRecovery\(\)[\s\S]*cancelColdStartRecovery\(\)[\s\S]*cancelChartViewportRecovery\(\)[\s\S]*\}, \[[\s\S]*chartRuntimeActive[\s\S]*chartSurfaceReady[\s\S]*cancelChartViewportRecovery[\s\S]*isScreenFocused[\s\S]*scheduleChartViewportColdStartRecovery[\s\S]*\]\);/,
    'focused chart route must schedule cold-start recovery and clean it up on route changes',
  );
  assert.doesNotMatch(
    routeEntryRecoverySource,
    /chartTapMenuBounds\.width <= 0 \|\| chartTapMenuBounds\.height <= 0/,
    'route entry recovery must not wait for focused bounds because a retained surface may not emit a new onLayout',
  );
});

test('WebView ready events recover cold-start viewport size after the bridge exists', () => {
  const readyMessageSource = source.slice(
    source.indexOf("if (msg.type === 'READY')"),
    source.indexOf("} else if (msg.type === 'ERROR')"),
  );
  assertSourceContains(
    readyMessageSource,
    /msg\.type === 'READY'[\s\S]*setWebViewReady\(true\);[\s\S]*if \(isScreenFocused\) \{[\s\S]*requestChartViewportRecovery\(2\);[\s\S]*\}[\s\S]*msg\.type === 'CHART_READY'/,
    'WebView READY must retry viewport recovery after the resize bridge has loaded',
  );
  assertSourceContains(
    readyMessageSource,
    /msg\.type === 'CHART_READY'[\s\S]*setChartReadyEpoch\(\(c\) => c \+ 1\);[\s\S]*requestChartViewportRecovery\(4\);/,
    'CHART_READY must recover the viewport after the chart surface is created',
  );
});

test('fullscreen enter and exit cancel stale resize frames and remain available in More', () => {
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*cancelChartViewportRecovery\(\)[\s\S]*pendingChartViewportSizeRef\.current = null[\s\S]*\}, \[cancelChartViewportRecovery, isChartExpanded\]\)/,
    'fullscreen changes must cancel stale pending resize state',
  );
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*requestChartViewportRecovery\(4\)[\s\S]*isChartExpanded/,
    'fullscreen changes must request chart viewport recovery',
  );
  assertSourceContains(
    source,
    /label: t\(isChartExpanded \? 'Exit fullscreen' : 'Fullscreen'\)[\s\S]*onPress: \(\) => \{\s*hideChartActionSheet\(\);\s*handleToggleChartExpanded\(\);/,
    'fullscreen action in More must close the action sheet and retain viewport-safe fullscreen handling',
  );
  assertSourceContains(
    source,
    /useChartWindowToolbarRouter\([\s\S]*more: handleOpenMoreMenu/,
    'the targeted More toolbar action must still expose the fullscreen menu action',
  );
});

test('chart viewport keeps scale controls in the radial menu, not price-scale dots', () => {
  assertSourceContains(
    source,
    /<ChartTapRadialMenu[\s\S]*onOpenScaleControls=\{handleRadialOpenChartScaleMenu\}/,
    'chart scale controls must be opened from one tap radial menu section',
  );
  assertSourceContains(
    source,
    /const handleRadialOpenChartScaleMenu = useCallback\(\(\) => \{\s*latestHandleOpenChartScaleMenuRef\.current\(\);\s*\}, \[\]\)/,
    'the retained radial menu must call the latest scale-controls handler through a stable callback',
  );
  assertSourceContains(
    radialMenuSource,
    /accessibilityLabel: `\$\{t\('Chart'\)\} \$\{t\('Options'\)\}`[\s\S]*onPress: onOpenScaleControls[\s\S]*<Ionicons name="options-outline"/,
    'radial menu must render one filter-style chart scale button',
  );
  assertSourceContains(
    source,
    /const chartScaleActions = useMemo\([\s\S]*label: t\('Scroll to last bar'\)[\s\S]*label: t\('Reset vertical scale'\)[\s\S]*label: t\('Auto-scale'\)[\s\S]*label: t\('Vertical movement'\)/,
    'chart scale dropdown must contain the four scale commands',
  );
  assert.doesNotMatch(radialMenuSource, /const scaleActionItems/);
  assert.doesNotMatch(source, /const chartPriceScaleActions = useMemo\(/);
  assert.doesNotMatch(source, /handleOpenChartPriceScaleMenu/);
  assert.doesNotMatch(source, /styles\.chartPriceScaleMenuButton/);
  assertSourceContains(
    source,
    /label: t\(showChartVolumePane \? 'Hide Volume Bar' : 'Show Volume Bar'\)[\s\S]*label: t\('Reset'\)/,
    'chart volume/reset actions must remain available from the toolbar options sheet',
  );
});

test('requestChartViewportRecovery forces resize passes and ends with recoverChartSurface', () => {
  const body = source.slice(source.indexOf('const requestChartViewportRecovery'), source.indexOf('const { candles } = useLiveCandles'));

  assertSourceContains(body, /const initialBounds = chartTapMenuBoundsRef\.current[\s\S]*cancelChartViewportRecovery\(\)/, 'recovery must run even when focused bounds have not been stored yet');
  assertSourceContains(body, /const fallbackWidth = fallbackBounds\.width > 0 \? fallbackBounds\.width : initialBounds\.width[\s\S]*const resizeWidth = viewport\.width > 0 \? viewport\.width : fallbackWidth/, 'recovery must prefer measured route-entry viewport before falling back to stale bounds');
  assertSourceContains(body, /scheduleChartViewportResize\(resizeWidth, resizeHeight, true\)/, 'recovery must force resize commits');
  assertSourceContains(body, /recoverChartViewportSurface\(resizeWidth, resizeHeight\)/, 'final recovery pass must call recoverChartSurface bridge');
  assertSourceContains(body, /requestAnimationFrame\(runRecoveryPass\)/, 'recovery must run across animation frames');
});

test('WebView resizeChartViewport replays pending init and reports geometry', () => {
  const body = extractFunctionBody(source, 'resizeChartViewport');

  assertSourceContains(body, /if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'resize must replay pending init');
  assertSourceContains(body, /rememberHostViewportSize\(width, height\)[\s\S]*resolveChartViewportSize\(hostSize\.width, hostSize\.height\)/, 'resize must use native host viewport size as the authority');
  assertSourceContains(body, /chart\.resize\(w, h\)/, 'resize must resize active chart');
  assertSourceContains(body, /refreshOverlayDomLabels\(_overlayPayload\)/, 'resize must refresh overlay labels');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must post updated chart geometry');
});

test('zero-sized WebView init retry is single-flight and bounded', () => {
  const initBody = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(
    source,
    /var _pendingInitRaf = null;[\s\S]*var _pendingInitRetryCount = 0;[\s\S]*var MAX_PENDING_INIT_RAF_RETRIES = 60;/,
    'pending init must track one animation frame and a finite retry budget',
  );
  assertSourceContains(
    initBody,
    /if \(w === 0 \|\| h === 0\) \{[\s\S]*if \(_pendingInitRaf === null && _pendingInitRetryCount < MAX_PENDING_INIT_RAF_RETRIES\) \{[\s\S]*_pendingInitRetryCount \+= 1;[\s\S]*_pendingInitRaf = requestAnimationFrame\(function\(\) \{[\s\S]*_pendingInitRaf = null;[\s\S]*_doInitChart\(/,
    'zero-size init retries must be single-flight and stop at the configured limit',
  );
  assertSourceContains(
    initBody,
    /if \(_pendingInitRaf !== null\) \{\s*cancelAnimationFrame\(_pendingInitRaf\);\s*_pendingInitRaf = null;\s*\}\s*_pendingInit = null;\s*_pendingInitRetryCount = 0;/,
    'successful layout must cancel the pending frame and reset retry state',
  );
});

test('WebView chart creation resists cold-start internal shrink measurements', () => {
  const rememberBody = extractFunctionBody(source, 'rememberHostViewportSize');
  const resolveBody = extractFunctionBody(source, 'resolveChartViewportSize');
  const initBody = extractFunctionBody(source, '_doInitChart');
  const recoverBody = extractFunctionBody(source, 'recoverChartSurface');

  assertSourceContains(source, /var lastHostViewportSize = \{ width: 0, height: 0 \}/, 'WebView must remember the latest native viewport');
  assertSourceContains(rememberBody, /lastHostViewportSize = size/, 'native viewport measurements must replace stale remembered size');
  assertSourceContains(resolveBody, /hostWidth > 0 && \(resolvedWidth <= 0 \|\| resolvedWidth < hostWidth \* 0\.92\)[\s\S]*resolvedWidth = hostWidth/, 'cold WebView width must not override a larger native host width');
  assertSourceContains(resolveBody, /hostHeight > 0 && \(resolvedHeight <= 0 \|\| resolvedHeight < hostHeight \* 0\.92\)[\s\S]*resolvedHeight = hostHeight/, 'cold WebView height must not override a larger native host height');
  assertSourceContains(initBody, /var viewportSize = resolveChartViewportSize\(\)[\s\S]*safeOpts\.width = w[\s\S]*safeOpts\.height = h/, 'initial chart creation must use the stable viewport resolver');
  assertSourceContains(recoverBody, /rememberHostViewportSize\(width, height\)[\s\S]*resolveChartViewportSize\(hostSize\.width, hostSize\.height\)[\s\S]*chart\.resize\(w, h\)/, 'surface recovery must use the same stable viewport resolver');
  assertSourceContains(source, /new ResizeObserver\(function\(entries\) \{[\s\S]*resolveChartViewportSize\(entry\.contentRect\.width, entry\.contentRect\.height\)[\s\S]*chart\.resize\(w, h\)/, 'ResizeObserver must not reapply stale shrunken WebView dimensions');
});

test('recoverChartSurface restores data, overlays, market price lines, direction lines, and geometry', () => {
  const body = extractFunctionBody(source, 'recoverChartSurface');

  assertSourceContains(body, /series\.setData\(mapped\)/, 'recovery must restore chart data');
  assertSourceContains(body, /var recoveryManualRange = isManualVerticalPanRangeLocked\(\)[\s\S]*series\.setData\(mapped\)[\s\S]*rememberManualVerticalPanRange\(recoveryManualRange\)[\s\S]*applyManualVerticalPanLockedRange\(\)/, 'recovery must immediately restore a fixed manual price window after data replacement');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'recovery must restore overlays');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)[\s\S]*rememberManualVerticalPanRange\(recoveryManualRange\)[\s\S]*applyManualVerticalPanLockedRange\(\)/, 'recovery must reassert the manual window after overlays can alter price-scale state');
  assertSourceContains(body, /setLivePriceLine\(lastLivePrice\)/, 'recovery must restore the live price line');
  assertSourceContains(body, /refreshDirectionPriceLine\(\)/, 'recovery must restore direction price line');
  assertSourceContains(body, /postChartGeometry\(\)/, 'recovery must report geometry');
});

test('same-context full chart rebuild retains the exact manual price window', () => {
  const body = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(
    body,
    /var retainedManualPriceScaleRange = !isNewDataContext && isManualVerticalPanRangeLocked\(\)[\s\S]*var retainedManualPriceScaleReferenceSpan =[\s\S]*!isNewDataContext &&[\s\S]*clearManualPriceScaleState\(\)/,
    'same-context rebuild must snapshot its manual range while rejecting another symbol price window',
  );
  assertSourceContains(
    body,
    /chart = LightweightCharts\.createChart[\s\S]*rememberManualVerticalPanRange\(retainedManualPriceScaleRange\)[\s\S]*manualPriceScaleReferenceSpan = retainedManualPriceScaleReferenceSpan[\s\S]*applyManualVerticalPanLockedRange\(\)/,
    'the replacement chart instance must receive the retained numeric range',
  );
  assertSourceContains(
    body,
    /scheduleOverlayPriceScaleLock\(!isValidPriceRange\(retainedManualPriceScaleRange\)\)[\s\S]*if \(!isValidPriceRange\(retainedManualPriceScaleRange\)\) \{[\s\S]*scheduleFreshSeriesVerticalCenter/,
    'rebuild recovery must never queue forced autoscale or fresh centering for a retained manual range',
  );
});

test('AppState foreground recovery refreshes overlay sources and chart surface', () => {
  assertSourceContains(
    source,
    /AppState\.addEventListener\('change', \(state\) => \{[\s\S]*state === 'active' && isScreenFocused[\s\S]*refreshShowOnChartSources\(\)[\s\S]*requestChartViewportRecovery\(3\)/,
    'foreground transition must refresh chart data sources and recover WebView surface',
  );
});

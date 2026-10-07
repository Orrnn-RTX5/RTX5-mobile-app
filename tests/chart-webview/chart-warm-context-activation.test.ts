import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSourceContains,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('painted chart contexts are tracked in a generation and visual-shell scoped LRU', () => {
  assertSourceContains(
    source,
    /const CHART_PAINTED_CONTEXT_LRU_MAX = 16;[\s\S]*const paintedChartContextLruRef = useRef\(new Map<[\s\S]*generation: number;[\s\S]*visualShellSig: string;[\s\S]*displayDecimals: number;/,
    'native must mirror enough exact WebView cache keys for ten-plus symbol revisits',
  );
  assertSourceContains(
    source,
    /const markChartContextPainted = useCallback[\s\S]*lru\.delete\(dataContextSig\)[\s\S]*lru\.set\(dataContextSig,[\s\S]*while \(lru\.size > CHART_PAINTED_CONTEXT_LRU_MAX\)/,
    'accepted paints must touch a bounded native LRU',
  );
  assertSourceContains(
    source,
    /readyInitSignature === readySnapshotInitSignature[\s\S]*if \(readyHasHistoryCandles\) \{[\s\S]*markChartContextPainted\(chartDataContextSig\)[\s\S]*msg\.type === 'CHART_DATA_PAINTED'[\s\S]*markChartContextPainted\(paintedDataContextSig\)/,
    'both exact CHART_READY initialization and replacement ACKs must make a context activatable',
  );
  assertSourceContains(
    source,
    /paintedChartContextLruRef\.current\.clear\(\);[\s\S]*chartWebViewGeneration,[\s\S]*currentSig/,
    'a new WebView document or visual shell must invalidate native warm-key ownership',
  );
});

test('a warm symbol is activated before its exact same-turn preference commit', () => {
  assertSourceContains(
    source,
    /const CHART_CONTEXT_ACTIVATION_TIMEOUT_MS = 1_500;/,
    'slow Android bridge round trips must not downgrade a valid warm hit to the loading path',
  );
  assertSourceContains(
    source,
    /const handleSymbolSelect = useCallback[\s\S]*requestWarmChartContextActivationImplementationRef\.current\([\s\S]*nextSymbol,[\s\S]*chartTimeframe,[\s\S]*\(activated\) => \{[\s\S]*commitPreactivatedChartContext\(nextSymbol, chartTimeframe\)[\s\S]*warmChartContextAndCommit\(nextSymbol, chartTimeframe\)[\s\S]*if \(!activationPending\) \{[\s\S]*warmChartContextAndCommit/,
    'only an activation hit may use the immediate commit; miss/timeout and cold keys keep the normal scheduler',
  );
  assertSourceContains(
    source,
    /const requestWarmChartContextActivation = useCallback[\s\S]*cachedContext\.generation !== chartWebViewGeneration[\s\S]*cachedContext\.visualShellSig !== currentSig[\s\S]*CHART_CONTEXT_ACTIVATION_TIMEOUT_MS[\s\S]*window\.activateCachedChartContext\([\s\S]*targetDataContextSig[\s\S]*paintToken[\s\S]*cachedContext\.displayDecimals[\s\S]*requestId/,
    'warm activation must be exact, scoped, and bounded before selection state changes',
  );
  assertSourceContains(
    source,
    /const commitPreactivatedChartContext = useCallback[\s\S]*isScreenFocusedRef\.current[\s\S]*captureActiveBrokerSession\(\)\?\.session\.cacheNamespace[\s\S]*chartMarketDataCacheNamespaceRef\.current[\s\S]*preferences\.setChartSymbol\(nextSymbol\)/,
    'the hit commit must retain focus and authenticated broker-session guards',
  );
});

test('only the exact activation reply grants loader-free visible ownership', () => {
  assertSourceContains(
    source,
    /const settleChartContextActivation = useCallback[\s\S]*requestId !== pending\.requestId[\s\S]*dataContextSig !== pending\.dataContextSig[\s\S]*paintToken !== pending\.paintToken[\s\S]*return;[\s\S]*message\.hit !== true[\s\S]*pending\.commit\(false\)[\s\S]*preactivatedChartContextRef\.current = \{[\s\S]*pending\.commit\(true\)/,
    'late, mismatched, and cache-miss replies must never own the visible surface',
  );
  assertSourceContains(
    source,
    /msg\.type === 'CHART_CONTEXT_ACTIVATED'[\s\S]*settleChartContextActivation\(msg\)[\s\S]*msg\.type === 'READY'/,
    'the native bridge must consume activation replies before normal chart readiness messages',
  );
  assertSourceContains(
    source,
    /const hasPreactivatedCurrentChartContext =[\s\S]*preactivatedChartContext\.dataContextSig === chartDataContextSig[\s\S]*preactivatedChartContext\.generation === chartWebViewGeneration[\s\S]*preactivatedChartContext\.visualShellSig === chartVisualShellSigRef\.current[\s\S]*const hasUsableRetainedChart =[\s\S]*hasPaintedCurrentChartContext \|\| hasPreactivatedCurrentChartContext/,
    'an exact hit must keep the WebView visible through the following symbol render',
  );
});

test('usable full replacements retain and replay their complete idempotent transaction', () => {
  assertSourceContains(
    source,
    /const pendingChartDataPaintRef = useRef\([\s\S]*retryScript: ''[\s\S]*const retainChartDataPaintRetryScript = useCallback/,
    'pending usable paints must own the JavaScript needed to perform the dropped replacement',
  );
  const retryAttachments = [
    ...source.matchAll(/retainChartDataPaintRetryScript\(/g),
  ];
  assert.ok(
    retryAttachments.length >= 3,
    'the direct, React replacement, and CHART_READY replacement paths must all attach replay scripts',
  );
  assertSourceContains(
    source,
    /pendingPaint\.retryScript\.length > 0[\s\S]*injectJavaScript\(pendingPaint\.retryScript\)[\s\S]*ackRetryCount: pendingPaint\.ackRetryCount \+ 1/,
    'watchdog retries must execute the original full transaction',
  );
  const watchdogStart = source.indexOf('watchdogRef.current = setInterval');
  const watchdogEnd = source.indexOf('const overlayMarkers', watchdogStart);
  assert.ok(watchdogStart >= 0 && watchdogEnd > watchdogStart);
  assert.doesNotMatch(
    source.slice(watchdogStart, watchdogEnd),
    /retryChartDataPaintAcknowledgement/,
    'native must not ask a silently dropped transaction to acknowledge data it never applied',
  );
  assertSourceContains(
    source,
    /catch \(_e\) \{[\s\S]*pendingChartDataPaintRef\.current\.token === issuedPaintToken[\s\S]*!pendingChartDataPaintRef\.current\.confirmsUsableChart[\s\S]*pendingChartDataPaintRef\.current = \{/,
    'an inject throw may discard a non-usable token, but must preserve a usable replacement for watchdog replay',
  );
});

test('terminal paint recovery ends in an explicit error instead of an infinite spinner', () => {
  assertSourceContains(
    source,
    /attemptCount >= CHART_WEBVIEW_PAINT_STALL_RECOVERY_MAX[\s\S]*pendingChartDataPaintRef\.current = \{[\s\S]*retryScript: ''[\s\S]*setChartSurfaceRecoveryExhausted\(true\)[\s\S]*return false/,
    'exhausted renderer recovery must terminate the pending paint and publish terminal state',
  );
  assertSourceContains(
    source,
    /const hasChartDataError = Boolean\([\s\S]*chartSurfaceRecoveryExhausted[\s\S]*const shouldShowChartLoadingOverlay =[\s\S]*!hasChartDataError/,
    'terminal renderer state must suppress the loading overlay and use the chart error surface',
  );
});

test('outgoing full replacements cannot overtake a pending warm activation', () => {
  assertSourceContains(
    source,
    /const shouldDeferOutgoingChartContextFullReplacement = useCallback[\s\S]*pending\.sourceDataContextSig !== dataContextSig[\s\S]*deferredChartContextFullReplacementRef\.current = dataContextSig[\s\S]*return true/,
    'only the exact activation source context may be deferred',
  );
  const guardedReplacementPaths = [
    ...source.matchAll(
      /shouldDeferOutgoingChartContextFullReplacement\(chartDataContextSig\)[\s\S]{0,220}issueChartDataPaintToken\(/g,
    ),
  ];
  assert.ok(
    guardedReplacementPaths.length >= 2,
    'both direct-live and React-history full replacements must defer before allocating a newer paint revision',
  );
  assertSourceContains(
    source,
    /cancelPendingChartContextActivation = useCallback[\s\S]*deferredChartContextFullReplacementRef\.current === pending\.sourceDataContextSig[\s\S]*setChartContextReplacementReplayRevision[\s\S]*chartContextReplacementReplayRevision,[\s\S]*shouldDeferOutgoingChartContextFullReplacement/,
    'canceling an activation must replay a deferred replacement for whichever context survives the React commit',
  );
});

test('an exact usable CHART_READY resets the bounded paint-stall budget', () => {
  assertSourceContains(
    source,
    /readyInitSignature === readySnapshotInitSignature[\s\S]*if \(readyHasHistoryCandles\) \{[\s\S]*chartWebViewPaintStallRecoveryRef\.current = \{[\s\S]*dataContextSig: chartDataContextSig,[\s\S]*dataContextEpoch: chartDataContextEpochRef\.current\.epoch,[\s\S]*attemptCount: 0,[\s\S]*setChartSurfaceRecoveryExhausted\(false\)/,
    'a successful remount confirmed by exact init data must restore the full future recovery budget',
  );
});

test('native overlay bridge writes carry their exact chart context', () => {
  const contextScopedOverlayCalls = [
    ...source.matchAll(
      /(?:setChartOverlays|updateOverlayTradeLabelValues|updateOverlayTradeLabels)\([\s\S]{0,260}?JSON\.stringify\(chartDataContextSig\)/g,
    ),
  ];
  assert.ok(
    contextScopedOverlayCalls.length >= 5,
    'geometry, resync, READY, and both live/structural label paths must carry context identity',
  );
});

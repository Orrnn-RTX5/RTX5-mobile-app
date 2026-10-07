import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildChartOverlayPayload,
  type ChartOverlayCandle,
} from './chartOverlays';
import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from './testing/chartStabilityTestUtils';

const nativeSource = readChartScreenSource();
const webSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.web.tsx'),
  'utf8',
);
const webViewHtmlSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'),
  'utf8',
);
const source = `${nativeSource}\n${webViewHtmlSource}`;
const chartTradeFeatureSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartTradeFeature.tsx'),
  'utf8',
);
const chartTradeButtonsFeatureSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx'),
  'utf8',
);
const chartTradeHandlerSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts'),
  'utf8',
);
const chartTradeActionsSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/chartTradeActions.ts'),
  'utf8',
);
const orderTicketSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/OrderTicketScreen.tsx'),
  'utf8',
);

const chartSettingsScreenSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartSettingsScreen.tsx'),
  'utf8',
);
const chartShowOnChartSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/chartShowOnChart.ts'),
  'utf8',
);

const TEST_CHART_COLORS = {
  background: '#000000',
  foreground: '#94A3B8',
  grid: 'rgba(255,255,255,0.04)',
  candlesUptrend: '#2962FF',
  candlesDowntrend: '#EF5350',
  hollowBody: '#1E293B',
  barsUptrend: '#2962FF',
  barsDowntrend: '#EF5350',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
} as const;

const candles: ChartOverlayCandle[] = Array.from({ length: 30 }, (_, index) => ({
  time: 1_700_000_000 + index * 60,
  open: 1.1 + index * 0.0001,
  high: 1.101 + index * 0.0001,
  low: 1.099 + index * 0.0001,
  close: 1.1005 + index * 0.0001,
  volume: 10 + index,
}));

test('overlay bridge: price lines are recreated while marker primitive survives same-series setData', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /series\.setData\(mapped\)/, 'chart data reload must call setData');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'stale price-line refs must be cleared after setData');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'overlay payload must be recreated after setData');
  assert.doesNotMatch(
    body,
    /_overlayMarkers = null/,
    'same-series setData must retain the attached marker handle so it can still be updated or detached',
  );
});

test('overlay bridge: full chart rebuild detaches markers and forces attachment to the replacement series', () => {
  const doInitBody = extractFunctionBody(source, '_doInitChart');
  const clearMarkersBody = extractFunctionBody(source, 'clearOverlayMarkers');
  const applyBody = extractFunctionBody(source, 'applyOverlayPayload');

  assertSourceContains(
    doInitBody,
    /if \(chart\) \{[\s\S]*clearOverlayMarkers\(\)[\s\S]*chart\.remove\(\)/,
    'full chart teardown must detach markers before destroying their series',
  );
  assertSourceContains(
    clearMarkersBody,
    /_overlayMarkers\.detach\(\)[\s\S]*_overlayMarkers = null[\s\S]*_lastAppliedOverlayNativeSignature = ''/,
    'marker cleanup must release the primitive and invalidate the old-series signature',
  );
  assertSourceContains(
    applyBody,
    /markersAttachedToCurrentSeries[\s\S]*typeof _overlayMarkers\.getSeries !== 'function'[\s\S]*_overlayMarkers\.getSeries\(\) === series[\s\S]*nativeGeometryUnchanged/,
    'the unchanged fast path must prove expected markers belong to the current series',
  );
});

test('overlay bridge: overlays reapply after chart init and CHART_READY', () => {
  const doInitBody = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(doInitBody, /applyOverlayPayload\(_overlayPayload\)/, 'chart init must apply cached overlays once series exists');
  assertSourceContains(
    source,
    /msg\.type === 'CHART_READY'[\s\S]*setChartOverlays\(\s*\$\{JSON\.stringify\(latestOverlay\)\},\s*\$\{JSON\.stringify\(chartDataContextSig\)\}\s*\)/,
    'CHART_READY must immediately push the latest overlay for the active chart context',
  );
});

test('overlay bridge: overlay resync timer repairs missed injection', () => {
  const body = extractFunctionBody(source, 'startOverlayResync');

  assertSourceContains(body, /setInterval\(function\(\)/, 'WebView overlay resync must run on an interval');
  assertSourceContains(body, /_positionLinesArr\.length !== countOverlayNativePriceLines\(_overlayPayload\.priceLines\)/, 'resync must detect missing native price lines');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'resync must recreate missing overlays');
  assertSourceContains(
    source,
    /const resyncInterval = setInterval\(\(\) => \{[\s\S]*setChartOverlays\(\s*\$\{JSON\.stringify\(payload\)\},\s*\$\{JSON\.stringify\(chartDataContextSig\)\}\s*\)[\s\S]*\}, 5000\)/,
    'native overlay bridge must periodically re-push overlays on the geometry path',
  );
});

test('overlay bridge: draggable SL and TP lines emit CHART_TRADE_LINE_DRAG', () => {
  const postDragBody = extractFunctionBody(source, 'postChartTradeLineDrag');
  const previewLinesSource = source.slice(source.indexOf('const chartTradePreviewLines'), source.indexOf('const chartType = chartVisualType'));

  assertSourceContains(postDragBody, /type: 'CHART_TRADE_LINE_DRAG'/, 'drag events must use the chart trade-line event type');
  assertSourceContains(postDragBody, /phase: phase/, 'drag events must include phase');
  assertSourceContains(postDragBody, /dragKey: dragKey/, 'drag events must include dragKey');
  assertSourceContains(previewLinesSource, /const chartTradeSlDragKey = chartProtectionBackendLocked\s*\? undefined\s*:\s*previewPositionTarget[\s\S]*buildChartPositionStopDragKey\(previewPositionTarget\.id, 'sl'\)[\s\S]*: 'sl'/, 'SL preview must be non-draggable while its broker capability is locked');
  assertSourceContains(previewLinesSource, /const chartTradeTpDragKey = chartProtectionBackendLocked\s*\? undefined\s*:\s*previewPositionTarget[\s\S]*buildChartPositionStopDragKey\(previewPositionTarget\.id, 'tp'\)[\s\S]*: 'tp'/, 'TP preview must be non-draggable while its broker capability is locked');
  assertSourceContains(
    previewLinesSource,
    /const previewPositionTarget = chartDirectProtectionActive\s*\? null\s*: chartTradePositionStopTarget[\s\S]*const positionHasSl =[\s\S]*Number\(previewPositionTarget\?\.sl\) > 0[\s\S]*const positionHasTp =[\s\S]*Number\(previewPositionTarget\?\.tp\) > 0/,
    'persisted SL and TP levels must suppress only their own matching draft',
  );
  assertSourceContains(
    previewLinesSource,
    /if \(!positionHasTp && chartTradeTpEnabled[\s\S]*id: 'chart-trade-tp-preview'/,
    'a selected position with no persisted TP must still render its TP draft',
  );
  assertSourceContains(
    previewLinesSource,
    /if \(!positionHasSl && chartTradeSlEnabled[\s\S]*id: 'chart-trade-sl-preview'/,
    'a selected position with no persisted SL must still render its SL draft',
  );
  assert.doesNotMatch(
    previewLinesSource,
    /renderPositionStopsFromOpenPosition/,
    'one persisted position level must not blanket-suppress both drafts',
  );
  assertSourceContains(previewLinesSource, /id: 'chart-trade-sl-preview'[\s\S]*labelPlacement: 'line'[\s\S]*labelMinTop: chartDisplay\.showTicker \|\| chartDisplay\.showOHLC \? 78 : undefined[\s\S]*dragKey: chartTradeSlDragKey/, 'SL preview line must draw to the right price scale below the native chart header');
  assertSourceContains(previewLinesSource, /id: 'chart-trade-tp-preview'[\s\S]*labelPlacement: 'line'[\s\S]*labelMinTop: chartDisplay\.showTicker \|\| chartDisplay\.showOHLC \? 78 : undefined[\s\S]*dragKey: chartTradeTpDragKey/, 'TP preview line must draw to the right price scale below the native chart header');
  const tpPreviewSource = previewLinesSource.slice(
    previewLinesSource.indexOf("if (!positionHasTp"),
    previewLinesSource.indexOf("if (!positionHasSl"),
  );
  const slPreviewSource = previewLinesSource.slice(previewLinesSource.indexOf("if (!positionHasSl"));
  assertSourceContains(
    tpPreviewSource,
    /labelSideColor: tpColor,\s*labelValueColor: tpColor,/,
    'a TP draft must keep both parts of its label green even when its projected value is negative',
  );
  assertSourceContains(
    slPreviewSource,
    /labelSideColor: slColor,\s*labelValueColor: slColor,/,
    'an SL draft must keep both parts of its label red even when its projected value is positive',
  );
  assert.doesNotMatch(
    previewLinesSource,
    /tpProjectedPnl|slProjectedPnl/,
    'draft protection colors must not branch on projected profit or loss',
  );
});

test('overlay bridge: dragged open-position SL/TP commits through the shared exact-ticket coordinator', () => {
  const sharedCommitStart = nativeSource.indexOf('const commitChartPositionStopLevels = useCallback');
  const commitStart = nativeSource.indexOf('const commitChartPositionStopDrag = useCallback');
  const sharedCommitEnd = nativeSource.indexOf('const commitChartTradeSheetStopsForPosition = useCallback', sharedCommitStart);
  const commitEnd = nativeSource.indexOf('const handleChartPositionStopDragMessage = useCallback', commitStart);
  const handlerEnd = nativeSource.indexOf('const handleChartTradePreviewDragMessage = useCallback', commitEnd);
  assert.notEqual(sharedCommitStart, -1, 'shared position stop commit callback must exist');
  assert.notEqual(sharedCommitEnd, -1, 'shared position stop commit callback boundary must exist');
  assert.notEqual(commitStart, -1, 'commitChartPositionStopDrag callback must exist');
  assert.notEqual(commitEnd, -1, 'handleChartPositionStopDragMessage callback must exist');
  assert.notEqual(handlerEnd, -1, 'chart trade preview drag callback must still exist');
  const sharedCommitSource = nativeSource.slice(sharedCommitStart, sharedCommitEnd);
  const commitSource = nativeSource.slice(commitStart, commitEnd);
  const handlerSource = nativeSource.slice(commitEnd, handlerEnd);
  const dragPreviewStart = nativeSource.indexOf('const basePriceLines = Object.keys(chartPositionStopDragPreviews)');
  const dragPreviewEnd = nativeSource.indexOf('if (chartTradePreviewLines.length === 0)', dragPreviewStart);
  const dragPreviewSource = nativeSource.slice(dragPreviewStart, dragPreviewEnd);

  assertSourceContains(
    handlerSource,
    /parseChartPositionStopDragKey\(msg\?\.dragKey\)[\s\S]*phase === 'end'[\s\S]*commitChartPositionStopDrag\(target, nextPrice\)/,
    'open-position SL/TP drag messages must parse the position key and commit only on release',
  );
  assertSourceContains(
    handlerSource,
    /if \(selectedChartPositionTicket !== target\.positionId\) \{\s*handleSelectChartPositionTicket\(target\.positionId\);\s*\}/,
    'dragging an already-selected draft must not rehydrate the ticket and disable its other local draft',
  );
  assertSourceContains(
    dragPreviewSource,
    /labelValueColor: line\.color/,
    'dragged persisted SL/TP labels must retain the semantic color of their source line',
  );
  assert.doesNotMatch(
    dragPreviewSource,
    /projectedPnl/,
    'dragged persisted SL/TP label colors must not flip with projected profit or loss',
  );
  assertSourceContains(
    handlerSource,
    /if \(existingPositionModifyBackendLocked\) \{\s*return true;\s*\}/,
    'stale position drag messages must be consumed without local state changes while modification is locked',
  );
  assertSourceContains(
    commitSource,
    /const requestedSl = target\.kind === 'sl' \? nextPrice : previousSl[\s\S]*const requestedTp = target\.kind === 'tp' \? nextPrice : previousTp/,
    'dragging one stop level must preserve the other stop level',
  );
  assertSourceContains(
    commitSource,
    /commitChartPositionStopLevels\(\s*position\.id,\s*requestedSl,\s*requestedTp,\s*\(\) => clearChartPositionStopDragPreview\(dragKey, nextPrice\),\s*\)/,
    'drag release must hand the requested SL/TP values to the shared committer and retain the live draft until reconciliation settles',
  );
  assertSourceContains(
    sharedCommitSource,
    /submitModifyPosition\(\{\s*ticket: position\.id,\s*symbol: position\.symbol,\s*accountLogin: sessionCapture\.session\.accountLogin,\s*request: \{\s*price_sl: requestedSl,\s*price_tp: requestedTp,\s*\},\s*\}\)/,
    'shared stop commit must submit the exact position through the session coordinator',
  );
  assert.doesNotMatch(
    sharedCommitSource,
    /positionsApi\s*\.modifyPosition|applyLocalStopPatch|clientModifiedAt/,
    'chart must not bypass the coordinator or paint proposed SL/TP as confirmed state',
  );
  assertSourceContains(
    sharedCommitSource,
    /pointSize: chartProtectionTickSize \?\? 0/,
    'existing-position validation must not invent point or minimum-distance metadata',
  );
  assertSourceContains(
    nativeSource,
    /const handleToggleChartTradeStopLevel = useCallback[\s\S]*commitChartTradeSheetStopsForPosition\(positionTarget, nextPrice, currentTp\)[\s\S]*commitChartTradeSheetStopsForPosition\(positionTarget, currentSl, nextPrice\)/,
    'top chart SL/TP sheet toggles must save enabled stop levels through the position modify path',
  );
  assertSourceContains(
    nativeSource,
    /msg\.type === 'CHART_TRADE_LINE_DRAG'[\s\S]*if \(!handleChartPositionStopDragMessage\(msg\)\) \{[\s\S]*handleChartTradePreviewDragMessage\(msg\)/,
    'position stop drags must be handled before falling back to the new-trade preview drag handler',
  );
  assertSourceContains(
    nativeSource,
    /allowPositionStopDragging: !existingPositionModifyBackendLocked/,
    'persisted position SL/TP lines must receive drag keys only when the active broker capability is enabled',
  );
});

test('chart modify selection stays ticket-durable and exposes coordinator reconciliation state', () => {
  assertSourceContains(
    nativeSource,
    /setSelectedChartPositionTicket\(String\(chartMatchingPositionCandidates\[0\]\.id\)\)/,
    'the sole same-symbol position must be materialized as an exact selected ticket',
  );
  const targetResolverStart = nativeSource.indexOf('const resolveSingleChartPositionStopTarget = useCallback');
  const targetResolverEnd = nativeSource.indexOf('const chartTradePositionStopTarget = useMemo', targetResolverStart);
  const targetResolverSource = nativeSource.slice(targetResolverStart, targetResolverEnd);
  assertSourceContains(
    targetResolverSource,
    /if \(selectedChartPosition\) \{\s*return selectedChartPosition;\s*\}[\s\S]*return null;/,
    'the resolver must use only the durable selected ticket',
  );
  assert.doesNotMatch(
    targetResolverSource,
    /chartMatchingPositionCandidates\[0\]/,
    'a same-symbol replacement must not silently become the selected ticket',
  );
  const missingTicketEffectStart = nativeSource.indexOf(
    '    if (!selectedChartPositionTicket) return;',
  );
  const missingTicketEffectEnd = nativeSource.indexOf(
    '  useEffect(() => {',
    missingTicketEffectStart + 1,
  );
  assert.notEqual(missingTicketEffectStart, -1, 'missing-ticket cleanup effect must exist');
  assert.notEqual(missingTicketEffectEnd, -1, 'missing-ticket cleanup effect boundary must exist');
  const missingTicketEffectSource = nativeSource.slice(
    missingTicketEffectStart,
    missingTicketEffectEnd,
  );
  assertSourceContains(
    missingTicketEffectSource,
    /setInvalidatedChartPositionSymbol\([\s\S]*chartMatchingPositionCandidates\.length > 0[\s\S]*normalizedChartPositionSymbol[\s\S]*: null[\s\S]*\)/,
    'a removed ticket must block same-symbol retargeting while another candidate remains',
  );
  assertSourceContains(
    missingTicketEffectSource,
    /setSelectedChartPositionTicket\(null\)[\s\S]*setChartTradeSlEnabled\(false\)[\s\S]*setChartTradeSlPrice\(0\)[\s\S]*setChartTradeTpEnabled\(false\)[\s\S]*setChartTradeTpPrice\(0\)[\s\S]*setChartStepperEditor\(null\)[\s\S]*setChartTradeSlLocked\(false\)[\s\S]*setChartTradeTpLocked\(false\)/,
    'SL/TP terminal removal must clear the selected ticket and every stale local chart draft',
  );
  assertSourceContains(
    nativeSource,
    /\}, \[activeChartSessionCacheNamespace, normalizedChartPositionSymbol\]\);/,
    'broker-session changes must clear chart SL/TP selection even when the symbol is unchanged',
  );
  assertSourceContains(
    nativeSource,
    /useModifyPositionTicketState\(\s*selectedChartPositionTicket,\s*\)/,
    'chart must subscribe to the same per-ticket coordinator state as the hosted screen',
  );
  assertSourceContains(
    nativeSource,
    /const hasChartExistingPositionProtectionContext =\s*chartMatchingPositionCandidates\.length > 0\s*\|\|\s*!!selectedChartPositionTicket\s*\|\|\s*invalidatedChartPositionSymbol === normalizedChartPositionSymbol;[\s\S]*const chartStopsTargetExistingPosition =\s*!chartDirectProtectionActive\s*&&\s*!isPendingChartOrderType\(chartTradeOrderType\)\s*&&\s*hasChartExistingPositionProtectionContext/,
    'direct Market Execution drafts must remain new-order protection even when same-symbol positions exist',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /modifyAttemptActive[\s\S]*modifyPhase === 'pending'[\s\S]*modifyPhase === 'reconciling' && modifyAttemptActive[\s\S]*modifyPhase === 'unknown'[\s\S]*modifyPhase === 'changed_elsewhere'/,
    'the chart sheet must visibly expose shared pending and reconciliation outcomes',
  );
  assert.doesNotMatch(
    chartTradeFeatureSource,
    /queuedLatestIntent|price_sl.*chartModifyTicketState|price_tp.*chartModifyTicketState/,
    'proposed coordinator intent must never be rendered as confirmed SL/TP',
  );
  assertSourceContains(
    nativeSource,
    /recordMarketDataEvent\('modify_position', \{\s*phase: 'chart_repaint_dispatched'[\s\S]*reconciliationSequence: modifyState\.latestEligibleSequence/,
    'eligible reconciled overlay injection must emit a chart repaint-dispatch timestamp',
  );
});

test('overlay bridge: draggable trade labels keep touch ownership through the full gesture', () => {
  assertSourceContains(source, /var getClampedRelativePoint = function\(clientX, clientY\)/, 'drag movement must clamp to the chart bounds instead of dropping updates');
  assertSourceContains(source, /beginTradeLineDragFromHit[\s\S]*return beginTradeLineDrag\(event, resolvedHit\.hit\)/, 'SL/TP line dragging must activate directly from the resolved pointer-down hit');
  assertSourceContains(source, /var onPointerDown = function\(event\)[\s\S]*resolveTradeLineDragHitFromEvent\(event\)[\s\S]*beginTradeLineDragFromHit\(event, tradeLineHit\)/, 'pointer-down must immediately start an SL/TP drag');
  assert.doesNotMatch(source, /CHART_TRADE_LINE_DRAG_HOLD_MS|pendingTradeLineHold/, 'SL/TP dragging must not retain the motion-cancelling hold gate');
  assertSourceContains(source, /beginTradeLineDrag[\s\S]*setPointerCapture\(event\.pointerId\)/, 'drag start must capture the active pointer');
  assertSourceContains(source, /beginTradeLineDrag[\s\S]*el\.style\.touchAction = 'none'/, 'drag start must disable competing touch panning');
  assertSourceContains(source, /continueTradeLineDrag[\s\S]*getTradeLineDragPoint\(pointFromEvent\.x, pointFromEvent\.y\)/, 'drag move must keep updating after the finger reaches chart edges');
  assertSourceContains(source, /finishTradeLineDrag[\s\S]*releasePointerCapture\(drag\.pointerId\)/, 'drag end must release the captured pointer');
  assertSourceContains(source, /var listenerOptions = \{ capture: true, passive: false \}/, 'chart touch listeners must be non-passive so preventDefault works on mobile');
});

test('overlay bridge: chart movement keeps DOM overlay rebuilds off the hot path', () => {
  const touchBody = extractFunctionBody(source, 'bindChartTapListeners');
  const verticalOverlayBody = extractFunctionBody(
    source,
    'refreshVerticalGestureOverlayPositions',
  );

  assertSourceContains(
    touchBody,
    /var renderVerticalPanRange = function\(nextRange\)[\s\S]*priceScaleApi\.setVisibleRange\(nextRange\)[\s\S]*refreshVerticalGestureOverlayPositions\(\)[\s\S]*var applyVerticalPanAt = function\(clientY\)[\s\S]*vertPanState\.latestRange = nextRange[\s\S]*renderVerticalPanRange\(nextRange\)/,
    'vertical chart movement must set the target price range during the active move while keeping trade labels and right-axis boxes attached',
  );
  assertSourceContains(
    verticalOverlayBody,
    /verticalGestureDomWorkPending = true[\s\S]*cancelOverlayDomRefreshFrame\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleTradeOverlayReposition\(\)/,
    'dense vertical gestures must coalesce existing axis labels and trade nodes into lightweight frame passes',
  );
  assert.doesNotMatch(
    verticalOverlayBody,
    /refreshOverlayDomLabels|applyOverlayPayload|createPriceLine/,
    'vertical pointermove must never rebuild all trade overlay DOM nodes',
  );
  assertSourceContains(
    touchBody,
    /var chartHeight =[\s\S]*pricePerPixel: rangeSpan \/ chartHeight/,
    'vertical chart movement must cache the pane price-per-pixel value at gesture start',
  );
  assert.doesNotMatch(
    touchBody,
    /VerticalPanVisualTransform|verticalPanVisualNodes/,
    'vertical chart movement must not use canvas transforms that can desync or blank the candle pane',
  );
  assertSourceContains(
    touchBody,
    /var continueVerticalPan = function\(clientY\)[\s\S]*Android WebView can postpone requestAnimationFrame callbacks[\s\S]*applyVerticalPanAt\(clientY\)/,
    'vertical chart movement must write the price range directly from touchmove so it follows the finger',
  );
  assert.doesNotMatch(
    touchBody,
    /VERT_PAN_SMOOTHING|stepVerticalPanAnimation|targetRange|verticalPanMoveFrame|pendingVerticalPanClientY/,
    'vertical chart movement must not use delayed smoothing or RAF batching that hides short MT5-style drags',
  );
  assertSourceContains(
    touchBody,
    /if \(dy > VERT_PAN_THRESHOLD && dy > dx \* 1\.2\) \{[\s\S]*beginVerticalPan\(vertPanPending\.startY\)[\s\S]*continueVerticalPan\(point\.y\)[\s\S]*stopChartEvent\(event\)/,
    'dominant vertical movement must keep ownership of the custom price-range pan',
  );
  assertSourceContains(
    touchBody,
    /isScaleGestureEvent\(event\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*return;/,
    'pinch and scale movement must stay on the lightweight right-scale refresh path',
  );
  assertSourceContains(
    touchBody,
    /if \(activeHorizontalScrollGesture\) \{[\s\S]*capture listener off the per-move hot path entirely[\s\S]*return;[\s\S]*if \(point && vertPanPending\) \{[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;[\s\S]*scheduleOverlayDomRefresh\(\);/,
    'classified horizontal movement must leave the capture hot path while pending movement defers full DOM overlays',
  );
  assertSourceContains(
    touchBody,
    /var endVerticalPan = function\(\)[\s\S]*scheduleOverlayDomRefresh\(\)/,
    'vertical chart movement must still settle full overlays when the finger lifts',
  );
  assertSourceContains(
    source,
    /var GESTURE_RIGHT_PRICE_SCALE_REFRESH_INTERVAL_MS = 16[\s\S]*function scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*GESTURE_RIGHT_PRICE_SCALE_REFRESH_INTERVAL_MS - \(now - lastGestureRightPriceScaleFallbackAt\)/,
    'gesture right-scale label refreshes must run at frame cadence after label DOM reuse',
  );
  assertSourceContains(
    source,
    /var rightPriceScaleFallbackLabelNodes = \[\][\s\S]*function renderFallbackRightPriceScaleLabels\(\)[\s\S]*var label = rightPriceScaleFallbackLabelNodes\[i\][\s\S]*rightPriceScaleFallbackLabelNodes\[i\] = label[\s\S]*unusedIndex = ticks\.length/,
    'right-scale fallback labels must be reused during vertical movement instead of rebuilt',
  );
  assertSourceContains(
    source,
    /function scheduleActiveScrollPriceScaleRecovery\(reason\)[\s\S]*if \(isHorizontalScrollMotionActive\(\)\) \{[\s\S]*touch momentum reaches the idle window[\s\S]*return;/,
    'horizontal price-scale recovery must defer through finger drag and kinetic scrolling',
  );
  assertSourceContains(
    source,
    /function scheduleMovingVerticalGridUpdate\(preferTransformOnly\)[\s\S]*isHorizontalScrollMotionActive\(\)[\s\S]*if \(shouldTransformOnly\) \{[\s\S]*updateMovingVerticalGridTransformOnly\(\)[\s\S]*return;[\s\S]*updateMovingVerticalGrid\(\);/,
    'horizontal movement must never fall through to a full grid recalculation in a kinetic frame',
  );
  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(range\)[\s\S]*var isLightweightHorizontalMotion = isHorizontalScrollMotionActive\(\);[\s\S]*scheduleMovingVerticalGridUpdate\(isLightweightHorizontalMotion\)[\s\S]*schedulePeriodSeparatorsUpdate\(isLightweightHorizontalMotion\)[\s\S]*if \(isLightweightHorizontalMotion\) \{[\s\S]*visibleRangeIdlePendingAfterGesture = true;[\s\S]*scheduleVisibleRangeIdleWork\(\)[\s\S]*return;[\s\S]*scheduleActiveScrollPriceScaleRecovery\('visible_range_active'\)/,
    'finger and kinetic visible-range changes must skip recovery, overlays, and history until idle',
  );
  assertSourceContains(
    source,
    /function finishHorizontalScrollGesture\(\)[\s\S]*visibleRangeIdlePendingAfterGesture = true;[\s\S]*scheduleVisibleRangeIdleWork\(\)[\s\S]*function scheduleVisibleRangeIdleWork\(\)[\s\S]*horizontalScrollMotionActive = false[\s\S]*scheduleMovingVerticalGridUpdate\(false\)[\s\S]*schedulePeriodSeparatorsUpdate\(false\)[\s\S]*scheduleActiveScrollPriceScaleRecovery\('visible_range_idle'\)[\s\S]*requestHistoryPaginationForVisibleRange/,
    'horizontal release must arm one deferred grid, separator, scale, overlay, and history settle after momentum',
  );
});

test('chart pending CTA submits the pending order and then exposes chart-side levels', () => {
  const handlerSource = source.slice(
    source.indexOf('const handleSubmitPendingTradeFromSheet = useCallback'),
    source.indexOf('const handleToggleChartTradeSheetMode', source.indexOf('const handleSubmitPendingTradeFromSheet = useCallback')),
  );

  assert.doesNotMatch(source, /Pending Order Preview/);
  assert.doesNotMatch(source, /Chart-side pending submission is still preview-only in this build/);
  assert.doesNotMatch(handlerSource, /Alert\.alert/);
  assertSourceContains(
    handlerSource,
    /if \(isPendingOrderTypeBackendLocked\(chartTradeOrderType\)\) \{\s*return;\s*\}/,
    'pending CTA must fail closed until backend readiness is explicitly enabled',
  );
  assertSourceContains(handlerSource, /ordersApi\.placePendingOrder\(payload\)/, 'pending CTA must submit to the pending-order API');
  assert.doesNotMatch(handlerSource, /Unsupported Order Type|not supported by the current trading API/);
  assertSourceContains(handlerSource, /price_sl: chartTradeSlPrice/, 'pending CTA must include enabled SL price');
  assertSourceContains(handlerSource, /price_tp: chartTradeTpPrice/, 'pending CTA must include enabled TP price');
  assertSourceContains(handlerSource, /stopLimitPrice: chartTradeStopLimitPrice/, 'pending CTA must include stop-limit price');
  assertSourceContains(handlerSource, /refetchOrders\(\)/, 'pending CTA must refresh orders so overlays can draw the new order');
  assertSourceContains(handlerSource, /snapTradeSheet\('collapsed'\)/, 'pending CTA must expose chart-side levels after submission');
  assert.doesNotMatch(handlerSource, /\|\|\s*isStopLimitChartOrder/);
});

test('chart market execution only submits SL and TP that target a new order', () => {
  const chartTradeResultSource = source.slice(
    source.indexOf('const handleChartTradeResult = useCallback'),
    source.indexOf('const [showSignalDetails', source.indexOf('const handleChartTradeResult = useCallback')),
  );
  const chartTradeExecutionResultSource = source.slice(
    source.indexOf('const handleChartTradeExecutionResult = useCallback'),
    source.indexOf('const isChartExpanded', source.indexOf('const handleChartTradeExecutionResult = useCallback')),
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /stopLossPrice=\{\s*!stopsTargetExistingPosition &&\s*!sheet\.newMarketOrderProtectionBackendLocked &&\s*sheet\.chartTradeSlEnabled\s*\? sheet\.chartTradeSlPrice\s*: undefined\s*\}/,
    'market buttons must receive SL only when the sheet levels target a new order and that capability is enabled',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /takeProfitPrice=\{\s*!stopsTargetExistingPosition &&\s*!sheet\.newMarketOrderProtectionBackendLocked &&\s*sheet\.chartTradeTpEnabled\s*\? sheet\.chartTradeTpPrice\s*: undefined\s*\}/,
    'market buttons must receive TP only when the sheet levels target a new order and that capability is enabled',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /pointSize=\{sheet\.chartProtectionTickSize \?\? 0\}/,
    'market protection validation must not receive a synthetic display point',
  );
  assertSourceContains(
    nativeSource,
    /const directMarketStopLossPrice =\s*chartDirectProtectionActive[\s\S]*const directMarketTakeProfitPrice =\s*chartDirectProtectionActive[\s\S]*<ChartTradeInlineFooter[\s\S]*stopLossPrice=\{directMarketStopLossPrice\}[\s\S]*takeProfitPrice=\{directMarketTakeProfitPrice\}[\s\S]*pointSize=\{chartProtectionTickSize \?\? 0\}/,
    'the normal Chart Market Execution footer must receive direct SL/TP guide prices while the sheet stays hidden',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /key=\{`chart-trade-footer-dock-\$\{sheet\.chartSymbol\}`\}[\s\S]*stopLossPrice=\{sheet\.directMarketStopLossPrice\}[\s\S]*takeProfitPrice=\{sheet\.directMarketTakeProfitPrice\}[\s\S]*pointSize=\{sheet\.chartProtectionTickSize \?\? 0\}/,
    'the floating Chart Market Execution dock must receive direct SL/TP guide prices',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /key=\{`chart-trade-inline-footer-\$\{chartSymbol\}`\}[\s\S]*stopLossPrice=\{stopLossPrice\}[\s\S]*takeProfitPrice=\{takeProfitPrice\}[\s\S]*pointSize=\{pointSize\}/,
    'the inline footer adapter must forward direct SL/TP guide prices to the execution buttons',
  );
  assertSourceContains(
    chartTradeButtonsFeatureSource,
    /useTradeHandler\(\{[\s\S]*stopLossPrice,[\s\S]*takeProfitPrice,[\s\S]*pointSize,/,
    'market button hook must receive SL/TP inputs',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /validateChartTradeProtectionLevels\(\{[\s\S]*side: action\.side,[\s\S]*entryPrice: action\.side === 'buy'[\s\S]*currentQuoteAvailability\.ask[\s\S]*currentQuoteAvailability\.bid/,
    'market submit must validate MT5-style SL/TP direction before sending',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /buildChartMarketOrderPayload\(\{[\s\S]*stopLossPrice: acceptedTrade\.stopLossPrice,[\s\S]*takeProfitPrice: acceptedTrade\.takeProfitPrice/,
    'immediate one-click market submit must include selected SL/TP prices',
  );
  assertSourceContains(
    chartTradeActionsSource,
    /price_sl: stopLossPrice[\s\S]*price_tp: takeProfitPrice/,
    'market payload builder must map selected levels to API price_sl and price_tp fields',
  );
  assertSourceContains(
    chartTradeResultSource,
    /if \(feedback\.type !== 'success'\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*return;[\s\S]*\}/,
    'chart rejected market submit must keep the detailed error feedback modal',
  );
  assertSourceContains(
    chartTradeResultSource,
    /if \(feedback\.type !== 'success'\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*return;[\s\S]*\}[\s\S]*if \(!suppressConfirmedReceipt\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*chartTradeResultRefreshScheduler\.schedule\([\s\S]*Promise\.allSettled\(\[[\s\S]*refetchClosedPositions\(\)[\s\S]*refetchOrders\(\)/,
    'chart success must suppress duplicate single receipts only for stacked fills and coalesce dependent query refreshes',
  );
  assert.doesNotMatch(
    chartTradeResultSource,
    /refreshPositions\(/,
    'chart success must not race the API-owned position reconciliation with an immediate full-ledger read',
  );
  assert.doesNotMatch(
    chartTradeResultSource,
    /refetchAccountSummary\(\)/,
    'chart success must not duplicate the orders-layer coalesced account-summary refresh',
  );
  assertSourceContains(
    chartTradeExecutionResultSource,
    /handleChartTradeResult\(feedback, suppressConfirmedReceipt\)[\s\S]*feedback\.type !== 'success'[\s\S]*!chartDirectProtectionActive[\s\S]*!feedback\.protectionDraftId[\s\S]*applyChartProtectionDraftExecution\(\{[\s\S]*draftId: feedback\.protectionDraftId,[\s\S]*executionConfirmed: feedback\.executionConfirmed === true/,
    'market execution must retain drafts unless the exact draft receives broker-confirmed evidence or a reconcilable ticket',
  );
  assertSourceContains(
    nativeSource,
    /if \(event\.executionConfirmed\) \{\s*clearChartDirectProtectionDraft\(event\.draftId\);[\s\S]*if \(!event\.ticket\) \{\s*return;/,
    'confirmation-pending feedback without an exact ticket must not clear the chart draft',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /pathname: '\/trade\/order-ticket'[\s\S]*params: \{[\s\S]*\.\.\.\(protectionDraftId \? \{ protectionDraftId \} : \{\}\)/,
    'one-click-off navigation must carry the exact chart protection draft token into Order Ticket',
  );
  assert.doesNotMatch(
    chartTradeHandlerSource,
    /tryBeginChartProtectionDraftSubmission|Order Already Submitted/,
    'one-click execution must not serialize rapid taps behind an in-flight protection draft',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /publishChartProtectionDraftSubmission\(acceptedTrade\.protectionDraftId\);[\s\S]*placeOrder\(payload/,
    'one-click execution must snapshot ticket structure at the actual POST start',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /\['rejected', 'failed', 'error'\]\.includes\(responseStatus\)[\s\S]*releaseChartProtectionDraftSubmission\(acceptedTrade\.protectionDraftId\)[\s\S]*return;/,
    'resolved broker rejections must release the protected draft instead of becoming confirmation-pending success',
  );
  assertSourceContains(
    orderTicketSource,
    /if \(!tryBeginChartProtectionDraftSubmission\(routeProtectionDraftId\)\)[\s\S]*publishChartProtectionDraftSubmission\(routeProtectionDraftId\);[\s\S]*const data = await ordersApi\.placeMarketOrder\(payload\)/,
    'Order Ticket must enforce single-flight and snapshot the chart draft immediately before its Market Execution POST',
  );
  assertSourceContains(
    nativeSource,
    /subscribeChartProtectionDraftSubmission\(captureChartProtectionDraftBaseline\)[\s\S]*const terminalTicketObserved = closedPositions\.some\([\s\S]*String\(position\.ticket\) === awaitingTicket[\s\S]*hasChartProtectionDraftReconciled\(\{[\s\S]*terminalTicketObserved/,
    'unconfirmed existing tickets must wait for changed structure or exact terminal history',
  );
  assertSourceContains(
    orderTicketSource,
    /publishChartProtectionDraftExecution\(\{[\s\S]*draftId: routeProtectionDraftId,[\s\S]*executionConfirmed: executionEvidence\.confirmed,[\s\S]*ticket: String\(positionTicket\)/,
    'Order Ticket must notify the originating chart draft after broker execution evidence is evaluated',
  );
  assert.doesNotMatch(chartTradeResultSource, /setChartTradeConfirmations/);
});

test('chart header: OHLC values use theme-aware neutral color plus fixed high low colors', () => {
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_NEUTRAL_DARK_COLOR = '#FFFFFF'/,
    'OHLC open and close must stay white in dark theme',
  );
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_NEUTRAL_LIGHT_COLOR = '#0F172A'/,
    'OHLC open and close must use readable dark text in light theme',
  );
  assertSourceContains(
    nativeSource,
    /const chartMetaNeutralColor = isDark \? CHART_OHLC_NEUTRAL_DARK_COLOR : CHART_OHLC_NEUTRAL_LIGHT_COLOR/,
    'native OHLC neutral color must switch with the app theme',
  );
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_HIGH_COLOR = GDark\.trading\.profit/,
    'OHLC high must use the positive blue theme color',
  );
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_LOW_COLOR = '#F23645'/,
    'OHLC low must use the fixed red market color',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'O', value: formatValue\(candle\?\.open\), color: neutralColor \}/,
    'O value must use the theme-aware neutral color',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'H', value: formatValue\(candle\?\.high\), color: isDark \? CHART_OHLC_HIGH_COLOR : GLight\.trading\.profit \}/,
    'H value must use theme-aware blue regardless of candle direction',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'L', value: formatValue\(candle\?\.low\), color: CHART_OHLC_LOW_COLOR \}/,
    'L value must stay red regardless of candle direction',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'C', value: formatValue\(candle\?\.close\), color: neutralColor \}/,
    'C value must use the theme-aware neutral color',
  );
  assertSourceContains(
    nativeSource,
    /neutralColor=\{chartMetaNeutralColor\}/,
    'the isolated OHLC row must receive the resolved theme-aware neutral color',
  );
  assertSourceContains(
    nativeSource,
    /\[valueStyle, textShadow, \{ color: item\.color \}\]/,
    'OHLC value rendering must use the per-item color',
  );
  assert.doesNotMatch(nativeSource, /styles\.symbolOhlcValue, \{ color: chartMetaIsUp \?/);
  assert.doesNotMatch(nativeSource, /chartMetaDirectionColor/);
  assertSourceContains(
    webSource,
    /const CHART_OHLC_NEUTRAL_DARK_COLOR = '#FFFFFF'/,
    'web OHLC open and close must stay white in dark theme',
  );
  assertSourceContains(
    webSource,
    /const CHART_OHLC_NEUTRAL_LIGHT_COLOR = '#0F172A'/,
    'web OHLC open and close must use readable dark text in light theme',
  );
  assertSourceContains(
    webSource,
    /const chartMetaNeutralColor = isDark \? CHART_OHLC_NEUTRAL_DARK_COLOR : CHART_OHLC_NEUTRAL_LIGHT_COLOR/,
    'web OHLC neutral color must switch with the app theme',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'O', value: formatChartValue\(chartMetaLastCandle\.open\), color: chartMetaNeutralColor \}/,
    'web O value must use the theme-aware neutral color',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'H', value: formatChartValue\(chartMetaLastCandle\.high\), color: isDark \? CHART_OHLC_HIGH_COLOR : GLight\.trading\.profit \}/,
    'web H value must stay green too',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'L', value: formatChartValue\(chartMetaLastCandle\.low\), color: CHART_OHLC_LOW_COLOR \}/,
    'web L value must stay red too',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'C', value: formatChartValue\(chartMetaLastCandle\.close\), color: chartMetaNeutralColor \}/,
    'web C value must use the theme-aware neutral color',
  );
  assertSourceContains(webSource, /\{ color: item\.color \}/, 'web OHLC value rendering must use the per-item color');
  assert.doesNotMatch(webSource, /chartMetaIsUp \? resolvedChartColors\.candlesUptrend/);
});
test('overlay bridge: repeated overlay sync clears previous lines before recreating', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');
  const clearBody = extractFunctionBody(source, 'clearOverlayPriceLines');

  assertSourceContains(body, /clearOverlayPriceLines\(\)/, 'overlay apply must clear previous lines first');
  assertSourceContains(body, /shouldCreateOverlayNativePriceLine\(ln\)/, 'overlay apply must skip DOM-owned trade lines before native creation');
  assertSourceContains(body, /series\.createPriceLine/, 'overlay apply must recreate price lines from payload');
  assertSourceContains(body, /lineVisible: ln\.labelPlacement === 'line' \? false : true/, 'native overlay lines must keep the previous visibility contract');
  assertSourceContains(clearBody, /series\.removePriceLine\(_positionLinesArr\[i\]\)/, 'clear must remove every previous price-line ref');
  assertSourceContains(clearBody, /_overlayPriceLinesByDragKey = Object\.create\(null\)/, 'clear must reset drag-key lookup');
});

test('overlay bridge: trade labels follow their price coordinate off screen', () => {
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels');
  const anchoredLineBody = extractFunctionBody(source, 'renderAnchoredTradeLine');
  assertSourceContains(
    anchoredLineBody,
    /line\.style\.transform = isOpenPositionOverlayLine\(item\) \? 'scaleY\(0\.5\)' : 'none'/,
    'only the open-position stroke becomes a hairline without scaling its labels',
  );
  const anchoredLaneBody = extractFunctionBody(source, 'resolveAnchoredOverlayLabelLane');
  const applyAnchoredLaneBody = extractFunctionBody(source, 'applyAnchoredOverlayLabelLane');
  const anchoredTopsBody = extractFunctionBody(source, 'resolveAnchoredOverlayLabelTops');
  const applyOverlayBody = extractFunctionBody(source, 'applyOverlayPayload');
  const shouldCreateNativeLineBody = extractFunctionBody(source, 'shouldCreateOverlayNativePriceLine');

  assert.doesNotMatch(
    source,
    /resolveAnchoredOverlayLabelBounds|resolveOverlayLabelBounds|OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING|OVERLAY_LABEL_TOP_SAFE_PADDING/,
    'trade labels must not keep stale top/bottom clamp helpers that pin off-screen prices inside the pane',
  );
  assertSourceContains(
    refreshBody,
    /anchoredLabels\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)/,
    'line-anchored open-position labels must be sorted for stable draw order',
  );
  assertSourceContains(
    refreshBody,
    /var desiredTop = Math\.round\(floatingLabels\[j\]\.y - OVERLAY_LABEL_HEIGHT \/ 2\)[\s\S]*tops\[j\] = desiredTop/,
    'floating order labels must use their real price coordinate instead of being clamped into the visible pane',
  );
  assertSourceContains(
    anchoredTopsBody,
    /var top = Math\.round\(item\.y - OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP\)[\s\S]*tops\[i\] = top/,
    'open-position labels must start from their real price coordinate',
  );
  assertSourceContains(
    anchoredTopsBody,
    /item\.paneVisible !== false[\s\S]*typeof item\.labelMinTop === 'number'[\s\S]*top = Math\.max\(top, Math\.round\(item\.labelMinTop\)\)/,
    'visible chart-trade draft labels may reserve the native ticker header without pinning off-screen persisted labels',
  );
  assertSourceContains(
    refreshBody,
    /var floatingTop = tops\[labelIndex\][\s\S]*renderLabel\(floatingItem, floatingTop,/,
    'floating labels must render from the unclamped top value',
  );
  assertSourceContains(
    refreshBody,
    /anchoredLabels\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)[\s\S]*var anchoredTops = resolveAnchoredOverlayLabelTops\(anchoredLabels\)/,
    'line-anchored labels must be price-sorted before vertical row spacing is resolved',
  );
  assertSourceContains(
    anchoredTopsBody,
    /var anchoredStep = Math\.max\([\s\S]*OVERLAY_LABEL_LINE_HEIGHT \+ OVERLAY_LABEL_LINE_GAP,[\s\S]*OVERLAY_POSITION_BOX_HEIGHT \+ resolvePositionBoxGap\(labels\.length\)[\s\S]*previousVisibleTop !== null[\s\S]*top = Math\.max\(top, previousVisibleTop \+ anchoredStep\)/,
    'crowded order and SL/TP rows must still clear both their text and right-axis price boxes',
  );
  assertSourceContains(
    anchoredTopsBody,
    /if \(!isOpenPositionOverlayLine\(item\) && item\.paneVisible !== false\) \{[\s\S]*previousVisibleTop = top;[\s\S]*\}[\s\S]*tops\[i\] = top/,
    'open-position rows must stay on their real price coordinate, and off-pane labels must not reserve space in the visible vertical list',
  );
  assertSourceContains(
    refreshBody,
    /if \(isOpenPositionBox\) \{[\s\S]*openPositionBoxes\.push\(positionBox\);[\s\S]*positionBoxes\.push\(positionBox\);[\s\S]*for \(var boxLayoutIndex[\s\S]*positionBoxes = openPositionBoxes\.concat\(positionBoxes\)/,
    'open-position right-axis boxes must bypass the stacked box layout and keep their real price row',
  );
  assert.doesNotMatch(
    source,
    /resolveAnchoredOverlayLabelLefts|doOverlayLabelBoxesOverlap|candidateLeft \+= laneWidth/,
    'open-position labels must never spread into horizontal collision lanes',
  );
  assertSourceContains(
    anchoredLaneBody,
    /var paneLeft =[\s\S]*var axisMetrics = resolveMarketPriceScaleAxisMetrics\(layer\)[\s\S]*axisMetrics\.axisLeft[\s\S]*var remainingWidth = Math\.max\(0, paneWidth - laneWidth\)[\s\S]*var desiredLeftInset = Math\.min\([\s\S]*OVERLAY_OPEN_POSITION_LABEL_MAX_LEFT[\s\S]*Math\.round\(paneWidth \* OVERLAY_OPEN_POSITION_LABEL_LEFT_RATIO\)[\s\S]*var maxLeftInset = Math\.max\(0, remainingWidth - OVERLAY_ANCHORED_LABEL_LEFT\)[\s\S]*leftBiased === true[\s\S]*Math\.min\(desiredLeftInset, maxLeftInset\)[\s\S]*remainingWidth \/ 2[\s\S]*left: Math\.round\(paneLeft \+ laneInset\)/,
    'open-position text must use an adaptive, bounded left lane while other anchored labels retain the centered pane lane',
  );
  assertSourceContains(
    applyAnchoredLaneBody,
    /label\.style\.left = Math\.round\(lane\.left\) \+ 'px'[\s\S]*label\.style\.width =[\s\S]*label\.style\.textAlign = 'center'/,
    'moving the fixed-width lane must preserve the centered Buy/Sell, lot, and P/L group layout',
  );
  assertSourceContains(
    refreshBody,
    /var openPositionLabelLane = resolveAnchoredOverlayLabelLane\(layer, true\)[\s\S]*isOpenPositionTradeLabel = isOpenPositionOverlayLine\(item\)[\s\S]*activeAnchoredLabelLane = isOpenPositionTradeLabel[\s\S]*applyAnchoredOverlayLabelLane\([\s\S]*activeAnchoredLabelLane/,
    'only open-position Buy/Sell, lot, and P/L rows must move into the left lane during full overlay rendering',
  );
  assertSourceContains(
    refreshBody,
    /openPositionRowYById\[anchoredRowItem\.id\] = resolveAnchoredOverlayRowY[\s\S]*renderAnchoredTradeLine\([\s\S]*openPositionRowYById\[anchoredItem\.id\][\s\S]*renderLabel\(anchoredItem, anchoredTop, 'label:anchored:' /,
    'each open-position label and connector line must use the same real-price row',
  );
  assertSourceContains(
    anchoredLineBody,
    /line\.style\.left = Math\.max\(0, Math\.round\(metrics\.leftAxisWidth \|\| 0\)\) \+ 'px'[\s\S]*line\.style\.width = paneWidth \+ 'px'/,
    'owned open-position dotted lines must draw as normal full-width horizontal chart lines',
  );
  assertSourceContains(
    applyOverlayBody,
    /if \(!shouldCreateOverlayNativePriceLine\(ln\)\) continue;/,
    'line-placement open trades must skip native price-line creation before the DOM overlay draws them',
  );
  assertSourceContains(
    shouldCreateNativeLineBody,
    /isTradeOverlayScaleLine\(line\)[\s\S]*return false;/,
    'account trade, order, SL/TP, and chart-trade preview lines must stay out of native price-line autoscale',
  );
  assertSourceContains(
    shouldCreateNativeLineBody,
    /line\.labelPlacement === 'line'[\s\S]*typeof line\.dragKey === 'string' && line\.dragKey[\s\S]*return false;/,
    'line-placement and draggable preview trades must not create hidden native price lines that can flatten candle autoscale',
  );
  assertSourceContains(
    refreshBody,
    /drawAnchoredTradeLine: ln\.labelPlacement === 'line'[\s\S]*lineStyle: typeof ln\.lineStyle === 'number' \? ln\.lineStyle : 0[\s\S]*lineWidth: typeof ln\.lineWidth === 'number' \? ln\.lineWidth : 1/,
    'only line-placement trade labels should draw the extra fixed dotted DOM line',
  );
  assertSourceContains(
    refreshBody,
    /label\.style\.textShadow = 'none'/,
    'line-anchored open-position labels must render without text shadow',
  );
  assertSourceContains(
    refreshBody,
    /renderAnchoredTradeLine\([\s\S]*isOpenPositionOverlayLine\(anchoredItem\)[\s\S]*openPositionRowYById\[anchoredItem\.id\]/,
    'open-position dotted lines must move to the same display row as their text',
  );
  assertSourceContains(
    refreshBody,
    /upsertOverlayDomNode\(layer, key[\s\S]*pruneOverlayDomNodes\(liveOverlayKeys\)/,
    'overlay DOM labels must update in place and never wipe the whole layer on quote ticks',
  );
  assert.doesNotMatch(
    refreshBody,
    /clearOverlayDomLabels\(\);\s*\n\s*if \(!series\)/,
    'overlay refresh must not blank the trade-line layer before painting when the series is healthy',
  );
  assert.doesNotMatch(refreshBody, /anchoredInitialBackIndex/);
  assert.doesNotMatch(refreshBody, /anchoredBounds|bounds\.minTop|bounds\.maxTop/);
  assert.doesNotMatch(refreshBody, /nudgeAnchoredLabelsAwayFrom/);
  assert.doesNotMatch(refreshBody, /label\.style\.textShadow = '0 1px 1px/);
  assert.doesNotMatch(refreshBody, /label\.style\.background/);
  assert.doesNotMatch(refreshBody, /label\.style\.boxShadow/);
});

test('overlay bridge: right-axis trade price boxes keep close entries visible', () => {
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels');
  const priceBoxEligibilityBody = extractFunctionBody(source, 'shouldRenderRightAxisTradePriceBox');

  assertSourceContains(
    priceBoxEligibilityBody,
    /line\.id === 'chart-trade-sl-preview' \|\| line\.id === 'chart-trade-tp-preview'/,
    'direct Market Execution SL and TP drafts must render an MT5-style right-axis price marker',
  );
  assert.doesNotMatch(
    priceBoxEligibilityBody,
    /startsWith\('chart-trade-'\)|\^chart-trade-/,
    'locked pending-order previews must not inherit the Market Execution right-axis marker',
  );
  assertSourceContains(
    refreshBody,
    /if \(!shouldRenderRightAxisTradePriceBox\(pln\)\) continue/,
    'right-axis price boxes must use the explicit trade-level eligibility gate',
  );

  assertSourceContains(
    refreshBody,
    /var seenBoxLevels = Object\.create\(null\)[\s\S]*var openPositionBoxes = \[\]/,
    'non-position levels may dedupe while open positions retain a dedicated box collection',
  );
  assertSourceContains(
    refreshBody,
    /var isOpenPositionBox = isOpenPositionOverlayLine\(pln\)[\s\S]*if \(!isOpenPositionBox && seenBoxLevels\[boxKey\]\) continue[\s\S]*if \(!isOpenPositionBox\) \{[\s\S]*seenBoxLevels\[boxKey\] = true/,
    'same-price open positions must bypass displayed-price box deduplication',
  );
  assertSourceContains(
    refreshBody,
    /positionBoxes\.sort\(function\(left, right\) \{ return left\.desiredTop - right\.desiredTop; \}\)[\s\S]*var positionBoxStep = POSITION_BOX_HEIGHT \+ resolvePositionBoxGap\(positionBoxes\.length\)[\s\S]*positionBoxes\[boxLayoutIndex\]\.top/,
    'right-axis trade boxes must use a wider dense-trade gap so nearby entry markers do not cover each other',
  );
  assertSourceContains(
    refreshBody,
    /var sharedRowY = isOpenPositionBox[\s\S]*openPositionRowYById\[pln\.id\][\s\S]*var desiredBoxTop = Math\.round\(sharedRowY - POSITION_BOX_HEIGHT \/ 2\)/,
    'each open-position price box must use the same row center as its label and connector line',
  );
  assertSourceContains(
    refreshBody,
    /if \(isOpenPositionBox\) \{[\s\S]*openPositionBoxes\.push\(positionBox\)[\s\S]*positionBoxes = openPositionBoxes\.concat\(positionBoxes\)/,
    'every open position must keep its own row-aligned right-axis price box',
  );
  assertSourceContains(
    refreshBody,
    /boxEl\.style\.left = \(positionBoxMetrics \? positionBoxMetrics\.axisLeft[\s\S]*boxEl\.style\.width = \(positionBoxMetrics \? positionBoxMetrics\.axisWidth[\s\S]*boxEl\.style\.background = '#FFFFFF'[\s\S]*boxEl\.style\.color = box\.color[\s\S]*boxEl\.style\.border = '1px solid ' \+ box\.color[\s\S]*boxEl\.style\.padding = '0 2px'[\s\S]*boxEl\.style\.textAlign = 'right'[\s\S]*boxEl\.style\.zIndex = '16'/,
    'right-axis trade boxes must stay pinned to the measured scale with compact MT5 white-fill colored-outline styling',
  );
  assertSourceContains(
    refreshBody,
    /var boxNodeKey = 'box:' \+ \(box\.id \|\| box\.text\)/,
    'same-price open-position boxes must remain keyed by their unique trade IDs',
  );
  assert.doesNotMatch(refreshBody, /positionBoxMinTop|positionBoxMaxTop|Math\.max\(positionBoxMinTop/);
  assert.doesNotMatch(refreshBody, /boxEl\.style\.right = '2px'/);
  assert.doesNotMatch(refreshBody, /levelScale \* 1e-4/);
});
test('overlay bridge: trade overlays stay out of price-scale autoscale', () => {
  const autoscaleBody = extractFunctionBody(source, 'buildOverlayAwareAutoscaleInfo');
  const visibleRangeBody = extractFunctionBody(source, 'resolvePriceRangeFromVisibleData');
  const healthBody = extractFunctionBody(source, 'healCollapsedPriceScaleRange');
  const setOverlayBody = extractFunctionBody(source, 'setChartOverlays');

  assertSourceContains(
    autoscaleBody,
    /resolveVisibleCandleDataPriceRange\(\)[\s\S]*isValidPriceRange\(visibleCandleRange\)[\s\S]*expandPriceRangeForMarketPriceBadges\(baseRange\)/,
    'series autoscale must start from visible backend candles and only add market price badges',
  );
  assert.doesNotMatch(autoscaleBody, /expandPriceRangeForTradeOverlays/);
  assertSourceContains(
    source,
    /var PRICE_SCALE_CANDLE_COMPRESSION_SPAN_MULTIPLE = 6/,
    'candle compression health recovery needs a mobile-visible span threshold for XAUUSD-style scale stretching',
  );
  assertSourceContains(
    source,
    /\^\(open-\|order-entry-\|order-stop-limit-\|order-sl-\|order-tp-\|sl-\|tp-\|chart-trade-\)/,
    'account trade overlays and draggable chart-trade preview lines must be recognized before native price-line creation',
  );
  assertSourceContains(
    visibleRangeBody,
    /expandPriceRangeForMarketPriceBadges\(robustRange\)/,
    'visible price range recovery should keep market badges visible without adding trade overlays',
  );
  assert.doesNotMatch(visibleRangeBody, /expandPriceRangeForTradeOverlays/);
  assert.doesNotMatch(healthBody, /tradeOverlaysOutOfRange|rangeContainsTradeOverlays/);
  assertSourceContains(
    healthBody,
    /var candleSpan = getPriceRangeSpan\(candleDataRange\)[\s\S]*scaleSpan > candleSpan \* PRICE_SCALE_CANDLE_COMPRESSION_SPAN_MULTIPLE[\s\S]*candleScaleTooWide/,
    'price-scale health recovery must reset a wide axis when candle bodies are visibly compressed by far XAUUSD levels',
  );
  assert.doesNotMatch(
    source,
    /function shouldResetManualVerticalPanForHealth/,
    'no health or context reason may reclaim a user-owned MT5-style price window',
  );
  assertSourceContains(
    healthBody,
    /void allowManualReset[\s\S]*verticalPricePanGestureActive \|\|[\s\S]*isManualVerticalPanRangePreserved\(\) \|\|[\s\S]*isManualVerticalPanRangeLocked\(\) \|\|[\s\S]*manualPriceScaleRangeActive[\s\S]*return;/,
    'price-scale health recovery must return before fitting candles whenever manual ownership is active',
  );
  assertSourceContains(
    setOverlayBody,
    /applyOverlayPayload\(_overlayPayload\)[\s\S]*schedulePriceScaleHealthCheck\('overlay_update', false, 1\)/,
    'live overlay updates must apply trade lines without re-fitting the candle scale (full recovery caused horizontal blink)',
  );
  assert.doesNotMatch(
    setOverlayBody,
    /scheduleOverlayVisibleCandleScaleRecovery\('overlay_update'\)/,
    'routine setChartOverlays must not re-center the visible candle scale on every trade/P-L push',
  );
  assertSourceContains(
    source,
    /function recoverOverlayVisibleCandleScale\(reason\)[\s\S]*isManualVerticalPanRangePreserved\(\) \|\|[\s\S]*isManualVerticalPanRangeLocked\(\)[\s\S]*resolveVisibleCandleDataPriceRange\(\)[\s\S]*expandPriceRangeForMarketPriceBadges\(candleRange\)[\s\S]*setRecoveredRightPriceRange\(visibleRange\)/,
    'overlay scale recovery must respect a user-owned vertical pan lock and derive the visible range from backend candles without including trade overlays',
  );
  assertSourceContains(
    source,
    /autoscaleInfoProvider: buildOverlayAwareAutoscaleInfo/,
    'every chart series type must use the overlay-aware autoscale provider',
  );
});

test('chart preferences exposes persistent show-on-chart filters', () => {
  // The "Show on chart" section exposes buy/sell visibility, while the chart display
  // trade-level toggle owns the same persisted SL/TP visibility flag.
  assert.match(chartSettingsScreenSource, /CHART_TRADE_VISIBILITY_ITEMS = CHART_SHOW_ON_CHART_ITEMS\.filter/);
  assert.match(chartSettingsScreenSource, /item\.key !== 'slTpLevels'/);
  assert.match(chartSettingsScreenSource, /CHART_TRADE_VISIBILITY_ITEMS\.map/);
  assert.match(chartSettingsScreenSource, /showTradeLevels: 'slTpLevels'/);
  assert.match(chartSettingsScreenSource, /setChartShowOnChartItem\(linkedShowOnChartKey, value\)/);
  assert.match(chartSettingsScreenSource, /setChartShowOnChartItem\(key, value\)/);
  assert.match(chartSettingsScreenSource, /SHOW ON CHART/);
  assert.match(chartSettingsScreenSource, /buyTrade: 'trending-up-outline'/);
  assert.match(chartSettingsScreenSource, /sellTrade: 'trending-down-outline'/);
  assert.match(chartSettingsScreenSource, /slTpLevels: 'shield-checkmark-outline'/);
  assert.match(chartShowOnChartSource, /SL\/TP levels/);
  assert.match(chartShowOnChartSource, /Show Stop Loss and Take Profit values on the chart/);
  assert.match(chartSettingsScreenSource, /pointerEvents="none"/);
});

test('chart preferences exposes MT5 one-click panel bottom placement toggle', () => {
  assert.match(chartSettingsScreenSource, /chartOneClickPanelAtBottom/);
  assert.match(chartSettingsScreenSource, /setChartOneClickPanelAtBottom/);
  assert.match(chartSettingsScreenSource, /One Click panel at the bottom/);
  assert.match(chartSettingsScreenSource, /Show one click trading panel at the bottom of the chart/);
});

test('chart preferences left swipe returns to the chart screen without stealing vertical scroll', () => {
  assert.match(chartSettingsScreenSource, /PanResponder\.create/);
  assert.match(chartSettingsScreenSource, /CHART_SETTINGS_LEFT_SWIPE_NAVIGATE_DISTANCE/);
  assert.match(
    chartSettingsScreenSource,
    /dx < 0[\s\S]*horizontalDistance >= CHART_SETTINGS_LEFT_SWIPE_CLAIM_DISTANCE[\s\S]*horizontalDistance > verticalDistance \* CHART_SETTINGS_HORIZONTAL_SWIPE_RATIO/,
  );
  assert.match(chartSettingsScreenSource, /safeRouterBack\(router, '\/\(tabs\)\/chart'\)/);
  assert.match(chartSettingsScreenSource, /\{\.\.\.chartReturnSwipePanResponder\.panHandlers\}/);
});

test('overlay payload: duplicate position inputs produce unique line ids', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [
      {
        id: 'same-ticket',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.105,
        currentPrice: 1.107,
        pnl: 2,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.1,
        tp: 1.11,
      },
      {
        id: 'same-ticket',
        symbol: 'EURUSDm',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.105,
        currentPrice: 1.107,
        pnl: 2,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.1,
        tp: 1.11,
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: { buyTrade: true, sellTrade: true, slTpLevels: true },
  });

  const ids = payload.priceLines.map((line: any) => line.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), ['open-same-ticket', 'sl-same-ticket', 'tp-same-ticket'].sort());
});

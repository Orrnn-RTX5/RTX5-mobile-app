import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const chartDirectory = path.resolve(__dirname, '..');
const screenSource = readFileSync(path.join(chartDirectory, 'ChartScreen.native.tsx'), 'utf8');
const controllerSource = readFileSync(path.join(chartDirectory, 'useChartWindowsFeature.ts'), 'utf8');
const layoutSource = readFileSync(path.join(__dirname, 'ChartWindowsLayout.tsx'), 'utf8');
const webViewHtmlSource = readFileSync(
  path.join(chartDirectory, 'rendering', 'ChartWebViewHtml.ts'),
  'utf8',
);

test('chart-window feature logic stays outside the large ChartScreen', () => {
  assert.match(controllerSource, /export function useChartWindowsFeature/);
  assert.match(layoutSource, /export const ChartWindowsLayout/);
  assert.match(screenSource, /from '.\/useChartWindowsFeature'/);
  assert.match(screenSource, /from '.\/components\/ChartWindowsLayout'/);
  assert.match(screenSource, /<ChartWindowsLayout/);
  assert.match(screenSource, /<ChartWindowManagerOverlay/);
  assert.match(screenSource, /onOpenChartWindows=\{handleOpenChartWindows\}/);
});

test('the full native chart retains one stable engine key during pane switches', () => {
  assert.match(layoutSource, /key="chart-window-active-engine"/);
  assert.match(layoutSource, /key="chart-window-auxiliary-engine"/);
  assert.match(layoutSource, /column-reverse/);
  assert.match(layoutSource, /row-reverse/);
  assert.doesNotMatch(layoutSource, /state\.panes\.map\([\s\S]*children/);
});

test('divided panes preserve their layout without blue selection frames', () => {
  const auxiliarySource = readFileSync(
    path.join(__dirname, 'AuxiliaryChartPane.tsx'),
    'utf8',
  );

  assert.match(layoutSource, /rendersAuxiliaryPane && styles\.transparentSplitFrame/);
  assert.match(layoutSource, /transparentSplitFrame:\s*\{[\s\S]*borderColor: 'transparent'/);
  assert.doesNotMatch(layoutSource, /borderColor: theme\.accent/);
  assert.match(auxiliarySource, /borderColor: 'transparent'/);
  assert.doesNotMatch(auxiliarySource, /active \? theme\.accent/);
  assert.doesNotMatch(auxiliarySource, /activeDot/);
});

test('reversed stacked windows retain the toolbar boundary above the auxiliary pane', () => {
  assert.match(
    layoutSource,
    /const auxiliaryPaneTouchesToolbar =[\s\S]*rendersAuxiliaryPane[\s\S]*state\.layout === 'horizontal'[\s\S]*activeIndex > 0/,
  );
  assert.match(
    layoutSource,
    /\{auxiliaryPaneTouchesToolbar \? \([\s\S]*testID="chart-window-toolbar-separator"[\s\S]*GDark\.borderMedium : GLight\.borderMedium/,
  );
  assert.match(
    layoutSource,
    /toolbarBoundarySeparator:\s*\{[\s\S]*position: 'absolute',[\s\S]*top: 0,[\s\S]*left: 0,[\s\S]*right: 0,[\s\S]*height: 1/,
  );
});

test('fullscreen can maximize only the explicitly targeted production pane', () => {
  assert.match(layoutSource, /showOnlyActivePane\?: boolean/);
  assert.match(layoutSource, /const rendersAuxiliaryPane = isSplit && !showOnlyActivePane/);
  assert.match(layoutSource, /\{rendersAuxiliaryPane \? auxiliaryChart : null\}/);
  assert.match(
    layoutSource,
    /rendersAuxiliaryPane \? resolveDirection\(state, activeIndex\) : 'column'/,
  );
  assert.match(layoutSource, /isScreenFocused=\{isScreenFocused && rendersAuxiliaryPane\}/);
});

test('pane handoff is confirmed without a timeout that can corrupt saved context', () => {
  assert.match(controllerSource, /targetConfirmed/);
  assert.match(controllerSource, /onCancelPendingContextRef\.current\(\)/);
  assert.doesNotMatch(controllerSource, /setTimeout/);
  assert.doesNotMatch(controllerSource, /CHART_WINDOW_CONTEXT_SWITCH_TIMEOUT/);
});

test('each auxiliary window receives its own symbol timeframe and trade row', () => {
  assert.match(layoutSource, /symbol=\{auxiliaryPane\.symbol\}/);
  assert.match(layoutSource, /timeframe=\{auxiliaryPane\.timeframe\}/);
  assert.match(
    layoutSource,
    /showTradeRow=\{[\s\S]*auxiliaryVisualPreferences\?\.chartDisplay\.showQuickTradingButtons[\s\S]*\?\? showTradeRow/,
  );
  assert.match(layoutSource, /visualPreferences=\{auxiliaryVisualPreferences\}/);
  assert.match(layoutSource, /renderTradeRow=\{renderAuxiliaryTradeRow\}/);
  assert.match(layoutSource, /onSymbolPress=\{\(\) => onOpenPaneSymbolPicker\?\.\(auxiliaryPane\.id\)\}/);
  assert.match(layoutSource, /<ChartWindowTradeRow/);
  assert.match(
    layoutSource,
    /resolveExecutionOwnership=\{resolveAuxiliaryExecutionOwnership\}/,
  );
  assert.doesNotMatch(layoutSource, /onSell=\{\(\) => onSelectPane/);
  assert.doesNotMatch(layoutSource, /onBuy=\{\(\) => onSelectPane/);
});

test('the layout forwards a measured frame with the auxiliary pane owner', () => {
  assert.match(layoutSource, /export type ChartWindowPaneFrame/);
  assert.match(layoutSource, /onAuxiliaryPaneFrameChange\?:/);
  assert.match(
    layoutSource,
    /onAuxiliaryPaneFrameChange\?\.\(\{ paneId: measuredPaneId, \.\.\.frame \}\)/,
  );
  assert.match(
    layoutSource,
    /onChartSurfaceFrameChange=\{handleAuxiliaryChartSurfaceFrameChange\}/,
  );
  assert.match(screenSource, /onAuxiliaryPaneFrameChange=\{setAuxiliaryChartPaneViewport\}/);
});

test('double-tapping either divided pane opens the radial menu for its confirmed context', () => {
  assert.match(layoutSource, /const handleAuxiliaryDoubleTap = useCallback/);
  assert.match(
    layoutSource,
    /onOpenPaneRadialMenu\(createChartWindowRadialMenuRequest\(currentPane, gesture\)\)/,
  );
  assert.match(layoutSource, /onDoublePress=\{handleAuxiliaryDoubleTap\}/);
  assert.match(screenSource, /chartWindows\.selectPaneFromTap\(request\.paneId, \(confirmedPane, confirmedContext\) =>/);
  assert.match(screenSource, /isChartWindowRadialMenuRequestConfirmed\([\s\S]*confirmedPane,[\s\S]*confirmedContext/);
  assert.match(screenSource, /request\.gesture\.ownerCredentialScopeKey !== getActiveBrokerCredentialScopeKey\(\)/);
  assert.match(screenSource, /cancelPendingChartWindowRadialMenu\(pending\.token\)/);
  assert.match(screenSource, /mapChartWindowGestureToMenuAnchor\([\s\S]*pending\.request\.gesture,[\s\S]*nextBounds/);
  assert.match(screenSource, /onOpenPaneRadialMenu=\{handleOpenChartWindowPaneRadialMenu\}/);
});

test('the full chart uses double-tap radial only while divided and keeps normal autoscale otherwise', () => {
  assert.match(webViewHtmlSource, /function setChartWindowSplitMode\(enabled\)/);
  assert.match(webViewHtmlSource, /type: 'CHART_DOUBLE_TAP'/);
  assert.match(webViewHtmlSource, /dataContextSig: lastInitDataContextSig \|\| ''/);
  assert.match(webViewHtmlSource, /previousTap\.dataContextSig === lastInitDataContextSig/);
  assert.match(webViewHtmlSource, /previousTap\.splitModeRevision === chartWindowSplitModeRevision/);
  assert.match(
    webViewHtmlSource,
    /if \(chartWindowSplitMode\) \{[\s\S]*emitChartDoubleTapAtPoint\(point\.x, point\.y\);[\s\S]*\} else \{[\s\S]*resetAutoScale\(\)/,
  );
  assert.match(screenSource, /typeof setChartWindowSplitMode === 'function'/);
  assert.match(screenSource, /msg\.dataContextSig !== chartDataContextSigRef\.current/);
  assert.match(
    screenSource,
    /msg\.type === 'CHART_TAP'[\s\S]*if \(chartWindows\.isSplit\) \{[\s\S]*scheduleFullPaneSelection\(msg\.dataContextSig\);[\s\S]*return;[\s\S]*msg\.type === 'CHART_DOUBLE_TAP'[\s\S]*cancelPendingFullPaneSelection\(\)/,
  );
  assert.match(
    screenSource,
    /CHART_WINDOW_FULL_PANE_SINGLE_TAP_DELAY_MS = 430[\s\S]*chartWindows\.claimToolbarTarget\(expectedPaneId\)[\s\S]*handleSelectChartWindowPane\(expectedPaneId\)/,
  );
  assert.match(
    screenSource,
    /msg\.type === 'CHART_DOUBLE_TAP'[\s\S]*cancelPendingFullPaneSelection\(\);[\s\S]*chartWindows\.claimToolbarTarget\([\s\S]*chartWindowsStateRef\.current\.activePaneId/,
    'full-pane radial actions must claim the same ownership as auxiliary radial actions',
  );
  assert.match(
    screenSource,
    /handleChartTapMenuDismiss[\s\S]*!chartWindowSplitModeRef\.current[\s\S]*openDrawingQuickActionsSheet\(\)/,
  );
});

test('pointer-down ownership covers both divided window shells before tap confirmation', () => {
  assert.match(layoutSource, /onTouchStart=\{handleActivePaneTouchStart\}/);
  assert.match(layoutSource, /onPaneTouchStart=\{handleAuxiliaryPaneTouchStart\}/);
  assert.match(layoutSource, /onTapIntent=\{handleAuxiliaryPaneTouchStart\}/);
  assert.match(screenSource, /onClaimPane=\{chartWindows\.claimToolbarTarget\}/);
});

test('secondary trade ownership requires immediate route focus and uncovered authentication without rerendering the heavy screen', () => {
  assert.match(screenSource, /const immediateFocusRef = useRef\(isScreenFocused && marketDemandAllowed\)/);
  assert.match(screenSource, /immediateFocusRef\.current = isScreenFocused && marketDemandAllowed/);
  assert.match(screenSource, /isTradeExecutionFocused=\{isTradeExecutionFocused\}/);
  assert.match(layoutSource, /focusResolver\(\) === true/);
  assert.match(layoutSource, /if \(!routeFocused \|\| !context\.paneId\) return false/);
});

test('auxiliary quote cadence cannot recreate the production trade-row ownership callback', () => {
  const tradeRowSource = readFileSync(
    path.join(__dirname, 'ChartWindowTradeRow.tsx'),
    'utf8',
  );

  assert.match(
    layoutSource,
    /const resolveAuxiliaryExecutionOwnership = useCallback\([\s\S]*\}, \[\]\);/,
  );
  assert.match(layoutSource, /tradeExecutionFocusResolverRef\.current = isTradeExecutionFocused/);
  assert.doesNotMatch(layoutSource, /const isExecutionOwner = \(\) =>/);
  assert.match(
    tradeRowSource,
    /const isExecutionOwner = useCallback\([\s\S]*resolveExecutionOwnership\(context\)[\s\S]*\[context, resolveExecutionOwnership\]/,
  );
  assert.match(tradeRowSource, /isSymbolExecutionOwner=\{isExecutionOwner\}/);
});

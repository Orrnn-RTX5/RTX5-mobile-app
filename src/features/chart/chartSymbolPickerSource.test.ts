import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('chart symbol pickers share the broker catalog and repair unavailable saved selections', () => {
  for (const sourcePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
  ]) {
    const source = readSource(sourcePath);

    assert.doesNotMatch(source, /const\s+CHART_SYMBOLS\s*=/, sourcePath);
    assert.doesNotMatch(source, /apiSymbols\.length\s*>\s*0\s*\?\s*apiSymbols\s*:/, sourcePath);
    assert.match(source, /import \{ buildAvailableChartSymbols, resolveBrokerChartSymbol \} from '\.\/chartBrokerSymbols'/, sourcePath);
    assert.match(source, /const\s+availableSymbols\s*=\s*useMemo\([\s\S]*buildAvailableChartSymbols\(chartSymbol, apiSymbols(?:Data)?\)/, sourcePath);
    assert.match(source, /const nextSymbol = resolveBrokerChartSymbol\(chartSymbol, apiSymbols(?:Data)?\)/, sourcePath);
    assert.match(source, /subtitle:\s*resolveChartSymbolFullName\(sym\)/, sourcePath);
    assert.match(source, /resolveChartSymbolCategory\(chartSymbol\)/, sourcePath);
    assert.doesNotMatch(source, /setChartSymbol\(apiSymbols\[0\]\)/, sourcePath);
    assert.doesNotMatch(source, /symbolCategory\s*=\s*SYMBOL_CATEGORY\[baseSymbol\]\s*\?\?\s*'FX'/, sourcePath);
  }
});

test('symbol picker stays fixed when the search keyboard opens (no focus-time jump)', () => {
  // Regression guard for the search-focus "jump": the symbol picker must opt
  // into keepFullHeightOnKeyboard, and the shared ActionSheet must honour it
  // cross-platform — (a) on Android by pinning the host to the full screen
  // height so the bottom-anchored sheet never rides the shrinking window up, and
  // (b) on iOS by disabling the KeyboardAvoidingView so it stops padding the
  // bottom-anchored sheet up. If any link in this chain is removed the jump returns.
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const uiStateSource = readSource('src/state/uiState.ts');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');
  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');

  // 1) Symbol picker opts in (and no longer relies on the old 'resize' avoidance).
  assert.match(chartSource, /title: t\('Select Symbol'\)[\s\S]*keepFullHeightOnKeyboard:\s*true/);
  assert.doesNotMatch(
    chartSource,
    /title: t\('Select Symbol'\)[\s\S]*androidKeyboardAvoidance:[\s\S]*actions: symbolPickerActions/,
  );

  // 2) Config type + global host passthrough exist.
  assert.match(uiStateSource, /keepFullHeightOnKeyboard\?:\s*boolean/);
  assert.match(tabsLayoutSource, /keepFullHeightOnKeyboard=\{activeConfig\?\.keepFullHeightOnKeyboard\}/);

  // 3) ActionSheet honours the flag cross-platform. The flag itself is no longer
  //    android-gated (it now also drives the iOS path).
  assert.match(
    actionSheetSource,
    /const keepFullHeightSheet\s*=\s*activeSearchable && activeKeepFullHeightOnKeyboard;/,
  );
  //    Android: avoidance math is opted out AND the host is pinned to the full
  //    (stable) screen height, top-anchored, so it cannot rise.
  assert.match(
    actionSheetSource,
    /const androidSearchableSheet\s*=\s*\n?\s*Platform\.OS === 'android' && activeSearchable && !keepFullHeightSheet;/,
  );
  assert.match(
    actionSheetSource,
    /keepFullHeightSheet\s*\n?\s*\?\s*\{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: screenHeight \}/,
  );
  //    iOS: stay-still and non-searchable sheets bypass KeyboardAvoidingView
  //    entirely, so it cannot pad the bottom-anchored sheet up. Searchable
  //    sheets that do need avoidance keep the dedicated iOS host.
  assert.match(
    actionSheetSource,
    /const iosKeyboardAvoidanceEnabled\s*=\s*\n?\s*Platform\.OS === 'ios' && activeSearchable && !keepFullHeightSheet;/,
  );
  assert.match(actionSheetSource, /\{iosKeyboardAvoidanceEnabled \? \(\s*<KeyboardAvoidingView/);
  assert.match(actionSheetSource, /<KeyboardAvoidingView[\s\S]*behavior="padding"[\s\S]*enabled[\s\S]*style=\{styles\.sheetHost\}/);
  assert.doesNotMatch(actionSheetSource, /enabled=\{!keepFullHeightSheet\}/);

  // 4) The chart must not run its own keyboard avoidance for a sheet's keyboard.
  assert.match(
    chartSource,
    /const actionSheetOwnsKeyboard\s*=[\s\S]*ui\.actionSheet !== null[\s\S]*scopedActionSheets\[ui\.actionSheetScope\] !== null[\s\S]*if \(actionSheetOwnsKeyboard\) \{\s*\n\s*return;/,
  );
});

test('market symbol API cache uses the immutable active-session namespace and parses full instrument payloads', () => {
  const querySource = readSource('src/query/market.ts');
  const extractorSource = readSource('src/domain/marketSymbols.ts');

  assert.match(querySource, /useActiveBrokerQuerySession/);
  assert.match(querySource, /getSessionQueryCacheNamespace/);
  assert.match(querySource, /const authenticatedCacheNamespace = getSessionQueryCacheNamespace\(session\)/);
  assert.match(
    querySource,
    /const isPublicDemoMarket = isOrrnnDemoPublicMarketSelection\(\{[\s\S]*brokerId: selectedBrokerId,[\s\S]*isLoggedIn,[\s\S]*\}\)/,
  );
  assert.match(querySource, /const cacheNamespace = isPublicDemoMarket[\s\S]*\? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE[\s\S]*: authenticatedCacheNamespace/);
  assert.match(querySource, /const isEnabled = enabled && \(isPublicDemoMarket \|\| Boolean\(session\)\)/);
  assert.match(querySource, /queryKey:\s*\['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'\]/);
  assert.match(querySource, /staleTime:\s*1000 \* 60 \* 5/);
  assert.match(querySource, /if \(isPublicDemoMarket\) \{[\s\S]*getOrrnnDemoPublicMarketCatalog\(\)[\s\S]*return catalog\.symbols/);
  assert.match(querySource, /commitApiJson\(result, authenticatedCacheNamespace, \(data\) => \{/);
  assert.match(querySource, /primeInstrumentMetaCacheFromCatalogPayload\(data, authenticatedCacheNamespace\)/);
  assert.doesNotMatch(querySource, /accountScope/);
  assert.match(extractorSource, /'instruments'[\s\S]*'symbols'[\s\S]*'data'[\s\S]*'items'[\s\S]*'results'[\s\S]*'records'/);
  assert.match(extractorSource, /'symbol'[\s\S]*'Symbol'[\s\S]*'instrumentSymbol'[\s\S]*'code'[\s\S]*'ticker'/);
});

test('native compact symbol header opens immediately from the full header tap target', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(source, /const symbolPickerActions = useMemo\([\s\S]*availableSymbols\.map/);
  assert.match(source, /actions: symbolPickerActions/);
  assert.match(
    source,
    /title: t\('Select Symbol'\)[\s\S]*presentation:\s*'mt5Plain'[\s\S]*deferOffscreenActions:\s*true[\s\S]*maximumVisibleActionRows:\s*9[\s\S]*instantOpen:\s*true[\s\S]*entryMotion:\s*'mt5Slide'[\s\S]*immediateHostHideOnClose:\s*true[\s\S]*actions: symbolPickerActions/,
  );
  assert.doesNotMatch(source, /const stopSymbolPickerTouchPropagation = useCallback/);
  assert.doesNotMatch(source, /const handleSymbolPickerStartShouldSetResponder = useCallback/);
  assert.ok(
    source.indexOf('<WebView') < source.indexOf('styles.chartOverlaySymbolSection'),
    'symbol dropdown hit target must render after the native WebView so Android taps reach it',
  );
  assert.match(
    source,
    /accessibilityLabel=\{t\('Select Symbol'\)\}[\s\S]*style=\{styles\.symbolSectionTapTarget\}[\s\S]*onPress=\{handleOpenSymbolPicker\}[\s\S]*activateOnPressIn[\s\S]*hitSlop=\{8\}/,
  );
  assert.match(styles, /symbolSectionTapTarget:/);
  assert.match(styles, /symbolSectionContent:/);
  assert.match(styles, /APP_HEADER_MENU_VISUAL_LEFT/);
  assert.match(styles, /COMPACT_SYMBOL_DROPDOWN_LEFT_SHIFT = 26/);
  assert.match(styles, /COMPACT_SYMBOL_DROPDOWN_LEFT_INSET = Math\.max\(/);
  assert.match(styles, /paddingLeft: COMPACT_SYMBOL_DROPDOWN_LEFT_INSET/);
});

test('native OHLC row renders below the full symbol name', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');
  const symbolNameRowIndex = source.indexOf('<View style={styles.symbolMetaRow}>');
  const ohlcRowIndex = source.indexOf(
    '{showChartMetaRow && !compactVerticalChartWindow && (',
    symbolNameRowIndex,
  );
  const symbolPressableEndIndex = source.indexOf('</Pressable>', symbolNameRowIndex);

  assert.notEqual(symbolNameRowIndex, -1);
  assert.notEqual(ohlcRowIndex, -1);
  assert.ok(symbolNameRowIndex < ohlcRowIndex, 'OHLC row must render after the full symbol name row');
  assert.ok(ohlcRowIndex < symbolPressableEndIndex, 'OHLC row must stay inside the symbol header tap target');
  assert.doesNotMatch(source, /<DraggableChartMetaOverlay/);
  assert.match(
    source,
    /const ChartLiveOhlcRow = React\.memo\(function ChartLiveOhlcRow\([\s\S]*\{items\.map\(\(item\) => \(/,
    'the header must render OHLC values through the isolated live row',
  );
  assert.match(styles, /symbolOhlcRow:/);
  assert.match(styles, /symbolOhlcPair:/);
  assert.match(styles, /symbolOhlcLabel:/);
  assert.match(styles, /symbolOhlcValue:/);
  assert.match(styles, /symbolSectionContent:\s*\{[\s\S]*backgroundColor: 'transparent'/);
  assert.match(styles, /symbolOhlcRow:\s*\{[\s\S]*marginTop: 1/);
  assert.doesNotMatch(source, /styles\.fxBadge,\s*\{\s*backgroundColor:/);
  assert.match(
    source,
    /const candle =[\s\S]*liveCandle && \(!fallbackCandle \|\| liveCandle\.time >= fallbackCandle\.time\)[\s\S]*\? liveCandle[\s\S]*: fallbackCandle/,
    'a direct same-bucket or newer live candle must win over the React fallback',
  );
  assert.match(
    source,
    /\{showChartMetaRow && !compactVerticalChartWindow && \([\s\S]*<ChartLiveOhlcRow[\s\S]*contextKey=\{chartDataContextSig\}[\s\S]*fallbackCandle=\{chartMetaLastCandle\}[\s\S]*subscribe=\{subscribeChartLiveOhlc\}/,
    'the OHLC row below the symbol name must use the context-scoped live component',
  );
  assert.doesNotMatch(
    source,
    /const chartMetaCanonicalCandles\s*=\s*!chartMetaLiveLastCandle\s*&&\s*isScreenFocused/,
    'first-visible OHLC fallback must not wait for deferred Chart focus',
  );
});

test('chart type pickers stay compact and do not expose the retired OHLC bars chart type', () => {
  const nativeSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const webSource = readSource('src/features/chart/ChartScreen.web.tsx');
  const nativeActionsSource = nativeSource.slice(
    nativeSource.indexOf('const chartTypePickerActions = useMemo'),
    nativeSource.indexOf('const handleOpenChartTypePicker', nativeSource.indexOf('const chartTypePickerActions = useMemo')),
  );
  const nativeOpenSource = nativeSource.slice(
    nativeSource.indexOf('const handleOpenChartTypePicker = useCallback'),
    nativeSource.indexOf('const handleOpenObjectsScreen', nativeSource.indexOf('const handleOpenChartTypePicker = useCallback')),
  );
  const webActionsSource = webSource.slice(
    webSource.indexOf('title=\'Chart Type\''),
    webSource.indexOf('<ActionSheet', webSource.indexOf('title=\'Chart Type\'') + 1),
  );

  [nativeActionsSource, webActionsSource].forEach((chartTypeSource) => {
    assert.match(chartTypeSource, /Candlestick/);
    assert.match(chartTypeSource, /Hollow Candles/);
    assert.match(chartTypeSource, /Renko/);
    assert.match(chartTypeSource, /Line/);
    assert.match(chartTypeSource, /Area/);
    assert.doesNotMatch(chartTypeSource, /OHLC Bars/);
    assert.doesNotMatch(chartTypeSource, /setChartVisualType\('bars'\)/);
    assert.doesNotMatch(chartTypeSource, /bar-chart-outline/);
  });
  assert.match(
    nativeActionsSource,
    /key: 'renko' as const, label: 'Renko', icon: 'grid-outline' as const/,
  );
  assert.match(
    nativeActionsSource,
    /key: 'area' as const, label: 'Area', icon: 'analytics-outline' as const/,
  );
  assert.match(webActionsSource, /label: 'Renko', onPress: \(\) => setChartVisualType\('renko'\)/);
  assert.match(webActionsSource, /label: 'Area', onPress: \(\) => setChartVisualType\('area'\)/);
  assert.match(nativeOpenSource, /title: t\('Chart Type'\)[\s\S]*detent:\s*'auto'/);
  assert.doesNotMatch(nativeOpenSource, /detent:\s*'adaptive'/);
  assert.match(webActionsSource, /detent="auto"/);
  assert.doesNotMatch(webActionsSource, /detent="adaptive"/);
});

test('native chart dark UI colors match the global dark palette', () => {
  const chartStyles = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(chartStyles, /const APP_BG = T\.bg/);
  assert.match(chartStyles, /const CHART_CANVAS_BG = isDark \? T\.bg : '#FFFFFF'/);
  assert.match(chartStyles, /const BOTTOM_AREA_BG = isDark \? T\.bg : '#F8FAFC'/);
  assert.match(chartStyles, /const TRADE_SHEET_BG = isDark \? T\.bg : '#FFFFFF'/);
  assert.match(chartStyles, /const TRADE_SHEET_PANEL = isDark \? T\.glass2 : '#FFFFFF'/);
  assert.match(chartStyles, /backgroundColor: T\.glass2/);
  assert.match(chartStyles, /backgroundColor: isDark \? T\.bg : T\.glass2/);
  assert.doesNotMatch(chartStyles, /CHART_DARK_CHROME_BACKGROUND|CHART_DARK_CANVAS_BACKGROUND/);
  assert.doesNotMatch(chartStyles, /const SETTINGS_DARK_BACKGROUND|const SETTINGS_DARK_CARD_BACKGROUND/);
});

test('native chart toolbar keeps fast action openers on reliable press surfaces', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');
  const timeframePickerSource = readSource('src/features/chart/components/ChartTimeframePickerSheet.tsx');
  const timeframeControllerSource = readSource('src/features/chart/chartTimeframePickerController.ts');
  const menuSource = readSource('src/features/chart/components/ChartToolbarMenuFeature.tsx');
  const drawingSource = readSource('src/features/chart/components/ChartDrawingToolsFeature.tsx');
  const radialSource = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');
  const chartSettingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const chartMenuOrderSource = readSource('src/features/chart/ChartMenuOrderScreen.tsx');
  const uiStateSource = readSource('src/state/uiState.ts');
  const drawingToolsSource = readSource('src/features/chart/drawingTools/index.ts');
  const drawingTypesSource = readSource('src/features/chart/drawingTools/types.ts');
  const tradeFeatureSource = readSource('src/features/chart/components/ChartTradeFeature.tsx');
  const symbolPickerSheetSource = readSource('src/features/chart/components/ChartSymbolPickerSheet.tsx');
  const symbolPickerControllerSource = readSource('src/features/chart/chartSymbolPickerSheetController.ts');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');
  const timeframeTextStyle = styles.slice(
    styles.indexOf('compactHeaderTimeframeText:'),
    styles.indexOf('/*', styles.indexOf('compactHeaderTimeframeText:')),
  );
  const timeframeHandlerSource = source.slice(
    source.indexOf('const handleOpenTimeframePicker = useCallback'),
    source.indexOf('const handleSelectChartType = useCallback', source.indexOf('const handleOpenTimeframePicker = useCallback')),
  );
  const symbolPickerHandlerSource = source.slice(
    source.indexOf('const handleOpenSymbolPicker = useCallback'),
    source.indexOf('const handleOpenTimeframePicker = useCallback', source.indexOf('const handleOpenSymbolPicker = useCallback')),
  );
  const symbolPickerOpenSource = source.slice(
    source.indexOf('const openSymbolPickerForActivePane = useCallback'),
    source.indexOf('const handleOpenSymbolPicker = useCallback'),
  );
  const drawingToolsHandlerSource = source.slice(
    source.indexOf('const handleOpenDrawingTools = useCallback'),
    source.indexOf('const handleOpenSettingsScreen = useCallback', source.indexOf('const handleOpenDrawingTools = useCallback')),
  );

  assert.match(timeframePickerSource, /TIMEFRAME_PICKER_GROUPS[\s\S]*title: 'Minutes'[\s\S]*options: \['M1', 'M5', 'M15', 'M30'\]/);
  assert.match(timeframePickerSource, /title: 'Hours'[\s\S]*options: \['H1', 'H4'\]/);
  assert.match(timeframePickerSource, /title: 'Days'[\s\S]*'D1'[\s\S]*'MN'/);
  assert.doesNotMatch(timeframePickerSource, /'M2'|'M3'|'M4'|'M6'|'M10'|'M12'|'M20'|'H2'|'H3'|'H6'|'H8'|'H12'/);
  assert.match(timeframePickerSource, /export function createTimeframePickerActionSheetActions/);
  assert.match(timeframePickerSource, /export const ChartTimeframePickerOverlay = memo\(function ChartTimeframePickerOverlay/);
  assert.match(timeframePickerSource, /controller = chartTimeframePickerController/);
  assert.match(timeframePickerSource, /useChartTimeframePickerVisible\(controller\)/);
  assert.match(timeframePickerSource, /const options = group\.options\.filter\(\(timeframe\) => supportedSet\.has\(timeframe\)\)/);
  assert.match(timeframePickerSource, /selected: active/);
  assert.match(timeframePickerSource, /disabled: !supported/);
  assert.match(timeframePickerSource, /activateOnPressIn: true/);
  assert.match(timeframePickerSource, /disabled=\{active\}/);
  assert.match(timeframePickerSource, /StyleSheet\.absoluteFillObject/);
  assert.match(timeframePickerSource, /justifyContent: 'center'/);
  assert.match(timeframePickerSource, /const CHART_DARK_PANEL_BACKGROUND = '#1E1E1E'/);
  assert.match(timeframePickerSource, /backgroundColor: isDark \? CHART_DARK_PANEL_BACKGROUND : '#FFFFFF'/);
  assert.match(timeframePickerSource, /borderColor: isDark \? 'rgba\(255,255,255,0\.10\)' : 'rgba\(15,23,42,0\.08\)'/);
  assert.match(timeframePickerSource, /shadowColor: 'transparent'/);
  assert.match(timeframePickerSource, /shadowOffset: \{ width: 0, height: 0 \}/);
  assert.match(timeframePickerSource, /shadowOpacity: 0/);
  assert.match(timeframePickerSource, /shadowRadius: 0/);
  assert.match(timeframePickerSource, /elevation: 0/);
  // Retained host: always mounted, native opacity flip on open (no mount lag).
  assert.match(timeframePickerSource, /controller\.registerApplier\(applyVisibilityNow\)/);
  assert.match(timeframePickerSource, /controller\.hide\(\)/);
  assert.match(timeframePickerSource, /setNativeProps\(\{[\s\S]*pointerEvents: isVisible \? 'auto' : 'none'/);
  assert.match(timeframePickerSource, /overlayHidden: \{\s*opacity: 0,\s*\}/);
  assert.doesNotMatch(timeframePickerSource, /if \(!visible\) return null/);
  assert.doesNotMatch(timeframePickerSource, /shadowColor: '#000000'|rgba\(59,130,246,0\.25\)|shadowColor: isDark \? accentColor|rgba\(37,99,235,0\.18\)|shadowRadius: isDark \? 0 : 28|elevation: isDark \? 0 : 18/);
  assert.doesNotMatch(timeframePickerSource, /Ionicons|iconName|icon:/);
  assert.doesNotMatch(timeframePickerSource, /<Modal|bottomDock/);
  assert.match(timeframeControllerSource, /export type ChartTimeframePickerController/);
  assert.match(timeframeControllerSource, /export function createChartTimeframePickerController\(\)[\s\S]*const listeners = new Set[\s\S]*const appliers = new Set/);
  assert.match(timeframeControllerSource, /export function useChartTimeframePickerVisible\([\s\S]*controller: ChartTimeframePickerController = chartTimeframePickerController[\s\S]*controller\.subscribe[\s\S]*controller\.getSnapshot\(\)\.visible/);
  assert.match(source, /import \{ ChartTimeframePickerOverlay \} from '\.\/components\/ChartTimeframePickerSheet'/);
  assert.match(source, /import \{\s*hideChartTimeframePicker,\s*showChartTimeframePicker,\s*\} from '\.\/chartTimeframePickerController'/);
  assert.doesNotMatch(source, /const \[timeframePickerVisible, setTimeframePickerVisible\] = useState\(false\)/);
  assert.match(source, /const chartTradeExpirationActions = useMemo\(/);
  assert.match(source, /chartTradeExpirationActions = useMemo\([\s\S]*name="infinite-outline"[\s\S]*label: t\('GTC'\)[\s\S]*name="today-outline"[\s\S]*label: t\('Today'\)[\s\S]*name="time-outline"[\s\S]*label: t\('Date and Time'\)[\s\S]*name="calendar-outline"[\s\S]*label: t\('Date'\)/);
  assert.doesNotMatch(source, /const timeframePickerActions = useMemo\(/);
  assert.match(source, /const drawingToolsActions = useMemo\(/);
  for (const handler of [
    'handleSetTool',
    'handleClearDrawings',
    'handleUndoDrawing',
    'handleRedoDrawing',
    'handleToggleStickyMode',
    'handleToggleMagnetMode',
    'handleToggleLock',
    'handleToggleHide',
    'handleZoomTool',
  ]) {
    assert.match(source, new RegExp(`const ${handler} = useCallback\\(`));
  }
  assert.match(source, /const chartTypePickerActions = useMemo\(/);
  assert.match(source, /const chartMoreActions = useMemo\(/);
  assert.match(source, /const CHART_SCALE_DISPLAY_ITEMS:[\s\S]*key: 'showTicker'[\s\S]*label: 'Show ticker'[\s\S]*key: 'showTradeLevels'[\s\S]*label: 'Show trade levels'/);
  assert.match(source, /chartOneClickPanelAtBottom: state\.chartOneClickPanelAtBottom/);
  assert.match(source, /chartVerticalScrollingLocked: state\.chartVerticalScrollingLocked/);
  assert.match(source, /chartAutoScaleEnabled: state\.chartAutoScaleEnabled/);
  assert.match(source, /setChartDisplaySetting: state\.setChartDisplaySetting/);
  assert.match(source, /const scheduleChartActionSheetContextReset = useCallback/);
  assert.match(source, /scheduleAfterFirstFrame\(resetChartActionSheetContext\)/);
  assert.match(source, /const handleTimeframeSelect = useCallback[\s\S]*hideChartTimeframePicker\(\)[\s\S]*chartWindows\.updateToolbarTargetContext\(\{ timeframe: nextTimeframe \}\)/);
  assert.match(
    source,
    /const chartWindows = useChartWindowsFeature\(\{[\s\S]*onCommitContext: commitChartWindowContext[\s\S]*chartWindowCommitContextImplementationRef\.current = warmChartContextAndCommit/,
  );
  // Open critical path: native show first, history prefetch deferred off the tap.
  assert.match(timeframeHandlerSource, /showChartTimeframePicker\(\);[\s\S]*hideActionSheet\(\);[\s\S]*closeChartTapMenu\(\);/);
  assert.match(timeframeHandlerSource, /scheduleIdleWork\(\(\) => \{\s*timeframes\.forEach[\s\S]*prefetchChartTimeframeHistory\(chartSymbol, tf\)/);
  assert.doesNotMatch(timeframeHandlerSource, /setTimeframePickerVisible/);
  assert.doesNotMatch(timeframeHandlerSource, /showActionIcons:\s*true/);
  assert.doesNotMatch(timeframeHandlerSource, /showChartActionSheet|presentation:\s*'mt5Plain'|presentation:\s*'mt5TimeframeGrid'|detent:\s*'adaptive'/);
  assert.match(source, /<ChartTimeframePickerOverlay[\s\S]*supportedTimeframes=\{timeframes\}[\s\S]*onSelect=\{handleTimeframeSelect\}/);
  assert.doesNotMatch(source, /visible=\{timeframePickerVisible\}|onClose=\{handleCloseTimeframePicker\}/);
  assert.match(source, /drawingToolsActionSheetConfig = useMemo[\s\S]*title:\s*t\('Drawing Tools'\)[\s\S]*searchable:\s*true[\s\S]*searchPlaceholder:\s*t\('Search drawing tools\.\.\.'\)[\s\S]*compactText:\s*true[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*deferOffscreenActions:\s*true[\s\S]*maximumVisibleActionRows:\s*12[\s\S]*detent:\s*'large'[\s\S]*instantOpen:\s*true[\s\S]*entryMotion:\s*'instant'[\s\S]*immediateHostHideOnClose:\s*true[\s\S]*runActionAfterClose:\s*false[\s\S]*keepFullHeightOnKeyboard:\s*true[\s\S]*actions: drawingToolsActions/);
  assert.doesNotMatch(source, /const openChartActionSheetSmoothly = useCallback|parkRetainedActionSheetHostForConfigSwap/);
  assert.match(symbolPickerSheetSource, /export const ChartSymbolPickerSheetHost = memo/);
  assert.match(
    symbolPickerControllerSource,
    /export function showChartSymbolPickerSheet\(config:[\s\S]*if \(interactionActive \|\| snapshot\.visible\)[\s\S]*publishSnapshot\(config, true\);[\s\S]*return true;/,
  );
  assert.doesNotMatch(
    symbolPickerControllerSource,
    /requestRetainedActionSheetPreview|commitRetainedActionSheetPreview|parkRetainedActionSheetHostForConfigSwap|scheduleAfterFirstFrame|pendingAdoptionCancel|ownedRetainedRevision/,
  );
  assert.match(symbolPickerControllerSource, /publishSnapshot\(nextConfig, false, wasVisible\);/);
  assert.match(symbolPickerSheetSource, /<ActionSheet[\s\S]*key=\{`chart-symbol-picker-host:\$\{current\.hostEpoch\}`\}[\s\S]*detent=\{config\.detent \?\? 'large'\}[\s\S]*instantOpen=\{config\.instantOpen \?\? true\}[\s\S]*visible=\{current\.visible\}/);
  assert.match(tabsLayoutSource, /<GlobalActionSheetHost \/>[\s\S]*<ChartSymbolPickerSheetHost \/>/);
  assert.match(drawingToolsHandlerSource, /runImmediateAction\('chart\.drawingTools\.open'[\s\S]*showChartActionSheet\(drawingToolsActionSheetConfig\)/);
  assert.doesNotMatch(drawingToolsHandlerSource, /openChartActionSheetSmoothly/);
  assert.match(symbolPickerOpenSource, /runImmediateAction\('chart\.symbolPicker\.open'[\s\S]*showChartSymbolPickerSheet\(symbolPickerActionSheetConfig\)/);
  assert.match(symbolPickerHandlerSource, /openSymbolPickerForActivePane\(\)/);
  assert.match(drawingToolsHandlerSource, /commitRetainedActionSheetPreview\([\s\S]*if \(retainedRevealAccepted\) \{[\s\S]*scheduleAfterFirstFrame\(adoptDrawingToolsSheet\)/);
  assert.doesNotMatch(symbolPickerHandlerSource, /scheduleAfterFirstFrame/);
  const tradeSheetSymbolOpeners = [
    ...tradeFeatureSource.matchAll(/<Pressable\b[^>]*onPress=\{handlers\.onOpenSymbolPicker\}[^>]*>/g),
  ];
  assert.equal(tradeSheetSymbolOpeners.length, 2);
  tradeSheetSymbolOpeners.forEach((opener) => {
    assert.match(opener[0], /activateOnPressIn/);
    assert.match(opener[0], /activateOnTouchStart/);
    assert.match(opener[0], /latencyLabel="chart\.symbolPicker\.open"/);
    assert.match(opener[0], /unstable_pressDelay=\{0\}/);
  });
  const tradeSheetDragDetectorStart = tradeFeatureSource.indexOf(
    '<GestureDetector gesture={sheet.chartTradeSheetDragGesture}>',
  );
  const tradeSheetDragDetectorEnd = tradeFeatureSource.indexOf(
    '</GestureDetector>',
    tradeSheetDragDetectorStart,
  );
  const pinnedTradeSheetHeaderAfterDetector = tradeFeatureSource.indexOf(
    '<ChartTradeSheetPinnedHeader',
    tradeSheetDragDetectorEnd,
  );
  assert.notEqual(tradeSheetDragDetectorStart, -1);
  assert.notEqual(tradeSheetDragDetectorEnd, -1);
  assert.notEqual(pinnedTradeSheetHeaderAfterDetector, -1);
  const tradeSheetDragDetectorSource = tradeFeatureSource.slice(
    tradeSheetDragDetectorStart,
    tradeSheetDragDetectorEnd,
  );
  assert.match(tradeSheetDragDetectorSource, /<ChartTradeSheetDragHeader/);
  assert.doesNotMatch(tradeSheetDragDetectorSource, /<ChartTradeSheetPinnedHeader/);
  assert.ok(tradeSheetDragDetectorEnd < pinnedTradeSheetHeaderAfterDetector);
  // Both long chart lists can share More-menu motion once their opening
  // viewport is stable and their offscreen rows are deferred.
  const symbolPickerConfigStart = source.indexOf('const symbolPickerActionSheetConfig = useMemo');
  const symbolPickerConfigEnd = source.indexOf('const handleOpenSymbolPicker', symbolPickerConfigStart);
  assert.notEqual(symbolPickerConfigStart, -1);
  assert.notEqual(symbolPickerConfigEnd, -1);
  const symbolPickerConfigSource = source.slice(symbolPickerConfigStart, symbolPickerConfigEnd);
  assert.match(symbolPickerConfigSource, /deferOffscreenActions:\s*true/);
  assert.match(symbolPickerConfigSource, /maximumVisibleActionRows:\s*9/);
  assert.match(symbolPickerConfigSource, /entryMotion:\s*'mt5Slide'/);
  assert.doesNotMatch(symbolPickerConfigSource, /entryMotion:\s*'instant'/);
  const drawingToolsConfigStart = source.indexOf('const drawingToolsActionSheetConfig = useMemo');
  const drawingToolsConfigEnd = source.indexOf('const handleOpenDrawingTools', drawingToolsConfigStart);
  assert.notEqual(drawingToolsConfigStart, -1);
  assert.notEqual(drawingToolsConfigEnd, -1);
  const drawingToolsConfigSource = source.slice(drawingToolsConfigStart, drawingToolsConfigEnd);
  assert.match(drawingToolsConfigSource, /title:\s*t\('Drawing Tools'\)/);
  assert.match(drawingToolsConfigSource, /searchable:\s*true/);
  assert.match(drawingToolsConfigSource, /searchPlaceholder:\s*t\('Search drawing tools\.\.\.'\)/);
  assert.match(drawingToolsConfigSource, /compactText:\s*true/);
  assert.match(drawingToolsConfigSource, /deferOffscreenActions:\s*true/);
  assert.match(drawingToolsConfigSource, /maximumVisibleActionRows:\s*12/);
  assert.match(drawingToolsConfigSource, /detent:\s*'large'/);
  assert.match(drawingToolsConfigSource, /entryMotion:\s*'instant'/);
  assert.match(drawingToolsConfigSource, /keepFullHeightOnKeyboard:\s*true/);
  assert.doesNotMatch(drawingToolsConfigSource, /entryMotion:\s*'mt5Slide'/);
  assert.match(source, /title:\s*t\('Drawing Tools'\)[\s\S]*presentation:\s*'mt5Plain'/);
  assert.match(drawingSource, /title=\{t\('Drawing Tools'\)\}[\s\S]*searchable[\s\S]*searchPlaceholder=\{t\('Search drawing tools\.\.\.'\)\}[\s\S]*maximumVisibleActionRows=\{12\}[\s\S]*detent="large"[\s\S]*entryMotion="instant"[\s\S]*keepFullHeightOnKeyboard/);
  assert.match(drawingSource, /presentation="mt5Plain"[\s\S]*showActionIcons[\s\S]*actions=\{createDrawingToolsActionSheetActions/);
  assert.match(drawingTypesSource, /icon\?: ReactNode/);
  assert.match(drawingToolsSource, /DRAWING_SHEET_OPTIONS\.map\(\(definition\) => \(\{[\s\S]*icon: definition\.renderIcon\(iconColor\)/);
  assert.match(drawingToolsSource, /const buildCommandAction = \(definition: DrawingToolCommandDefinition\)[\s\S]*icon: definition\.renderIcon\(definition\.danger \? dangerIconColor : iconColor\)[\s\S]*historyCommands\.map\(buildCommandAction\)/);
  assert.match(source, /title: t\('Chart Type'\)[\s\S]*instantOpen:\s*true[\s\S]*actions: chartTypePickerActions/);
  assert.match(source, /runImmediateAction\('chart\.moreMenu\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*instantOpen:\s*true[\s\S]*entryMotion:\s*'mt5Slide'[\s\S]*runActionAfterClose:\s*false[\s\S]*actions: chartMoreActions/);
  assert.doesNotMatch(source, /label: t\(isVerticalScrollingLocked \? 'Unlock Vertical Scrolling' : 'Lock Vertical Scrolling'\)[\s\S]*onPress: handleToggleVerticalScrollingLock/);
  assert.match(source, /const handleToggleVerticalScrollingLock = \(\) => \{[\s\S]*setChartVerticalScrollingLocked\(next\)[\s\S]*setVerticalScrollingLocked\(\$\{next\}\)/);
  assert.match(source, /setVerticalScrollingLocked\(\$\{isVerticalScrollingLocked\}\)/);
  assert.match(source, /<ChartTapRadialMenu[\s\S]*onOpenScaleControls=\{handleRadialOpenChartScaleMenu\}/);
  assert.match(radialSource, /accessibilityLabel: `\$\{t\('Chart'\)\} \$\{t\('Options'\)\}`[\s\S]*onPress: onOpenScaleControls[\s\S]*<Ionicons name="options-outline"/);
  assert.match(radialSource, /const CHART_TAP_ACTION_HIT_SLOP = \{ top: 14, bottom: 14, left: 14, right: 14 \} as const/);
  assert.match(radialSource, /const handleActionItemPress = React\.useCallback\(\(event: any, onPress: \(\) => void\) => \{[\s\S]*event\.stopPropagation\?\.\(\);[\s\S]*onPress\(\);[\s\S]*\}, \[\]\)/);
  assert.match(radialSource, /onPress=\{\(event\) => handleActionItemPress\(event, item\.onPress\)\}[\s\S]*activateOnPressIn[\s\S]*hitSlop=\{CHART_TAP_ACTION_HIT_SLOP\}/);
  assert.match(source, /const handleToggleOneClickPanelAtBottom = \(\) => \{[\s\S]*setChartOneClickPanelAtBottom\(!chartOneClickPanelAtBottom\)/);
  assert.match(source, /const handleToggleChartDisplayAction = useCallback\([\s\S]*setChartDisplaySetting\(key, next\)[\s\S]*setChartShowOnChartItem\(linkedShowOnChartKey, next\)/);
  assert.match(source, /const chartScaleActions = useMemo\([\s\S]*label: t\('Scroll to last bar'\)[\s\S]*label: t\('Reset vertical scale'\)[\s\S]*label: t\('Auto-scale'\)[\s\S]*label: t\('Vertical movement'\)[\s\S]*label: t\('One Click panel at the bottom'\)[\s\S]*CHART_SCALE_DISPLAY_ITEMS\.map/);
  assert.match(source, /label: t\('Auto-scale'\)[\s\S]*muted: isChartAutoScaleEnabled[\s\S]*onPress: handleToggleChartAutoScale/);
  assert.match(source, /label: t\('Vertical movement'\)[\s\S]*muted: !isVerticalScrollingLocked[\s\S]*onPress: handleToggleVerticalScrollingLock/);
  assert.match(source, /label: t\('One Click panel at the bottom'\)[\s\S]*muted: chartOneClickPanelAtBottom[\s\S]*onPress: handleToggleOneClickPanelAtBottom/);
  assert.match(source, /label: t\(item\.label\)[\s\S]*muted: enabled[\s\S]*onPress: \(\) => handleToggleChartDisplayAction\(item\.key\)/);
  assert.doesNotMatch(source, /label: t\([^)]*Disable/);
  assert.doesNotMatch(source, /subtitle: t\(.*(?:On|Off)/);
  assert.doesNotMatch(source, /label: t\(isChartAutoScaleEnabled \? 'Free chart movement' : 'Auto-scale'\)[\s\S]*selected: isChartAutoScaleEnabled/);
  assert.doesNotMatch(source, /label: t\(isVerticalScrollingLocked \? 'Unlock vertical scrolling' : 'Lock vertical scrolling'\)[\s\S]*selected: isVerticalScrollingLocked/);
  assert.match(source, /runImmediateAction\('chart\.radial\.scaleMenu\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*title: t\('Chart settings'\)[\s\S]*titleAlign: 'center'[\s\S]*presentation: 'mt5Plain'[\s\S]*showActionIcons: true[\s\S]*detent: 'auto'[\s\S]*actions: chartScaleActions/);
  assert.doesNotMatch(radialSource, /const scaleActionItems/);
  assert.match(source, /const handleToggleChartAutoScale = \(\) => \{[\s\S]*setChartAutoScaleEnabled\(next\)[\s\S]*setChartAutoScaleEnabled\(\$\{next\}\)/);
  assert.match(source, /setChartAutoScaleEnabled\(\$\{isChartAutoScaleEnabled\}\)/);
  assert.match(uiStateSource, /pendingChartCommand: PendingChartCommand \| null[\s\S]*queueChartCommand: \(command: PendingChartCommand\) => void[\s\S]*clearPendingChartCommand: \(\) => void/);
  assert.match(chartSettingsSource, /const CHART_SETTINGS_DISPLAY_ITEMS:[\s\S]*key: 'showTicker'[\s\S]*label: 'Show ticker'[\s\S]*key: 'showOHLC'[\s\S]*label: 'Show OHLC'[\s\S]*key: 'showQuickTradingButtons'[\s\S]*label: 'Show quick trading buttons'[\s\S]*key: 'showLivePriceLine'[\s\S]*label: 'Show live price line'[\s\S]*key: 'showLastPriceLine'[\s\S]*label: 'Show last price line'[\s\S]*key: 'showGrid'[\s\S]*label: 'Show grid'[\s\S]*key: 'showObjectDescriptions'[\s\S]*label: 'Show object descriptions'[\s\S]*key: 'showTradeLevels'[\s\S]*label: 'Show trade levels'/);
  assert.doesNotMatch(chartSettingsSource, /label: 'Show bid price line'|label: 'Show ask price line'/);
  assert.match(chartSettingsSource, /const CHART_DISPLAY_TO_SHOW_ON_CHART_KEY:[\s\S]*showTradeLevels: 'slTpLevels'/);
  assert.match(chartSettingsSource, /title="Scroll to last bar"[\s\S]*handleRunChartCommand\('scrollToLastBar'\)[\s\S]*title="Reset vertical scale"[\s\S]*handleRunChartCommand\('resetVerticalScale'\)[\s\S]*title="Auto-scale"[\s\S]*enabled=\{chartAutoScaleEnabled\}[\s\S]*title="Vertical movement"[\s\S]*enabled=\{!chartVerticalScrollingLocked\}[\s\S]*onValueChange=\{handleToggleChartVerticalMovement\}/);
  assert.match(chartSettingsSource, /title="One Click panel at the bottom"[\s\S]*enabled=\{chartOneClickPanelAtBottom\}[\s\S]*onValueChange=\{setChartOneClickPanelAtBottom\}/);
  assert.match(chartSettingsSource, /CHART_SETTINGS_DISPLAY_ITEMS\.map\(\(item\) =>[\s\S]*title=\{item\.label\}[\s\S]*enabled=\{getChartDisplaySettingEnabled\(item\.key\)\}[\s\S]*onValueChange=\{\(value\) => handleToggleChartDisplaySetting\(item\.key, value\)\}/);
  assert.match(chartSettingsSource, /handleToggleChartDisplaySetting[\s\S]*setChartDisplaySetting\(key, value\)[\s\S]*setChartShowOnChartItem\(linkedShowOnChartKey, value\)/);
  assert.match(chartSettingsSource, />\{t\('SHOW ON CHART'\)\}<[\s\S]*label="Price Alerts"[\s\S]*onPress=\{handleOpenPriceAlerts\}/);
  assert.match(chartSettingsSource, /openConfigDestination\('alerts', 'alerts'\)/);
  assert.doesNotMatch(chartSettingsSource, /label="Order of menu items"|>NAVIGATION<|\/chart\/menu-order/);
  assert.match(chartMenuOrderSource, /export function ChartMenuOrderScreen/);
  assert.match(chartMenuOrderSource, /safeRouterBack\(router, '\/\(tabs\)\/chart'\)/);
  assert.doesNotMatch(chartMenuOrderSource, /QUICK_ACCESS|OTHER|Only 3 items can be placed|Price Alerts|Maximise|Add to favorites|Trading calculator|Analytics|Specification/);
  assert.doesNotMatch(source, /const chartPriceScaleActions = useMemo\(/);
  assert.doesNotMatch(source, /runImmediateAction\('chart\.priceScaleMenu\.open'/);
  assert.doesNotMatch(source, /style=\{styles\.chartPriceScaleMenuButton\}/);
  assert.doesNotMatch(source, /title:\s*(?:t\('Options'\)|'⋮')[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true/);
  assert.match(
    source,
    /runImmediateAction\('chart\.tradeSheet\.expiration\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*detent:\s*'auto'[\s\S]*instantOpen:\s*true[\s\S]*runActionAfterClose:\s*false[\s\S]*actions: chartTradeExpirationActions/,
  );
  assert.doesNotMatch(source, /title:\s*t\('Expiration'\)[\s\S]*actions: chartTradeExpirationActions/);
  assert.match(source, /requestAnimationFrame\(handleOpenChartTypePicker\)/);
  assert.doesNotMatch(source, /showChartTypeMenu\s*\?/);
  assert.doesNotMatch(source, /setShowChartTypeMenu/);
  assert.doesNotMatch(source, /styles\.chartTypeMenuCard/);
  assert.match(
    source,
    /const symbolPickerActionSheetConfig = useMemo[\s\S]*title: t\('Select Symbol'\)[\s\S]*visualKey: symbolPickerVisualKey[\s\S]*actions: symbolPickerActions/,
  );
  assert.match(
    source,
    /if \(!isScreenFocused\) \{[\s\S]*hideChartSymbolPickerSheet\(\)[\s\S]*preloadChartSymbolPickerSheet\(symbolPickerActionSheetConfig\)/,
  );
  assert.match(
    source,
    /title: t\('Select Symbol'\)[\s\S]*searchable:\s*true[\s\S]*keepFullHeightOnKeyboard:\s*true[\s\S]*actions: symbolPickerActions/,
  );
  assert.doesNotMatch(
    source,
    /prefetchSymbolPickerHistory|CHART_SYMBOL_PICKER_PREFETCH_LIMIT|CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS/,
  );
  // The preloaded picker replaces the hidden native host after each completed open.
  assert.match(
    source,
    /runImmediateAction\('chart\.symbolPicker\.open'[\s\S]*showChartSymbolPickerSheet\(symbolPickerActionSheetConfig\)[\s\S]*scheduleChartActionSheetContextReset\(\);/,
  );
  assert.match(
    source,
    /const refreshSelectedChartHistory = useCallback\([\s\S]*liveCandlesEngine\.prefetchHistory\(nextSymbol, nextTimeframe\)[\s\S]*liveCandlesEngine\.refreshHistoryForContext\(nextSymbol, nextTimeframe\)/,
  );
  assert.match(
    source,
    /const warmChartContextAndCommit = useCallback\([\s\S]*chartContextCommitScheduler\.request\(\{[\s\S]*prepare: \(\) => \{[\s\S]*prefetchChartSelectionHistory\(nextSymbol, nextTimeframe\)[\s\S]*prefetchInstrument\(nextSymbol\)[\s\S]*commit: \(\) => \{[\s\S]*preferences\.setChartSymbol\(nextSymbol\)/,
  );
  assert.match(
    source,
    /const handleTimeframeSelect = useCallback[\s\S]*chartWindows\.updateToolbarTargetContext\(\{ timeframe: nextTimeframe \}\)/,
  );
  assert.doesNotMatch(
    source.slice(source.indexOf('const handleOpenObjectsScreen'), source.indexOf('const handleOpenSignalDetails')),
    /requestAnimationFrame/,
  );
  assert.doesNotMatch(
    source.slice(source.indexOf('const handleOpenSettingsScreen'), source.indexOf('const handleToggleChartExpanded')),
    /requestAnimationFrame/,
  );
  const scrollableToolbar = source.slice(
    source.indexOf('const renderCompactHeaderToolbar'),
    source.indexOf('const renderChartTradeSheetTopHeader'),
  );
  for (const action of ['crosshair', 'timeframe', 'sltp', 'drawings', 'more']) {
    assert.ok(scrollableToolbar.includes(`onPress={() => routeChartWindowToolbarAction('${action}')}`));
  }
  assert.doesNotMatch(scrollableToolbar, /routeChartWindowToolbarAction\('settings'\)|options-outline/);
  assert.doesNotMatch(scrollableToolbar, /activateOnPressIn|activateOnTouchStart|onPressIn=/);
  assert.match(
    source,
    /useChartWindowToolbarRouter\([\s\S]*timeframe: handleOpenTimeframePicker[\s\S]*sltp: handleActivateDirectChartProtection[\s\S]*drawings: handleOpenDrawingTools[\s\S]*settings: handleOpenSettingsScreen[\s\S]*more: handleOpenMoreMenu/,
  );
  assert.match(source, /onPress=\{handleOpenChartExpirationMenu\}[\s\S]*activateOnPressIn/);
  assert.match(timeframeTextStyle, /color:\s*HEADER_CONTROL_COLOR/);
  assert.doesNotMatch(timeframeTextStyle, /color:\s*BLUE/);
  const scrollableExpirationOpeners = tradeFeatureSource.match(
    /<Pressable\b[^>]*\bonPress=\{handlers\.onOpenExpirationMenu\}[^>]*>/g,
  ) ?? [];
  assert.equal(scrollableExpirationOpeners.length, 2);
  scrollableExpirationOpeners.forEach((opener) => {
    assert.match(opener, /unstable_pressDelay=\{0\}/);
    assert.doesNotMatch(opener, /activateOnPressIn|activateOnTouchStart/);
  });
  assert.match(menuSource, /onPressIn=\{onPress\}/);
  assert.match(drawingSource, /onPress=\{onPress\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/);
});

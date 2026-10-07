import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Chart Preferences opens Schema & Colors on the immediate hosted path without route prefetch', () => {
  const warmupSource = readSource('src/utils/actionRouteWarmup.ts');
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const hostSource = readSource('src/features/chart/ChartConfigDestinationHost.tsx');
  const controllerSource = readSource('src/features/chart/chartConfigDestinationController.ts');
  const schemaRowStart = settingsSource.indexOf('label="Chart Schema & Colors"');
  const schemaRowSource = settingsSource.slice(schemaRowStart, schemaRowStart + 260);
  const navRowStart = settingsSource.indexOf('function NavRow(');
  const navRowSource = settingsSource.slice(navRowStart, navRowStart + 900);

  assert.doesNotMatch(
    warmupSource,
    /ACTION_ROUTE_WARMUP_PATHS|router\.prefetch|'\/chart\/schema-colors'/,
  );
  // Sidebar-style retained host — no router.push on the tap path for config rows.
  assert.match(
    settingsSource,
    /const handleOpenSchemaColors = useCallback\(\(\) => \{\s*openConfigDestination\('schema-colors', 'schemaColors'\);\s*\}, \[openConfigDestination\]\)/,
  );
  assert.match(settingsSource, /showChartConfigDestination\(destination\)/);
  assert.match(settingsSource, /openConfigDestination\('price-source'/);
  assert.match(settingsSource, /openConfigDestination\('open-order-mode'/);
  assert.match(settingsSource, /openConfigDestination\('alerts'/);
  assert.match(settingsSource, /showFastTabVisual\('chart'\)/);
  assert.match(hostSource, /ChartConfigDestinationHost/);
  assert.match(hostSource, /schema-colors|price-source|open-order-mode|alerts/);
  assert.match(controllerSource, /export function showChartConfigDestination/);
  assert.match(controllerSource, /revealMounted: \(revision\) =>/);
  assert.match(
    controllerSource,
    /show: \(destination\) => \{[\s\S]*ready: false,[\s\S]*visible: true/,
  );
  assert.match(
    hostSource,
    /const mounted = snapshot\.visible && snapshot\.destination === destination[\s\S]*const active = mounted && snapshot\.ready/,
  );
  assert.match(
    hostSource,
    /onLayout=\{\(\) => \{[\s\S]*chartConfigDestinationController\.revealMounted\(snapshot\.revision\)/,
  );
  assert.match(hostSource, /backgroundColor: 'transparent'/);
  assert.doesNotMatch(hostSource, /backgroundColor: '#0B1220'/);
  assert.notEqual(schemaRowStart, -1);
  assert.match(schemaRowSource, /onPress=\{handleOpenSchemaColors\}/);
  assert.notEqual(navRowStart, -1);
  assert.match(navRowSource, /onPress=\{onPress\}[\s\S]*unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(navRowSource, /activateOnPressIn|activateOnTouchStart/);
});

test('Chart Preferences and Schema & Colors back controls fire on touch-down', () => {
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const schemaSource = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const settingsBackStart = settingsSource.indexOf('onPress={handleReturnToChart}');
  const settingsBackSource = settingsSource.slice(settingsBackStart, settingsBackStart + 360);
  const schemaBackStart = schemaSource.indexOf('onPress={handleReturnFromSchema}');
  const schemaBackSource = schemaSource.slice(schemaBackStart, schemaBackStart + 380);

  assert.notEqual(settingsBackStart, -1);
  assert.match(settingsBackSource, /activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}/);
  assert.notEqual(schemaBackStart, -1);
  assert.match(schemaBackSource, /activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(
    schemaSource,
    /const handleReturnFromSchema = useCallback\(\(\) => \{[\s\S]*if \(hosted && onHostedBack\) \{[\s\S]*onHostedBack\(\);/,
  );
  // Hosted toolbar open: hide retained layer immediately. Route path still uses deferred stack back.
  assert.match(
    settingsSource,
    /const handleReturnToChart = useCallback\(\(\) => \{[\s\S]*if \(hosted && onHostedBack\) \{[\s\S]*onHostedBack\(\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/chart'\)/,
  );
});

test('Chart More-menu Preferences opens and closes via retained host (no stack push on tap)', () => {
  const nativeSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const hostSource = readSource('src/features/chart/ChartSettingsHost.tsx');
  const controllerSource = readSource('src/features/chart/chartSettingsHostController.ts');
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const rootSource = readSource('app/_layout.tsx');

  assert.match(
    nativeSource,
    /const handleOpenSettingsScreen = useCallback\(\(\) => \{[\s\S]*showChartSettingsHost\(\);/,
  );
  assert.doesNotMatch(
    nativeSource.slice(
      nativeSource.indexOf('const handleOpenSettingsScreen'),
      nativeSource.indexOf('const handleToggleChartExpanded'),
    ),
    /router\.push\(['"]\/chart\/settings['"]\)/,
  );
  const moreActionsSource = nativeSource.slice(
    nativeSource.indexOf('const chartMoreActions'),
    nativeSource.indexOf('const chartScaleActions'),
  );
  assert.match(
    moreActionsSource,
    /label: t\('Chart Preferences'\)[\s\S]*icon: <Ionicons name="options-outline"[\s\S]*activateOnPressIn: true[\s\S]*onPress: \(\) => \{\s*hideChartActionSheet\(\);\s*handleOpenSettingsScreen\(\);/,
  );
  assert.match(
    nativeSource,
    /useChartWindowToolbarRouter\([\s\S]*settings: handleOpenSettingsScreen/,
  );
  assert.match(hostSource, /ChartSettingsScreen[\s\S]*hosted[\s\S]*onHostedBack=\{closeHost\}/);
  assert.match(hostSource, /setNativeProps/);
  assert.match(controllerSource, /export function showChartSettingsHost/);
  assert.match(controllerSource, /visualApplier\?\.\(true\)/);
  assert.match(controllerSource, /visualApplier\?\.\(false\)/);
  assert.match(settingsSource, /hosted\?: boolean/);
  assert.match(settingsSource, /onHostedBack\?: \(\) => void/);
  assert.match(rootSource, /import \{ ChartSettingsHost \} from/);
  assert.match(
    rootSource,
    /<ChartSettingsHost \/>[\s\S]*<ChartConfigDestinationHost \/>[\s\S]*<SidebarDrawer \/>/,
  );
});

test('Schema & Colors primes Bid immediately while deferring candles and WebView content', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const previewHostStart = source.indexOf('<View style={[styles.previewChart');
  const previewHostSource = source.slice(previewHostStart, previewHostStart + 900);

  assert.match(source, /SCHEMA_COLORS_PREVIEW_DELAY_MS = 120/);
  assert.match(source, /useDeferredRouteContentReady\(\s*SCHEMA_COLORS_PREVIEW_DELAY_MS,\s*isScreenFocused,\s*\)/);
  assert.match(source, /const quoteActive = \(hosted \|\| navigationFocused\) && !colorEditorOpen/);
  assert.match(source, /const previewActive = previewContentReady && isScreenFocused && !colorEditorOpen/);
  assert.match(source, /useLiveSymbolQuote\(chartSymbol, quoteActive, 0\)/);
  assert.doesNotMatch(source, /useLiveSymbolQuote\(chartSymbol, previewActive, 0\)/);
  assert.match(source, /useLiveCandles\(chartSymbol, chartTimeframe, previewActive\)/);
  // Hosted layers must not inherit useIsFocused() (always true outside a
  // navigator screen); only hostedActive may activate a hosted instance.
  assert.match(source, /const isScreenFocused = hosted \? hostedActive : navigationFocused/);
  assert.notEqual(previewHostStart, -1);
  assert.match(previewHostSource, /\{previewContentReady \? \([\s\S]*<LiveChartPreview/);
  assert.match(previewHostSource, /testID="chart-live-preview-placeholder"[\s\S]*style=\{StyleSheet\.absoluteFillObject\}/);
  assert.match(source, /previewChart: \{\s*height: 240,/);
  // Closed Android Modal windows must not be created during the destination's
  // first mount; their dialog surface can otherwise flash before visible=false
  // reaches the native window.
  assert.match(source, /\{schemeModalOpen \? \(\s*<Modal/);
  assert.match(source, /\{activeColorKey !== null \? \(\s*<Modal/);
});

test('Schema & Colors reuses the retained Chart timeframe picker without reconciling the preview', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const metaStart = source.indexOf('{chartDisplay.showTicker && (');
  const metaEnd = source.indexOf('{chartDisplay.showOHLC', metaStart);
  const metaSource = source.slice(metaStart, metaEnd);
  const hostStart = source.indexOf('const ChartPropertiesTimeframePickerHost =');
  const screenStart = source.indexOf('export function ChartPropertiesScreen');
  const hostSource = source.slice(hostStart, screenStart);
  const screenSource = source.slice(screenStart);
  const openStart = screenSource.indexOf('const handleOpenTimeframePicker');
  const openEnd = screenSource.indexOf('const handleTimeframeSelect', openStart);
  const openSource = screenSource.slice(openStart, openEnd);
  const hostOpenStart = hostSource.indexOf('const open = useCallback');
  const hostOpenEnd = hostSource.indexOf('React.useImperativeHandle', hostOpenStart);
  const hostOpenSource = hostSource.slice(hostOpenStart, hostOpenEnd);

  assert.match(source, /import \{ CANDLE_HISTORY_TIMEFRAMES \} from '\.\.\/\.\.\/domain\/candles\/core\/timeframeUtils'/);
  assert.match(source, /import \{ ChartTimeframePickerOverlay \} from '\.\.\/chart\/components\/ChartTimeframePickerSheet'/);
  assert.match(source, /import \{[\s\S]*createChartTimeframePickerController,[\s\S]*type ChartTimeframePickerController,[\s\S]*\} from '\.\.\/chart\/chartTimeframePickerController'/);
  assert.notEqual(hostStart, -1);
  assert.notEqual(screenStart, -1);
  assert.match(hostSource, /React\.memo\(React\.forwardRef</);
  assert.match(hostSource, /const \[controller\] = useState<ChartTimeframePickerController>\([\s\S]*createChartTimeframePickerController/);
  assert.match(hostSource, /React\.useImperativeHandle\(ref, \(\) => \(\{ open \}\), \[open\]\)/);
  assert.match(hostOpenSource, /if \(!active\) return;[\s\S]*controller\.show\(\)/);
  assert.doesNotMatch(hostOpenSource, /\bset[A-Z]\w*\s*\(|requestAnimationFrame|setTimeout|useUserPreferences/);
  assert.match(hostSource, /useEffect\(\(\) => \{\s*if \(!active\) \{\s*controller\.hide\(\)/);
  assert.match(hostSource, /const handleSelect = useCallback\(\(timeframe: string\) => \{\s*controller\.hide\(\);\s*onSelect\(timeframe\)/);
  assert.match(hostSource, /return \(\s*<ChartTimeframePickerOverlay/);
  assert.match(hostSource, /<ChartTimeframePickerOverlay[\s\S]*controller=\{controller\}[\s\S]*activeTimeframe=\{activeTimeframe\}[\s\S]*supportedTimeframes=\{CANDLE_HISTORY_TIMEFRAMES\}[\s\S]*accentColor=\{accentColor\}[\s\S]*isDark=\{isDark\}[\s\S]*textColor=\{textColor\}[\s\S]*mutedColor=\{mutedColor\}[\s\S]*onSelect=\{handleSelect\}/);
  assert.doesNotMatch(hostSource, /\bhostReady\b|\bsetHostReady\b|return null|<Modal|<ActionSheet/);
  assert.doesNotMatch(hostSource, /\{(?:timeframePickerOpen|visible)\s*\?\s*\(/);
  assert.doesNotMatch(screenSource, /const \[timeframePickerOpen, setTimeframePickerOpen\]|setTimeframePickerOpen\(|<ActionSheet/);
  assert.match(source, /const timeframePickerHostRef = useRef<ChartPropertiesTimeframePickerHostHandle>\(null\)/);
  assert.match(openSource, /timeframePickerHostRef\.current\?\.open\(\)/);
  assert.doesNotMatch(openSource, /\bset[A-Z]\w*\s*\(|requestAnimationFrame|setTimeout|useUserPreferences/);
  assert.match(source, /const handleTimeframeSelect = useCallback\(\(nextTimeframe: string\) => \{[\s\S]*useUserPreferences\.getState\(\)[\s\S]*preferences\.setChartTimeframe\(nextTimeframe\)/);
  assert.notEqual(metaStart, -1);
  assert.notEqual(metaEnd, -1);
  assert.match(metaSource, /<Pressable[\s\S]*accessibilityRole="button"[\s\S]*accessibilityLabel=\{t\('Select Timeframe'\)\}[\s\S]*accessibilityValue=\{\{ text: chartTimeframe \}\}[\s\S]*onPress=\{handleOpenTimeframePicker\}/);
  assert.match(metaSource, /activateOnPressIn[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="chartProperties\.timeframePicker\.open"/);
  assert.match(metaSource, /chartSymbol\.replace[\s\S]*chartTimeframe[\s\S]*name="chevron-down"/);
  assert.match(screenSource, /<\/ScrollView>\s*<ChartPropertiesTimeframePickerHost[\s\S]*ref=\{timeframePickerHostRef\}[\s\S]*active=\{isScreenFocused\}[\s\S]*activeTimeframe=\{chartTimeframe\}[\s\S]*accentColor=\{T\.trading\.buy\.primary\}[\s\S]*isDark=\{isDark\}[\s\S]*textColor=\{T\.text\}[\s\S]*mutedColor=\{T\.textMuted\}[\s\S]*onSelect=\{handleTimeframeSelect\}/);
  assert.doesNotMatch(source, /showChartTimeframePicker|hideChartTimeframePicker/);
  assert.match(source, /useLiveCandles\(chartSymbol, chartTimeframe, previewActive\)/);
  assert.match(source, /<LiveChartPreview[\s\S]*timeframe=\{chartTimeframe\}/);
});

test('root layout mounts ChartSettingsHost and ChartConfigDestinationHost with other retained hosts', () => {
  const rootSource = readSource('app/_layout.tsx');
  assert.match(rootSource, /import \{ ChartConfigDestinationHost \} from/);
  assert.match(rootSource, /import \{ ChartSettingsHost \} from/);
  assert.match(rootSource, /import \{ TradePositionActionHost \} from/);
  assert.match(
    rootSource,
    /<TradePositionActionHost \/>[\s\S]*<ChartSettingsHost \/>[\s\S]*<ChartConfigDestinationHost \/>[\s\S]*<SidebarDrawer \/>/,
  );
});


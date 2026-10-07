import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourceRoots = ['app', 'src'];

const readSource = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), 'utf8');

const collectFiles = (dir: string): string[] => {
  const absoluteDir = resolve(root, dir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = join(absoluteDir, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return collectFiles(relative(root, absolutePath));
    }

    if (!/\.(tsx?)$/.test(entry) || /\.test\.(tsx?)$/.test(entry)) {
      return [];
    }

    return [relative(root, absolutePath).replace(/\\/g, '/')];
  });
};

const allSourceFiles = sourceRoots.flatMap(collectFiles);

const readAllSource = () =>
  allSourceFiles.map((file) => readSource(file)).join('\n');

test('shared ActionSheet surfaces use the instant host contract', () => {
  const allSource = readAllSource();
  const actionSheetMounts = [...allSource.matchAll(/<ActionSheet\b[\s\S]*?\/>/g)];
  const scopedActionSheetCalls = [
    ...allSource.matchAll(/\bshow(?:Chart|Trade|History|Accounts|BrokerDetail)ActionSheet\(/g),
  ];

  // Mailbox/News/Community screens removed — fewer mounts and no News sheet scope.
  // Quotes now owns a dedicated implementation and is deliberately excluded
  // from both the shared mounts and the shared scoped-call inventory.
  // The retained auth form contributes country and leverage pickers.
  assert.equal(actionSheetMounts.length, 21);
  assert.equal(scopedActionSheetCalls.length, 13);

  for (const mount of actionSheetMounts) {
    assert.match(mount[0], /instantOpen/, 'ActionSheet mount must opt into instant open path');
    assert.match(mount[0], /detent/, 'ActionSheet mount must declare or forward a stable detent');
  }

  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const uiStateSource = readSource('src/state/uiState.ts');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');

  assert.match(actionSheetSource, /activeConfig\.instantOpen \?\? true/);
  assert.match(actionSheetSource, /activateOnPressIn/);
  assert.match(actionSheetSource, /const activateInlineActionOnTouchStart =[\s\S]*isMt5PlainPresentation[\s\S]*shouldRenderInlineActions[\s\S]*action\.activateOnPressIn === true/);
  assert.match(actionSheetSource, /activateOnTouchStart=\{activateInlineActionOnTouchStart\}/);
  assert.match(tabsLayoutSource, /presentation=\{activeConfig\?\.presentation\}/);
  assert.match(tabsLayoutSource, /showActionIcons=\{activeConfig\?\.showActionIcons\}/);
  assert.match(tabsLayoutSource, /deferOffscreenActions=\{activeConfig\?\.deferOffscreenActions\}/);
  assert.match(tabsLayoutSource, /maximumVisibleActionRows=\{activeConfig\?\.maximumVisibleActionRows\}/);
  assert.match(tabsLayoutSource, /androidKeyboardAvoidance=\{activeConfig\?\.androidKeyboardAvoidance\}/);
  assert.match(tabsLayoutSource, /entryMotion=\{activeConfig\?\.entryMotion\}/);
  assert.match(tabsLayoutSource, /visualKey=\{activeConfig\?\.visualKey\}/);
  assert.match(tabsLayoutSource, /const activeConfig = actionSheet \|\| scopedActionSheet \|\| scopedPreloadConfig \|\| preloadConfig/);
  assert.match(tabsLayoutSource, /const visible = actionSheet !== null \|\| scopedActionSheet !== null/);
  assert.match(uiStateSource, /showActionSheet: \(config\) => set\(\{ actionSheet: withInstantActionSheetOpen\(config\) \}\)/);
  assert.match(uiStateSource, /config\.instantOpen === true \? config : \{ \.\.\.config, instantOpen: true \}/);
  assert.match(uiStateSource, /entryMotion\?: 'instant' \| 'mt5Slide' \| 'standard'/);
  assert.match(uiStateSource, /deferOffscreenActions\?: boolean/);
  assert.match(uiStateSource, /maximumVisibleActionRows\?: number/);
  assert.match(actionSheetSource, /registerRetainedActionSheetVisualApplier/);
  assert.match(actionSheetSource, /retainedSnapshot\.mode === 'preview'[\s\S]*overlayOpacity\.setValue\(0\)[\s\S]*pointerEvents: 'none'[\s\S]*return true/);
  assert.match(actionSheetSource, /retainedSnapshot\.mode === 'committed'/);
  assert.match(actionSheetSource, /retainedVisualOwnerRef\.current\?\.revision === retainedSnapshot\.revision/);
  assert.match(actionSheetSource, /const interactive = retainedSnapshot\.mode === 'committed'/);
  assert.match(actionSheetSource, /pointerEvents: interactive \? 'auto' : 'none'/);
  assert.match(actionSheetSource, /acknowledgeRetainedActionSheetVisible\(activeVisualKey\)/);
  assert.match(actionSheetSource, /acknowledgeRetainedActionSheetVisible\(activeVisualKey\)[\s\S]*pointerEvents: 'auto'/);
  assert.match(actionSheetSource, /retainedVisualOwnerRef\.current === null/);
  assert.match(actionSheetSource, /if \(!visible\) \{[\s\S]*syncRetainedActionSheetVisual\(\)/);
  assert.match(actionSheetSource, /syncRetainedActionSheetVisual\(\)/);
  assert.match(actionSheetSource, /const interruptedClose = closeAnimationRunningRef\.current[\s\S]*closeAnimationRunningRef\.current = false[\s\S]*refreshHiddenConfig/);
});

test('opening the next sheet restores a shared host hidden by an MT5 close', () => {
  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const visibilityEffectStart = actionSheetSource.indexOf('useLayoutEffect(() => {');
  const visibilityEffectEnd = actionSheetSource.indexOf(
    'const applyRetainedVisualSnapshot',
    visibilityEffectStart,
  );
  const visibilityEffectSource = actionSheetSource.slice(
    visibilityEffectStart,
    visibilityEffectEnd,
  );

  assert.match(
    actionSheetSource,
    /const activeUsesTransparentMt5Host =[\s\S]*activePresentation === 'mt5Plain' \|\| activePresentation === 'mt5TimeframeGrid'/,
  );
  assert.match(
    visibilityEffectSource,
    /if \(visible\) \{[\s\S]*if \(hostHiddenImperativelyRef\.current\) \{[\s\S]*overlayLayerRef\.current\?\.setNativeProps\(\{[\s\S]*style: \{ opacity: 1 \}[\s\S]*hostHiddenImperativelyRef\.current = false/,
  );
});

test('an open MT5 sheet runs its entry animation only once per visibility transition', () => {
  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');

  assert.match(actionSheetSource, /const entryAnimationStartedForOpenRef = useRef\(false\)/);
  assert.match(
    actionSheetSource,
    /if \(visible\) \{[\s\S]*entryAnimationStartedForOpenRef\.current = false;[\s\S]*openedAtRef\.current = Date\.now\(\)/,
  );
  assert.match(
    actionSheetSource,
    /retainedAdoptionVisualKeyRef\.current = null;[\s\S]*entryAnimationStartedForOpenRef\.current = true;[\s\S]*if \(entryAnimationStartedForOpenRef\.current\) \{[\s\S]*return;[\s\S]*entryAnimationStartedForOpenRef\.current = true;[\s\S]*runEntryAnimation\(activeEntryMotion\)/,
  );
});

test('the Quotes symbol sheet stays outside the shared ActionSheet host', () => {
  const quotesSource = readSource('src/features/quotes/QuotesScreen.tsx');
  const quotesSheetSource = readSource('src/features/quotes/QuotesSymbolActionSheet.tsx');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');

  assert.match(
    quotesSource,
    /const openQuotesSymbolSheet = useCallback[\s\S]*runImmediateAction\(actionName, \(\) => \{[\s\S]*presentQuotesSymbolActionSheet\(config\)/,
  );
  assert.match(quotesSource, /openQuotesSymbolSheet\(\s*config,\s*'quotes\.symbolSheet\.tap\.open'/);
  assert.match(quotesSource, /openQuotesSymbolSheet\(\s*config,\s*'quotes\.symbolSheet\.longPress\.open'/);
  assert.doesNotMatch(
    quotesSource,
    /showQuotesActionSheet|preloadQuotesActionSheet|showScopedActionSheet|preloadScopedActionSheet|ensureQuoteSheetConfigMounted|scheduleQuoteSheetConfigPaint/,
  );
  assert.doesNotMatch(
    quotesSheetSource,
    /from ['"][^'"]*ui\/components\/ActionSheet(?:\/index)?['"]|from ['"][^'"]*state\/uiState['"]|<ActionSheet\b/,
  );
  assert.match(quotesSheetSource, /export const QuotesSymbolActionSheetHost = memo/);
  assert.match(
    tabsLayoutSource,
    /<GlobalActionSheetHost \/>[\s\S]*<QuotesSymbolActionSheetHost \/>/,
    'the dedicated Quotes host must mount independently from the shared host',
  );
});

test('high-traffic shared action sheets open through immediate action wrappers', () => {
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const historySource = readSource('src/features/history/HistoryScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');

  assert.match(tradeSource, /runImmediateAction\('trade\.bulkSheet\.open'[\s\S]*showTradeActionSheet\(bulkActionSheetConfig\)/);
  assert.match(tradeSource, /const bulkActionSheetConfig = useMemo[\s\S]*entryMotion: 'mt5Slide'[\s\S]*runActionAfterClose: false/);
  assert.match(tradeSource, /runImmediateAction\('trade\.positionSheet\.open'[\s\S]*showTradeActionSheet\(\{/);
  assert.match(historySource, /const historySortSheetConfig = useMemo[\s\S]*title: t\('Sort By'\),[\s\S]*presentation: 'mt5Plain'[\s\S]*entryMotion: 'mt5Slide'[\s\S]*runActionAfterClose: false[\s\S]*actions: SORT_OPTIONS\.map/);
  assert.match(historySource, /runImmediateAction\('history\.sortSheet\.open'[\s\S]*showHistoryActionSheet\(historySortSheetConfig\)/);
  assert.match(accountsSource, /const accountsOptionsSheetConfig = React\.useMemo[\s\S]*entryMotion: 'mt5Slide'[\s\S]*runActionAfterClose: false/);
  assert.match(accountsSource, /runImmediateAction\('accounts\.optionsSheet\.open'[\s\S]*showAccountsActionSheet\(accountsOptionsSheetConfig\)/);
  assert.match(brokerDetailSource, /runImmediateAction\('brokerDetail\.serverSheet\.open'[\s\S]*showBrokerDetailActionSheet\(\{/);
  assert.match(chartSource, /runImmediateAction\('chart\.symbolPicker\.open'[\s\S]*showChartSymbolPickerSheet\(/);
  // Timeframe uses a retained centered overlay (not the shared bottom ActionSheet).
  assert.match(chartSource, /runImmediateAction\('chart\.timeframePicker\.open'[\s\S]*showChartTimeframePicker\(\)/);
  assert.match(chartSource, /runImmediateAction\('chart\.drawingTools\.open'[\s\S]*showChartActionSheet\(drawingToolsActionSheetConfig\)/);
  assert.match(chartSource, /runImmediateAction\('chart\.moreMenu\.open'[\s\S]*(?:showChartActionSheet|openChartActionSheetSmoothly)\(/);
});

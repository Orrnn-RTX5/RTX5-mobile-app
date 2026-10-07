import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('trade bulk action sheet uses the MT5 plain icon action contract', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const bulkConfigStart = source.indexOf('const bulkActionSheetConfig = useMemo');
  const bulkConfigEnd = source.indexOf('const showBulkSheet = useCallback', bulkConfigStart);
  const bulkConfigSource = source.slice(bulkConfigStart, bulkConfigEnd);

  assert.notEqual(bulkConfigStart, -1);
  assert.notEqual(bulkConfigEnd, -1);
  assert.match(bulkConfigSource, /presentation:\s*'mt5Plain'/);
  assert.match(bulkConfigSource, /showActionIcons:\s*true/);
  assert.match(bulkConfigSource, /entryMotion:\s*'mt5Slide'/);
  assert.match(bulkConfigSource, /runActionAfterClose:\s*false/);
  assert.doesNotMatch(bulkConfigSource, /title:\s*t\('Bulk Operations'\)/);
  assert.match(bulkConfigSource, /name="close-circle-outline"[\s\S]*label: t\('Close All Positions'\)/);
  assert.match(bulkConfigSource, /name="trending-up-outline"[\s\S]*label: t\('Close Profitable Positions'\)/);
  assert.match(bulkConfigSource, /name="trending-down-outline"[\s\S]*label: t\('Close Losing Positions'\)/);
  assert.match(bulkConfigSource, /name="arrow-up-circle-outline"[\s\S]*label: t\('Close Buy Positions'\)/);
  assert.match(bulkConfigSource, /name="arrow-down-circle-outline"[\s\S]*label: t\('Close Sell Positions'\)/);
});

test('trade position long-press action sheet uses the MT5 plain icon action contract', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const positionSheetStart = source.indexOf('const showPositionSheet = useCallback');
  const positionSheetEnd = source.indexOf('const renderPositionRow = useCallback', positionSheetStart);
  const positionSheetSource = source.slice(positionSheetStart, positionSheetEnd);

  assert.notEqual(positionSheetStart, -1);
  assert.notEqual(positionSheetEnd, -1);
  assert.match(positionSheetSource, /presentation:\s*'mt5Plain'/);
  assert.match(positionSheetSource, /showActionIcons:\s*true/);
  assert.match(positionSheetSource, /detent:\s*'auto'/);
  assert.match(positionSheetSource, /runActionAfterClose:\s*false/);
  assert.doesNotMatch(positionSheetSource, /detent:\s*'adaptive'/);
  assert.doesNotMatch(positionSheetSource, /title:\s*`#\$\{item\.id\}/);
  assert.match(source, /const TRADE_POSITION_CLOSE_ACTION_LIGHT = '#000000'/);
  assert.match(source, /const TRADE_POSITION_CLOSE_ACTION_DARK = '#EEF1F5'/);
  assert.match(source, /const TRADE_POSITION_CLOSE_ACTION_FONT_WEIGHT = '400'/);
  assert.match(source, /const positionCloseActionColor = isDark \? TRADE_POSITION_CLOSE_ACTION_DARK : TRADE_POSITION_CLOSE_ACTION_LIGHT/);
  assert.match(positionSheetSource, /name="close-circle-outline"[\s\S]*color=\{positionCloseActionColor\}[\s\S]*label: t\('Close position'\)[\s\S]*textColor: positionCloseActionColor[\s\S]*textFontWeight: TRADE_POSITION_CLOSE_ACTION_FONT_WEIGHT/);
  assert.doesNotMatch(positionSheetSource, /label: t\('Close position'\)[\s\S]*danger: true/);
  assert.doesNotMatch(positionSheetSource, /label: t\('Close By'\)|showTradePositionAction\('close-by'/);
  assert.doesNotMatch(positionSheetSource, /color=\{T\.trading\.sell\.primary\}/);
  assert.match(positionSheetSource, /name="create-outline"[\s\S]*label: t\('Modify position'\)[\s\S]*activateOnPressIn:\s*true/);
  assert.match(
    positionSheetSource,
    /if \(isExistingPositionModifyBackendLocked\(\)\) \{[\s\S]*Alert\.alert\(t\(SLTP_COMING_SOON_TITLE\), t\(getActiveSltpUnavailableMessage\(\)\)\);[\s\S]*return;[\s\S]*\}[\s\S]*primePositionSnapshot\(item\);[\s\S]*showTradePositionAction\('modify', item\.id\)/,
  );
  assert.match(positionSheetSource, /name="swap-horizontal-outline"[\s\S]*label: t\('Trade'\)/);
  assert.match(positionSheetSource, /name="analytics-outline"[\s\S]*label: t\('Chart'\)/);
});

test('retained position action screens conceal the native tab bar without collapsing its layout', () => {
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');

  assert.match(tabsLayoutSource, /useSyncExternalStore/);
  assert.match(tabsLayoutSource, /tradePositionActionHostController\.subscribe/);
  const hideMenuSource = tabsLayoutSource.slice(
    tabsLayoutSource.indexOf('const shouldHideMenu ='),
    tabsLayoutSource.indexOf('const shouldConcealMenuForTradeAction ='),
  );
  assert.doesNotMatch(hideMenuSource, /tradePositionActionSnapshot\.visible/);
  assert.match(tabsLayoutSource, /tabBarStyle: shouldHideMenu[\s\S]*display: 'none'/);
  assert.match(
    tabsLayoutSource,
    /shouldConcealMenuForTradeAction && \{[\s\S]*opacity: 0,[\s\S]*transform: \[\{ translateY: tabBarHeight \}\]/,
  );
});

test('trade position swipe drawer stays visible on iOS', () => {
  const tradeScreenSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');

  assert.match(tradeScreenSource, /import \{ Alert, Text, View, FlatList, Platform \} from 'react-native'/);
  assert.match(tradeScreenSource, /removeClippedSubviews=\{Platform\.OS === 'android'\}/);
  assert.match(rowSource, /const TRADE_ROW_SWIPE_ACTIVE_OFFSET_X: \[number, number\] = Platform\.OS === 'ios' \? \[-10, 10\] : \[-18, 18\]/);
  assert.match(rowSource, /const TRADE_ROW_SWIPE_FAIL_OFFSET_Y: \[number, number\] = Platform\.OS === 'ios' \? \[-28, 28\] : \[-10, 10\]/);
  assert.match(rowSource, /const TRADE_ROW_SWIPE_OPEN_VELOCITY_X = Platform\.OS === 'ios' \? -360 : -500/);
  assert.match(rowSource, /\.activeOffsetX\(TRADE_ROW_SWIPE_ACTIVE_OFFSET_X\)[\s\S]*\.failOffsetY\(TRADE_ROW_SWIPE_FAIL_OFFSET_Y\)/);
  assert.match(rowSource, /event\.velocityX < TRADE_ROW_SWIPE_OPEN_VELOCITY_X/);
});

test('trade position swipe actions have separated visual and touch targets', () => {
  const overlaySource = readSource('src/ui/components/TradePositionRow/OverlayActions.tsx');
  const stylesSource = readSource('src/ui/components/TradePositionRow/styles.ts');
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const tradeScreenSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');

  assert.equal(
    (overlaySource.match(/hitSlop=\{0\}/g) ?? []).length,
    6,
    'every position action must use the non-overlapping hit target',
  );
  assert.doesNotMatch(overlaySource, /hitSlop=\{12\}|activateOnPressIn|activateOnTouchStart/);
  assert.match(
    stylesSource,
    /actionBtnContainer: \{[\s\S]*width: 44,[\s\S]*height: 44,[\s\S]*marginLeft: 0,[\s\S]*alignItems: 'center',[\s\S]*justifyContent: 'center'/,
  );
  assert.match(stylesSource, /actionBtnPressable: \{[\s\S]*borderRadius: 24/);
  assert.match(stylesSource, /actionBtn: \{[\s\S]*width: 38,[\s\S]*height: 38/);
  assert.match(overlaySource, /accessibilityLabel=\{t\('Close Sell Positions'\)\}[\s\S]*name="arrow-down-circle-outline"/);
  assert.match(rowSource, /onCloseSell=\{onCloseSellPress \? \(\) => runOverlayAction\(onCloseSellPress\) : undefined\}/);
  assert.match(tradeScreenSource, /const showCloseSellPositions = useCallback\(\(\) => \{[\s\S]*navigateToBulkMode\('sell'\)/);
});

test('trade rows and summary use direct live websocket quote listeners', () => {
  const tradeScreenSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const summaryHeaderSource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');

  assert.doesNotMatch(tradeScreenSource, /const liveQuotes = useLiveSymbolQuotes\(liveQuoteSymbols, tradeLiveActive, 0\)/);
  assert.doesNotMatch(tradeScreenSource, /quotesWsService\.setSubscriptions/);
  assert.doesNotMatch(tradeScreenSource, /liveQuote=\{resolveTradeRowLiveQuote\(liveQuotes, item\.symbol\)\}/);
  assert.match(tradeScreenSource, /active=\{tradeLiveActive\}/);
  assert.match(tradeScreenSource, /extraData=\{flatListExtraData\}/);
  assert.match(tradeScreenSource, /const flatListExtraData = useMemo\([\s\S]*rowActivationKey/);
  assert.match(rowSource, /const liveQuote = useLiveSymbolQuote\(item\.symbol, active, 0\)/);
  assert.doesNotMatch(rowSource, /liveQuoteOverride|liveQuote\?: Partial<QuoteItem>/);
  // Commit interval is parameterized (default 0) so the always-mounted
  // tab-bar P/L badge can throttle its copy of the stream.
  assert.match(summaryHeaderSource, /useLiveSymbolQuotes\(liveQuoteSymbols, active, quoteCommitIntervalMs\)/);
  assert.match(summaryHeaderSource, /quoteCommitIntervalMs = 0/);
  assert.match(summaryHeaderSource, /positions\.map\(\(position\) => position\.symbol\)/);
  assert.doesNotMatch(summaryHeaderSource, /liveQuotes: Record<string, Partial<QuoteItem> \| undefined>/);
});

test('trade expanded position row shows backend point metadata and backend account leverage', () => {
  const tradeScreenSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const expandedStart = rowSource.indexOf('{expanded && (');
  const expandedEnd = rowSource.indexOf('{/* Render overlay', expandedStart);
  assert.notEqual(expandedStart, -1, 'expanded details section must exist');
  assert.notEqual(expandedEnd, -1, 'expanded details section boundary must exist');

  const expandedSource = rowSource.slice(expandedStart, expandedEnd);
  assert.match(tradeScreenSource, /import \{ useAccountSummary \} from '..\/..\/..\/query\/account'/);
  assert.match(tradeScreenSource, /const accountLoginString = resolvedLogin !== undefined \? String\(resolvedLogin\) : undefined/);
  assert.match(tradeScreenSource, /useAccountSummary\(accountLoginString, \{[\s\S]*enabled: tradeFetchActive && !!accountLoginString/);
  assert.match(tradeScreenSource, /const accountLeverage = typeof accountSummary\?\.leverage === 'number'[\s\S]*\? accountSummary\.leverage[\s\S]*: null/);
  assert.match(tradeScreenSource, /accountLeverage=\{accountLeverage\}/);
  assert.match(tradeScreenSource, /const flatListExtraData = useMemo\([\s\S]*accountLeverage[\s\S]*rowActivationKey/);
  assert.match(rowSource, /import \{ useInstrumentMeta \} from '..\/..\/..\/query\/instruments'/);
  assert.match(rowSource, /accountLeverage\?: number \| null/);
  assert.match(rowSource, /const \{ data: instrumentMeta \} = useInstrumentMeta\(item\.symbol, active\)/);
  assert.match(rowSource, /const pointValue = resolveTradePositionPointValue\(\{ instrumentMeta, liveQuote \}\)/);
  assert.match(rowSource, /const pointText = formatPointSize\(pointValue\)/);
  assert.match(rowSource, /const leverageText = formatTradeLeverage\(accountLeverage\)/);
  assert.match(expandedSource, />Point size<\/Text>[\s\S]*\{pointText\}/);
  assert.match(expandedSource, />Leverage<\/Text>[\s\S]*\{leverageText\}/);
  // The Limits value is the single intentional tap target, and it must fire on
  // press RELEASE (never touch-down) so the row's swipe pan can cancel it when
  // a swipe starts on the text. Everything else stays static metadata.
  const expandedPressHandlers = expandedSource.match(/onPress(?:In)?=\{[^}]+\}/g) ?? [];
  assert.deepEqual(expandedPressHandlers, ['onPress={navigateToModifyPosition}']);
  assert.doesNotMatch(expandedSource, /ActionSheet|Select/);
});

test('trade expanded point display never guesses from symbol classes or tick size', () => {
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');

  assert.doesNotMatch(rowSource, /resolveSymbolPointFallback|FIAT_SYMBOL_CODES|instrumentMeta\?\.tickSize|liveQuote\?\.tickSize/);
  assert.match(rowSource, /from '\.\.\/\.\.\/\.\.\/utils\/pricePoint'/);
});

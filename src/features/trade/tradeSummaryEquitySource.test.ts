import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readTradeSummarySource = () => readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/SummaryHeader.tsx'), 'utf8');
const readTradeScreenSource = () => readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/TradeScreen.tsx'), 'utf8');
const readTradeStylesSource = () => readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/styles.ts'), 'utf8');

/** Splits SummaryHeader into its pinned hero half and its scrolling details half. */
function summaryHeaderHalves() {
  const summarySource = readTradeSummarySource();
  const heroStart = summarySource.indexOf('const LiveUnrealizedPnLHeader = React.memo(');
  const detailsStart = summarySource.indexOf('export const TradeSummaryDetailsHeader = React.memo(');

  assert.notEqual(heroStart, -1);
  assert.notEqual(detailsStart, -1);
  assert.ok(heroStart < detailsStart);

  return {
    summarySource,
    hero: summarySource.slice(heroStart, detailsStart),
    details: summarySource.slice(detailsStart),
  };
}

test('trade summary keeps equity in expanded details, not the floating pnl header', () => {
  const { hero, details } = summaryHeaderHalves();

  assert.match(hero, /\{t\('Floating Profit\/Loss'\)\}/);
  assert.match(hero, /\{fmt\.pnlPrecise\(safeFloating\)\} \{accountCurrency\}/);
  assert.doesNotMatch(hero, /\{t\('Equity'\)\}/);
  assert.doesNotMatch(hero, /\{fmt\.decimal\(safeEquity\)\}/);
  assert.match(details, /\{t\('Equity'\)\}[\s\S]*\{fmt\.decimal\(safeEquity\)\}/);
});

test('trade floating pnl readout stays blank until a position is open', () => {
  const { hero, summarySource } = summaryHeaderHalves();

  const gateStart = hero.indexOf('{hasOpenPositions ? (');
  const valueIndex = hero.indexOf('{fmt.pnlPrecise(safeFloating)} {accountCurrency}');
  const gateEnd = hero.indexOf(') : null}', valueIndex);

  assert.notEqual(gateStart, -1);
  assert.notEqual(valueIndex, -1);
  assert.notEqual(gateEnd, -1);
  assert.ok(
    gateStart < valueIndex && valueIndex < gateEnd,
    'the floating P/L value must sit inside the hasOpenPositions gate',
  );

  assert.match(hero, /hasOpenPositions: boolean/);
  assert.match(summarySource, /hasOpenPositions=\{positions\.length > 0\}/);
  // The label stays put so the row reads as "nothing open yet", not as a layout bug.
  assert.match(hero, /\{t\('Floating Profit\/Loss'\)\}/);
});

test('trade summary renders normalized margin fields and uses the REST summary as fallback', () => {
  const summarySource = readTradeSummarySource();

  assert.match(summarySource, /label=\{t\('Margin'\)\} value=\{fmt\.decimal\(safeMargin\)\}/);
  assert.match(summarySource, /label=\{t\('Free Margin'\)\} value=\{fmt\.decimal\(safeFreeMargin\)\}/);
  // margin_level 0 means no margin is used and renders as an em dash.
  assert.match(summarySource, /label=\{t\('Margin Level'\)\} value=\{formatMarginLevel\(safeMarginLevel, fmt\.decimal\)\}/);
  assert.match(summarySource, /floating: restAccountSummary\.profit/);
  assert.match(summarySource, /restTradingAccount \?\? selectedTradingAccount/);
  assert.match(summarySource, /metricFlags: state\.metricFlags/);
});

test('trade pins its hero when space permits and scrolls account details and positions header', () => {
  const { summarySource, hero, details } = summaryHeaderHalves();
  const tradeScreenSource = readTradeScreenSource();

  // The scroll-direction collapse animation is gone — the details scroll for real,
  // exactly like the History screen's summary details.
  assert.doesNotMatch(summarySource, /visibilityProgress|useAnimatedStyle|summaryMetricsReveal|react-native-reanimated/);
  assert.doesNotMatch(tradeScreenSource, /tradeSummaryVisibility|animateTradeSummaryVisibility|handleTradePositionsScroll|TRADE_SUMMARY_/);
  assert.doesNotMatch(tradeScreenSource, /onScrollBeginDrag=|onScrollEndDrag=|onMomentumScrollEnd=/);

  // The pinned hero is a tap target that toggles the persisted details visibility.
  assert.match(hero, /latencyLabel="trade\.summary\.toggle"/);
  assert.match(hero, /accessibilityState=\{\{ expanded: detailsVisible \}\}/);
  assert.match(hero, /detailsVisible && s\.summaryBlockFused/);
  assert.match(summarySource, /state\.tradeSummaryDetailsVisible/);
  assert.match(summarySource, /state\.setTradeSummaryDetailsVisible/);
  // History parity: the toggle is the row itself, with no extra affordance chrome.
  assert.doesNotMatch(summarySource, /summaryDetailsActionLabel|summaryDetailsActionIcon/);
  assert.doesNotMatch(summarySource, /t\('Hide'\)|t\('Details'\)|expand-outline|chevron-up/);

  // The scrolling half holds the details card and the Positions/Bulk header.
  assert.match(details, /detailsVisible \? \(/);
  assert.match(details, /s\.summaryDetailsCard[\s\S]*s\.positionsHeader/);
  assert.match(details, /latencyLabel="trade\.bulk\.open"[\s\S]*activateOnTouchStart/);

  // It renders from the FlatList header, and the list is still threaded through
  // TradeSummaryHeader so the pinned hero stays its earlier sibling in the tree.
  assert.match(tradeScreenSource, /ListHeaderComponent=\{\s*<TradeSummaryDetailsHeader/);
  assert.match(tradeScreenSource, /<TradeSummaryHeader[\s\S]*active=\{tradeLiveActive\}/);
  assert.match(tradeScreenSource, /shouldScrollTradingSummary\(useResponsiveLayout\(\)\)/);
  assert.match(tradeScreenSource, /<TradeSummaryHeader[^>]*scrollSummary=\{scrollSummary\}/);
  assert.match(tradeScreenSource, /<TradeSummaryDetailsHeader[^>]*scrollSummary=\{scrollSummary\}/);
  assert.match(summarySource, /\{!scrollSummary \? <TradeFloatingSummaryHeader/);
  assert.match(details, /\{scrollSummary \? <TradeFloatingSummaryHeader/);
  assert.match(details, /scrollSummary && s\.summaryDetailsCardScrolling/);
  assert.ok(
    tradeScreenSource.indexOf('<TradeSummaryHeader') < tradeScreenSource.indexOf('<FlatList'),
    'the pinned hero must still precede the positions FlatList',
  );
});

test('trade summary shares one live account subscription between both halves', () => {
  const { summarySource } = summaryHeaderHalves();

  // useLiveSymbolQuotes attaches a per-symbol tick listener and commits a snapshot
  // every frame, so the two halves must not each call the hook.
  assert.equal(summarySource.match(/useTradeLiveAccountSummary\(\{/g)?.length, 1);
  assert.match(summarySource, /React\.createContext<TradeAccountSummary>/);
  assert.match(summarySource, /<TradeAccountSummaryContext\.Provider value=\{account\}>/);
  assert.match(summarySource, /const account = React\.useContext\(TradeAccountSummaryContext\)/);
  assert.match(summarySource, /\{children\}/);
});

test('active and inactive Trade tab labels share one live P/L subscription owner', () => {
  const badgeSource = readFileSync(resolve(process.cwd(), 'src/features/trade/TradeTabFloatingPnl.tsx'), 'utf8');
  const tabsSource = readFileSync(resolve(process.cwd(), 'app/(tabs)/_layout.tsx'), 'utf8');
  const providerStart = badgeSource.indexOf('export const TradeTabFloatingPnlProvider');
  const labelStart = badgeSource.indexOf('export const TradeTabFloatingPnl =');
  assert.ok(providerStart >= 0 && labelStart > providerStart);
  assert.equal(badgeSource.match(/useTradeLiveAccountSummary\(\{/g)?.length, 1);
  assert.match(badgeSource.slice(providerStart, labelStart), /<TradeTabFloatingPnlContext\.Provider value=\{floating\}>\s*\{children\}/);
  // Both native label layers still render instantly, but neither owns quote
  // listeners or a second copy of the position/account derivation.
  assert.match(badgeSource.slice(labelStart), /useContext\(TradeTabFloatingPnlContext\)/);
  assert.doesNotMatch(badgeSource.slice(labelStart), /usePositionsState\(|useTradeLiveAccountSummary\(|useResolvedTradingLogin\(/);
  assert.match(tabsSource, /renderPresentation\(inactiveColor\)/);
  assert.match(tabsSource, /renderPresentation\(activeColor\)/);
  assert.equal(tabsSource.match(/<TradeTabFloatingPnlProvider>/g)?.length, 1);
  assert.match(tabsSource, /return routeName === 'trade'\s*\? <TradeTabFloatingPnlProvider>\{presentation\}<\/TradeTabFloatingPnlProvider>\s*: presentation/);
});

test('trade summary details bleed past the clip boundary so a fast fling cannot open a seam', () => {
  const stylesSource = readTradeStylesSource();

  const bleed = Number(/const TRADE_SUMMARY_OVERSCROLL_BLEED = (\d+);/.exec(stylesSource)?.[1]);
  assert.ok(Number.isFinite(bleed), 'TRADE_SUMMARY_OVERSCROLL_BLEED must be a numeric constant');
  assert.ok(bleed >= 48, `bleed of ${bleed}px is too small to cover a fast-fling overscroll`);

  const detailsStart = stylesSource.indexOf('summaryDetailsCard: {');
  const detailsEnd = stylesSource.indexOf('summaryBlock: {', detailsStart);
  assert.notEqual(detailsStart, -1);
  assert.notEqual(detailsEnd, -1);
  const detailsStyle = stylesSource.slice(detailsStart, detailsEnd);

  // Pulled up by the bleed and padded back down by the same amount: the rows keep
  // their position and the content height is unchanged, but card background and
  // side borders cover the boundary instead of screen background.
  assert.match(detailsStyle, /marginTop: -TRADE_SUMMARY_OVERSCROLL_BLEED/);
  assert.match(detailsStyle, /paddingTop: TRADE_SUMMARY_OVERSCROLL_BLEED/);
  assert.match(detailsStyle, /summaryDetailsCardScrolling: \{ marginTop: 0, paddingTop: 0 \}/);
  // Fused with the pinned hero: no top edge, square top corners, shared shell.
  assert.match(detailsStyle, /borderTopWidth: 0/);
  assert.match(detailsStyle, /borderTopLeftRadius: 0/);
  assert.match(detailsStyle, /borderTopRightRadius: 0/);
  assert.match(detailsStyle, /borderRadius: 16/);
  assert.match(detailsStyle, /borderWidth: 1/);
  assert.match(detailsStyle, /borderColor: T\.border/);
});

test('trade hero card squares its bottom edge only while the details are expanded', () => {
  const stylesSource = readTradeStylesSource();
  const fusedStart = stylesSource.indexOf('summaryBlockFused: {');
  const fusedEnd = stylesSource.indexOf('summaryDetailsCard: {', fusedStart);

  assert.notEqual(fusedStart, -1);
  assert.notEqual(fusedEnd, -1);
  const fusedStyle = stylesSource.slice(fusedStart, fusedEnd);

  assert.match(fusedStyle, /borderBottomWidth: 0/);
  assert.match(fusedStyle, /borderBottomLeftRadius: 0/);
  assert.match(fusedStyle, /borderBottomRightRadius: 0/);
});

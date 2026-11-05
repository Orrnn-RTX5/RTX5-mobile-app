import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { resolveVisibleTradeStopPreviewPrice } from './ChartScreen.constants';

import {
  buildFooterLotPickerQuickAdjustments,
  buildFooterLotPickerValues,
  resolveChartSltpToolbarTapMode,
  resolveChartTradeSheetCollapsedHeight,
  resolveChartTradeSheetFrameHeight,
  resolveChartTradeSheetHeaderLift,
  resolveChartTradeSheetMaxHeight,
  resolveChartTradeSheetTopInset,
  resolveChartTradeSheetHostHeight,
  resolveChartTradeSheetPortalHostHeight,
  resolveFooterLotChevronPressBehavior,
  resolveFooterLotChevronState,
  resolveFooterLotCommitDraft,
  resolveFooterTradeDockBottom,
  resolveFooterTradeRowState,
  resolveKeyboardDockOffset,
  resolveKeyboardResizesHost,
  shouldHideChartTabBarForTradeInput,
  shouldRenderChartTradeSheetBody,
  shouldSuppressChartTapMenu,
  shouldShowChartTradePreviewOnChart,
  shouldShowChartTradeSheetHandle,
  shouldShowChartTradeSheetMarketExecutionButtons,
  shouldShowChartTradeSheetHeader,
} from './chartTradeInteractionUtils';

const lotBounds = { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 };
const wideLotBounds = { minVolume: 0.01, maxVolume: 10, stepVolume: 0.01 };
const activeLotRangeLabels = (selectedMultiplier: number, mode: 'increase' | 'decrease' = 'increase') =>
  buildFooterLotPickerValues(mode === 'increase' ? 0.01 : 10, mode, wideLotBounds, selectedMultiplier)
    .map((option: any) => option.label);
const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('new SL/TP preview prices stay inside the visible BTC range for buy and sell', () => {
  const visibleRange = { from: 62391.71, to: 62617.34 };
  const entryPrice = 62563.76;
  const roundPrice = (value: number) => Number(value.toFixed(2));
  const resolvePrice = (kind: 'sl' | 'tp', side: 'buy' | 'sell') =>
    resolveVisibleTradeStopPreviewPrice(
      kind,
      entryPrice,
      side,
      350,
      0.01,
      visibleRange,
      roundPrice,
    );

  const buySl = resolvePrice('sl', 'buy');
  const buyTp = resolvePrice('tp', 'buy');
  const sellSl = resolvePrice('sl', 'sell');
  const sellTp = resolvePrice('tp', 'sell');

  for (const price of [buySl, buyTp, sellSl, sellTp]) {
    assert.ok(price > visibleRange.from && price < visibleRange.to);
  }
  assert.ok(buySl < entryPrice && buyTp > entryPrice);
  assert.ok(sellSl > entryPrice && sellTp < entryPrice);
});

test('new SL/TP preview labels reserve the chart header and sheet edge bands', () => {
  const visibleRange = { from: 62461.45, to: 62641.38 };
  const entryPrice = 62605.46;
  const price = resolveVisibleTradeStopPreviewPrice(
    'tp',
    entryPrice,
    'buy',
    350,
    0.01,
    visibleRange,
    (value) => Number(value.toFixed(2)),
  );
  const upperSafeBound = visibleRange.to - (visibleRange.to - visibleRange.from) * 0.15;

  assert.ok(price > entryPrice);
  assert.ok(price <= upperSafeBound);
});

test('new SL/TP preview price preserves the configured offset until a visible range is available', () => {
  assert.equal(
    resolveVisibleTradeStopPreviewPrice('sl', 62563.76, 'buy', 350, 0.01, null, (value) => Number(value.toFixed(2))),
    62213.76,
  );
});

test('resolveFooterLotCommitDraft prefers the latest non-empty override', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '0.23',
      draftRef: '0.15',
      currentDraft: '0.10',
    }),
    '0.23',
  );
});

test('resolveFooterLotCommitDraft falls back when the event payload is blank', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '',
      draftRef: '0.37',
      currentDraft: '0.10',
    }),
    '0.37',
  );
});

test('resolveFooterLotCommitDraft sanitizes invalid characters before commit', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: ' 0..2a5 ',
      draftRef: '0.10',
      currentDraft: '0.10',
    }),
    '0.25',
  );
});

test('resolveFooterLotCommitDraft returns blank only when every source is blank', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '',
      draftRef: '',
      currentDraft: '',
    }),
    '',
  );
});

test('chart footer lot editor has an iOS Apply accessory and stable focus retry', () => {
  const tradeButtonsSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx');
  const chartScreenSource = readSource('src/features/chart/ChartScreen.native.tsx');

  assert.match(tradeButtonsSource, /InputAccessoryView/);
  assert.match(tradeButtonsSource, /const IOS_LOT_INPUT_ACCESSORY_ID = 'chart-trade-lot-input-accessory'/);
  assert.match(
    tradeButtonsSource,
    /inputAccessoryViewID=\{Platform\.OS === 'ios' \? IOS_LOT_INPUT_ACCESSORY_ID : undefined\}/,
  );
  assert.match(tradeButtonsSource, /<InputAccessoryView nativeID=\{IOS_LOT_INPUT_ACCESSORY_ID\}>/);
  assert.match(tradeButtonsSource, /testID="chart-trade-lot-ios-apply-button"/);
  assert.match(tradeButtonsSource, /onPress=\{handleLotAccessoryApply\}/);
  assert.match(chartScreenSource, /const maxAttempts = 8/);
});

test('chart quick trade buttons keep semantic side colors and terminal prices stable while quotes update', () => {
  const tradeButtonsSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx');
  const quoteSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/quoteFallback.ts');
  const chartScreenSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const priceTextSource = tradeButtonsSource.slice(
    tradeButtonsSource.indexOf('const ChartTradeButtonPriceText = React.memo'),
    tradeButtonsSource.indexOf('export const ChartTradeButtons = React.memo'),
  );

  assert.match(chartScreenSource, /const BLUE = T\.trading\.buy\.primary/);
  assert.match(chartScreenSource, /buyColor=\{BLUE\}/);
  assert.match(chartScreenSource, /sellColor=\{T\.trading\.sell\.primary\}/);
  assert.match(tradeButtonsSource, /const sellTileColor = sellColor;/);
  assert.match(tradeButtonsSource, /const buyTileColor = buyColor;/);
  assert.doesNotMatch(tradeButtonsSource, /previousBidRef|previousAskRef|sellTileVisual|buyTileVisual/);
  assert.doesNotMatch(quoteSource, /resolveChartTradeButtonPriceColor|direction = 'up'|direction = 'down'/);
  assert.doesNotMatch(tradeButtonsSource, /ChartTradeButtonPriceFlash|Animated\.View/);
  assert.match(tradeButtonsSource, /const TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS = 16/);
  assert.match(tradeButtonsSource, /const TRADE_BUTTON_PRICE_TEXT_COLOR = '#FFFFFF'/);
  assert.match(tradeButtonsSource, /const ChartTradeButtonPriceText = React\.memo/);
  assert.match(tradeButtonsSource, /splitFormattedChartTradePrice\(text\)/);
  assert.match(tradeButtonsSource, /baseStyles\.actionBtnPriceTrailingText/);
  assert.doesNotMatch(
    priceTextSource,
    /Animated|Easing|previousTextRef|flashProgress|flashColor|setFlashColor|TRADE_BUTTON_PRICE_(?:UP|DOWN)_FLASH|TRADE_BUTTON_PRICE_FLASH_MS/,
  );
  assert.match(priceTextSource, /<Text[\s\S]*color: TRADE_BUTTON_PRICE_TEXT_COLOR,[\s\S]*opacity: 1/);
  assert.match(tradeButtonsSource, /<ChartTradeButtonPriceText text=\{formattedBid\} testID="chart-trade-sell-price-text" compact=\{compactPane\} \/>/);
  assert.match(tradeButtonsSource, /<ChartTradeButtonPriceText text=\{formattedAsk\} testID="chart-trade-buy-price-text" compact=\{compactPane\} \/>/);
  assert.match(tradeButtonsSource, /baseStyles\.chartTradeMarketActionButton,\s*\{ backgroundColor: sellColor \}/);
  assert.match(tradeButtonsSource, /baseStyles\.chartTradeMarketActionButton,\s*\{ backgroundColor: buyColor \}/);
});

test('chart footer floating lot dock does not add an extra iOS keyboard gap', () => {
  const chartTradeFeatureSource = readSource('src/features/chart/components/ChartTradeFeature.tsx');

  assert.doesNotMatch(chartTradeFeatureSource, /FOOTER_TRADE_DOCK_EDIT_GAP/);
  assert.doesNotMatch(chartTradeFeatureSource, /footerTradeRowKeyboardOffset \+ tradeFooterDockEditGap/);
});

test('chart footer keeps inline row height reserved while iOS floating lot dock is active', () => {
  const chartTradeFeatureSource = readSource('src/features/chart/components/ChartTradeFeature.tsx');

  assert.match(chartTradeFeatureSource, /COMPACT_TRADE_FOOTER_ROW_HEIGHT/);
  assert.match(chartTradeFeatureSource, /INLINE_FOOTER_TRADE_ROW_RESERVE_STYLE = \{ height: COMPACT_TRADE_FOOTER_ROW_HEIGHT \}/);
  assert.match(chartTradeFeatureSource, /const shouldPreserveInlineFooterSpace = showFloatingFooterTradeRow && !hideInlineTradeRow/);
  assert.match(chartTradeFeatureSource, /<View pointerEvents="none" style=\{INLINE_FOOTER_TRADE_ROW_RESERVE_STYLE\} \/>/);
});

test('resolveFooterLotChevronState disables only lot decrease at the minimum volume', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 0.01,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: false,
      canIncreaseLot: true,
    },
  );
});

test('resolveFooterLotChevronState keeps lot decrease disabled at the minimum when picker exists', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 0.01,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: false,
      canIncreaseLot: true,
    },
  );
});

test('resolveFooterLotChevronState disables only lot increase at the maximum volume', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 1,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: true,
      canIncreaseLot: false,
    },
  );
});

test('resolveFooterLotChevronState keeps lot increase disabled at the maximum when picker exists', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 1,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: true,
      canIncreaseLot: false,
    },
  );
});

test('resolveFooterLotChevronState keeps both lot chevrons enabled between min and max', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 0.5,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: true,
      canIncreaseLot: true,
    },
  );
});

test('resolveFooterLotChevronPressBehavior restores picker ranges when a lot picker exists', () => {
  assert.equal(
    resolveFooterLotChevronPressBehavior({
      hasStepAction: true,
      hasLotPickerAction: true,
    }),
    'picker',
  );
});

test('resolveFooterLotChevronPressBehavior falls back to the lot picker when no direct step exists', () => {
  assert.equal(
    resolveFooterLotChevronPressBehavior({
      hasStepAction: false,
      hasLotPickerAction: true,
    }),
    'picker',
  );
});

test('resolveFooterLotChevronPressBehavior falls back to direct step when no lot picker exists', () => {
  assert.equal(
    resolveFooterLotChevronPressBehavior({
      hasStepAction: true,
      hasLotPickerAction: false,
    }),
    'step',
  );
});

test('buildFooterLotPickerQuickAdjustments shows the expected increase range selectors', () => {
  assert.deepEqual(
    buildFooterLotPickerQuickAdjustments(0.01, 'increase', lotBounds).map((option: any) => option.label),
    ['+0.01', '+0.1', '+0.5'],
  );
});

test('buildFooterLotPickerQuickAdjustments mirrors decrease range selectors with negative labels', () => {
  assert.deepEqual(
    buildFooterLotPickerQuickAdjustments(0.01, 'decrease', lotBounds).map((option: any) => option.label),
    ['-0.01', '-0.1', '-0.5'],
  );
});

test('buildFooterLotPickerValues shows small positive steps after selecting +0.01', () => {
  assert.deepEqual(
    activeLotRangeLabels(1),
    ['+0.01', '+0.02', '+0.03', '+0.04', '+0.05', '+0.06', '+0.07', '+0.08', '+0.09', '+0.1'],
  );
});

test('buildFooterLotPickerValues shows the next positive tenth range after selecting +0.1', () => {
  assert.deepEqual(
    activeLotRangeLabels(10),
    ['+0.1', '+0.2', '+0.3', '+0.4', '+0.5', '+0.6', '+0.7', '+0.8', '+0.9', '+1'],
  );
});

test('buildFooterLotPickerValues shows the next positive hundredth range after selecting +0.5', () => {
  assert.deepEqual(
    activeLotRangeLabels(50),
    ['+0.5', '+0.6', '+0.7', '+0.8', '+0.9', '+1'],
  );
});

test('buildFooterLotPickerValues mirrors the small range for lot decrease', () => {
  assert.deepEqual(
    activeLotRangeLabels(1, 'decrease'),
    ['-0.01', '-0.02', '-0.03', '-0.04', '-0.05', '-0.06', '-0.07', '-0.08', '-0.09', '-0.1'],
  );
});

test('buildFooterLotPickerValues commits decrease selections as current lot minus selected amount', () => {
  const smallRange = buildFooterLotPickerValues(0.1, 'decrease', wideLotBounds, 1);
  const minusThreeSteps = smallRange.find((option: any) => option.label === '-0.03');

  assert.ok(minusThreeSteps, 'expected -0.03 decrease option');
  assert.equal(minusThreeSteps.value, 0.07);

  const tenthRange = buildFooterLotPickerValues(1, 'decrease', wideLotBounds, 10);
  const minusFourTenths = tenthRange.find((option: any) => option.label === '-0.4');

  assert.ok(minusFourTenths, 'expected -0.4 decrease option');
  assert.equal(minusFourTenths.value, 0.6);
});

test('buildFooterLotPickerValues shows the negative ladder even when the current lot is already at minimum', () => {
  const options = buildFooterLotPickerValues(0.01, 'decrease', lotBounds, 1);

  assert.deepEqual(
    options.map((option: any) => option.label),
    ['-0.01', '-0.02', '-0.03', '-0.04', '-0.05', '-0.06', '-0.07', '-0.08', '-0.09', '-0.1'],
  );
  assert.deepEqual(
    options.map((option: any) => option.value),
    Array(10).fill(0.01),
  );
});

test('buildFooterLotPickerValues mirrors the tenth range for lot decrease', () => {
  assert.deepEqual(
    activeLotRangeLabels(10, 'decrease'),
    ['-0.1', '-0.2', '-0.3', '-0.4', '-0.5', '-0.6', '-0.7', '-0.8', '-0.9', '-1'],
  );
});

test('buildFooterLotPickerValues mirrors the hundredth range for lot decrease after selecting -0.5', () => {
  assert.deepEqual(
    activeLotRangeLabels(50, 'decrease'),
    ['-0.5', '-0.6', '-0.7', '-0.8', '-0.9', '-1'],
  );
});

test('buildFooterLotPickerValues lets selected positive values become the next active range', () => {
  assert.deepEqual(
    buildFooterLotPickerValues(0.01, 'increase', wideLotBounds, 20)
      .map((option: any) => option.label),
    ['+0.2', '+0.3', '+0.4', '+0.5', '+0.6', '+0.7', '+0.8', '+0.9', '+1'],
  );
});

test('resolveFooterTradeRowState keeps Android lot editing in the inline footer before keyboard metrics arrive', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 0,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState keeps Android inline editor in place while keyboard metrics are still opening', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 0,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState keeps Android lot editing inline while the keyboard is opening', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 288,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState keeps Android resized-host lot editing in the inline footer', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 184,
      keyboardResizesHost: true,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState keeps Android lot editing inline when the resized window is already docked to the keyboard', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState keeps the iOS floating editor visible without waiting for an Android keyboard event', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'ios',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 0,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState uses the measured iOS keyboard overlap for the floating editor', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'ios',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 76,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 76,
    },
  );
});

test('resolveFooterTradeRowState falls back to iOS keyboard height when dock anchors are not ready', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'ios',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 312,
    },
  );
});

test('resolveFooterTradeRowState disables the floating row when the editor is closed', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: false,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 288,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeDockBottom keeps Android focused lot editor lifted when the keyboard resizes the host', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'android',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 0,
      keyboardVisibleHeight: 312,
      keyboardResizesHost: true,
    }),
    12,
  );
});

test('resolveFooterTradeDockBottom lifts Android focused lot editor above overlay keyboards', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'android',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 0,
      keyboardVisibleHeight: 588,
      keyboardResizesHost: false,
    }),
    588,
  );
});

test('resolveFooterTradeDockBottom can reserve the lifted tab bar above overlay keyboards', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'android',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 0,
      keyboardVisibleHeight: 546,
      keyboardResizesHost: false,
      footerKeyboardAvoidanceOffset: 646,
    }),
    646,
  );
});

test('resolveFooterTradeDockBottom keeps normal floating rows on the reported keyboard offset', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'android',
      footerLotEditorFocused: false,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 288,
    }),
    288,
  );
});

test('resolveFooterTradeDockBottom keeps iOS lot editor on the measured keyboard overlap', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'ios',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 288,
    }),
    288,
  );
});

test('resolveFooterTradeDockBottom docks iOS lot editing from measured keyboard overlap', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'ios',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 76,
      keyboardVisibleHeight: 312,
    }),
    76,
  );
});

test('resolveFooterTradeDockBottom falls back to iOS keyboard height when offset is still zero', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'ios',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 0,
      keyboardVisibleHeight: 312,
    }),
    312,
  );
});

test('resolveFooterTradeDockBottom returns zero for inline or hidden floating footer states', () => {
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'android',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: true,
      showInlineFooterDock: true,
      footerTradeRowKeyboardOffset: 288,
    }),
    0,
  );
  assert.equal(
    resolveFooterTradeDockBottom({
      platform: 'android',
      footerLotEditorFocused: true,
      showFloatingFooterTradeRow: false,
      showInlineFooterDock: false,
      footerTradeRowKeyboardOffset: 288,
    }),
    0,
  );
});

test('shouldHideChartTabBarForTradeInput hides the bottom menu while the SL/TP comment box is focused', () => {
  assert.equal(
    shouldHideChartTabBarForTradeInput({
      showChartTradeSheet: true,
      chartTradeCommentFocused: true,
    }),
    true,
  );

  assert.equal(
    shouldHideChartTabBarForTradeInput({
      showChartTradeSheet: false,
      chartTradeCommentFocused: true,
    }),
    false,
  );

  assert.equal(
    shouldHideChartTabBarForTradeInput({
      showChartTradeSheet: true,
      chartTradeCommentFocused: false,
    }),
    false,
  );
});

test('chart trade preview stays visible for direct SL/TP while the trade sheet is hidden', () => {
  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: true,
      chartTradeSheetMode: 'collapsed',
    }),
    true,
  );

  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: true,
      chartTradeSheetMode: 'expanded',
    }),
    false,
  );

  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: false,
      chartTradeSheetMode: 'hidden',
      directProtectionActive: true,
    }),
    true,
  );

  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: false,
      chartTradeSheetMode: 'hidden',
      directProtectionActive: false,
    }),
    false,
  );
});

test('SL/TP toolbar alternates compact open and close on every tap', () => {
  let visible = false;
  const states = ['hidden'];
  const modes = Array.from({ length: 4 }, () => {
    const mode = resolveChartSltpToolbarTapMode(visible);
    visible = mode !== 'hidden';
    states.push(mode);
    return mode;
  });

  assert.deepEqual(modes, ['collapsed', 'hidden', 'collapsed', 'hidden']);
  assert.deepEqual(states, ['hidden', 'collapsed', 'hidden', 'collapsed', 'hidden']);
});

test('compact Chart sheet replaces only app tabs and starts at the footer divider', () => {
  const hostHeight = 600;
  const bottomTabBarHeight = 110;
  const safeAreaBottom = 24;
  const presentationHostHeight = resolveChartTradeSheetPortalHostHeight({
    hostHeight,
    bottomTabBarHeight,
    safeAreaBottom,
    portalEnabled: true,
  });
  const collapsedHeight = resolveChartTradeSheetCollapsedHeight({
    bottomTabBarHeight,
    safeAreaBottom,
    portalEnabled: true,
    nonPortalHeight: 186,
  });

  assert.equal(presentationHostHeight, 686);
  assert.equal(collapsedHeight, 86);
  assert.equal(presentationHostHeight - collapsedHeight, hostHeight);
  assert.equal(
    resolveChartTradeSheetPortalHostHeight({
      hostHeight,
      bottomTabBarHeight,
      safeAreaBottom,
      portalEnabled: false,
    }),
    hostHeight,
  );
  assert.equal(
    resolveChartTradeSheetCollapsedHeight({
      bottomTabBarHeight,
      safeAreaBottom,
      portalEnabled: false,
      nonPortalHeight: 186,
    }),
    186,
  );
});

test('chart tap radial menu is suppressed while the footer lot editor is active', () => {
  assert.equal(
    shouldSuppressChartTapMenu({
      activeTool: 'crosshair',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      footerLotPickerOpen: false,
      suppressUntil: 0,
      now: 100,
    }),
    true,
  );
});

test('chart tap radial menu is suppressed during the lot picker close tap', () => {
  assert.equal(
    shouldSuppressChartTapMenu({
      activeTool: 'crosshair',
      footerLotEditorFocused: false,
      footerLotEditorOpening: false,
      footerLotPickerOpen: false,
      suppressUntil: 150,
      now: 100,
    }),
    true,
  );
});

test('chart tap radial menu opens only after lot interaction suppression expires', () => {
  assert.equal(
    shouldSuppressChartTapMenu({
      activeTool: 'crosshair',
      footerLotEditorFocused: false,
      footerLotEditorOpening: false,
      footerLotPickerOpen: false,
      suppressUntil: 150,
      now: 151,
    }),
    false,
  );
});

test('chart tap radial menu treats inactive drawing mode as normal chart mode', () => {
  assert.equal(
    shouldSuppressChartTapMenu({
      activeTool: 'none',
      footerLotEditorFocused: false,
      footerLotEditorOpening: false,
      footerLotPickerOpen: false,
      suppressUntil: 0,
      now: 100,
    }),
    false,
  );
});

test('chart tap radial menu remains disabled for drawing tools', () => {
  assert.equal(
    shouldSuppressChartTapMenu({
      activeTool: 'trend-line',
      footerLotEditorFocused: false,
      footerLotEditorOpening: false,
      footerLotPickerOpen: false,
      suppressUntil: 0,
      now: 100,
    }),
    true,
  );
});

test('resolveChartTradeSheetMaxHeight keeps inline SL/TP sheet below the compact chart toolbar gap', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 82,
      headerLift: 0,
      bottomInset: 0,
    }),
    538,
  );
});

test('resolveChartTradeSheetMaxHeight subtracts the inline footer inset so the sheet opens above the footer', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 0,
      headerLift: 72,
      bottomInset: 58,
    }),
    634,
  );
});

test('resolveChartTradeSheetMaxHeight never shrinks below the collapsed height', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 120,
      topInset: 12,
      headerLift: 0,
      bottomInset: 58,
    }),
    186,
  );
});

test('resolveChartTradeSheetMaxHeight keeps expanded SL/TP sheet below the chart toolbar with a visible gap', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 58,
      headerLift: 0,
      bottomInset: 0,
    }),
    562,
  );
});

test('resolveChartTradeSheetTopInset keeps compact SL/TP sheet below the toolbar when its host overlaps the header', () => {
  assert.equal(
    resolveChartTradeSheetTopInset({
      isFullscreen: false,
      toolbarBottomInset: 0,
      topGap: 0,
      compactHeaderHeight: 194,
      hostTopOffset: 70,
    }),
    124,
  );
});

test('resolveChartTradeSheetTopInset aligns to the divider when the compact host already starts below the toolbar', () => {
  assert.equal(
    resolveChartTradeSheetTopInset({
      isFullscreen: false,
      toolbarBottomInset: 0,
      topGap: 0,
      compactHeaderHeight: 194,
      hostTopOffset: 194,
    }),
    0,
  );
});

test('compact SL/TP max height places the expanded sheet exactly on the toolbar divider', () => {
  const dividerY = 194;
  const hostHeight = 620;

  for (const hostTopOffset of [70, dividerY]) {
    const topInset = resolveChartTradeSheetTopInset({
      isFullscreen: false,
      toolbarBottomInset: 0,
      topGap: 0,
      compactHeaderHeight: dividerY,
      hostTopOffset,
    });
    const maxHeight = resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight,
      topInset,
      headerLift: 0,
      bottomInset: 0,
    });

    assert.equal(hostTopOffset + hostHeight - maxHeight, dividerY);
  }
});

test('resolveChartTradeSheetTopInset preserves fullscreen toolbar offsets without compact overlap math', () => {
  assert.equal(
    resolveChartTradeSheetTopInset({
      isFullscreen: true,
      toolbarBottomInset: 92,
      topGap: 10,
      compactHeaderHeight: 194,
      hostTopOffset: 0,
    }),
    102,
  );
});

test('resolveChartTradeSheetMaxHeight reserves both the chart heading gap and visible trade footer', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 58,
      headerLift: 0,
      bottomInset: 58,
    }),
    504,
  );
});

test('resolveChartTradeSheetHeaderLift does not lift expanded SL/TP sheet into the compact toolbar', () => {
  assert.equal(
    resolveChartTradeSheetHeaderLift({
      topInset: 58,
      compactHeaderHeight: 64,
      isFullscreen: false,
    }),
    0,
  );
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 120,
      hostHeight: 620,
      topInset: 58,
      headerLift: 0,
      bottomInset: 0,
    }),
    562,
  );
});

test('resolveChartTradeSheetHeaderLift does not move fullscreen sheet into the status toolbar', () => {
  assert.equal(
    resolveChartTradeSheetHeaderLift({
      topInset: 84,
      compactHeaderHeight: 64,
      isFullscreen: true,
    }),
    0,
  );
});

test('resolveChartTradeSheetHostHeight freezes both shrink and growth while sheet input is focused', () => {
  assert.equal(
    resolveChartTradeSheetHostHeight({
      currentHostHeight: 620,
      nextHostHeight: 430,
      freezeHostHeight: true,
    }),
    620,
  );
  assert.equal(
    resolveChartTradeSheetHostHeight({
      currentHostHeight: 620,
      nextHostHeight: 700,
      freezeHostHeight: true,
    }),
    620,
  );
  assert.equal(
    resolveChartTradeSheetHostHeight({
      currentHostHeight: 620,
      nextHostHeight: 700,
      freezeHostHeight: false,
    }),
    700,
  );
});

test('resolveChartTradeSheetFrameHeight keeps collapsed SL/TP sheet touch frame compact', () => {
  assert.equal(
    resolveChartTradeSheetFrameHeight({
      chartTradeSheetMode: 'collapsed',
      collapsedHeight: 120,
      maxHeight: 684,
    }),
    120,
  );
  assert.equal(
    resolveChartTradeSheetFrameHeight({
      chartTradeSheetMode: 'expanded',
      collapsedHeight: 120,
      maxHeight: 684,
    }),
    684,
  );
});

test('resolveKeyboardDockOffset prefers real keyboard overlap from screenY on Android', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 620,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    76,
  );
});

test('resolveKeyboardDockOffset falls back to keyboard height minus safe bottom on Android', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: null,
      containerBottom: null,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    288,
  );
});

test('resolveKeyboardDockOffset uses real keyboard overlap from screenY on iOS', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'ios',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 620,
      screenHeight: 800,
      safeAreaBottom: 34,
    }),
    76,
  );
});

test('resolveKeyboardDockOffset falls back to full keyboard height on iOS without frame geometry', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'ios',
      keyboardHeight: 312,
      keyboardScreenY: null,
      containerBottom: null,
      screenHeight: 800,
      safeAreaBottom: 34,
    }),
    312,
  );
});

test('resolveKeyboardDockOffset returns zero when the resized Android container already ends at the keyboard top', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 544,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    0,
  );
});

test('resolveKeyboardDockOffset clamps stale Android container geometry to the current resized window height', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 800,
      screenHeight: 544,
      safeAreaBottom: 24,
    }),
    0,
  );
});

test('resolveKeyboardResizesHost detects Android adjustResize from the measured chart host shrink', () => {
  assert.equal(
    resolveKeyboardResizesHost({
      platform: 'android',
      footerLotEditorFocused: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardFreeHostHeight: 620,
      currentHostHeight: 430,
    }),
    true,
  );
});

test('resolveKeyboardResizesHost ignores small layout changes while the Android keyboard is open', () => {
  assert.equal(
    resolveKeyboardResizesHost({
      platform: 'android',
      footerLotEditorFocused: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardFreeHostHeight: 620,
      currentHostHeight: 590,
    }),
    false,
  );
});

test('chart trade sheet header hides only in expanded mode', () => {
  assert.equal(shouldShowChartTradeSheetHeader({ chartTradeSheetMode: 'collapsed' }), true);
  assert.equal(shouldShowChartTradeSheetHeader({ chartTradeSheetMode: 'expanded' }), false);
});

test('chart trade sheet grab handle stays visible while the sheet is open', () => {
  assert.equal(shouldShowChartTradeSheetHandle({ chartTradeSheetMode: 'collapsed' }), true);
  assert.equal(shouldShowChartTradeSheetHandle({ chartTradeSheetMode: 'expanded' }), true);
  assert.equal(shouldShowChartTradeSheetHandle({ chartTradeSheetMode: 'hidden' }), false);
});

test('chart trade sheet body renders only after expanding from compact SL/TP mode', () => {
  assert.equal(shouldRenderChartTradeSheetBody({ chartTradeSheetMode: 'collapsed' }), false);
  assert.equal(shouldRenderChartTradeSheetBody({ chartTradeSheetMode: 'expanded' }), true);
  assert.equal(shouldRenderChartTradeSheetBody({ chartTradeSheetMode: 'hidden' }), false);
});

test('chart trade sheet hides duplicated market execution buttons when the compact footer stays mounted', () => {
  assert.equal(
    shouldShowChartTradeSheetMarketExecutionButtons({
      chartTradeOrderType: 'Market Execution',
      showInlineFooterWhileSheetOpen: true,
    }),
    false,
  );
  assert.equal(
    shouldShowChartTradeSheetMarketExecutionButtons({
      chartTradeOrderType: 'Market Execution',
      showInlineFooterWhileSheetOpen: false,
    }),
    true,
  );
  assert.equal(
    shouldShowChartTradeSheetMarketExecutionButtons({
      chartTradeOrderType: 'Buy Limit',
      showInlineFooterWhileSheetOpen: true,
    }),
    true,
  );
});

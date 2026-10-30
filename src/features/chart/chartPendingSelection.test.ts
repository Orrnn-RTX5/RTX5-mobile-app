import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { normalizePendingOrderType } from '../../api/orders/pendingOrderPayload';
import { defaultPendingPrice } from '../../domain/pendingOrders';
import {
  CHART_ORDER_TYPES, getChartOrderSide, isPendingChartOrderType,
  isStopLimitChartOrderType, resolveDefaultStopLimitPrice,
} from './chartTradeOrderUtils';

const native = ts.createSourceFile('chart.tsx', readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const feature = ts.createSourceFile('feature.tsx', readFileSync('src/features/chart/components/ChartTradeFeature.tsx', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function expression(file: ts.SourceFile, name: string): string {
  let result = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name
      && node.initializer && ts.isCallExpression(node.initializer)) {
      result = node.initializer.arguments[0].getText(file);
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(result, name);
  return result;
}

function evaluate(code: string, scope: Record<string, any>): any {
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(`exports.value = (${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { exports, ...scope });
  return exports.value;
}

function buttons(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [
    ...(CHART_ORDER_TYPES.includes(node.props?.accessibilityLabel) ? [node] : []),
    ...buttons(node.props?.children),
  ];
}

for (const quoteAvailable of [true, false]) {
  test(`switching all pending options updates the selected tab and guide with ${quoteAvailable ? 'live' : 'unavailable'} quotes`, () => {
    const state: Record<string, any> = {
      chartTradeOrderType: 'Market Execution', chartDirectProtectionActive: false,
      chartLiveQuote: {}, chartPendingOffset: 0.00075, chartStopLimitOffset: 0.00015,
      chartAsk: 1.12374, chartBid: 1.12373,
      displayDecimals: 5, chartProtectionTickSize: 0.00001, chartInstrumentMeta: { stopsLevel: 0 },
      roundTradePrice: (value: number) => Number(value.toFixed(5)),
      normalizePendingOrderType, defaultPendingPrice, getChartOrderSide, isPendingChartOrderType,
      isStopLimitChartOrderType, resolveDefaultStopLimitPrice,
      resolveSessionQuoteActionAvailability: () => quoteAvailable
        ? { allowed: true, bid: 1.12373, ask: 1.12374 } : { allowed: false },
      isPendingOrderTypeBackendLocked: () => false,
      runImmediateAction: (_label: string, action: () => void) => action(),
      clearChartDirectProtectionDraft: () => {},
      resolveChartVisibleStopPreviewPrice: () => 0,
      chartTradeSheetScrollRef: { current: { scrollTo() {} } },
      showChartTradePreviewLinesOnChart: true, showChartTradeStopLabelsOnChart: true,
      chartProtectionBackendLocked: true, chartTradePositionStopTarget: null,
      chartTradeSlEnabled: false, chartTradeTpEnabled: false,
      T: { text: '#000', trading: { sell: { primary: '#f00' } } }, BLUE: '#00f',
      CHART_LINE_STYLE: { Solid: 0 }, tradeVolume: 0.01, tradeVolumeBounds: {},
      formatTradeVolume: () => '0.01',
    };
    state.setChartTradeOrderType = (type: typeof CHART_ORDER_TYPES[number]) => {
      state.chartTradeOrderType = type;
      state.isPendingChartOrder = isPendingChartOrderType(type);
      state.isStopLimitChartOrder = isStopLimitChartOrderType(type);
      state.chartTradeSheetSide = getChartOrderSide(type);
    };
    state.setChartTradePrice = (value: number) => { state.chartTradePrice = value; state.chartTradeEntryPrice = value; };
    state.setChartTradeStopLimitPrice = (value: number) => { state.chartTradeStopLimitPrice = value; };
    state.setChartTradeSlPrice = (value: number) => { state.chartTradeSlPrice = value; };
    state.setChartTradeTpPrice = (value: number) => { state.chartTradeTpPrice = value; };
    state.setChartTradeSlEnabled = (value: boolean) => { state.chartTradeSlEnabled = value; };
    state.setChartTradeTpEnabled = (value: boolean) => { state.chartTradeTpEnabled = value; };
    state.setChartPendingTimeInForce = (value: string) => { state.chartPendingTimeInForce = value; };
    state.setChartPendingExpiry = (value: number | null) => { state.chartPendingExpiry = value; };

    const renderTabs = () => evaluate(expression(feature, 'ChartTradeSheetPinnedHeader'), {
      React: { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }) },
      View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Ionicons: 'Icon',
      ChartTradeSheetHeaderActions: 'HeaderActions', useTranslation: () => ({ t: (value: string) => value }),
      CHART_ORDER_TYPES, getChartOrderSide, isPendingOrderTypeBackendLocked: () => false,
    })({
      styles: {}, colors: { blue: '#00f', sellPrimary: '#f00' }, symbolHeader: {}, sheet: state,
      handlers: { onSelectOrderType: (type: string) => {
        const defaults = evaluate(expression(native, 'resolveDefaultPendingPrice'), state);
        state.resolveDefaultPendingPrice = defaults;
        state.resolveChartTradeEntryPrice = evaluate(expression(native, 'resolveChartTradeEntryPrice'), state);
        evaluate(expression(native, 'handleChartTradeOrderTypeSelect'), state)(type);
      } }, tabs: {}, components: {},
    });

    for (const type of [...CHART_ORDER_TYPES.filter(isPendingChartOrderType), 'Buy Limit'] as const) {
      Object.assign(state, {
        chartTradeSlEnabled: true, chartTradeTpEnabled: true,
        chartTradeSlPrice: 1.12, chartTradeTpPrice: 1.13,
        chartPendingTimeInForce: 'GTD', chartPendingExpiry: 1_900_000_000,
      });
      buttons(renderTabs()).find((node) => node.props.accessibilityLabel === type)!.props.onPress();
      const selected = buttons(renderTabs()).filter((node) => node.props.accessibilityState.selected);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].props.accessibilityLabel, type);
      assert.equal(selected[0].props.hitSlop.left, 0, 'the selected tab must not cover its left neighbor');
      assert.equal(selected[0].props.hitSlop.right, 0, 'the selected tab must not cover its right neighbor');
      const expectedLivePrice: Record<string, number> = {
        'Buy Limit': 1.12363, 'Sell Limit': 1.12384,
        'Buy Stop': 1.12385, 'Sell Stop': 1.12362,
        'Buy Stop Limit': 1.12385, 'Sell Stop Limit': 1.12362,
      };
      assert.equal(state.chartTradeEntryPrice, quoteAvailable ? expectedLivePrice[type] : 0,
        `${type} defaults must use the live quote and broker price rules`);
      assert.equal(state.chartTradeSlEnabled, false);
      assert.equal(state.chartTradeTpEnabled, false);
      assert.equal(state.chartTradeSlPrice, 0);
      assert.equal(state.chartTradeTpPrice, 0);
      assert.equal(state.chartPendingTimeInForce, 'GTC');
      assert.equal(state.chartPendingExpiry, null);
      state.chartTradePreviewEntryLabel = evaluate(expression(native, 'chartTradePreviewEntryLabel'), state)();
      const lines = evaluate(expression(native, 'chartTradePreviewLines'), state)();
      if (!quoteAvailable) {
        assert.equal(lines.length, 0, 'unavailable quotes must not create a default entry guide');
        continue;
      }
      assert.equal(lines.length, isStopLimitChartOrderType(type) ? 2 : 1);
      assert.equal(lines[0].price, state.chartTradeEntryPrice);
      assert.equal(lines[0].title, `${type.toUpperCase()} 0.01`);
      assert.equal(lines[0].color, type.startsWith('Sell') ? '#f00' : '#00f');
    }
  });
}

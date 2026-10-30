import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { formatBackendPrice } from '../../../utils/backendPrice';
import { priceAfterVerticalDrag } from '../../trade/priceDrag';
import { formatPendingExpiryDate, formatPendingExpiryTime, pendingExpiryWithLocalDate, pendingExpiryWithLocalTime } from '../../trade/pendingExpirationDate';
import { endOfLocalDaySeconds } from '../../../domain/pendingOrders';
import { CHART_ORDER_TYPES, getChartOrderSide, isPendingChartOrderType } from '../chartTradeOrderUtils';
import { shouldShowChartTradeSheetMarketExecutionButtons } from '../chartTradeInteractionUtils';

const { renderToStaticMarkup } = createRequire(resolve(process.cwd(), 'package.json'))('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

function load(file: string, scope: Record<string, unknown>, extra = ''): any {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const compiled = ts.transpileModule(source.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(source)).join('\n') + extra, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, React, ...scope });
  return exports;
}

const host = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
const nativeView = (props: { children?: React.ReactNode; accessibilityValue?: Record<string, unknown> }) => {
  // Fabric's AccessibilityValue uses optional<int> for all numeric fields.
  // Enforce that boundary so native-only decimal conversion crashes are caught.
  for (const key of ['now', 'min', 'max']) {
    const value = props.accessibilityValue?.[key];
    if (value != null) assert.ok(Number.isInteger(value) && Number(value) >= -2147483648 && Number(value) <= 2147483647,
      `Loss of precision in native accessibilityValue.${key}: ${value}`);
  }
  return host(props);
};
const theme = { text: '#000', textSub: '#555', textMuted: '#888', border: '#ddd', accent: '#00f',
  trading: { profit: '#080', sell: { primary: '#f00' }, buy: { primary: '#00f' } } };
const common = {
  View: nativeView, Text: host, TextInput: host, Pressable: host, FastPressable: host, ScrollView: host,
  Ionicons: host, Platform: { OS: 'ios' }, useTheme: () => theme,
  useTranslation: () => ({ t: (value: string) => value }), formatBackendPrice,
};
const pending = load('src/features/trade/PendingOrderFields.tsx', {
  ...common, useState: React.useState, useEffect: React.useEffect, endOfLocalDaySeconds,
  Calendar: host, formatPendingExpiryDate, formatPendingExpiryTime, pendingExpiryWithLocalDate, pendingExpiryWithLocalTime,
});
const drag = load('src/features/trade/PriceDragControl.tsx', {
  ...common, useMemo: React.useMemo, useRef: React.useRef,
  PanResponder: { create: () => ({ panHandlers: {} }) }, priceAfterVerticalDrag,
});
const feature = load('src/features/chart/components/ChartTradeFeature.tsx', {
  ...common, ...drag, PendingExpirationPicker: pending.PendingExpirationPicker,
  LiveOrderTickExecutionGraph: host, CHART_ORDER_TYPES, getChartOrderSide, isPendingChartOrderType,
  COMPACT_TRADE_FOOTER_ROW_HEIGHT: 44,
  shouldShowChartTradeSheetMarketExecutionButtons,
  isPendingOrderPlacementBackendLocked: () => false,
  isPendingOrderTypeBackendLocked: () => false,
  getActiveSltpUnavailableMessage: () => '',
}, '\nexports.PendingBody = ChartTradeSheetBody; exports.PendingContent = ChartTradeSheetContent;');

for (const type of CHART_ORDER_TYPES.filter(isPendingChartOrderType)) for (const legacy of [false, true]) for (const price of [3999.72, 4001.62]) {
  test(`${type} at ${price} mounts the complete ${legacy ? 'legacy' : 'pinned'} panel with native-safe prices`, () => {
    const render = () => renderToStaticMarkup(React.createElement(legacy ? feature.PendingContent : feature.PendingBody, {
      styles: {}, isDark: false, colors: { blue: '#00f', sellPrimary: '#f00', textMuted: '#888' },
      symbolHeader: { displaySymbol: 'BTCUSD', displayDecimals: 2 },
      components: { ChartTradeVolumeSlider: host, LiveTradeButtons: host },
      tabs: {},
      handlers: {},
      sheet: {
        chartTradeOrderType: type, chartTradePrice: price, chartTradeStopLimitPrice: price + 0.15,
        chartTradeComment: '', chartTradeCommentFocused: false,
        chartTradeVolumePrimaryDisplay: '0.01', chartTradeVolumeModeLabel: 'Lots',
        chartTradeVolumeDisplayMode: 'lots', chartTradeStopUnit: 'Price',
        chartTradeStopUnitOptions: ['Price', 'Pips', 'Currency'],
        chartPositionCandidates: [], chartPendingTimeInForce: 'GTC', chartPendingExpiry: null,
        chartPointSize: 0.01, chartProtectionTickSize: 0.01, chartTradeSlEnabled: false, chartTradeTpEnabled: false,
        tradeVolume: 0.01, tradeVolumeBounds: {}, accountCurrency: 'USD',
        showChartTradeExpiration: true, showChartTradeComment: true, useMtPendingTradeSheetLayout: true,
      },
    }));
    const html = render();
    assert.ok(html.includes('Price'));
    assert.ok(html.includes('Expiration'));
    assert.ok(html.includes(`Place ${type}`));
  });
}

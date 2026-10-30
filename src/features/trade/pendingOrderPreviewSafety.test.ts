import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { CHART_ORDER_TYPES, isPendingChartOrderType } from '../chart/chartTradeOrderUtils';
import {
  isPendingOrderPlacementBackendLocked,
  resolveTradeBackendCapabilities,
} from './tradeBackendCapabilities';

const chartPath = 'src/features/chart/ChartScreen.native.tsx';
const ticketPath = 'src/features/trade/OrderTicketScreen.tsx';
const featurePath = 'src/features/chart/components/ChartTradeFeature.tsx';
const tradeHandlerPath = 'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts';
const tradeButtonsPath = 'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx';
const capabilities = { ...resolveTradeBackendCapabilities({}), pendingOrders: false };
const pendingTypes = CHART_ORDER_TYPES.filter(isPendingChartOrderType);
const placementLocked = (orderType: Parameters<typeof isPendingOrderPlacementBackendLocked>[0]) =>
  isPendingOrderPlacementBackendLocked(orderType, capabilities);

function source(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(resolve(process.cwd(), path), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function initializers(file: ts.SourceFile, name: string): ts.Expression[] {
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) {
      found.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(found.length, `missing ${name}`);
  return found;
}

function evaluate(expression: string, scope: Record<string, unknown>): any {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(`exports.value = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  runInNewContext(code, { exports, ...scope });
  return exports.value;
}

for (const [path, name, wrapped] of [
  [chartPath, 'handleSubmitPendingTradeFromSheet', true],
  [ticketPath, 'handlePlacePendingOrder', false],
] as const) {
  test(`${name}: disabled placement keeps all six retained callbacks inert`, async () => {
    const file = source(path);
    const initializer = initializers(file, name)[0];
    const callback = wrapped && ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer;
    assert.equal(pendingTypes.length, 6);
    for (const orderType of pendingTypes) {
      const unexpected = () => assert.fail(`${orderType} preview attempted a trading side effect`);
      const handler = evaluate(callback.getText(file), {
        orderType,
        chartTradeOrderType: orderType,
        isPendingOrderPlacementBackendLocked: placementLocked,
        requestOrrnnDemoTradeAuth: unexpected,
        blockInvestorTradeAction: unexpected,
        runImmediateAction: unexpected,
        setChartPendingOrderSubmitting: unexpected,
        setTradeActionLocked: unexpected,
        setPendingSide: unexpected,
        ordersApi: { placePendingOrder: unexpected, placeMarketOrder: unexpected },
      });
      // Call twice to cover a retained/programmatic callback and repeat taps.
      await handler();
      await handler();
    }
  });
}

test('disabled placement overrides valid prices and retained props', () => {
  for (const path of [chartPath, featurePath]) {
    const file = source(path);
    const gates = initializers(file, 'disablePendingTradePlaceButton');
    assert.equal(gates.length, path === chartPath ? 1 : 2);
    for (const orderType of pendingTypes) {
      for (const gate of gates) {
        assert.equal(evaluate(gate.getText(file), {
          isPendingOrderPlacementBackendLocked: placementLocked,
          isPendingChartOrder: true,
          chartTradeOrderType: orderType,
          chartPendingOrderSubmitting: false,
          chartPendingQuoteAvailability: { allowed: true },
          stablePendingTradePlaceButtonEnabled: true,
          chartTradeProtectionValidation: { valid: true },
          sheet: { chartTradeOrderType: orderType, disablePendingTradePlaceButton: false },
        }), true, `${path}: ${orderType} must remain preview-only`);
      }
    }
  }
});

test('all four pending placement buttons render disabled and expose no press handler', () => {
  const React = {
    createElement: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  };
  for (const [path, marker, expectedCount] of [
    [chartPath, 'handleSubmitPendingTradeFromSheet', 1],
    [featurePath, 'handlers.onSubmitPendingTrade', 2],
    [ticketPath, 'handlePlacePendingOrder', 1],
  ] as const) {
    const file = source(path);
    const buttons: ts.JsxElement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.getText(file).includes(marker)) buttons.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    assert.equal(buttons.length, expectedCount);
    for (const orderType of pendingTypes) {
      for (const button of buttons) {
        const rendered = evaluate(button.getText(file), {
          React, Pressable: 'Button', FastPressable: 'Button', Text: 'Text',
          styles: {}, t: (value: string) => value,
          disablePendingTradePlaceButton: true,
          pendingOrderPlacementBackendLocked: placementLocked(orderType),
          tradeActionDisabled: false, pendingEntryPrice: 1.12288, pendingSide: null,
          volume: 0.01, formatBackendPrice: String, orderType,
          chartTradeOrderType: orderType, chartTradeCtaColor: '#2563eb',
          sheet: { chartTradeOrderType: orderType, chartTradeCtaColor: '#2563eb' },
        });
        assert.equal(rendered.props.disabled, true);
        assert.equal(rendered.props.accessibilityState.disabled, true);
        assert.equal(rendered.props.onPress, undefined);
      }
    }
  }
});

test('quote strips block market execution only while a pending draft panel is visible', () => {
  const file = source(chartPath);
  const gate = initializers(file, 'chartPendingPreviewActive')[0];
  for (const orderType of CHART_ORDER_TYPES) {
    for (const showChartTradeSheet of [false, true]) {
      assert.equal(evaluate(gate.getText(file), {
        showChartTradeSheet, isPendingChartOrder: isPendingChartOrderType(orderType),
      }), showChartTradeSheet && orderType !== 'Market Execution');
    }
  }

  // All primary top/bottom rows and the split layout receive the same gate.
  const native = file.getText();
  assert.equal(native.match(/executionDisabled=\{chartPendingPreviewActive\}/g)?.length, 4);
  assert.match(native, /disablePendingTradePlaceButton,\s*chartPendingPreviewActive,/);
  const feature = source(featurePath).getText();
  assert.match(feature, /key=\{`chart-trade-footer-dock-\$\{sheet\.chartSymbol\}`\}\s*executionDisabled=\{sheet\.chartPendingPreviewActive\}/);
  assert.match(feature, /key=\{`chart-trade-inline-footer-\$\{chartSymbol\}`\}\s*executionDisabled=\{executionDisabled\}/);
  for (const path of [
    'src/features/chart/components/ChartWindowsLayout.tsx',
    'src/features/chart/components/ChartWindowTradeRow.tsx',
  ]) {
    assert.match(source(path).getText(), /executionDisabled=\{executionDisabled\}/);
  }
  const buttons = source(tradeButtonsPath).getText();
  assert.match(buttons, /useTradeHandler\(\{\s*symbol,\s*variant,\s*executionDisabled,/);
  assert.match(buttons, /const tradeControlsDisabled = !isCurrentChartSymbol;/,
    'preview mode must leave lot editing available');
});

test('retained quote-strip callbacks and scheduled execution recheck the latest preview mode', () => {
  const file = source(tradeHandlerPath);
  const execute = initializers(file, 'executeTrade')[0];
  const handle = initializers(file, 'handleTrade')[0];
  assert.match(file.getText(), /executionDisabledRef\.current = executionDisabled;/);
  for (const orderType of pendingTypes) {
    for (const side of ['buy', 'sell']) {
      const executionDisabledRef = { current: true };
      const effects: string[] = [];
      let scheduled: (() => unknown) | undefined;
      const executeTrade = evaluate(execute.getText(file), {
        executionDisabledRef,
        getChartTradeAction: (actionSide: string) => ({ side: actionSide }),
        useUserPreferences: { getState: () => ({ chartSymbol: 'EURUSD' }) },
        resolveSymbolExecutionOwnership: () => true,
        requestOrrnnDemoTradeAuth: () => { effects.push('auth'); return true; },
        oneClickAccepted: true, variant: 'compact', symbol: 'EURUSD',
      });
      const handleTrade = evaluate(handle.getText(file), {
        executionDisabledRef, executeTrade, variant: 'compact',
        markTradeIntent: () => effects.push('intent'),
        runCriticalTradeAction: (_label: string, action: () => unknown) => { scheduled = action; },
      });
      handleTrade(side);
      executeTrade(side);
      assert.deepEqual(effects, [], `${orderType} ${side}: retained callbacks must be inert`);

      executionDisabledRef.current = false;
      handleTrade(side);
      assert.deepEqual(effects, ['intent']);
      assert.ok(scheduled);
      // Opening a pending panel after a press but before execution also blocks it.
      executionDisabledRef.current = true;
      scheduled();
      assert.deepEqual(effects, ['intent']);

      // Hiding the panel or switching to Market restores the existing market path.
      executionDisabledRef.current = false;
      handleTrade(side);
      scheduled();
      assert.deepEqual(effects, ['intent', 'intent', 'auth']);
    }
  }
});

test('compact and expanded quote-strip buttons remove press callbacks while blocked', () => {
  const file = source(tradeButtonsPath);
  const presses: ts.JsxAttribute[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'onPress'
      && node.getText(file).includes('handleTrade(')) presses.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(presses.length, 4);
  for (const press of presses) {
    assert.ok(press.initializer && ts.isJsxExpression(press.initializer) && press.initializer.expression);
    const expression = press.initializer.expression.getText(file);
    assert.equal(evaluate(expression, { tradeBlocked: true }), undefined);
    let invokedSide = '';
    const callback = evaluate(expression, {
      tradeBlocked: false, handleTrade: (side: string) => { invokedSide = side; },
    });
    callback();
    assert.ok(invokedSide === 'buy' || invokedSide === 'sell');
  }
});

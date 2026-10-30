import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildChartMarketOrderPayload, getChartTradeAction } from '../../chartTradeActions';
import { dispatchChartTradeImmediately } from './chartTradeDispatch';
import { createMarketOrderIntentId } from '../../../../api/orders/marketOrderInFlight';

const file = ts.createSourceFile('useTradeHandler.ts', readFileSync(
  'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function callback(name: string, sourceFile = file) {
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile); assert.ok(expression, name);
  return expression.getText(sourceFile);
}
function harness(oneClickAccepted: boolean, variant: 'compact' | 'mt5-market', overrides: Record<string, unknown> = {}) {
  const orders: any[] = [], feedback: any[] = [], navigation: any[] = [];
  const pendingSides = new Set<string>();
  const state = { oneClickAccepted, chartSymbol: 'EURUSD', accountDetails: { credentials: { accessToken: 'test-only' } } };
  const scope: any = {
    oneClickAccepted, variant, symbol: 'EURUSD', lotSize: 0.01, pointSize: 0.00001,
    comment: '', stopLossPrice: undefined, takeProfitPrice: undefined, protectionDraftId: undefined,
    chartWindowPaneId: 'main', nextChartTradeReceiptId: 1, executionDisabledRef: { current: false },
    useUserPreferences: { getState: () => state }, resolveSymbolExecutionOwnership: () => true,
    router: { navigate: (route: unknown) => navigation.push(JSON.parse(JSON.stringify(route))) },
    isSymbolExecutionOwner: undefined, requestOrrnnDemoTradeAuth: () => false, normalizeSymbol: (value: string) => value,
    getChartTradeAction, createMarketOrderIntentId, resolveTradingLogin: () => 123,
    resolveCurrentQuoteActionAvailability: () => ({ allowed: true, bid: 1.1, ask: 1.1002 }),
    emitTradeResult: (value: any) => feedback.push(value), recordBlockedPriceAction() {}, quoteActionBlockMessage: () => 'Unavailable',
    isNewMarketOrderProtectionBackendLocked: () => false, validateChartTradeProtectionLevels: () => ({ valid: true }),
    getApiLatencyNow: () => 1, dispatchChartTradeImmediately, emitTradeQueueEvent() {},
    isMarketOrderPending: (_symbol: string, side: string) => pendingSides.has(side),
    dispatchAcceptedChartTrade: (order: any) => { pendingSides.add(order.side); orders.push(order); }, logChartTradeDiagnostic() {}, markTradeIntent() {},
    runCriticalTradeAction: (_label: string, action: () => void) => action(),
    tradeTapLockRef: { current: false }, tradeTapLockSideRef: { current: null },
    acquireChartTradeButtonSharedLock: () => true, getChartTradeButtonSharedLockSide: () => null,
    showOrderTicketLaunch: () => { navigation.push('ticket'); return 1; }, markActiveTradeSide() {},
    scheduleOrderTicketLaunchNavigation: () => navigation.push('navigation'), releaseTradeTapLock() {},
    classifyTradingError: () => ({ title: 'Error', message: 'Error' }), reportAcceptedTradeResult() {},
    ...overrides,
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(`const executeTrade = ${callback('executeTrade')}; exports.press = ${callback('handleTrade')};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...scope });
  return { press: exports.press, orders, feedback, navigation, scope, state, pendingSides };
}

test('one Buy/Sell tap dispatches immediately in both chart variants with One Click ON', () => {
  for (const variant of ['compact', 'mt5-market'] as const) {
    const h = harness(true, variant);
    h.press('buy');
    assert.equal(h.orders.length, 1, `${variant}: Buy must dispatch in the tap call`);
    assert.equal(h.orders[0].side, 'buy');
    h.press('sell');
    assert.equal(h.orders.length, 2);assert.equal(h.orders[1].side, 'sell');
    assert.equal(h.orders[0].volume, 0.01);assert.equal(h.orders[1].symbol, 'EURUSD');
    assert.deepEqual(h.navigation, []);assert.deepEqual(h.feedback, []);
  }
});

test('native chart keeps every distinct Buy/Sell click while earlier requests are pending', () => {
  for (const variant of ['compact', 'mt5-market'] as const) for (const side of ['buy', 'sell']) {
    const h = harness(true, variant);
    for (let tap = 0; tap < 10; tap++) h.press(side);
    assert.equal(h.orders.length, 10);
    assert.equal(new Set(h.orders.map(order => order.frontendIntentId)).size, 10);
    assert.equal(new Set(h.orders.map(order => order.id)).size, 10);
    assert.ok(h.orders.every(order => order.side === side));
  }
});

test('One Click OFF immediately opens the ticket without submitting, including after settings change', () => {
  for (const variant of ['compact', 'mt5-market'] as const) for (const side of ['buy', 'sell'] as const) {
    for (const initiallyEnabled of [false, true]) {
      const h = harness(initiallyEnabled, variant);
      h.state.oneClickAccepted = false;
      h.press(side);
      assert.equal(h.orders.length, 0, 'opening the ticket must never submit');
      assert.deepEqual(h.navigation, [{ pathname: '/trade/order-ticket', params: { symbol: 'EURUSD', side, origin: 'chart' } }]);
      h.state.oneClickAccepted = true;
      assert.equal(h.orders.length, 0, 'changing the setting must not replay a tap');
      h.press(side);
      assert.equal(h.orders.length, 1, 'the next explicit tap uses direct execution after enabling');
      assert.equal(h.orders[0].side, side);
    }
  }
});

test('selected chart protection and comment survive both direct execution and ticket navigation', () => {
  for (const enabled of [false, true]) {
    const h = harness(enabled, 'compact', {
      stopLossPrice: 1.09, takeProfitPrice: 1.12, protectionDraftId: 'draft-1', comment: ' chart trade ',
    });
    h.press('buy');
    if (enabled) {
      assert.equal(h.orders.length, 1);
      assert.equal(h.orders[0].stopLossPrice, 1.09);
      assert.equal(h.orders[0].takeProfitPrice, 1.12);
      assert.equal(h.orders[0].protectionDraftId, 'draft-1');
      assert.equal(h.orders[0].comment, 'chart trade');
      assert.deepEqual(h.navigation, []);
    } else {
      assert.equal(h.orders.length, 0);
      assert.deepEqual(h.navigation, [{ pathname: '/trade/order-ticket', params: {
        symbol: 'EURUSD', side: 'buy', origin: 'chart', sl: '1.09', tp: '1.12',
        protectionDraftId: 'draft-1', comment: 'chart trade',
      } }]);
    }
  }
});

test('guest authentication still runs before order dispatch in either preference mode', () => {
  for (const enabled of [false, true]) {
    const h = harness(enabled, 'compact', { requestOrrnnDemoTradeAuth: () => true });
    h.press('buy');
    assert.equal(h.orders.length, 0);
    assert.deepEqual(h.navigation, []);
  }
});

test('disabled previews, invalid lot size, stale quotes and missing login cannot submit through the direct path', () => {
  for (const blocked of ['preview', 'lot', 'quote', 'login']) {
    const h = harness(true, 'compact');
    if (blocked === 'preview') h.scope.executionDisabledRef.current = true;
    if (blocked === 'lot') h.scope.lotSize = 0;
    if (blocked === 'quote') h.scope.resolveCurrentQuoteActionAvailability = () => ({ allowed: false });
    if (blocked === 'login') h.scope.resolveTradingLogin = () => null;
    // Rebind the real callbacks with the changed tap-time context.
    const exports: any = {};
    runInNewContext(ts.transpileModule(`const executeTrade = ${callback('executeTrade')}; exports.press = ${callback('handleTrade')};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, ...h.scope });
    exports.press('buy');
    assert.equal(h.orders.length, 0, blocked);assert.deepEqual(h.navigation, [], blocked);
  }
});

test('web Buy/Sell opens the ticket when OFF and executes directly when ON', () => {
  const webFile = ts.createSourceFile('ChartScreen.web.tsx', readFileSync(
    'src/features/chart/ChartScreen.web.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const enabled of [false, true]) for (const side of ['buy', 'sell'] as const) {
    const state = { oneClickAccepted: enabled };
    const orders: any[] = [], navigation: any[] = [];
    let quoteReads = 0;
    const scope = {
      symbol: 'EURUSD', lotSize: 0.01, isPending: false, isPublicDemoTradePrompt: false,
      shouldLogTradeDiagnostics: false, tradeTapLockRef: { current: false },
      markTradeIntent() {}, requestOrrnnDemoTradeAuth: () => false,
      useUserPreferences: { getState: () => state }, router: { navigate: (route: unknown) => navigation.push(JSON.parse(JSON.stringify(route))) },
      getChartTradeAction, buildChartMarketOrderPayload, createMarketOrderIntentId,
      createTradeReceipt: () => ({}),
      getCurrentExecutableQuoteState: () => { quoteReads++; return { quote: { bid: 1.1, ask: 1.1002 } }; },
      resolveChartTradeQuoteAvailability: () => ({ allowed: true }),
      captureActiveBrokerSessionProvenance: () => ({ identity: { accountLogin: '123' } }),
      resolveTradingLogin: () => 123, placeOrder: (order: any) => orders.push(order),
    };
    const press = runInNewContext(ts.transpileModule(`(${callback('handleTrade', webFile)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, scope);
    press(side);
    assert.equal(orders.length, enabled ? 1 : 0);
    assert.equal(quoteReads, enabled ? 1 : 0, 'ticket navigation must not wait for quote processing');
    assert.deepEqual(navigation, enabled ? [] : [{ pathname: '/trade/order-ticket', params: { symbol: 'EURUSD', side, origin: 'chart' } }]);
    if (enabled) {
      assert.equal(orders[0].side, side);
      for (let tap = 1; tap < 10; tap++) press(side);
      assert.equal(orders.length, 10, 'each distinct click starts another request immediately');
      assert.equal(new Set(orders.map(order => order.frontendIntentId)).size, 10);
    }
  }
});

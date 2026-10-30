import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { resolveBrokerExecutionEvidence } from '../../api/orders/executionEvidence';
import { normalizePendingOrderType } from '../../api/orders/pendingOrderPayload';
import { pendingEntryPrice, pendingExpiry, pendingPriceRulesReady, validatePendingOrder } from '../../domain/pendingOrders';
import { resolveConfirmedTradeReceipt } from '../../ui/components/tradeFeedbackPresentation';
import { createChartTradeReceiptStackController } from '../chart/components/chartTradeReceiptStackController';
import { getChartOrderSide, isPendingChartOrderType, isPendingChartTradeValid, isStopLimitChartOrderType, validateChartTradeProtectionLevels } from '../chart/chartTradeOrderUtils';
import { createOrderTicketReceiptAnchor } from './orderTicketReceiptAnchor';

// Execute the real screen callbacks with controlled broker and refresh promises.
function callback(path: string, name: string) {
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) {
      found = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(found, name);
  return ts.transpileModule(`(${found.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const chart = callback('src/features/chart/ChartScreen.native.tsx', 'submitPendingOrder');
const ticket = callback('src/features/trade/OrderTicketScreen.tsx', 'handlePlacePendingOrder');
const showModal = callback('src/features/trade/OrderTicketScreen.tsx', 'showModal');

function harness(surface: 'chart' | 'ticket', side: 'buy' | 'sell') {
  const events: string[] = [], requests: any[] = [], feedback: any[] = [];
  let complete!: (data: object) => void, fail!: (error: unknown) => void;
  let current = true;
  const controller = createChartTradeReceiptStackController();
  controller.subscribe(() => { events.push(controller.getSnapshot().at(-1)?.status ?? 'cleared'); });
  const orderType = side === 'buy' ? 'Buy Limit' : 'Sell Limit';
  const entry = side === 'buy' ? 90 : 110;
  const sl = side === 'buy' ? 80 : 120, tp = side === 'buy' ? 120 : 80;
  const meta = { digits: 2, stopsLevel: 0 };
  const scope: any = {
    chartTradeOrderType: orderType, orderType,
    chartTradePrice: entry, pendingEntryPrice: entry,
    chartTradeStopLimitPrice: 0, pendingStopLimitPrice: 0, isStopLimitOrderType: false,
    chartTradeSlEnabled: true, slEnabled: true, chartTradeSlPrice: sl, slPrice: sl,
    chartTradeTpEnabled: true, tpEnabled: true, chartTradeTpPrice: tp, tpPrice: tp,
    chartTradeComment: '', routeComment: '',
    chartPendingTimeInForce: 'GTC', pendingTimeInForce: 'GTC',
    chartPendingExpiry: null, pendingExpirySeconds: null,
    chartSymbol: 'BTCUSD', symbol: 'BTCUSD', chartLiveQuote: {},
    chartInstrumentMeta: meta, instrumentMeta: meta,
    displayDecimals: 2, priceDecimals: 2, chartProtectionTickSize: 0.01, priceTickSize: 0.01, chartPointSize: 0.01,
    tradeVolume: 0.01, volume: 0.01, brokerId: 'broker-a',
    accountDetails: { id: '123', credentials: { accessToken: 'test-only' } },
    chartPendingSubmitLockRef: { current: false }, tradeTapLockRef: { current: false }, tradeTapLockSideRef: { current: null },
    tradeActionLocked: false, pendingSide: null, isMarketExecution: false,
    hasProtectionIntent: true, resolvedOrigin: 'chart',
    chartWindows: { activePane: { id: 'pane-a' } },
    nextPendingReceiptIdRef: { current: -1 }, nextReceiptIdRef: { current: 1 },
    chartTradeReceiptStackController: controller, orderTicketReceiptController: controller,
    getChartOrderSide, isPendingChartOrderType, isPendingChartTradeValid, isStopLimitChartOrderType, validateChartTradeProtectionLevels,
    normalizePendingOrderType, pendingExpiry, pendingPriceRulesReady, validatePendingOrder,
    // Ticket has a local numeric variable with this name; Chart calls the domain helper.
    ...(surface === 'chart' ? { pendingEntryPrice } : {}),
    roundTradePrice: (value: number) => value, roundPendingPrice: (value: number) => value,
    resolveBrokerExecutionEvidence, resolveConfirmedTradeReceipt, TRADE_MODAL_INITIAL: { visible: false, type: 'success' },
    isPendingOrderPlacementBackendLocked: () => false, isPendingOrderProtectionBackendLocked: () => false,
    requestOrrnnDemoTradeAuth: () => false, blockInvestorTradeAction: () => false, checkOrderPolicy: () => null,
    resolveSessionQuoteActionAvailability: () => ({ allowed: true, bid: 100, ask: 101 }),
    resolveCurrentQuoteAvailability: () => ({ allowed: true, bid: 100, ask: 101 }),
    recordBlockedPriceAction() {}, quoteActionBlockMessage: () => 'Quote unavailable',
    useUserPreferences: { getState: () => scope }, resolveTradingLogin: () => 123,
    captureActiveBrokerSession: () => ({ session: { accountLogin: '123' } }),
    captureActiveBrokerSessionProvenance: () => ({ cacheNamespace: 'account-a', identity: { accountLogin: '123' } }),
    getActiveBrokerSessionProvenance: () => ({ cacheNamespace: 'account-a' }),
    isActiveBrokerSessionProvenanceCurrent: () => current,
    ordersApi: { placePendingOrder: (payload: any) => {
      events.push('POST'); requests.push(payload);
      return new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    } },
    handleChartTradeResult: (value: any, suppressed: boolean) => { feedback.push(value); events.push(suppressed ? 'compact-result' : 'detail-result'); },
    setModalState: () => {},
    setChartPendingOrderSubmitting: (busy: boolean) => { events.push(`busy:${busy}`); },
    setTradeActionLocked: (busy: boolean) => { events.push(`busy:${busy}`); }, setPendingSide() {},
    refetchOrders: () => { events.push('refresh'); return new Promise(() => {}); },
    refetchAccountSummary: () => new Promise(() => {}), refreshPositions: () => new Promise(() => {}),
    queryClient: {}, invalidateSessionQueryRoots: () => { events.push('refresh'); return new Promise(() => {}); },
    snapTradeSheet: () => { events.push('collapse'); }, logOrderTicketDiagnostic() {},
    classifyTradingError: (error: any) => ({ kind: error?.status === 400 ? 'backend-rejection' : 'backend-unavailable',
      status: error?.status, title: 'Order error', message: 'Check Orders before retrying' }),
    createFrontendTradingError: (title: string, message: string) => ({ title, message }),
    redactSensitiveString: (value: string) => value, t: (value: string) => value,
  };
  scope.showModal = runInNewContext(showModal, scope);
  const submit: () => Promise<void> = runInNewContext(surface === 'chart' ? chart : ticket, scope);
  return { submit, controller, events, requests, feedback, scope,
    complete: (data: object) => complete(data), fail: (error: unknown) => fail(error),
    changeSession: () => { current = false; },
  };
}

for (const surface of ['chart', 'ticket'] as const) for (const side of ['buy', 'sell'] as const) {
  test(`${surface} ${side} limit shows a request popup immediately and placement before slow refreshes`, async () => {
    const h = harness(surface, side);
    try {
      const request = h.submit();
      assert.equal(h.events[0], 'POST');
      assert.equal(h.controller.getSnapshot()[0].status, 'pending');
      assert.ok(h.events.indexOf('pending') < h.events.indexOf('busy:true'));
      assert.equal(h.requests[0].side, side);
      assert.equal(h.requests[0].price_sl, side === 'buy' ? 80 : 120);
      assert.equal(h.requests[0].price_tp, side === 'buy' ? 120 : 80);
      await h.submit();
      assert.equal(h.requests.length, 1, 'duplicate native callbacks cannot create another pending order');
      h.complete({ status: 'placed', ticket: '9007199254740993', price_open: h.requests[0].price });
      await request; // Refresh promises deliberately never settle.
      const rows = h.controller.getSnapshot();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, 'placed');
      assert.equal(rows[0].feedback?.executionConfirmed, false, 'placement is not an executed market trade');
      assert.equal(rows[0].feedback?.ticket, '9007199254740993');
      assert.ok(h.events.indexOf('placed') < h.events.indexOf('refresh'));
      assert.equal(h.events.at(-1), 'busy:false');
    } finally { h.controller.dispose(); }
  });

  test(`${surface} ${side} limit preserves uncertain results, broker rejection and stale-session cleanup`, async () => {
    for (const result of ['missing-ticket', 'rejected', 'network', 'stale', 'unmounted'] as const) {
      const h = harness(surface, side);
      try {
        const request = h.submit();
        if (result === 'stale') h.changeSession();
        if (result === 'unmounted') h.controller.clear();
        if (result === 'network') h.fail(new Error('Network timed out'));
        else h.complete(result === 'rejected' ? { status: 'rejected', comment: 'Invalid price' }
          : result === 'missing-ticket' ? { status: 'accepted' } : { status: 'placed', ticket: 12 });
        await request;
        const rows = h.controller.getSnapshot();
        if (result === 'stale' || result === 'unmounted') assert.equal(rows.length, 0);
        else assert.equal(rows[0].status, result === 'rejected' ? 'failed' : 'unconfirmed');
        assert.equal(h.scope.chartPendingSubmitLockRef.current, false);
        assert.equal(h.scope.tradeTapLockRef.current, false);
        assert.equal(h.events.at(-1), 'busy:false');
      } finally { h.controller.dispose(); }
    }
  });
}

test('pending placement receipt expires like a one-click receipt without using executed status', async () => {
  const controller = createChartTradeReceiptStackController({ terminalDismissMs: 5 });
  try {
    controller.applyEvent({ queueId: -1, status: 'placed', side: 'buy', symbol: 'BTCUSD', volume: 0.01 });
    assert.equal(controller.getSnapshot()[0].status, 'placed');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(controller.getSnapshot().length, 0);
  } finally { controller.dispose(); }
});

test('pending placement popup labels are distinct from executed one-click trades', () => {
  const terminalLabel = runInNewContext(callback('src/features/chart/components/ChartTradeReceiptStack.tsx', 'terminalLabel'));
  assert.equal(terminalLabel({ status: 'placed' }), 'placed');
  assert.equal(terminalLabel({ status: 'confirmed' }), 'done');
  assert.equal(terminalLabel({ status: 'unconfirmed' }), 'check');
  assert.equal(terminalLabel({ status: 'failed' }), 'failed');
});

test('the pending Place row measures the popup above its button after scrolling', () => {
  const path = 'src/features/trade/OrderTicketScreen.tsx';
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let row: ts.JsxElement | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'testID'
      && node.initializer?.getText(file) === '"order-ticket-pending-submit"') {
      row = node.parent.parent.parent.parent as ts.JsxElement;
    }
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(row && ts.isJsxElement(row));
  assert.ok(ts.isJsxFragment(row.parent), 'pending and market rows must share scroll-content coordinates');
  const layout = row.openingElement.attributes.properties.find(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(file) === 'onLayout') as ts.JsxAttribute;
  assert.ok(layout?.initializer && ts.isJsxExpression(layout.initializer) && layout.initializer.expression);
  const anchor = createOrderTicketReceiptAnchor();
  anchor.update({ rootHeight: 800, viewportTop: 60, viewportHeight: 700, scrollOffset: 300 });
  const measure = runInNewContext(ts.transpileModule(`(${layout.initializer.expression.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { orderTicketReceiptAnchor: anchor });
  measure({ nativeEvent: { layout: { y: 900 } } });
  assert.deepEqual(anchor.getSnapshot(), { top: 68, bottom: 148 });
  assert.equal(800 - anchor.getSnapshot()!.bottom, 60 + 900 - 300 - 8);
});

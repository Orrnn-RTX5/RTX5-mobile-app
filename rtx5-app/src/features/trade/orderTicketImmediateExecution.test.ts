import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { assertTradeSide } from '../../domain/tradeSide';
import { resolveBrokerExecutionEvidence } from '../../api/orders/executionEvidence';
import { resolveConfirmedTradeReceipt } from '../../ui/components/tradeFeedbackPresentation';
import { createChartTradeReceiptStackController } from '../chart/components/chartTradeReceiptStackController';

const source = readFileSync('src/features/trade/OrderTicketScreen.tsx', 'utf8');
const file = ts.createSourceFile('OrderTicketScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.Expression | undefined;
let modalHandler: ts.Expression | undefined;
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handlePlaceOrder') handler = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'showModal' && node.initializer && ts.isCallExpression(node.initializer)) modalHandler = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
};
visit(file);
assert.ok(handler);

function harness(overrides: Record<string, unknown> = {}) {
  const requests: any[] = [], events: string[] = [], feedback: any[] = [];
  const completions: Array<(data: object) => void> = [];
  const failures: Array<(error: unknown) => void> = [];
  let nextIntent = 0;
  const controller = createChartTradeReceiptStackController({ terminalDismissMs: 0 });
  let applyFeedback: (...args: any[]) => void = () => {};
  controller.subscribe(() => { if (controller.getSnapshot()[0]?.status === 'pending') events.push('sent'); });
  const scope: any = {
    symbol: 'BTCUSD', volume: 0.01, resolvedOrigin: 'chart', routeSide: 'buy', routeComment: '',
    routeInitialSymbol: 'BTCUSD', routeProtectionDraftId: '', brokerId: 'test', instrumentMeta: {},
    isMarketExecution: true,
    hasProtectionIntent: false, slEnabled: false, slPrice: 0, tpEnabled: false, tpPrice: 0,
    tradeTapLockRef: { current: false }, tradeTapLockSideRef: { current: null },
    tradeActionLocked: false, pendingSide: null,
    marketPendingCounts: { buy: 0, sell: 0 },
    accountDetails: { id: '123', credentials: { accessToken: 'test-only' } },
    assertTradeSide, markTradeIntent() {}, requestOrrnnDemoTradeAuth: () => false,
    blockInvestorTradeAction: () => false, checkOrderPolicy: () => null,
    isNewMarketOrderProtectionBackendLocked: () => false,
    resolveCurrentQuoteAvailability: () => ({ allowed: true }),
    recordBlockedPriceAction() {}, quoteActionBlockMessage: () => 'Unavailable',
    resolveTradingLogin: () => 123,
    captureActiveBrokerSessionProvenance: () => ({ cacheNamespace: 'account-a', identity: { accountLogin: '123' } }),
    isMarketOrderFeedbackCurrent: () => true,
    createMarketOrderIntentId: () => `order-test-click-${++nextIntent}`,
    setMarketPendingCounts: (update: (counts: any) => any) => {
      scope.marketPendingCounts = update(scope.marketPendingCounts);
      events.push(`busy:${scope.marketPendingCounts.buy + scope.marketPendingCounts.sell > 0}`);
    },
    setTradeActionLocked: (busy: boolean) => { events.push(`busy:${busy}`); },
    setPendingSide: (side: string | null) => { events.push(`side:${side}`); },
    ordersApi: { placeMarketOrder: (payload: any) => {
      events.push('POST'); requests.push(payload);
      return new Promise<object>((resolve, reject) => { completions.push(resolve); failures.push(reject); });
    } },
    showModal: (value: any, ...args: any[]) => { events.push('receipt'); feedback.push(value); applyFeedback(value, ...args); },
    orderTicketReceiptController: controller, nextReceiptIdRef: { current: 1 },
    resolveConfirmedTradeReceipt, TRADE_MODAL_INITIAL: { visible: false, type: 'success' }, setModalState() {},
    resolveBrokerExecutionEvidence,
    formatTradeVolume: (value: number) => value.toFixed(2), volumeBounds: {}, queryClient: {},
    scheduleMarketOrderSummaryRefresh: (_client: unknown, namespace: string) => { events.push(`refresh:${namespace}`); },
    invalidateSessionQueryRoots: () => { throw new Error('Market execution must not duplicate API position reconciliation'); },
    classifyTradingError: () => ({ kind: 'backend-rejection', status: 400, title: 'Rejected', message: 'Broker rejected order' }),
    redactSensitiveString: (message: string) => message,
    normalizeSymbol: (value: string) => value,
    publishChartProtectionDraftSubmission() {}, publishChartProtectionDraftExecution() {}, releaseChartProtectionDraftSubmission() {},
    logOrderTicketDiagnostic() {}, warnOrderTicketDiagnostic() {}, t: (value: string) => value,
    ...overrides,
  };
  applyFeedback = runInNewContext(ts.transpileModule(`(${modalHandler!.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  const press = runInNewContext(ts.transpileModule(`(${handler!.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  return { press, requests, events, feedback, scope, controller,
    complete: (data: object, index = completions.length - 1) => completions[index](data),
    reject: (index = completions.length - 1) => completions[index]({ status: 'rejected' }),
    fail: (error: unknown, index: number) => failures[index](error),
  };
}

test('ticket Buy/Sell starts each click before rendering without waiting for another request', async () => {
  for (const oneClickAccepted of [false, true]) for (const side of ['buy', 'sell']) {
    const h = harness({ oneClickAccepted });
    const completion = h.press(side);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].side, side);
    assert.equal(h.requests[0].symbol, 'BTCUSD');
    assert.equal(h.requests[0].volume, 0.01);
    assert.equal(h.events[0], 'POST', 'no busy-state render may precede transport');
    const second = h.press(side === 'buy' ? 'sell' : 'buy');
    assert.equal(h.requests.length, 2, 'a new click remains available during another order');
    assert.notEqual(h.requests[0].frontendIntentId, h.requests[1].frontendIntentId);
    h.reject(0); h.reject(1); await Promise.all([completion, second]);
    assert.equal(h.feedback[0].type, 'error', 'a server rejection must never look executed');
  }
});

test('ticket returns the exact broker result before background refresh with One Click ON or OFF', async () => {
  for (const oneClickAccepted of [false, true]) for (const side of ['buy', 'sell']) {
    const h = harness({ oneClickAccepted });
    const completion = h.press(side);
    assert.equal(h.requests.length, 1);
    assert.equal(h.events[0], 'POST');
    assert.equal(h.feedback.length, 0, 'success must wait for broker evidence');
    assert.equal(h.controller.getSnapshot().length, 1, 'a receipt must appear before the backend responds');
    assert.equal(h.controller.getSnapshot()[0].status, 'pending');
    const receiptId = h.controller.getSnapshot()[0].queueId;
    assert.ok(h.events.indexOf('sent') > h.events.indexOf('POST'));
    assert.ok(h.events.indexOf('sent') < h.events.indexOf('busy:true'));
    h.complete({ status: 'filled', position_ticket: '9007199254740993', price: 81621.851234 });
    await completion;
    assert.equal(h.feedback.length, 1);
    assert.equal(h.feedback[0].executionConfirmed, true);
    assert.equal(h.feedback[0].price, 81621.851234);
    assert.equal(h.feedback[0].ticket, '9007199254740993');
    assert.equal(h.feedback[0].side, side);
    assert.equal(h.controller.getSnapshot().length, 1, 'confirmation updates the immediate popup instead of adding another');
    assert.equal(h.controller.getSnapshot()[0].queueId, receiptId);
    assert.equal(h.controller.getSnapshot()[0].status, 'confirmed');
    assert.ok(h.events.indexOf('receipt') < h.events.indexOf('refresh:account-a'));
    assert.equal(h.scope.tradeTapLockRef.current, false);
  }
});

test('ticket local account/symbol policy, investor access and current quotes still guard immediate execution', async () => {
  for (const overrides of [
    { checkOrderPolicy: () => 'Trading is disabled for this account.' },
    { blockInvestorTradeAction: () => true },
    { resolveCurrentQuoteAvailability: () => ({ allowed: false }) },
  ]) {
    const h = harness(overrides);
    await h.press('buy');
    assert.equal(h.requests.length, 0);
  }
});

test('margin/status previews cannot delay a valid ticket Buy/Sell request', async () => {
  for (const side of ['buy', 'sell']) {
    const h = harness({
      marginFetching: true, marginError: true, serverMargin: undefined,
      marketStatus: undefined, marketSymbols: [],
    });
    const completion = h.press(side);
    assert.equal(h.requests.length, 1, 'dispatch must not wait for preview API responses');
    assert.equal(h.events[0], 'POST');
    h.reject(); await completion;
    assert.equal(h.feedback[0].type, 'error', 'the broker still rejects invalid market/margin conditions');
  }
  const availability = source.slice(source.indexOf('const tradePolicyErrors ='), source.indexOf('const pricePanelActionUnavailable'));
  assert.doesNotMatch(availability, /marginFetching|marginReady|serverMargin|marketStatus|marketSymbols/);
  assert.doesNotMatch(handler!.getText(file), /marginReady|policyReady|setTimeout|calculateMargin|useMarketStatus/);
});

test('a new explicit Buy/Sell click starts immediately after settlement without a cooldown', async () => {
  const h = harness();
  for (let click = 1; click <= 20; click++) {
    const side = click % 2 ? 'buy' : 'sell';
    const completion = h.press(side);
    assert.equal(h.requests.length, click);
    assert.equal(h.requests.at(-1).side, side);
    h.complete({ status: 'filled', position_ticket: String(1000 + click), price: 81621.851234 });
    await completion;
    assert.equal(h.feedback.length, click, 'one confirmed popup per executed click');
    assert.equal(h.scope.tradeTapLockRef.current, false);
  }
});

test('10 rapid clicks dispatch 10 independent orders and retain 10 correctly matched popups in click order', async () => {
  for (const oneClickAccepted of [false, true]) for (const mode of ['buy', 'sell', 'mixed']) {
    const h = harness({ oneClickAccepted, routeProtectionDraftId: 'same-chart-draft' });
    try {
      const sides = Array.from({ length: 10 }, (_, index) => mode === 'mixed' ? index % 2 ? 'sell' : 'buy' : mode);
      const pending = sides.map(side => h.press(side));
      assert.equal(h.requests.length, 10, 'all requests start before any backend response');
      assert.equal(new Set(h.requests.map(request => request.frontendIntentId)).size, 10);
      assert.equal(h.controller.getSnapshot().length, 10);
      assert.ok(h.controller.getSnapshot().every(row => row.status === 'pending'));
      assert.equal(h.feedback.length, 0, 'a pending request is never shown as executed');
      for (let index = 9; index >= 0; index--) {
        h.complete({ status: 'filled', position_ticket: `9007199254740${String(index).padStart(3, '0')}`, price: 81621 + index / 100 }, index);
        await pending[index];
        const rows = h.controller.getSnapshot();
        assert.deepEqual(rows.map(row => row.queueId), Array.from({ length: 10 }, (_, i) => i + 1));
        assert.equal(rows[index].status, 'confirmed');
        assert.equal(rows[index].feedback?.ticket, `9007199254740${String(index).padStart(3, '0')}`);
        assert.equal(rows[index].feedback?.price, 81621 + index / 100);
        assert.equal(rows[index].side, sides[index]);
      }
      assert.equal(h.feedback.length, 10);
      assert.equal(h.controller.getSnapshot().length, 10, 'sent-to-done updates cannot replace another trade or add duplicate receipts');
      assert.equal(h.scope.marketPendingCounts.buy + h.scope.marketPendingCounts.sell, 0);
    } finally { h.controller.dispose(); }
  }
});

test('one rejected request does not cancel or relabel the other concurrent orders', async () => {
  const h = harness();
  try {
    const pending = ['buy', 'buy', 'sell'].map(side => h.press(side));
    h.fail(new Error('Rejected by broker'), 1); await pending[1];
    assert.deepEqual(h.controller.getSnapshot().map(row => row.status), ['pending', 'failed', 'pending']);
    assert.equal(h.scope.marketPendingCounts.buy, 1);
    assert.equal(h.scope.marketPendingCounts.sell, 1);
    for (const index of [2, 0]) {
      h.complete({ status: 'filled', position_ticket: String(900 + index), price: 81621.85 }, index);
      await pending[index];
    }
    assert.deepEqual(h.controller.getSnapshot().map(row => row.status), ['confirmed', 'failed', 'confirmed']);
    assert.equal(h.requests.length, 3);
    assert.equal(h.scope.marketPendingCounts.buy + h.scope.marketPendingCounts.sell, 0);
  } finally { h.controller.dispose(); }
});

test('ticket market buttons activate on touch-down with no press delay', () => {
  for (const action of ['sellTradeAction.side', 'buyTradeAction.side', 'action.side']) {
    const start = source.indexOf(`onPress={() => { void handlePlaceOrder(${action}); }}`);
    assert.ok(start > 0);
    const props = source.slice(start, source.indexOf('latencyLabel=', start));
    assert.match(props, /activateOnPressIn/);
    assert.match(props, /activateOnTouchStart/);
    assert.match(props, /unstable_pressDelay=\{0\}/);
  }
});

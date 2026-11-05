import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createMarketOrderIntentId } from '../../../api/orders/marketOrderInFlight';
import { createMarketTradeReceiptCallbacks } from '../../trade/marketTradeReceiptCallbacks';
import { createChartTradeReceiptStackController } from '../../chart/components/chartTradeReceiptStackController';

const source = readFileSync('src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx', 'utf8');
const file = ts.createSourceFile('SymbolDetailsScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.Expression | undefined;
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handleTrade') handler = node.initializer;
  ts.forEachChild(node, visit);
};
visit(file); assert.ok(handler);

function harness(enabled: boolean, quoteAllowed = true) {
  const requests: any[] = [], events: string[] = [], alerts: any[] = [];
  const state = { oneClickAccepted: enabled, tradeVolume: 0.01 };
  const navigation: any[] = [];
  const receipts = createChartTradeReceiptStackController({ terminalDismissMs: 0 });
  let nextReceiptId = 1;
  const scope = {
    symbol: 'BTCUSD', oneClickAccepted: enabled, isPending: false,
    tradeTapLockRef: { current: false }, q: { minVolume: 0.01, maxVolume: 10 }, liveQuote: {},
    markTradeIntent() {}, requestOrrnnDemoTradeAuth: () => false,
    setActiveSide: (side: unknown) => events.push(`busy:${side}`),
    resolveSessionQuoteActionAvailability: () => ({ allowed: quoteAllowed }),
    recordBlockedPriceAction() {}, quoteActionBlockMessage: () => 'Missing quote',
    captureActiveBrokerSessionProvenance: () => ({ identity: { accountLogin: '123' } }),
    isMarketOrderFeedbackCurrent: () => true,
    resolveTradingLogin: () => 123, resolveTradingLoginString: () => '123',
    useUserPreferences: { getState: () => state },
    placeOrder: (payload: any, callbacks: any) => { events.push('POST'); requests.push({ payload, callbacks }); },
    createMarketOrderIntentId,
    createTradeReceipt: (trade: any) => createMarketTradeReceiptCallbacks(receipts,
      { ...trade, queueId: nextReceiptId++, status: 'pending' }, () => true),
    Alert: { alert: (...args: any[]) => alerts.push(args) }, t: (value: string) => value,
    router: { navigate: (route: unknown) => { events.push('navigation'); navigation.push(JSON.parse(JSON.stringify(route))); } },
    prefetchOrderTicketData: () => { events.push('prefetch'); },
  };
  const press = runInNewContext(ts.transpileModule(`(${handler!.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  return { press, requests, events, alerts, state, navigation, receipts };
}

test('quote-details Buy/Sell dispatches immediately with One Click ON and displays the exact fill', () => {
  for (const side of ['buy', 'sell']) {
    const h = harness(true);
    h.press(side);
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].payload.side, side);
    assert.deepEqual(h.events, ['POST']);
    for (let tap = 1; tap < 10; tap++) h.press(side);
    assert.equal(h.requests.length, 10);
    assert.equal(new Set(h.requests.map(request => request.payload.frontendIntentId)).size, 10);
    assert.equal(h.receipts.getSnapshot().length, 10);
    for (let index = 9; index >= 0; index--) {
      const callbacks = h.requests[index].callbacks;
      callbacks.onSuccess({ status: 'filled', position_ticket: `900719925474099${index}`, price: 81621.851234 + index });
      callbacks.onSettled();
    }
    h.receipts.getSnapshot().forEach((row, index) => {
      assert.equal(row.status, 'confirmed');
      assert.equal(row.feedback?.ticket, `900719925474099${index}`);
      assert.equal(row.feedback?.price, 81621.851234 + index);
    });
    assert.equal(h.alerts.length, 0, 'each result updates its own stacked popup');
    assert.ok(!h.events.includes('navigation'));
    assert.ok(!h.events.includes('prefetch'));
  }
});

test('One Click OFF opens quote-details order ticket before prefetch without submitting', () => {
  for (const initiallyEnabled of [false, true]) for (const side of ['buy', 'sell']) {
    const h = harness(initiallyEnabled, false);
    h.state.oneClickAccepted = false;
    h.press(side);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.events, ['navigation', 'prefetch']);
    assert.deepEqual(h.navigation, [{ pathname: '/trade/order-ticket', params: { symbol: 'BTCUSD', side, origin: 'quotes' } }]);
  }
});

test('a missing quote cannot execute a direct order with One Click ON', () => {
  const stale = harness(true, false);
  stale.press('buy');
  assert.equal(stale.requests.length, 0);
  assert.equal(stale.alerts.length, 1);
  assert.equal(stale.receipts.getSnapshot().length, 0);
  assert.ok(!stale.events.includes('navigation'));
});

test('quote-details trade actions activate on touch-down without a timer-based reset', () => {
  for (const side of ['buy', 'sell']) {
    const start = source.indexOf(`onPress={() => handleTrade('${side}')}`);
    assert.ok(start > 0);
    const props = source.slice(start, source.indexOf('latencyLabel=', start));
    assert.match(props, /activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}/);
  }
  assert.doesNotMatch(handler!.getText(file), /setTimeout|releaseTradeTapLockAfter/);
});

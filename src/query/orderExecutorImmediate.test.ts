import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const file = ts.createSourceFile('orders.ts', readFileSync('src/query/orders.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function callback(name: string) {
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(expression, name); return expression.getText(file);
}

function harness() {
  const requests: any[] = [], feedback: any[] = [];
  let owner: object | null = { cacheNamespace: 'account-1' };
  let resolve!: (data: object) => void;
  let reject!: (error: unknown) => void;
  const exports: any = {};
  runInNewContext(ts.transpileModule(`
    const submitPlaceOrderWithCacheUpdate = ${callback('submitPlaceOrderWithCacheUpdate')};
    const usePlaceOrderExecutor = ${callback('usePlaceOrderExecutor')};
    exports.execute = usePlaceOrderExecutor();
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    useQueryClient: () => ({}), useActiveBrokerQuerySession: () => ({}),
    getSessionQueryCacheNamespace: () => 'account-1', useCallback: (fn: unknown) => fn,
    captureActiveBrokerSessionOwnerStamp: () => owner,
    isActiveBrokerSessionOwnerStampCurrent: () => owner !== null,
    StaleBrokerSessionError: class extends Error {}, logPlaceOrderPayload() {},
    handlePlaceOrderSuccess() {},
    ordersApi: { placeMarketOrder: (payload: any) => {
      requests.push(payload);
      return new Promise<object>((yes, no) => { resolve = yes; reject = no; });
    } },
  });
  let settle!: () => void;
  const settled = new Promise<void>(done => { settle = done; });
  const options = {
    onSuccess: (value: any) => feedback.push(value), onError: (error: any) => feedback.push(error), onSettled: settle,
  };
  return { execute: exports.execute, requests, feedback, options, settled,
    succeed: (data: object) => resolve(data), fail: (error: unknown) => reject(error),
    switchAccount: () => { owner = null; } };
}

test('direct Buy/Sell starts the API inside the click call and forwards the exact response immediately on settlement', async () => {
  for (const side of ['buy', 'sell']) {
    const h = harness();
    h.execute({ symbol: 'BTCUSD', side, account_login: 123, volume: 0.01 }, h.options);
    assert.equal(h.requests.length, 1, 'no mutation scheduler or timer may run before the API call');
    assert.equal(h.requests[0].side, side);
    assert.equal(h.feedback.length, 0, 'no invented result before the backend');
    const response = { position_ticket: '9007199254740993', price: 81621.851234 };
    h.succeed(response); await h.settled;
    assert.equal(h.feedback[0], response);
  }
});

test('backend rejection releases loading and an account switch suppresses stale results while still settling', async () => {
  const failed = harness();
  failed.execute({ symbol: 'BTCUSD', side: 'buy' }, failed.options);
  const error = new Error('rejected');
  failed.fail(error); await failed.settled;
  assert.equal(failed.feedback[0], error);
  const stale = harness();
  stale.execute({ symbol: 'BTCUSD', side: 'buy' }, stale.options);
  stale.switchAccount(); stale.succeed({ price: 1 }); await stale.settled;
  assert.equal(stale.feedback.length, 0);
});

test('chart web and quote-details buttons use the direct executor instead of a query mutation queue', () => {
  for (const path of ['src/features/chart/ChartScreen.web.tsx', 'src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx']) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /const placeOrder = usePlaceOrderExecutor\(\)/);
    assert.match(source, /frontendIntentId: createMarketOrderIntentId\(\)/);
    assert.match(source, /createTradeReceipt\(\{ symbol, side/);
    assert.doesNotMatch(source, /tradeTapLockRef|onSettled: releaseTradeTapLock|disabled=\{isPending/);
    assert.doesNotMatch(source, /usePlaceOrderMutation/);
  }
});

test('ticket and One-Click share a deferred summary refresh without an extra positions request', async () => {
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'scheduleMarketOrderSummaryRefresh');
  assert.ok(declaration);
  const exports: any = {}, scheduled: Array<() => Promise<unknown>> = [], refreshed: any[] = [];
  const queryClient = {};
  runInNewContext(ts.transpileModule(declaration.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports,
    placeOrderCacheRefreshScheduler: { schedule: (owner: unknown, namespace: string, refresh: () => Promise<unknown>) => {
      assert.equal(owner, queryClient); assert.equal(namespace, 'account-a'); scheduled.push(refresh);
    } },
    invalidateSessionQueryRoots: async (owner: unknown, namespace: string, roots: string[]) => {
      assert.equal(owner, queryClient); refreshed.push({ namespace, roots: Array.from(roots) });
    },
  });
  assert.equal(exports.scheduleMarketOrderSummaryRefresh(queryClient, 'account-a'), undefined);
  assert.equal(scheduled.length, 1);
  assert.deepEqual(refreshed, [], 'no cache traversal runs in the receipt callback');
  await scheduled[0]();
  assert.deepEqual(refreshed, [{ namespace: 'account-a', roots: ['accountSummary', 'transactions'] }]);
});

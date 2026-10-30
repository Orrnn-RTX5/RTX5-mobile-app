import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

const historySource = readFileSync(resolve(process.cwd(), 'src/features/history/HistoryScreen.tsx'), 'utf8');
const hookNames = ['usePositionHistoryQuery', 'useAccountDealsQuery', 'useOrdersByLoginQuery', 'useAccountSummary'];
const tree = ts.createSourceFile('HistoryScreen.tsx', historySource, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
const calls: string[] = [];
const visit = (node: ts.Node) => {
  if (ts.isCallExpression(node) && hookNames.includes(node.expression.getText(tree))) calls.push(node.getText(tree));
  ts.forEachChild(node, visit);
};
visit(tree);
const activitySource = historySource.slice(historySource.indexOf('  const appForeground ='), historySource.indexOf('  // Cached data shows instantly'));

test('all four history observers subscribe on visible focus before deferred fetching, and stop hidden/background notifications', () => {
  assert.equal(calls.length, 4);
  for (const focused of [true, false]) for (const foreground of [true, false]) for (const ready of [true, false]) {
    const observed: Array<{ enabled: boolean; subscribed: boolean }> = [];
    const context: Record<string, unknown> = {
      isScreenFocused: focused,
      useAppForeground: () => foreground,
      useDeferredActiveFlag: (active: boolean) => active && ready,
      accountLogin: 42, accountLoginString: '42', positionHistoryRange: {},
    };
    for (const hook of hookNames) context[hook] = (first: unknown, second?: unknown) => observed.push((second ?? first) as any);
    runInNewContext(activitySource + '\n' + calls.map(call => `${call};`).join('\n'), context);
    assert.equal(observed.length, 4);
    for (const options of observed) {
      assert.equal(options.subscribed, focused && foreground);
      assert.equal(options.enabled, focused && foreground && ready);
    }
  }
});

test('unsubscribed history observer does no work for 100 shared-cache changes and adopts the latest rows on focus', () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const queryKey = ['history', 'broker-a/account-1'];
  client.setQueryData(queryKey, [1]);
  let computations = 0;
  const options = {
    queryKey,
    enabled: false,
    select: (rows: number[]) => { computations++; return rows.reduce((sum, value) => sum + value, 0); },
  };
  const observer = new QueryObserver(client, options);
  let notifications = 0;
  const unsubscribe = observer.subscribe(() => { notifications++; });
  client.setQueryData(queryKey, [2]);
  assert.ok(notifications > 0, 'enabled=false alone still notifies the retained screen');
  unsubscribe();
  const before = computations;
  const beforeNotifications = notifications;
  for (let i = 0; i < 100; i++) client.setQueryData(queryKey, [i]);
  assert.equal(computations, before);
  assert.equal(notifications, beforeNotifications);
  const latest = observer.getOptimisticResult(client.defaultQueryOptions(options));
  assert.equal(latest.data, 99, 'first focused render reads the current cache, not the old detached snapshot');
  assert.equal(computations, before + 1);
  observer.destroy();
  client.clear();
});

test('account and order query hooks forward explicit subscription control without changing other consumers', () => {
  for (const [file, hooks] of [
    ['account', ['useAccountSummary']], ['orders', ['useOrdersByLoginQuery', 'useAccountOrdersQuery']],
  ] as const) {
    const source = readFileSync(resolve(process.cwd(), `src/query/${file}.ts`), 'utf8');
    const exports: Record<string, (...args: any[]) => any> = {};
    const stubs = new Proxy({}, { get: () => () => {} });
    runInNewContext(ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText, {
      exports,
      require: (name: string) => name === '@tanstack/react-query'
        ? { useQuery: (options: unknown) => options, useQueryClient: () => ({}) }
        : name === './authenticatedQueryScope'
          ? { useActiveBrokerQuerySession: () => ({}), getSessionQueryCacheNamespace: () => 'scope' }
          : stubs,
    });
    for (const hook of hooks) for (const subscribed of [true, false, undefined]) {
      const options = hook === 'useAccountOrdersQuery'
        ? exports[hook]({ enabled: false, subscribed })
        : exports[hook](42, { enabled: false, subscribed });
      assert.equal(options.subscribed, subscribed);
      assert.equal(options.enabled, false);
      assert.equal(options.refetchInterval, false);
    }
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { parsePositiveDecimalInput } from '../utils/decimalInput';
import { createSavedAccountCredentialQueue } from '../state/savedAccountCredentialQueue';
import { clearSavedLoginPassword } from '../state/savedLoginCredentials';

const accountsPath = 'src/features/settings/AccountsScreen.tsx';
const alertsPath = 'src/features/chart/PriceAlertsScreen/PriceAlertsScreen.tsx';
function source(path: string) {
  return ts.createSourceFile(path, readFileSync(resolve(process.cwd(), path), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function evaluate(code: string, scope: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(`exports.handler = ${code};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  runInNewContext(compiled, { exports, ...scope });
  return exports.handler;
}
function handler(path: string, name: string, scope: Record<string, unknown>) {
  const file = source(path);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      expression = node as unknown as ts.Expression;
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) {
      expression = node.initializer;
      if (expression && ts.isCallExpression(expression)) expression = expression.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(expression, `missing ${name}`);
  return evaluate(expression.getText(file).replace(/^export\s+/, ''), scope);
}

test('alert creation blocks malformed prices and sends the complete decimal value', () => {
  for (const price of ['1.25oops', 'Infinity', '0', '1,25']) {
    const requests: any[] = []; let error = '';
    const submit = handler(alertsPath, 'handleCreate', {
      createAlertInFlightRef: { current: false }, isCreating: false,
      symbol: 'EURUSD', price, condition: 'above', message: '', parsePositiveDecimalInput,
      setFormError: (value: string) => { error = value; },
      createAlert: (payload: any) => { requests.push(payload); },
    });
    submit();
    if (price === '1,25') { assert.equal(requests[0].price, 1.25); assert.equal(error, ''); }
    else { assert.equal(requests.length, 0); assert.ok(error.includes('valid price')); }
  }
});

test('failed alert deletion shows feedback, releases pending state, and allows retry', () => {
  const deletingAlertIdsRef = { current: new Set<number>() };
  let error = ''; let displayed = new Set<number>(); let callbacks: any;
  let sends = 0;
  const remove = handler(alertsPath, 'handleDelete', {
    deletingAlertIdsRef,
    setDeleteError: (value: string) => { error = value; },
    setDeletingAlertIds: (value: Set<number>) => { displayed = value; },
    deleteAlert: (_id: number, value: any) => { callbacks = value; sends += 1; },
  });
  remove(17); remove(17); assert.equal(sends, 1); assert.ok(displayed.has(17));
  callbacks.onError(); callbacks.onSettled();
  assert.ok(error.includes('Failed to delete')); assert.equal(displayed.size, 0);
  remove(17); assert.equal(sends, 2); assert.equal(error, '');
});

test('Accounts Back dismisses each popup before allowing screen navigation', () => {
  for (const kind of ['password', 'notifications', 'delete', 'actions', 'none']) {
    const calls: string[] = [];
    const dismiss = handler(accountsPath, 'dismissAccountsPopup', {
      passwordSheetVisible: kind === 'password', tradeNotificationsSheetVisible: kind === 'notifications',
      deleteTarget: kind === 'delete' ? {} : null,
      setPasswordSheetVisible: () => calls.push('password'),
      setTradeNotificationsSheetVisible: () => calls.push('notifications'),
      setDeleteTarget: () => calls.push('delete'),
      useUIState: { getState: () => ({
        scopedActionSheets: { settingsAccounts: kind === 'actions' ? {} : null },
        hideAccountsActionSheet: () => calls.push('actions'),
      }) },
    });
    assert.equal(dismiss(), kind !== 'none');
    assert.deepEqual(calls, kind === 'none' ? [] : [kind]);
  }
});

test('clear password waits for both secure stores and reports failure without false success', async () => {
  for (const fail of [false, true]) {
    const calls: string[] = [];
    const lock = { current: false };
    const clear = handler(accountsPath, 'handleClearSavedPassword', {
      clearPasswordInFlightRef: lock, brokerId: 'A', displayLogin: '123', accountsMountedRef: { current: true },
      removeSavedAccountPassword: async () => { calls.push('password'); },
      clearSavedLoginPassword: async () => { calls.push('autofill'); if (fail) throw new Error('write failed'); },
      getSecureItemAsync: () => {}, setSecureItemAsync: () => {},
      setSuccessMessage: () => calls.push('success'), t: (value: string) => value,
      Alert: { alert: () => calls.push('error') }, console: { error: () => {} }, redactAuthPayload: () => 'redacted',
    });
    const first = clear(); await clear(); await first;
    assert.deepEqual(calls, ['password', 'autofill', fail ? 'error' : 'success']);
    assert.equal(lock.current, false);
  }
});

test('symbol bell navigates to real alerts with the selected symbol', () => {
  let request: any;
  handler('src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx', 'handleOpenPriceAlerts', {
    symbol: 'EURUSD', router: { push: (value: any) => { request = value; } },
  })();
  assert.equal(request.pathname, '/chart/alerts'); assert.equal(request.params.symbol, 'EURUSD');
});

test('forget password treats an unreadable autofill keychain as failure', async () => {
  const calls: string[] = [];
  const clear = handler(accountsPath, 'handleClearSavedPassword', {
    clearPasswordInFlightRef: { current: false }, brokerId: 'A', displayLogin: '123', accountsMountedRef: { current: true },
    removeSavedAccountPassword: async () => {}, clearSavedLoginPassword,
    getSecureItemAsync: async (_key: string, strict: boolean) => {
      assert.equal(strict, true); throw new Error('keychain locked');
    },
    setSecureItemAsync: async () => {}, setSuccessMessage: () => calls.push('success'),
    t: (value: string) => value, Alert: { alert: () => calls.push('error') },
    console: { error: () => {} }, redactAuthPayload: () => 'redacted',
  });
  await clear(); assert.deepEqual(calls, ['error']);
});

test('secure reader propagates errors when clearing passwords while retaining existing read behavior', async () => {
  const file = source('src/utils/secureStorage.ts');
  const storageRead = handler('src/utils/secureStorage.ts', 'getSecureItemAsync', {
    assertNativeSecureStorage: () => {}, Platform: { OS: 'ios' },
    SecureStore: { getItemAsync: async () => { throw new Error('keychain locked'); } },
    console: { error: () => {} },
  });
  assert.ok(file.statements.length > 0);
  assert.equal(await storageRead('key'), null);
  await assert.rejects(storageRead('key', true), /keychain locked/);
});

test('secure password removal updates only its account metadata after successful deletion', async () => {
  for (const fail of [false, true]) {
    let state = { accounts: [
      { brokerId: 'A', login: '123', hasCredentials: true },
      { brokerId: 'B', login: '123', hasCredentials: true },
    ] };
    let finish!: () => void;
    const removed = new Promise<void>((resolve) => { finish = resolve; });
    const remove = handler('src/state/savedAccounts.ts', 'removeSavedAccountPassword', {
      enqueueCredentialOperation: createSavedAccountCredentialQueue(),
      makeSavedAccountCredentialKey: (broker: string, login: string) => `${broker}.${login}`,
      buildAccountEnvironmentKey: (broker: string, login: string) => `${broker}.${login}`,
      removeSecureItemAsync: async () => { await removed; if (fail) throw new Error('keychain failed'); },
      useSavedAccounts: { setState: (updater: any) => { state = updater(state); } },
    });
    const pending = remove('A', '123');
    assert.equal(state.accounts[0].hasCredentials, true);
    finish();
    if (fail) await assert.rejects(pending, /keychain failed/); else await pending;
    assert.equal(state.accounts[0].hasCredentials, fail);
    assert.equal(state.accounts[1].hasCredentials, true);
  }
});

test('alert list distinguishes failed requests from empty results and offers retry', () => {
  const file = source(alertsPath);
  let renderExpression: ts.Expression | undefined;
  file.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'PriceAlertsScreen') {
      for (const statement of node.body!.statements) {
        if (ts.isReturnStatement(statement)) renderExpression = statement.expression;
      }
    }
  });
  assert.ok(renderExpression);
  const flatten = (node: any): any[] => typeof node === 'object' && node !== null
    ? [node, ...(node.children ?? []).flat(Infinity).flatMap(flatten)] : [node];
  for (const isError of [false, true]) {
    let retries = 0;
    const React = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }), Fragment: 'Fragment' };
    const scope: Record<string, any> = {
      React, styles: {}, T: { trading: { buy: { primary: '' }, sell: { primary: '' } } },
      screenBg: '', insets: { top: 0, bottom: 0 }, isDark: false,
      t: (value: string) => value, alerts: [], sorted: [], isLoading: false, isError, isRefetching: false,
      formError: '', deleteError: '', isCreating: false, symbol: '', price: '', condition: 'above', message: '',
      handleCreate: () => {}, placeholderColor: '', sectionIconColor: '', refetch: () => { retries += 1; },
      setPrice: () => {}, setMessage: () => {},
      Platform: { OS: 'ios' }, Ionicons: 'Icon', ActivityIndicator: 'Loading',
    };
    for (const component of ['View', 'Text', 'TextInput', 'ScrollView', 'RefreshControl', 'Pressable', 'KeyboardAvoidingView']) scope[component] = component;
    const nodes = flatten(evaluate(`() => (${renderExpression.getText(file)})`, scope)());
    assert.equal(nodes.includes('No alerts set'), !isError);
    assert.equal(nodes.includes('Unable to load alerts. Please try again.'), isError);
    if (isError) {
      const retry = nodes.find((node) => node?.type === 'Pressable' && flatten(node).includes('Retry'));
      assert.ok(retry); retry.props.onPress(); assert.equal(retries, 1);
    }
  }
});

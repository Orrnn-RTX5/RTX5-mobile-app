import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  PENDING_ORDER_PLACEMENT_AVAILABLE,
  PENDING_ORDER_PREVIEW_MESSAGE,
} from '../../config/pendingOrderAvailability';
import { CHART_ORDER_TYPES, isPendingChartOrderType } from '../../features/chart/chartTradeOrderUtils';

const source = readFileSync(
  resolve(process.cwd(), 'src/api/orders/placePendingOrder.ts'),
  'utf8',
);

test('disabled pending placement rejects all six types before any session or network effect', async () => {
  const tree = ts.createSourceFile('placePendingOrder.ts', source, ts.ScriptTarget.ESNext, true);
  let initializer = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === 'placePendingOrder' && node.initializer) {
      initializer = node.initializer.getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(initializer, 'execute the actual shared pending-create function');
  const compiled = ts.transpileModule(`exports.placePendingOrder = ${initializer};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  for (const orderType of CHART_ORDER_TYPES.filter(isPendingChartOrderType)) {
    const effects: string[] = [];
    const unexpectedEffect = (name: string) => () => {
      effects.push(name);
      throw new Error(`Unexpected ${name} for a preview-only order`);
    };
    const exports: { placePendingOrder?: (payload: unknown) => Promise<unknown> } = {};
    runInNewContext(compiled, {
      exports,
      PENDING_ORDER_PLACEMENT_AVAILABLE: false,
      PENDING_ORDER_PREVIEW_MESSAGE,
      createTradingApiError: (status: number, data: { message: string }) =>
        Object.assign(new Error(data.message), { response: { status, data } }),
      captureActiveBrokerSessionOwnerStamp: unexpectedEffect('session capture'),
      assertActivePendingCreateProtectionAllowed: unexpectedEffect('protection check'),
      apiClient: unexpectedEffect('network request'),
      resolveBrokerSymbol: unexpectedEffect('symbol lookup'),
      listPendingOrdersForCapturedOwner: unexpectedEffect('order reconciliation'),
    });
    await assert.rejects(exports.placePendingOrder!({
      account_login: 'preview-account',
      symbol: 'EURUSD',
      side: orderType.startsWith('Buy') ? 'buy' : 'sell',
      volume: 0.01,
      price: 1.12289,
      stopLimitPrice: 1.12359,
      type: orderType.toLowerCase().replace(/\s+/g, '_'),
    }), (error: any) => {
      assert.equal(error.response?.status, 503, orderType);
      assert.equal(error.response?.data?.error, 'PENDING_ORDER_PLACEMENT_UNAVAILABLE', orderType);
      assert.equal(error.message, PENDING_ORDER_PREVIEW_MESSAGE, orderType);
      return true;
    });
    assert.deepEqual(effects, [], `${orderType} must remain a local draft`);
  }
});

test('pending create treats null protection as unset before capability gating', () => {
  const createGuardSource = source.slice(
    source.indexOf('const assertActivePendingCreateProtectionAllowed'),
    source.indexOf('const utf8ByteLength'),
  );
  assert.match(
    createGuardSource,
    /\['sl', 'tp', 'price_sl', 'price_tp'\]/,
  );
  assert.match(
    createGuardSource,
    /if \(createIntent\[key\] === null\) delete createIntent\[key\]/,
  );
  assert.match(
    createGuardSource,
    /assertActivePendingProtectionAllowed\(createIntent\)/,
  );
});

test('pending create keys are bound to exact serialized candidate payloads', () => {
  const sendSource = source.slice(
    source.indexOf('const sendOrder = async'),
    source.indexOf('const isSymbolMiss'),
  );
  assert.match(sendSource, /const fields = \{ \.\.\.orderFields, symbol: canonicalSymbol \}/);
  assert.match(sendSource, /clientOrderIdsBySerializedBody\.get\(serializedFields\)/);
  assert.match(sendSource, /clientOrderIdsBySerializedBody\.set\(serializedFields, clientOrderId\)/);
  assert.match(sendSource, /const body = \{ client_order_id: clientOrderId, \.\.\.fields \}/);
  assert.match(sendSource, /const serializedBody = JSON\.stringify\(body\)/);
  assert.match(sendSource, /headers: \{ 'Idempotency-Key': clientOrderId \}/);
  assert.match(sendSource, /body: serializedBody/);
  assert.doesNotMatch(source, /createTradeIdempotencyKey/);
});

test('pending candidates stay canonical before payload binding', () => {
  assert.match(source, /String\(value \?\? ''\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(source, /utf8ByteLength\(symbol\) > 20/);
  const sendSource = source.slice(
    source.indexOf('const sendOrder = async'),
    source.indexOf('const isSymbolMiss'),
  );
  assert.ok(
    sendSource.indexOf('normalizePendingOrderSymbolCandidate(symbolToSend)')
      < sendSource.indexOf('const serializedBody = JSON.stringify(body)'),
  );
});

test('every dispatched pending-create outcome starts captured-owner list reconciliation', () => {
  const outcomeSource = source.slice(
    source.indexOf('let createRequestStarted = false'),
    source.indexOf('export function resetAcceptedPendingOrderSymbolCache'),
  );
  assert.match(
    outcomeSource,
    /createRequestStarted = true;[\s\S]*await apiClient\('\/orders\/pending'/,
  );
  assert.match(outcomeSource, /try \{[\s\S]*\} finally \{/);
  assert.match(
    outcomeSource,
    /createRequestStarted && isActiveBrokerSessionOwnerStampCurrent\(owner\)/,
  );
  assert.match(
    outcomeSource,
    /listPendingOrdersForCapturedOwner\(owner\)\.catch/,
  );
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createTradingApiError, getTradingErrorCode, TradingApiError } from '../tradingErrors';
import { createMarketOrderClientOrderId, isValidClientOrderId } from '../tradeIdempotency';
import { assertTradeSide } from '../../domain/tradeSide';
import { confirmedPositionFill } from './confirmedPositionFill';
import { buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey } from './placeMarketOrderCandidates';
import { createMarketOrderIntentId, createOrderRequestRegistry, marketOrderRequestKey } from './marketOrderInFlight';
import type { PlaceOrderPayload, PlaceOrderResponse } from './types';

// Execute the complete production module, including its public entry point,
// validation, body builder, idempotency, result handling and request registry.
// Only external session/transport/storage effects are replaced at the boundary.
const source = ts.createSourceFile('placeMarketOrder.ts', readFileSync('src/api/orders/placeMarketOrder.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const compiledModule = ts.transpileModule(source.statements
  .filter(statement => !ts.isImportDeclaration(statement))
  .map(statement => statement.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const createHarness = () => {
  const owner = {
    brokerId: 'test-broker', accountLogin: '123', cacheNamespace: 'test-epoch',
    apiBase: 'https://broker.example.invalid/api/v2', sessionEpoch: 1,
  };
  const sends: {
    body: Record<string, unknown>;
    settle: (status: number, body: unknown) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const positions: unknown[] = [];
  const outcomes: unknown[] = [];
  const moduleExports = {} as { placeMarketOrder: (payload: PlaceOrderPayload) => Promise<PlaceOrderResponse> };
  const noop = () => {};
  const unexpected = () => { throw new Error('Unexpected network lookup/reconciliation before order response'); };
  runInNewContext(compiledModule, {
    exports: moduleExports,
    captureActiveBrokerSessionOwnerStamp: () => owner,
    isActiveBrokerSessionOwnerStampCurrent: (stamp: unknown) => stamp === owner,
    StaleBrokerSessionError: class StaleBrokerSessionError extends Error {},
    assertActiveMarketProtectionAllowed: noop,
    assertTradeSide, createTradingApiError, getTradingErrorCode, TradingApiError,
    createMarketOrderClientOrderId, isValidClientOrderId,
    marketOrderRequests: createOrderRequestRegistry<PlaceOrderResponse>(), marketOrderRequestKey,
    buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey,
    resolveBrokerSymbolFromCache: () => null,
    resolveBrokerSymbol: unexpected,
    apiClient: (endpoint: string, options: { method: string; headers: Record<string, string>; body: string }) => {
      assert.equal(endpoint, '/orders');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(options.headers['Idempotency-Key'], body.client_order_id);
      assert.equal(Object.hasOwn(body, 'frontendIntentId'), false);
      return new Promise((resolve, reject) => {
        sends.push({
          body, reject,
          settle: (status, responseBody) => resolve({
            status, headers: new Headers(), json: async () => responseBody,
          }),
        });
      });
    },
    isOrderAcceptedResponse: () => false,
    pollOrderCommand: unexpected,
    createOrderCommandRejectedError: unexpected,
    createOrderConfirmationPendingError: unexpected,
    recordMarketOrderGatewayLatency: noop,
    recordMarketOrderJournalFailure: noop,
    recordMarketOrderJournalRequest: noop,
    recordMarketOrderJournalSuccess: noop,
    watchMarketOrderExecution: noop,
    getApiLatencyNow: () => 1,
    takeTradeIntentStartedAt: () => 0,
    recordApiLatency: noop,
    recordOrderLatencySample: noop,
    buildJournalSessionScopeKey: () => owner.cacheNamespace,
    redactDiagnosticValue: (value: unknown) => value,
    beginProtectedPositionsMutation: () => noop,
    beginCoalescedMarketOrderReconciliation: () => ({ markTransportStarted: noop, finish: (outcome: unknown) => outcomes.push(outcome) }),
    resetMarketOrderReconciliationCoordinatorForTests: noop,
    reconcileMarketOrderPositions: unexpected,
    positionsApi: { getPositionsForReconciliation: unexpected },
    confirmedPositionFill,
    usePositionsState: { getState: () => ({ upsertPosition: (position: unknown) => positions.push(position) }) },
  });
  return { place: moduleExports.placeMarketOrder, sends, positions, outcomes };
};

const click = (side: 'buy' | 'sell'): PlaceOrderPayload => ({
  frontendIntentId: createMarketOrderIntentId(), account_login: 123,
  symbol: 'BTCUSD', side, volume: 0.01,
});

const fill = (index: number, side: 'buy' | 'sell'): PlaceOrderResponse => ({
  order_ticket: 1000 + index, position_ticket: 2000 + index,
  symbol: 'BTCUSD', side, volume: 0.01, price: 81621.85 + index,
  status: 'filled', action: 'opened', time: 1700000000 + index,
});

for (const side of ['buy', 'sell'] as const) {
  test(`complete API flow sends ten independent ${side} POST bodies immediately and returns each correct reverse-order fill`, async () => {
    const { place, sends, positions, outcomes } = createHarness();
    const clicks = Array.from({ length: 10 }, () => click(side));
    const requests = clicks.map(payload => place(payload));
    assert.equal(sends.length, 10, 'all ten POSTs start before any response resolves');
    assert.equal(new Set(sends.map(send => send.body.client_order_id)).size, 10);
    sends.forEach((send, index) => {
      assert.equal(send.body.client_order_id, clicks[index].frontendIntentId);
      assert.equal(send.body.side, side);
      assert.equal(send.body.volume, '0.01');
      assert.equal(place({ ...clicks[index] }), requests[index], 'duplicate delivery keeps one request per click');
    });
    assert.equal(sends.length, 10);
    const responses = clicks.map((_, index) => fill(index, side));
    for (let index = 9; index >= 0; index--) sends[index].settle(200, responses[index]);
    const results = await Promise.all(requests);
    results.forEach((result, index) => assert.equal(result, responses[index]));
    assert.equal(positions.length, 10, 'each authoritative position reaches frontend state');
    assert.equal(outcomes.length, 10, 'each transport independently enters reconciliation');
  });
}

test('a rejected click and a failed transport do not cancel or merge the other eight order results', async () => {
  const { place, sends, positions, outcomes } = createHarness();
  const clicks = Array.from({ length: 10 }, (_, index) => click(index % 2 ? 'sell' : 'buy'));
  const requests = clicks.map(payload => place(payload));
  const settled = Promise.allSettled(requests);
  assert.equal(sends.length, 10);
  const responses = clicks.map((payload, index) => fill(index, payload.side));
  for (let index = 9; index >= 0; index--) {
    if (index === 2) sends[index].settle(400, { error: 'INSUFFICIENT_MARGIN', message: 'Insufficient margin for this order.' });
    else if (index === 7) sends[index].reject(new Error('Connection lost for order 7'));
    else sends[index].settle(200, responses[index]);
  }
  const results = await settled;
  results.forEach((result, index) => {
    if (index === 2 || index === 7) assert.equal(result.status, 'rejected');
    else {
      assert.equal(result.status, 'fulfilled');
      if (result.status === 'fulfilled') assert.equal(result.value, responses[index]);
    }
  });
  assert.equal(positions.length, 8);
  assert.equal(outcomes.length, 10);
  assert.equal(sends.length, 10, 'failure does not silently retry a potentially executed order');
});

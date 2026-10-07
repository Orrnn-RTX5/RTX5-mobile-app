import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import { buildMarketOrderSymbolCandidates } from './placeMarketOrderCandidates.ts';

const marketOrderSource = readFileSync(resolve(process.cwd(), 'src/api/orders/placeMarketOrder.ts'), 'utf8');

test('market order symbol candidates reject accepted and catalog aliases with different suffixes', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'XAUUSDm',
      acceptedSymbol: 'XAUUSD.pro',
      cachedCatalogSymbol: 'XAUUSD.c',
    }),
    ['XAUUSDm'],
  );
});

test('market order symbol candidates dedupe exact and normalized matches', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'EURUSD',
      cachedCatalogSymbol: 'EURUSD',
    }),
    ['EURUSD'],
  );
});

test('market order symbol candidates keep broker-authoritative spelling for the same exact key', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'eurusd.pro',
      acceptedSymbol: 'EURUSD.PRO',
      cachedCatalogSymbol: 'EURUSD.pro',
    }),
    ['EURUSD.PRO', 'eurusd.pro', 'EURUSD.pro'],
  );
});

test('market order symbol candidates do not brute-force hardcoded suffixes', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'GBPUSD',
    }),
    ['GBPUSD'],
  );
});

test('market order request explicitly identifies market execution', () => {
  const orderBodySource = marketOrderSource.slice(
    marketOrderSource.indexOf('const orderBody:'),
    marketOrderSource.indexOf("logOrderDiagnostic('[RTX5 Order] active broker session:'"),
  );

  assert.match(orderBodySource, /type: 'market'/);
  assert.match(orderBodySource, /volume: toCanonicalDecimalString\(restWithoutBroker\.volume/);
});

test('market order wire body uses one canonical field family and never sends magic', () => {
  const orderBodySource = marketOrderSource.slice(
    marketOrderSource.indexOf('const orderBody:'),
    marketOrderSource.indexOf("logOrderDiagnostic('[RTX5 Order] active broker session:'"),
  );

  assert.match(orderBodySource, /account_login: loginInt/);
  assert.doesNotMatch(orderBodySource, /\blogin: loginInt/);
  assert.match(orderBodySource, /orderBody\[canonicalKey\] = toCanonicalDecimalString/);
  assert.match(orderBodySource, /\['sl', 'price_sl', 'Stop Loss'\]/);
  assert.match(orderBodySource, /\['tp', 'price_tp', 'Take Profit'\]/);
  assert.doesNotMatch(orderBodySource, /orderBody\.price_sl|orderBody\.price_tp/);
  assert.doesNotMatch(orderBodySource, /\bbroker_id\s*:/);
  assert.doesNotMatch(orderBodySource, /orderBody\.magic|magic\s*:/);
});

test('market protection is capability-checked before request construction and transport', () => {
  const guardIndex = marketOrderSource.indexOf('assertActiveMarketProtectionAllowed(');
  const bodyIndex = marketOrderSource.indexOf('const orderBody:');
  const transportIndex = marketOrderSource.indexOf("apiClient('/orders'");
  assert.ok(guardIndex >= 0);
  assert.ok(guardIndex < bodyIndex);
  assert.ok(guardIndex < transportIndex);
});

test('market client_order_id is sent in the body and bound to the exact wire payload', () => {
  // Contract v3 6.0: idempotency is the BODY field client_order_id; one id
  // per distinct body, reused for identical resends of the same action.
  assert.match(marketOrderSource, /idsBySerializedBody = new Map<string, string>\(\)/);
  assert.match(marketOrderSource, /idsBySerializedBody\.get\(serializedBody\)/);
  assert.match(marketOrderSource, /idsBySerializedBody\.set\(serializedBody, created\)/);
  assert.match(marketOrderSource, /const created = createMarketOrderClientOrderId\(\)/);
  assert.match(marketOrderSource, /const serializedBody = JSON\.stringify\(body\)/);
  assert.match(marketOrderSource, /const clientOrderId = resolveClientOrderId\(serializedBody\)/);
  assert.match(
    marketOrderSource,
    /const wireBody = JSON\.stringify\(\{ client_order_id: clientOrderId, \.\.\.body \}\)/,
  );
  assert.match(marketOrderSource, /headers: \{ 'Idempotency-Key': clientOrderId \}/);
  assert.match(marketOrderSource, /body: wireBody/);
  assert.match(marketOrderSource, /IDEMPOTENCY_CONFLICT/);
  assert.doesNotMatch(marketOrderSource, /createTradeIdempotencyKey\('order'\)/);
  assert.doesNotMatch(marketOrderSource, /response\.ok/);
});

test('market order uses a >= 30 s HTTP budget', () => {
  const match = marketOrderSource.match(/MARKET_ORDER_HTTP_TIMEOUT_MS = ([\d_]+)/);
  assert.ok(match);
  assert.ok(Number(match[1].replace(/_/g, '')) >= 30_000);
  assert.match(
    marketOrderSource,
    /apiClient\('\/orders', \{[\s\S]*timeoutMs: MARKET_ORDER_HTTP_TIMEOUT_MS,/,
  );
});

test('a 200 is always a fill and never a rejection; 202 is confirmed by polling', () => {
  assert.match(marketOrderSource, /const ok = response\.status === 200;/);
  assert.doesNotMatch(marketOrderSource, /graceful/);
  assert.doesNotMatch(marketOrderSource, /\['rejected', 'failed', 'error'\]\.includes/);
  assert.match(marketOrderSource, /isOrderAcceptedResponse\(response\.status, raw\)/);
  const confirmSource = marketOrderSource.slice(
    marketOrderSource.indexOf('if (accepted.acceptedAsync) {'),
    marketOrderSource.indexOf("logOrderDiagnostic('[TRADE-RESPONSE]'"),
  );
  assert.match(confirmSource, /pollOrderCommand\(\{[\s\S]*clientOrderId: accepted\.clientOrderId,[\s\S]*accountLogin: loginInt/);
  assert.match(confirmSource, /outcome\.kind === 'rejected'[\s\S]*createOrderCommandRejectedError\(outcome\)/);
  assert.match(confirmSource, /outcome\.kind === 'pending'[\s\S]*createOrderConfirmationPendingError\(accepted\.clientOrderId\)/);
  assert.match(confirmSource, /finalData = unwrap\(outcome\.data\)/);
});

test('legacy zero protection is omitted while canonical zero remains invalid', () => {
  const orderBodySource = marketOrderSource.slice(
    marketOrderSource.indexOf('const orderBody:'),
    marketOrderSource.indexOf("logOrderDiagnostic('[RTX5 Order] active broker session:'"),
  );
  assert.match(orderBodySource, /if \(!usesCanonical && Number\(value\) === 0\) continue/);
  assert.match(
    orderBodySource,
    /orderBody\[canonicalKey\] = toCanonicalDecimalString\([\s\S]*value as number \| string/,
  );
  assert.match(orderBodySource, /hasOwn\(restWithoutBroker, canonicalKey\)/);
  assert.match(orderBodySource, /hasOwn\(restWithoutBroker, legacyKey\)/);
});

test('market fill mode is never sent and comment bytes are validated before transport', () => {
  const orderBodySource = marketOrderSource.slice(
    marketOrderSource.indexOf('const orderBody:'),
    marketOrderSource.indexOf("logOrderDiagnostic('[RTX5 Order] active broker session:'"),
  );
  // Contract v3 6.1: fill_mode is ignored by the server.
  assert.doesNotMatch(orderBodySource, /orderBody\.fill_mode/);
  assert.match(orderBodySource, /utf8ByteLength\(restWithoutBroker\.comment\) > 1024/);
});

test('every market wire candidate is exact-cased, 20-byte bounded, and independently keyed', () => {
  assert.match(marketOrderSource, /String\(value \?\? ''\)\.trim\(\)/);
  assert.match(marketOrderSource, /utf8ByteLength\(symbol\) > 20/);
  const sendSource = marketOrderSource.slice(
    marketOrderSource.indexOf('const sendOrder = async'),
    marketOrderSource.indexOf('const isMarketDataMiss'),
  );
  const canonicalIndex = sendSource.indexOf('normalizeMarketOrderSymbol(symbolToSend)');
  const bodyIndex = sendSource.indexOf('const body = { ...orderBody, symbol: canonicalSymbol }');
  const serializedIndex = sendSource.indexOf('const serializedBody = JSON.stringify(body)');
  const keyIndex = sendSource.indexOf('resolveClientOrderId(serializedBody)');
  assert.ok(canonicalIndex >= 0);
  assert.ok(canonicalIndex < bodyIndex);
  assert.ok(bodyIndex < serializedIndex);
  assert.ok(serializedIndex < keyIndex);
});

test('every dispatched market outcome joins captured-owner coalesced reconciliation', () => {
  const outcomeSource = marketOrderSource.slice(
    marketOrderSource.indexOf('let createRequestStarted = false'),
    marketOrderSource.indexOf('export function resetAcceptedMarketOrderSymbolCache'),
  );
  assert.match(
    outcomeSource,
    /reconciliationHandle\?\.markTransportStarted\(\);[\s\S]*createRequestStarted = true;[\s\S]*await apiClient\('\/orders'/,
  );
  assert.match(outcomeSource, /try \{[\s\S]*\} finally \{/);
  const coordinatorIndex = outcomeSource.indexOf('beginCoalescedMarketOrderReconciliation({');
  const firstDispatchIndex = outcomeSource.indexOf('const attempt = await sendOrder(candidate)');
  assert.ok(coordinatorIndex >= 0 && coordinatorIndex < firstDispatchIndex);
  assert.match(outcomeSource, /releaseBarrier: beginProtectedPositionsMutation\(\)/);
  assert.match(outcomeSource, /ownerKey: owner\.cacheNamespace/);
  assert.doesNotMatch(outcomeSource, /ownerKey:[\s\S]{0,120}credentialGeneration|ownerKey:[\s\S]{0,120}credentialIdentity/);
  assert.match(
    outcomeSource,
    /reconcile: async \(reconciliationEvidence, isBatchCurrent\) => \{[\s\S]*reconcileMarketOrderPositions\(reconciliationEvidence/,
  );
  assert.match(
    outcomeSource,
    /positionsApi\.getPositionsForReconciliation\(reconciliationAccountLogin\)/,
  );
  assert.match(
    outcomeSource,
    /!isBatchCurrent\(\)[\s\S]*!isReconciliationSessionCurrent\(\)[\s\S]*applyPositionsSnapshot\([\s\S]*reconciliationAccountLogin/,
  );
  assert.match(outcomeSource, /finally \{[\s\S]*reconciliationHandle\?\.finish\(reconciliationResponse\);/);
  assert.doesNotMatch(outcomeSource, /marketOrderReconciliationGeneration|preserveMissingExisting/);
  assert.doesNotMatch(
    outcomeSource,
    /getPositionsForReconciliation\(reconciliationAccountLogin\)[\s\S]{0,250}\.then\([\s\S]{0,250}applyPositionsSnapshot/,
  );
  assert.doesNotMatch(outcomeSource, /resolveTradingLoginString/);
});

test('legacy ticket normalization never promotes a ticket into order_ticket', () => {
  const normalizationSource = marketOrderSource.slice(
    marketOrderSource.indexOf("if (finalData && typeof finalData === 'object')"),
    marketOrderSource.indexOf("logOrderDiagnostic('[TRADE-RESPONSE]'"),
  );

  assert.match(normalizationSource, /finalData\.position_ticket = finalData\.ticket/);
  assert.doesNotMatch(normalizationSource, /finalData\.order_ticket = finalData\.ticket/);
});

test('market response safely adopts only a causal same-session credential refresh', () => {
  assert.match(
    marketOrderSource,
    /const adoptCurrentCredentialOwner = \(\) => \{[\s\S]*currentOwner\.brokerId !== owner\.brokerId[\s\S]*currentOwner\.accountLogin !== owner\.accountLogin[\s\S]*currentOwner\.cacheNamespace !== owner\.cacheNamespace[\s\S]*owner = currentOwner;/,
  );
  assert.match(
    marketOrderSource,
    /raw = await response\.json\(\);[\s\S]*if \(error instanceof StaleBrokerSessionError\) throw error;[\s\S]*adoptCurrentCredentialOwner\(\);[\s\S]*assertOrderSessionCurrent\(\);/,
  );
  assert.doesNotMatch(marketOrderSource, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
});


import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/api/orders/placePendingOrder.ts'),
  'utf8',
);

test('pending create treats null protection as unset before capability gating', () => {
  const createGuardSource = source.slice(
    source.indexOf('const assertActivePendingCreateProtectionAllowed'),
    source.indexOf('const createPayloadBoundIdempotencyKeyResolver'),
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
  assert.match(source, /keysBySerializedBody = new Map<string, string>\(\)/);
  assert.match(source, /keysBySerializedBody\.get\(serializedBody\)/);
  assert.match(source, /keysBySerializedBody\.set\(serializedBody, created\)/);
  const sendSource = source.slice(
    source.indexOf('const sendOrder = async'),
    source.indexOf('const isSymbolMiss'),
  );
  assert.match(sendSource, /const body = \{ \.\.\.orderBody, symbol: canonicalSymbol \}/);
  assert.match(sendSource, /const serializedBody = JSON\.stringify\(body\)/);
  assert.match(sendSource, /const idempotencyKey = resolveIdempotencyKey\(serializedBody\)/);
  assert.match(sendSource, /headers: \{ 'Idempotency-Key': idempotencyKey \}/);
  assert.match(sendSource, /body: serializedBody/);
  assert.doesNotMatch(source, /const idempotencyKey = createTradeIdempotencyKey\('pending'\)/);
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

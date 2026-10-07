import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const assertBefore = (
  source: string,
  earlier: string,
  later: string,
  label: string,
) => {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  assert.ok(earlierIndex >= 0, `${label}: missing ${earlier}`);
  assert.ok(laterIndex >= 0, `${label}: missing ${later}`);
  assert.ok(earlierIndex < laterIndex, `${label}: guard must run before transport`);
};

test('every direct SL/TP mutation helper fails before transport', () => {
  const market = readSource('src/api/orders/placeMarketOrder.ts');
  const pending = readSource('src/api/orders/placePendingOrder.ts');
  const positions = readSource('src/api/positions/index.ts');
  const coordinator = readSource('src/features/trade/modifyPositionCoordinator.ts');

  assertBefore(
    market,
    'assertActiveMarketProtectionAllowed(',
    "apiClient('/orders'",
    'market order',
  );
  assertBefore(
    pending,
    'assertActivePendingProtectionAllowed(',
    "apiClient('/orders/pending'",
    'pending order',
  );
  assertBefore(
    positions.slice(positions.indexOf('modifyPosition: async')),
    'assertActiveExistingPositionSltpAllowed()',
    'apiClient(`/positions/${normalizedTicket.path}`',
    'position PUT',
  );
  assertBefore(
    coordinator.slice(coordinator.indexOf('export const submitModifyPosition')),
    'assertActiveExistingPositionSltpAllowed()',
    'coordinator.submit(',
    'modify coordinator',
  );
});

test('one-click immediate trades check protection before dispatch', () => {
  const source = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
  );
  const occurrences = source.match(/isNewMarketOrderProtectionBackendLocked\(\)/g) ?? [];
  assert.ok(occurrences.length >= 1);
  assert.match(
    source,
    /\(hasStopLossPrice \|\| hasTakeProfitPrice\) &&[\s\S]*isNewMarketOrderProtectionBackendLocked\(\)[\s\S]*getActiveSltpUnavailableMessage\(\)[\s\S]*return;/,
  );
  assertBefore(
    source.slice(source.indexOf('// ── One-click ON:')),
    'isNewMarketOrderProtectionBackendLocked()',
    'dispatchChartTradeImmediately({',
    'chart one-click order',
  );
});

test('capability failures use a stable error code and broker-specific message', () => {
  const source = readSource('src/api/sltpCapabilityGuard.ts');
  assert.match(source, /error: 'SLTP_UNAVAILABLE'/);
  assert.match(source, /message: getSltpUnavailableMessage\(brokerId\)/);
  assert.match(source, /isExistingPositionSltpEnabled\(active\.capabilities\)/);
  assert.match(source, /active\.capabilities\.newMarketOrderProtection/);
  assert.match(source, /active\.capabilities\.pendingOrderProtection/);
  assert.match(source, /active\.capabilities\.trailingStop/);
});

test('pending protection gates explicit null clears as mutations', () => {
  const source = readSource('src/api/sltpCapabilityGuard.ts');
  const pendingIntent = source.slice(
    source.indexOf('export const hasPendingOrderProtectionIntent'),
    source.indexOf('export const hasTrailingStopIntent'),
  );

  assert.match(pendingIntent, /hasOwn\(payload, key\)/);
  assert.match(pendingIntent, /payload\[key\] !== undefined/);
  assert.doesNotMatch(pendingIntent, /payload\[key\] !== null/);
});

test('market protection preserves only the documented legacy zero-as-unset rule', () => {
  const source = readSource('src/api/sltpCapabilityGuard.ts');
  const marketIntent = source.slice(
    source.indexOf('export const hasMarketOrderProtectionIntent'),
    source.indexOf('export const hasPendingOrderProtectionIntent'),
  );

  assert.match(marketIntent, /hasSubmittedStopValue\(payload, \['sl', 'tp'\]\)/);
  assert.match(marketIntent, /\['price_sl', 'price_tp'\]\.some/);
  assert.match(marketIntent, /!Number\.isFinite\(numeric\) \|\| numeric !== 0/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('order symbol discovery and accepted candidates are scoped to one session epoch', () => {
  const resolver = readSource('src/api/orders/symbolResolver.ts');
  const market = readSource('src/api/orders/placeMarketOrder.ts');
  const pending = readSource('src/api/orders/placePendingOrder.ts');
  const coordinator = readSource('src/services/brokerSessionCoordinator.ts');

  assert.match(resolver, /instrumentCaches = new Map<string, InstrumentCacheEntry>/);
  assert.match(resolver, /commitApiJson\(result, cacheNamespace,/);
  assert.match(resolver, /capture\.session\.cacheNamespace !== cacheNamespace/);
  assert.doesNotMatch(resolver, /let instrumentCache: string\[] \| null/);

  for (const source of [market, pending]) {
    assert.match(
      source,
      /const (?:initialOwner|owner) = captureActiveBrokerSessionOwnerStamp\(\)/,
    );
    assert.match(source, /isActiveBrokerSessionOwnerStampCurrent\(owner\)/);
    assert.match(source, /getAcceptedSymbolCacheKey\(cacheNamespace, callerSymbol\)/);
    assert.match(source, /resolveBrokerSymbolFromCache\(callerSymbol, cacheNamespace\)/);
    assert.match(source, /resolveBrokerSymbol\(callerSymbol, cacheNamespace\)/);
  }

  assert.match(coordinator, /resetBrokerSymbolResolverCache\(\)/);
  assert.match(coordinator, /resetAcceptedMarketOrderSymbolCache\(\)/);
  assert.match(coordinator, /resetAcceptedPendingOrderSymbolCache\(\)/);
});

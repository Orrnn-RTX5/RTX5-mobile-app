import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('open-position cache is bound to the immutable active-session namespace', () => {
  const source = readSource('src/state/positionsState.ts');

  assert.match(source, /OPEN_POSITIONS_CACHE_PREFIX = OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX/);
  assert.match(source, /getOpenPositionsCacheKey = \(cacheNamespace: string\)/);
  assert.match(source, /cacheNamespace: scope\.cacheNamespace/);
  assert.match(source, /isActiveBrokerSessionCurrent\(scope\.identity\)/);
  assert.match(source, /const cachedPositions = await readCachedOpenPositions\(cacheScope\);[\s\S]*if \(!isPositionsCacheScopeCurrent\(cacheScope\)\)/);
  assert.doesNotMatch(source, /getOpenPositionsCacheKey\(accountLogin\)/);
  assert.doesNotMatch(source, /JSON\.parse\(rawValue\)[\s\S]{0,160}\? payload\s*:/);
});

test('position reset cancels deferred writes and clears prior-session memory', () => {
  const source = readSource('src/state/positionsState.ts');

  assert.match(source, /export const resetPositionsSessionState = \(\): void => \{/);
  assert.match(source, /clearTimeout\(openPositionsCacheWriteTimer\)/);
  assert.match(source, /pendingOpenPositionsCacheWrites\.clear\(\)/);
  assert.match(source, /latestOpenPositionsCacheSignatureByNamespace\.clear\(\)/);
  assert.match(source, /positionsRateLimitUntilByNamespace\.clear\(\)/);
  assert.match(source, /optimisticCloseUntilByPositionId\.clear\(\)/);
  assert.match(source, /event\.type === 'transition'[\s\S]*resetPositionsSessionState\(\)/);
});

test('open-position cache skips market-only ticks before rebuilding or writing the payload', () => {
  const source = readSource('src/state/positionsState.ts');
  const signatureGate = source.indexOf(
    'latestOpenPositionsCacheSignatureByNamespace.get(scope.cacheNamespace) === signature',
  );
  const payloadNormalization = source.indexOf(
    'positions: normalizeCachedPositions(positions)',
    signatureGate,
  );

  assert.ok(signatureGate >= 0);
  assert.ok(payloadNormalization > signatureGate);
  assert.match(source, /const signature = buildOpenPositionsCacheSignature\(positions\)/);
  assert.match(source, /latestOpenPositionsCacheSignatureByNamespace\.set\(scope\.cacheNamespace, signature\)/);
  assert.match(source, /latestOpenPositionsCacheSignatureByNamespace\.delete\(scope\.cacheNamespace\)/);
});

test('persisted candle cache is session-namespaced and guards async hydration and writes', () => {
  const source = readSource('src/domain/candles/state/persistedCandleCache.ts');

  assert.match(source, /STORAGE_KEY_PREFIX = CANDLE_SESSION_CACHE_STORAGE_PREFIX/);
  assert.match(source, /getPersistedCandleStorageKey = \(cacheNamespace: string\)/);
  assert.match(source, /parsed\.cacheNamespace !== expectedCacheNamespace/);
  assert.match(source, /await readStorage\(scope\);[\s\S]*if \(!isCandleCacheScopeCurrent\(scope\)\)/);
  assert.match(source, /AsyncStorage\.setItem\([\s\S]*getPersistedCandleStorageKey\(scope\.cacheNamespace\)/);
  assert.doesNotMatch(source, /AsyncStorage\.getItem\(STORAGE_KEY\)/);
});

test('persisted candle reset cancels timers and clears in-memory candles', () => {
  const source = readSource('src/domain/candles/state/persistedCandleCache.ts');

  assert.match(source, /export const resetPersistedCandleCacheSession = \(\): void => \{/);
  assert.match(source, /for \(const timer of writeTimers\.values\(\)\)[\s\S]*clearTimeout\(timer\)/);
  assert.match(source, /pendingWrites\.clear\(\)/);
  assert.match(source, /hydrationPromises\.clear\(\)/);
  assert.match(source, /useTradingState\.setState\(\{ candles: \{\} \}\)/);
  assert.match(source, /event\.type === 'transition'[\s\S]*resetPersistedCandleCacheSession\(\)/);
});

test('market and instrument queries use the active epoch namespace and guarded JSON commits', () => {
  const market = readSource('src/query/market.ts');
  const instruments = readSource('src/query/instruments.ts');
  const instrumentApi = readSource('src/api/instruments.ts');

  assert.match(market, /const authenticatedCacheNamespace = getSessionQueryCacheNamespace\(session\)/);
  assert.match(
    market,
    /const cacheNamespace = isPublicDemoMarket[\s\S]*\? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE[\s\S]*: authenticatedCacheNamespace/,
  );
  assert.match(market, /queryKey: \['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'\]/);
  assert.match(market, /if \(isPublicDemoMarket\) \{[\s\S]*getOrrnnDemoPublicMarketCatalog\(\)[\s\S]*return catalog\.symbols/);
  assert.match(market, /fetchInstrumentCatalogResponse\(authenticatedCacheNamespace\)/);
  assert.match(market, /commitApiJson\(result, authenticatedCacheNamespace/);
  assert.match(market, /primeInstrumentMetaCacheFromCatalogPayload\(data, authenticatedCacheNamespace\)/);
  assert.doesNotMatch(market, /placeholderData: \(previousData\) => previousData/);

  assert.match(instruments, /INSTRUMENT_META_QUERY_VERSION = 'instrument-meta-v4'/);
  assert.match(instruments, /queryKey: \['instrument', cacheNamespace, INSTRUMENT_META_QUERY_VERSION, normalizedSymbol\]/);
  assert.match(instruments, /fetchInstrumentMeta\(symbol, cacheNamespace\)/);
  assert.match(instrumentApi, /commitApiJson\(result, cacheNamespace/);
  assert.match(instrumentApi, /primeInstrumentMetaCacheFromCatalogPayload\(catalog, cacheNamespace\)/);
});

test('session teardown preserves only broker-directory and tokenless public-market queries', () => {
  const coordinator = readSource('src/services/brokerSessionCoordinator.ts');

  assert.match(coordinator, /ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE/);
  assert.match(
    coordinator,
    /const isSessionIndependentQuery = \(queryKey: readonly unknown\[\]\) =>[\s\S]*queryKey\[0\] === BROKER_SERVERS_KEY[\s\S]*queryKey\.includes\(ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE\)/,
  );
  assert.match(
    coordinator,
    /appQueryClient\.cancelQueries\(\{[\s\S]*predicate: \(query\) => !isSessionIndependentQuery\(query\.queryKey\)/,
  );
  assert.match(
    coordinator,
    /appQueryClient\.removeQueries\(\{[\s\S]*predicate: \(query\) => !isSessionIndependentQuery\(query\.queryKey\)/,
  );
});

test('candle history parse, query, memory merge, and disk persist share one provenance', () => {
  const api = readSource('src/domain/candles/api/candles.ts');
  const query = readSource('src/domain/candles/query/candles.ts');
  const cache = readSource('src/domain/candles/state/candleCache.ts');
  const persisted = readSource('src/domain/candles/state/persistedCandleCache.ts');

  assert.match(api, /apiJsonClient<unknown>/);
  assert.match(api, /commitApiJson\(result, cacheNamespace/);
  assert.match(api, /provenance: ActiveBrokerSessionProvenance/);
  assert.match(query, /candleKeys\.history\(cacheNamespace/);
  assert.match(query, /commitCandleHistoryResponse\(res/);
  assert.match(query, /provenance: current\.provenance/);
  assert.match(cache, /isActiveBrokerSessionProvenanceCurrent\(provenance\)/);
  assert.match(cache, /persistCanonicalCandleCache\(normalized\.symbol, normalized\.timeframe, nextCandles, provenance\)/);
  assert.match(persisted, /captureCandleCacheScope\(provenance\)/);
  assert.match(persisted, /expectedProvenance\.cacheNamespace !== capture\.session\.cacheNamespace/);
});

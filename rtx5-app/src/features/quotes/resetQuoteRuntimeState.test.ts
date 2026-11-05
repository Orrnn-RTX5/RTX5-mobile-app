import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('quote runtime reset clears session-scoped memory state and pending timers', () => {
  const snapshotsSource = readSource('src/features/quotes/useLiveQuotes.ts');
  const symbolSource = readSource('src/query/websocket.ts');
  const coordinatorSource = readSource('src/features/quotes/resetQuoteRuntimeState.ts');

  assert.match(snapshotsSource, /export const resetLiveQuoteSnapshotRuntimeState/);
  assert.match(snapshotsSource, /snapshotsBySymbol\.clear\(\)/);
  assert.match(snapshotsSource, /quoteSnapshotContinuity\.clear\(\)/);
  assert.match(snapshotsSource, /listenersBySymbol\.clear\(\)/);
  assert.match(snapshotsSource, /pendingNotifySymbols\.clear\(\)/);
  assert.match(snapshotsSource, /clearTimeout\(notifyTimer\)/);
  assert.match(snapshotsSource, /captureActiveBrokerSessionOwnerStamp\(\)/);
  assert.match(snapshotsSource, /owner\.cacheNamespace/);
  assert.match(snapshotsSource, /owner\.credentialGeneration/);
  assert.match(snapshotsSource, /owner\.credentialIdentity/);
  assert.match(snapshotsSource, /const scopeQuoteSnapshotKey = \(symbolKey: string\): string =>/);
  assert.doesNotMatch(
    snapshotsSource,
    /AsyncStorage|cachedVolumeBySymbol|QUOTE_VOLUME_CACHE_STORAGE_KEY|volumeCachePersistTimer|loadVolumeCache/,
  );

  assert.match(symbolSource, /export const resetLiveSymbolQuoteRuntimeState/);
  assert.match(symbolSource, /pendingLiveSymbolTicks\.clear\(\)/);
  assert.match(symbolSource, /restQuoteFallbackEntries\.clear\(\)/);

  assert.match(coordinatorSource, /resetLiveSymbolQuoteRuntimeState\(\)/);
  assert.match(coordinatorSource, /resetLiveQuoteSnapshotRuntimeState\(\)/);
});

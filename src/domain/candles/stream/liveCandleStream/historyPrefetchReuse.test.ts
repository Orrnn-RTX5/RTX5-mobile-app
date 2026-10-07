import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  'src/domain/candles/stream/liveCandleStream/historyFetching.ts',
  'utf8',
);

test('completed Quotes warm-up is reused before another candle REST prefetch', () => {
  const start = source.indexOf('export const runPrefetchHistory');
  const end = source.indexOf('\n};', start);
  const prefetchSource = source.slice(start, end);

  const memoryRead = prefetchSource.indexOf(
    'candleMemoryCache.get(normalizedSymbol, normalizedTimeframe)',
  );
  const networkRead = prefetchSource.indexOf(
    'const prefetch = manager.fetchHistory(',
  );

  assert.ok(memoryRead >= 0, 'prefetch must inspect the exact symbol/timeframe memory seed');
  assert.ok(networkRead > memoryRead, 'memory reuse must happen before a second REST request is created');
  assert.match(
    prefetchSource,
    /if \(memorySeed\.length >= requestedLimit\) \{\s*return Promise\.resolve\(memorySeed\.length\);\s*\}/,
  );
});

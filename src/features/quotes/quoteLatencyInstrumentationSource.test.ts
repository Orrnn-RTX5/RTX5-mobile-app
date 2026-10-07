import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('websocket quote cache commits carry only timing and update sequence into metrics', () => {
  const source = readSource('src/features/quotes/useLiveQuotes.ts');
  assert.match(source, /if \(tick\.transport === 'websocket' && next\?\.updateSeq === nextUpdateSeq\)/);
  assert.match(source, /recordQuoteCacheCommit\(\{[\s\S]*sessionKey: getQuoteCacheNamespace\(\)[\s\S]*updateSeq: nextUpdateSeq[\s\S]*sourceTimestampMs: tick\.feedTickAt[\s\S]*receiptMonotonicTimestampMs: tick\.receiptMonotonicAt/);
  assert.doesNotMatch(source, /recordQuoteCacheCommit\(\{[\s\S]{0,400}(symbol|brokerId|accountLogin):/);
});

test('each mounted QuoteCard reports its own next visible animation frame', () => {
  const source = readSource('src/features/quotes/QuotesScreen.tsx');
  const quoteCardStart = source.indexOf('const QuoteCard = React.memo');
  const quoteCardEnd = source.indexOf('/*', quoteCardStart + 1);
  const quoteCardSource = source.slice(quoteCardStart, quoteCardEnd > quoteCardStart ? quoteCardEnd : undefined);

  assert.match(quoteCardSource, /useEffect\(\(\) => \{[\s\S]*liveItem\?\.updateSeq/);
  assert.match(quoteCardSource, /globalThis\.requestAnimationFrame\(recordVisibleFrame\)/);
  assert.match(quoteCardSource, /recordQuoteRowVisible\(\{[\s\S]*sessionKey: latencySessionKey[\s\S]*updateSeq: currentUpdateSeq/);
  assert.doesNotMatch(quoteCardSource, /subscribeQuoteLatency|useSyncExternalStore/);
});

test('session quote teardown resets latency aggregates', () => {
  const source = readSource('src/features/quotes/useLiveQuotes.ts');
  const resetStart = source.indexOf('export const resetLiveQuoteSnapshotRuntimeState');
  assert.ok(resetStart >= 0);
  assert.match(source.slice(resetStart), /resetQuoteLatencyMetrics\(\)/);
});

test('the parent quote list records commits without subscribing to per-tick metrics', () => {
  const source = readSource('src/features/quotes/QuotesScreen.tsx');
  assert.match(source, /recordQuoteListCommit\(quoteLatencySessionKey\)/);
  assert.doesNotMatch(source, /subscribeQuoteLatency|useQuoteLatencyMetrics/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('authenticated quote runtime paths do not import or merge mock quote values', () => {
  const paths = [
    'src/query/websocket.ts',
    'src/features/quotes/liveQuoteSnapshot.ts',
    'src/state/tradingState.ts',
    'src/api/ws/quotesSocket/flushPipeline.ts',
    'src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx',
    'src/features/quotes/MarketStatisticsScreen/MarketStatisticsScreen.tsx',
  ];

  for (const path of paths) {
    const source = readSource(path);
    assert.doesNotMatch(source, /import\s+\{[^}]*\bquotes\b[^}]*\}\s+from\s+['"][^'"]*dev\/mock\/tradingData/);
    assert.doesNotMatch(source, /\bmockQuotes\b|\bquoteSpecBySymbol\b|\bsymbolSpecs\b/);
  }
});

test('REST quote repair is one-shot and explicitly non-executable', () => {
  const querySource = readSource('src/query/websocket.ts');
  const watchlistSource = readSource('src/features/quotes/useLiveQuotes.ts');
  const restTickSource = readSource('src/query/restQuoteTick.ts');

  assert.doesNotMatch(querySource, /setInterval\s*\(/);
  assert.doesNotMatch(watchlistSource, /setInterval\s*\(/);
  assert.match(restTickSource, /transport: 'rest_snapshot'/);
  assert.match(restTickSource, /tradable: false/);
});

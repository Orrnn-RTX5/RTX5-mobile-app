import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('single-position close disables and rechecks against an exact executable quote', () => {
  const closePosition = readSource('src/features/trade/ClosePositionScreen.tsx');

  assert.match(closePosition, /useExecutableQuote\(/);
  assert.match(closePosition, /const currentQuoteAvailability = getCurrentAvailability\(\)/);
  assert.match(closePosition, /quoteActionBlockMessage\(currentQuoteAvailability\)/);
  assert.match(closePosition, /!quoteAvailability\.allowed/);
  assert.match(closePosition, /quoteActionBlockMessage\(quoteAvailability\)/);
});

test('unsupported Close By cannot submit an invalid non-atomic close request', () => {
  const closeBy = readSource('src/features/trade/CloseByScreen.tsx');
  const closePosition = readSource('src/features/trade/ClosePositionScreen.tsx');
  const tradeScreen = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const row = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');

  assert.match(closeBy, /Close By is unavailable for this API contract/);
  assert.match(closeBy, /style=\{\[styles\.submitButton, styles\.submitDisabled\]\}[\s\S]*disabled/);
  assert.doesNotMatch(closeBy, /positionsApi|beginOptimisticClose|ticket_by/);
  assert.doesNotMatch(tradeScreen, /showTradePositionAction\('close-by'/);
  assert.doesNotMatch(row, /onCloseBy|openPositionAction\('close-by'/);
  assert.doesNotMatch(closePosition, /handleOpenCloseBy|closePosition\.closeBy/);
});

test('bulk close subscribes every affected symbol and blocks if any live quote is not executable', () => {
  const source = readSource('src/features/trade/BulkOperationScreen.tsx');

  assert.match(source, /const affectedSymbols = useMemo\(/);
  assert.match(
    source,
    /useLiveSymbolQuotes\(\s*affectedSymbols,\s*isScreenFocused && affectedSymbols\.length > 0,\s*0,\s*\)/,
  );
  assert.match(source, /for \(const position of affectedPositions\)/);
  assert.match(source, /resolveSessionQuoteActionAvailability\(quotes\[position\.symbol\], now\)/);
  assert.match(source, /const currentQuoteBlock = resolveBulkQuoteBlock\(\)/);
  assert.match(source, /quoteActionBlockMessage\(bulkQuoteBlock\)/);
  assert.match(source, /Boolean\(bulkQuoteBlock\)/);
});

test('row quick-close passes its current quote and validates it again inside the flow', () => {
  const flow = readSource('src/features/trade/closePositionFlow.ts');
  const row = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');

  assert.match(flow, /quote: ExecutableQuoteInput \| null \| undefined/);
  assert.match(flow, /resolveSessionQuoteActionAvailability\(options\.quote, Date\.now\(\)\)/);
  assert.match(flow, /quoteActionBlockMessage\(quoteAvailability\)/);
  assert.match(row, /closePositionImmediately\(item, \{[\s\S]*quote: liveQuote,[\s\S]*resolvedLogin: tradingLogin/);
});

test('retained single-position close cannot submit an old ticket through a new session', () => {
  const source = readSource('src/features/trade/ClosePositionScreen.tsx');
  const handler = source.slice(
    source.indexOf('const handleClosePosition'),
    source.indexOf('// Hosted inactive layers'),
  );

  assert.match(source, /type ScopedStablePosition/);
  assert.match(source, /useSyncExternalStore\(/);
  assert.match(source, /subscribeActiveBrokerSession/);
  assert.match(source, /current\.cacheNamespace !== activeCacheNamespace/);
  assert.match(handler, /positionCacheNamespace !== actionProvenance\.cacheNamespace/);
  assert.match(handler, /resolvedLogin !== actionProvenance\.identity\.accountLogin/);
  assert.ok(
    handler.indexOf('positionCacheNamespace !== actionProvenance.cacheNamespace')
      < handler.indexOf('positionsApi.closePosition(ticketId)'),
  );
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
  'utf8',
);

test('native chart pending-order defaults never use candle or display quote fallbacks', () => {
  const start = source.indexOf('const resolveDefaultPendingPrice');
  const end = source.indexOf('const injectChartScript', start);
  const resolver = source.slice(start, end);

  assert.match(
    resolver,
    /resolveSessionQuoteActionAvailability\(chartLiveQuote, Date\.now\(\)\)/,
  );
  assert.match(resolver, /if \(!currentQuoteAvailability\.allowed\) \{\s*return 0;/);
  assert.match(resolver, /const \{ bid, ask \} = currentQuoteAvailability/);
  assert.doesNotMatch(resolver, /latestChartClose|chartBid|chartAsk|fallback/);
  assert.doesNotMatch(source, /chartTradePrice \|\| chartBid/);
});

test('native chart pending-order submission rechecks the active session quote and health', () => {
  const start = source.indexOf('const handleSubmitPendingTradeFromSheet');
  const end = source.indexOf('const handleToggleChartTradeSheetMode', start);
  const handler = source.slice(start, end);

  assert.match(
    handler,
    /resolveSessionQuoteActionAvailability\(chartLiveQuote, Date\.now\(\)\)/,
  );
  assert.match(handler, /if \(!currentQuoteAvailability\.allowed\)/);
  assert.match(handler, /quoteActionBlockMessage\(currentQuoteAvailability\)/);
  assert.match(handler, /bid: currentQuoteAvailability\.bid/);
  assert.match(handler, /ask: currentQuoteAvailability\.ask/);
  assert.ok(
    handler.indexOf('if (!currentQuoteAvailability.allowed)')
      < handler.indexOf('ordersApi.placePendingOrder(payload)'),
  );
  assert.match(source, /\|\| !chartPendingQuoteAvailability\.allowed/);
});

test('native chart pending-order completions are bound to the captured broker epoch', () => {
  const start = source.indexOf('const handleSubmitPendingTradeFromSheet');
  const end = source.indexOf('const handleToggleChartTradeSheetMode', start);
  const handler = source.slice(start, end);

  assert.match(handler, /const pendingOrderSessionCapture = captureActiveBrokerSession\(\)/);
  assert.match(
    handler,
    /const pendingOrderSessionProvenance = getActiveBrokerSessionProvenance\([\s\S]*?pendingOrderSessionCapture\.session/,
  );
  assert.match(handler, /isActiveBrokerSessionProvenanceCurrent\(pendingOrderSessionProvenance\)/);
  assert.match(
    handler,
    /String\(tradingLogin\) !== pendingOrderSessionCapture\.session\.accountLogin/,
  );
  assert.match(handler, /const data = await ordersApi\.placePendingOrder\(payload\);\s*if \(!isPendingOrderSessionCurrent\(\)\) return;/);
  assert.match(handler, /await Promise\.allSettled\([\s\S]*?if \(!isPendingOrderSessionCurrent\(\)\) return;/);
  assert.match(handler, /catch \(error: any\) \{\s*if \(!isPendingOrderSessionCurrent\(\)\) return;/);
  assert.match(handler, /finally \{\s*if \(isPendingOrderSessionCurrent\(\)\) \{\s*setChartPendingOrderSubmitting\(false\);/);
});

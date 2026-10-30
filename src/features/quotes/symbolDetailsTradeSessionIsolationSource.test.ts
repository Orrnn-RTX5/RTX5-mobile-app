import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx'),
  'utf8',
);
const receiptsHookSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/useMarketTradeReceipts.ts'),
  'utf8',
);
const receiptCallbacksSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/marketTradeReceiptCallbacks.ts'),
  'utf8',
);

test('symbol-details order callbacks are bound to their originating broker epoch', () => {
  const start = source.indexOf('const handleTrade');
  const end = source.indexOf('\n  return (', start);
  const handler = source.slice(start, end);

  assert.match(handler, /const actionProvenance = captureActiveBrokerSessionProvenance\(\)/);
  assert.match(handler, /String\(tradingLogin\) !== actionProvenance\.identity\.accountLogin/);
  assert.match(
    handler,
    /createTradeReceipt\(\{ symbol, side, volume: resolvedVolume \}, actionProvenance\.cacheNamespace\)/,
  );
  assert.match(
    receiptsHookSource,
    /\(\) => isMarketOrderFeedbackCurrent\(namespace\)/,
  );
  assert.match(
    receiptCallbacksSource,
    /status: isCurrent\(\) \? status : 'cancelled'/,
  );
});

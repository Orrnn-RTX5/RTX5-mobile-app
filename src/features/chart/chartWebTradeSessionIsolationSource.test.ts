import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.web.tsx'),
  'utf8',
);
const marketTradeReceiptsSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/useMarketTradeReceipts.ts'),
  'utf8',
);
const marketTradeReceiptCallbacksSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/marketTradeReceiptCallbacks.ts'),
  'utf8',
);

test('web chart trade callbacks cannot render a prior broker epoch result', () => {
  const start = source.indexOf('const LiveTradeButtons');
  const end = source.indexOf('const ChartToolbar', start);
  const buttons = source.slice(start, end);

  assert.match(buttons, /const actionProvenance = captureActiveBrokerSessionProvenance\(\)/);
  assert.match(buttons, /String\(tradingLogin\) !== actionProvenance\.identity\.accountLogin/);
  assert.match(
    buttons,
    /createTradeReceipt\(\{ symbol, side: action\.side, volume: Number\(lotSize\) \}, actionProvenance\.cacheNamespace\)/,
  );
  assert.match(
    marketTradeReceiptsSource,
    /\(\) => isMarketOrderFeedbackCurrent\(namespace\)/,
  );
  assert.match(
    marketTradeReceiptCallbacksSource,
    /status: isCurrent\(\) \? status : 'cancelled'/,
  );
});

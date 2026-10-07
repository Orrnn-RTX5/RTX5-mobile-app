import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMarketQuoteStale,
  isRecognizedMarketDataSource,
  MARKET_QUOTE_STALE_AFTER_MS,
} from './quotePolicy';

test('market quotes become stale only after fifteen seconds', () => {
  const now = 1_800_000_000_000;
  assert.equal(MARKET_QUOTE_STALE_AFTER_MS, 15_000);
  assert.equal(isMarketQuoteStale({ timeMs: now - 15_000 }, now), false);
  assert.equal(isMarketQuoteStale({ timeMs: now - 15_001 }, now), true);
  assert.equal(isMarketQuoteStale({ timeMs: now, stale: true }, now), true);
});

test('market-data source policy recognizes RTX hub labels without requiring UI badges', () => {
  assert.equal(isRecognizedMarketDataSource('rtx_market_data'), true);
  assert.equal(isRecognizedMarketDataSource('RTXMD'), true);
  assert.equal(isRecognizedMarketDataSource('tiger_direct'), false);
});

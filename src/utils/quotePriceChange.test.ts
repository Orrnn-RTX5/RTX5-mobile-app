import assert from 'node:assert/strict';
import test from 'node:test';

import { hasQuotePriceChange } from './quotePriceChange.ts';

test('hasQuotePriceChange treats the first quote as a price change', () => {
  assert.equal(hasQuotePriceChange(undefined, { bid: 1.17121, ask: 1.17141 }), true);
});

test('hasQuotePriceChange ignores duplicate quote snapshots', () => {
  assert.equal(
    hasQuotePriceChange(
      { bid: 1.17121, ask: 1.17141 },
      { bid: 1.17121, ask: 1.17141, bidHigh: 1.17121, bidLow: 1.17121 },
    ),
    false,
  );
});

test('hasQuotePriceChange detects bid, ask, and collapsed intra-frame wick changes', () => {
  assert.equal(hasQuotePriceChange({ bid: 1.17121, ask: 1.17141 }, { bid: 1.17122, ask: 1.17141 }), true);
  assert.equal(hasQuotePriceChange({ bid: 1.17121, ask: 1.17141 }, { bid: 1.17121, ask: 1.17142 }), true);
  assert.equal(
    hasQuotePriceChange(
      { bid: 1.17121, ask: 1.17141 },
      { bid: 1.17121, ask: 1.17141, bidHigh: 1.17125, bidLow: 1.17121 },
    ),
    true,
  );
});

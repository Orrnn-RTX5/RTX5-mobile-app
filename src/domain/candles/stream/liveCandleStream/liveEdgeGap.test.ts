import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hasLiveEdgeHistoryGap } from './helpers';

const M1 = 60;
const base = 1_000_000 * M1;

test('no gap when the live bucket is the one immediately after history', () => {
  // history closed at base, live opens base + 1 bucket → contiguous.
  assert.equal(hasLiveEdgeHistoryGap(base, base + M1, 'M1'), false);
});

test('no gap when the live bucket overlaps the history boundary', () => {
  assert.equal(hasLiveEdgeHistoryGap(base, base, 'M1'), false);
  assert.equal(hasLiveEdgeHistoryGap(base, base - M1, 'M1'), false);
});

test('gap when one whole bucket is missing between history and live', () => {
  // history closed at base, live opens base + 2 buckets → base + 1 is missing.
  assert.equal(hasLiveEdgeHistoryGap(base, base + 2 * M1, 'M1'), true);
});

test('gap when several buckets are missing (stale prefetch)', () => {
  assert.equal(hasLiveEdgeHistoryGap(base, base + 5 * M1, 'M1'), true);
});

test('respects timeframe step (M5)', () => {
  const M5 = 5 * 60;
  const b = 2_000_000 * M5;
  assert.equal(hasLiveEdgeHistoryGap(b, b + M5, 'M5'), false); // next bucket
  assert.equal(hasLiveEdgeHistoryGap(b, b + 2 * M5, 'M5'), true); // one missing
  // A sub-bucket difference smaller than one M5 step is not a whole-bar gap.
  assert.equal(hasLiveEdgeHistoryGap(b, b + 60, 'M5'), false);
});

test('returns false on missing inputs', () => {
  assert.equal(hasLiveEdgeHistoryGap(null, base + 5 * M1, 'M1'), false);
  assert.equal(hasLiveEdgeHistoryGap(base, null, 'M1'), false);
  assert.equal(hasLiveEdgeHistoryGap(base, undefined, 'M1'), false);
  assert.equal(hasLiveEdgeHistoryGap(base, Number.NaN, 'M1'), false);
});

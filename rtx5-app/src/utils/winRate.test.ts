import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWinRatePercentFromCounts,
  calculateWinRatePercentFromPnl,
} from './winRate';

test('calculateWinRatePercentFromPnl uses wins divided by decisive closed trades', () => {
  assert.equal(calculateWinRatePercentFromPnl([10, -5, 0, 7]), 67);
});

test('calculateWinRatePercentFromPnl ignores breakeven and non-finite values', () => {
  assert.equal(calculateWinRatePercentFromPnl([0, Number.NaN, Number.POSITIVE_INFINITY]), 0);
});

test('calculateWinRatePercentFromCounts clamps invalid counts before calculating', () => {
  assert.equal(calculateWinRatePercentFromCounts({ wins: 2.9, losses: -1 }), 100);
});

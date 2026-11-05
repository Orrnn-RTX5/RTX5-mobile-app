import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVisiblePendingEntryPrice } from './ChartScreen.constants';

const roundForexPrice = (value: number) => Number(value.toFixed(5));

test('pending entry starts at the visible plot midpoint regardless of range direction', () => {
  const from = 1.12212;
  const to = 1.12366;
  assert.equal(resolveVisiblePendingEntryPrice({ from, to }, roundForexPrice), 1.12289);
  assert.equal(resolveVisiblePendingEntryPrice({ from: to, to: from }, roundForexPrice), 1.12289);
});

test('pending entry follows the current viewport when the chart is moved or rescaled', () => {
  assert.equal(
    resolveVisiblePendingEntryPrice({ from: 1.12212, to: 1.12366 }, roundForexPrice),
    1.12289,
  );
  assert.equal(
    resolveVisiblePendingEntryPrice({ from: 1.125, to: 1.127 }, roundForexPrice),
    1.126,
  );
});

test('pending entry uses the instrument rounding function for the visible midpoint', () => {
  const roundToQuarter = (value: number) => Math.round(value / 0.25) * 0.25;
  assert.equal(
    resolveVisiblePendingEntryPrice({ from: 2401.1, to: 2402.2 }, roundToQuarter),
    2401.75,
  );
});

test('missing or unusable viewport geometry leaves quote-based defaults available', () => {
  for (const range of [
    null,
    undefined,
    { from: 1, to: 1 },
    { from: NaN, to: 2 },
    { from: 1, to: Infinity },
    { from: -2, to: -1 },
    { from: -1, to: 1 },
  ]) {
    assert.equal(resolveVisiblePendingEntryPrice(range, roundForexPrice), null);
  }
  assert.equal(resolveVisiblePendingEntryPrice({ from: 1, to: 2 }, () => NaN), null);
  assert.equal(resolveVisiblePendingEntryPrice({ from: 1, to: 2 }, () => 0), null);
});

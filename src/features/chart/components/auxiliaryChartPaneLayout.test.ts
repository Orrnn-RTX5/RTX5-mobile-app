import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAuxiliaryChartPaneDensity } from './auxiliaryChartPaneLayout';

test('full-width horizontal panes keep the standard MT5 trade row', () => {
  assert.deepEqual(
    resolveAuxiliaryChartPaneDensity({ width: 390, height: 300 }, 'horizontal'),
    {
      compact: false,
      short: false,
      headerHeight: 58,
      tradeRowHeight: 40,
      lotSlotWidth: 172,
      maxCandles: 320,
      candleCommitIntervalMs: 32,
    },
  );
});

test('side-by-side bounds shrink chrome and cap retained candle history', () => {
  const density = resolveAuxiliaryChartPaneDensity(
    { width: 195, height: 620 },
    'vertical',
  );

  assert.equal(density.compact, true);
  assert.equal(density.short, false);
  assert.equal(density.lotSlotWidth, 82);
  assert.equal(density.maxCandles, 180);
});

test('short stacked panes preserve usable chart space', () => {
  const density = resolveAuxiliaryChartPaneDensity(
    { width: 390, height: 180 },
    'horizontal',
  );

  assert.equal(density.compact, false);
  assert.equal(density.short, true);
  assert.equal(density.headerHeight, 58);
  assert.equal(density.tradeRowHeight, 36);
  assert.equal(density.maxCandles, 180);
});

test('layout gives a safe density before native bounds are measured', () => {
  assert.equal(resolveAuxiliaryChartPaneDensity(null, 'horizontal').compact, false);
  assert.equal(resolveAuxiliaryChartPaneDensity(null, 'vertical').compact, true);
  assert.equal(resolveAuxiliaryChartPaneDensity({ width: Number.NaN }).maxCandles, 320);
});

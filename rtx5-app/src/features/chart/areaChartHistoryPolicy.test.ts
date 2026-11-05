import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AREA_CHART_HISTORY_TARGETS,
  resolveAreaChartHistoryTarget,
  resolveAreaChartVisibleBarTarget,
  resolveChartHistoryTarget,
} from './areaChartHistoryPolicy';
import {
  INITIAL_HISTORY_LIMIT,
  PAGINATED_HISTORY_LIMIT,
} from '../../domain/candles/stream/liveCandleStream/types';

test('Area history targets are bounded real-candle windows for every chart timeframe', () => {
  assert.deepEqual(AREA_CHART_HISTORY_TARGETS, {
    M1: 500,
    M5: 420,
    M15: 360,
    M30: 320,
    H1: 280,
    H4: 240,
    D1: 220,
    W1: 180,
    MN: 144,
  });

  for (const [timeframe, target] of Object.entries(AREA_CHART_HISTORY_TARGETS)) {
    assert.equal(resolveAreaChartHistoryTarget(timeframe), target);
    assert.equal(Number.isInteger(target), true);
    assert.ok(target >= INITIAL_HISTORY_LIMIT);
    assert.ok(target <= PAGINATED_HISTORY_LIMIT);
  }
});

test('only Area opts into deeper history and invalid timeframes stay lightweight', () => {
  assert.equal(resolveChartHistoryTarget('area', 'M1'), PAGINATED_HISTORY_LIMIT);
  assert.equal(resolveChartHistoryTarget('candles', 'M1'), INITIAL_HISTORY_LIMIT);
  assert.equal(resolveChartHistoryTarget('line', 'H1'), INITIAL_HISTORY_LIMIT);
  assert.equal(resolveChartHistoryTarget('area', 'invalid'), INITIAL_HISTORY_LIMIT);
});

test('split panes may cap visible Area bars without changing the timeframe policy', () => {
  assert.equal(resolveAreaChartVisibleBarTarget('M1'), 500);
  assert.equal(resolveAreaChartVisibleBarTarget('M1', 320), 320);
  assert.equal(resolveAreaChartVisibleBarTarget('H1', 500), 280);
  assert.equal(resolveAreaChartVisibleBarTarget('MN', 180), 144);
});


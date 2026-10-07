import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { LIVE_CHART_PREVIEW_TIME_AXIS_SCRIPT } from './liveChartPreviewTimeAxisScript';

const evaluateTimeAxisRuntime = () => {
  const sandbox: Record<string, any> = {
    Date,
    Math,
    Number,
    String,
    isFinite,
  };
  vm.runInNewContext(LIVE_CHART_PREVIEW_TIME_AXIS_SCRIPT, sandbox);
  return sandbox;
};

test('auxiliary intraday ticks include the same UTC date and time as the full chart', () => {
  const runtime = evaluateTimeAxisRuntime();
  const timestamp = Date.UTC(2026, 7, 14, 4, 30, 0) / 1000;

  assert.equal(runtime.formatPreviewChartTickMark(timestamp, 3), '14 Aug 04:30');
  assert.equal(runtime.formatPreviewChartTickMark(timestamp, 4), '14 Aug 04:30');
  assert.equal(runtime.formatPreviewChartTime(timestamp), '14 Aug 04:30');
});

test('auxiliary calendar tick families and business-day values stay UTC-safe', () => {
  const runtime = evaluateTimeAxisRuntime();
  const businessDay = { year: 2026, month: 8, day: 14 };

  assert.equal(runtime.formatPreviewChartTickMark(businessDay, 2), '14 Aug');
  assert.equal(runtime.formatPreviewChartTickMark(businessDay, 1), 'Aug 2026');
  assert.equal(runtime.formatPreviewChartTickMark(businessDay, 0), '2026');
  assert.equal(
    runtime.resolvePreviewTickDate({ businessDay }).getTime(),
    Date.UTC(2026, 7, 14),
  );
});

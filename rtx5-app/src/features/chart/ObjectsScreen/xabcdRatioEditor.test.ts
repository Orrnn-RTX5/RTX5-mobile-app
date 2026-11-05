import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistedChartDrawing } from '../drawingPersistence';
import {
  applyXabcdRatioPatch,
  applyXabcdRatioPreset,
  drawingSupportsXabcdRatioEditor,
  formatXabcdTargetValue,
  getActiveXabcdPresetId,
  getXabcdRatioEditorRatios,
  parseXabcdTargetValue,
  resetXabcdRatios,
} from './xabcdRatioEditor';

const baseXabcd: PersistedChartDrawing = {
  id: 'xabcd_1',
  kind: 'xabcd',
  label: 'XABCD 1',
  hidden: false,
  points: [
    { time: 1, price: 90 },
    { time: 2, price: 96 },
    { time: 3, price: 92 },
    { time: 4, price: 95 },
    { time: 5, price: 99 },
  ],
};

test('xabcd ratio editor is limited to xabcd drawings', () => {
  assert.equal(drawingSupportsXabcdRatioEditor('xabcd'), true);
  assert.equal(drawingSupportsXabcdRatioEditor('elliottWave'), false);
  assert.equal(drawingSupportsXabcdRatioEditor('fib'), false);
});

test('xabcd ratio editor resolves default measured-only legs', () => {
  const ratios = getXabcdRatioEditorRatios(baseXabcd);
  assert.equal(ratios.length, 3);
  assert.deepEqual(ratios.map((ratio) => ratio.id), ['ratio_ab', 'ratio_bc', 'ratio_cd']);
  assert.ok(ratios.every((ratio) => ratio.target === null && ratio.visible));
  assert.equal(getActiveXabcdPresetId(ratios), null);
});

test('applyXabcdRatioPatch updates the selected leg only', () => {
  const updated = applyXabcdRatioPatch(baseXabcd, 'ratio_ab', { target: 0.618, visible: false }, 12345);

  const ratios = getXabcdRatioEditorRatios(updated);
  assert.equal(ratios[0]?.target, 0.618);
  assert.equal(ratios[0]?.visible, false);
  assert.equal(ratios[1]?.target, null);
  assert.equal(ratios[1]?.visible, true);
  assert.equal(updated.updatedAt, 12345);

  const cleared = applyXabcdRatioPatch(updated, 'ratio_ab', { target: null }, 12346);
  assert.equal(getXabcdRatioEditorRatios(cleared)[0]?.target, null);
});

test('xabcd presets apply harmonic targets and reset restores measured-only', () => {
  const gartley = applyXabcdRatioPreset(baseXabcd, 'gartley', 10);
  assert.deepEqual(gartley.ratios?.map((ratio) => ratio.target), [0.618, 0.618, 1.272]);
  assert.equal(gartley.updatedAt, 10);
  assert.equal(getActiveXabcdPresetId(getXabcdRatioEditorRatios(gartley)), 'gartley');

  const crab = applyXabcdRatioPreset(gartley, 'crab', 11);
  assert.equal(getActiveXabcdPresetId(getXabcdRatioEditorRatios(crab)), 'crab');

  const reset = resetXabcdRatios(crab, 12);
  assert.equal(reset.ratios, undefined);
  assert.equal(reset.updatedAt, 12);
  assert.ok(getXabcdRatioEditorRatios(reset).every((ratio) => ratio.target === null));
});

test('xabcd target parsing and formatting are stable', () => {
  assert.equal(parseXabcdTargetValue(' 1.618 '), 1.618);
  assert.equal(parseXabcdTargetValue('0.6182'), 0.618);
  assert.equal(parseXabcdTargetValue('99'), 10);
  assert.equal(parseXabcdTargetValue('0'), null);
  assert.equal(parseXabcdTargetValue('-1'), null);
  assert.equal(parseXabcdTargetValue('bad'), null);
  assert.equal(formatXabcdTargetValue(0.5), '0.5');
  assert.equal(formatXabcdTargetValue(1.272), '1.272');
  assert.equal(formatXabcdTargetValue(null), '');
});

test('xabcd ratio editor ignores non-xabcd drawings', () => {
  const trendline: PersistedChartDrawing = { ...baseXabcd, id: 'trend_1', kind: 'trendline' };
  assert.deepEqual(getXabcdRatioEditorRatios(trendline), []);
  assert.equal(applyXabcdRatioPreset(trendline, 'bat'), trendline);
  assert.equal(applyXabcdRatioPatch(trendline, 'ratio_ab', { target: 1 }), trendline);
  assert.equal(resetXabcdRatios(trendline), trendline);
});

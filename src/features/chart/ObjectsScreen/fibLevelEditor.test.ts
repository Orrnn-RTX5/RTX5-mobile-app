import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistedChartDrawing } from '../drawingPersistence';
import {
  addFibLevel,
  applyFibLevelPatch,
  drawingSupportsFibLevelEditor,
  formatFibLevelPercent,
  formatFibLevelValue,
  getFibLevelEditorLevels,
  parseFibLevelValue,
  removeFibLevel,
  resetFibLevels,
} from './fibLevelEditor';

const baseFib: PersistedChartDrawing = {
  id: 'fib_1',
  kind: 'fib',
  label: 'Fib 1',
  hidden: false,
  points: [
    { time: 1, price: 100 },
    { time: 2, price: 110 },
  ],
};

test('fib level editor is limited to fibonacci drawings', () => {
  assert.equal(drawingSupportsFibLevelEditor('fib'), true);
  assert.equal(drawingSupportsFibLevelEditor('fibExtension'), true);
  assert.equal(drawingSupportsFibLevelEditor('trendline'), false);
});

test('fib level editor resolves default retracement and extension levels', () => {
  const retracementLevels = getFibLevelEditorLevels(baseFib);
  assert.ok(retracementLevels.some((level) => level.value === 0.618));
  assert.equal(retracementLevels.some((level) => level.value > 1), false);

  const extensionLevels = getFibLevelEditorLevels({
    ...baseFib,
    id: 'fib_ext_1',
    kind: 'fibExtension',
  });
  assert.ok(extensionLevels.some((level) => level.value === 1.618));
  assert.ok(extensionLevels.some((level) => level.value > 1));
});

test('applyFibLevelPatch updates selected level controls only', () => {
  const [firstLevel, secondLevel] = getFibLevelEditorLevels(baseFib);
  const updated = applyFibLevelPatch(
    { ...baseFib, levels: [firstLevel!, secondLevel!] },
    firstLevel!.id,
    {
      color: '#14B8A6',
      label: 'Entry',
      lineStyle: 'dashed',
      lineWidth: 3,
      showPercent: false,
      showPrice: false,
      value: 0.65,
      visible: false,
    },
    12345,
  );

  const edited = updated.levels?.find((level) => level.id === firstLevel!.id);
  const untouched = updated.levels?.find((level) => level.id === secondLevel!.id);
  assert.equal(edited?.value, 0.65);
  assert.equal(edited?.label, 'Entry');
  assert.equal(edited?.visible, false);
  assert.equal(edited?.lineColor, '#14B8A6');
  assert.equal(edited?.color, '#14B8A6');
  assert.equal(edited?.lineWidth, 3);
  assert.equal(edited?.lineStyle, 'dashed');
  assert.equal(edited?.showPrice, false);
  assert.equal(edited?.showPercent, false);
  assert.equal(updated.updatedAt, 12345);
  assert.equal(untouched?.id, secondLevel!.id);
});

test('fib level editor can add remove and reset levels', () => {
  const withAdded = addFibLevel(baseFib, 10);
  assert.ok(withAdded.levels?.some((level) => level.value === 0.65));
  assert.equal(withAdded.updatedAt, 10);

  const added = withAdded.levels?.find((level) => level.value === 0.65);
  const removed = removeFibLevel(withAdded, added!.id, 11);
  assert.equal(removed.levels?.some((level) => level.value === 0.65), false);
  assert.equal(removed.updatedAt, 11);

  const reset = resetFibLevels(withAdded, 12);
  assert.equal(reset.levels?.some((level) => level.value === 0.65), false);
  assert.ok(reset.levels?.some((level) => level.value === 0.618));
  assert.equal(reset.updatedAt, 12);
});

test('fib level value formatting and parsing are stable', () => {
  assert.equal(formatFibLevelValue(0.650000), '0.65');
  assert.equal(formatFibLevelPercent(0.618), '61.8%');
  assert.equal(parseFibLevelValue(' 1.618 '), 1.618);
  assert.equal(parseFibLevelValue('bad'), null);
});

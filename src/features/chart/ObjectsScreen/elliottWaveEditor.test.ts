import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistedChartDrawing } from '../drawingPersistence';
import {
  applyElliottWavePatch,
  applyElliottWavePreset,
  describeElliottWavePivot,
  drawingSupportsElliottWaveEditor,
  getActiveElliottWavePresetId,
  getElliottWaveEditorWaves,
  resetElliottWaves,
} from './elliottWaveEditor';

const baseElliott: PersistedChartDrawing = {
  id: 'elliott_1',
  kind: 'elliottWave',
  label: 'Elliott 1',
  hidden: false,
  points: [
    { time: 1, price: 100 },
    { time: 2, price: 110 },
    { time: 3, price: 105 },
    { time: 4, price: 120 },
    { time: 5, price: 112 },
    { time: 6, price: 130 },
  ],
};

test('elliott wave editor is limited to elliott wave drawings', () => {
  assert.equal(drawingSupportsElliottWaveEditor('elliottWave'), true);
  assert.equal(drawingSupportsElliottWaveEditor('fib'), false);
  assert.equal(drawingSupportsElliottWaveEditor('trendline'), false);
});

test('elliott wave editor resolves default impulse labels', () => {
  const waves = getElliottWaveEditorWaves(baseElliott);
  assert.equal(waves.length, 6);
  assert.deepEqual(waves.map((wave) => wave.label), ['', '1', '2', '3', '4', '5']);
  assert.ok(waves.every((wave) => wave.visible));
  assert.equal(getActiveElliottWavePresetId(waves), 'impulse');
});

test('applyElliottWavePatch updates the selected wave only', () => {
  const waves = getElliottWaveEditorWaves(baseElliott);
  const updated = applyElliottWavePatch(baseElliott, waves[2]!.id, { label: '(2)', visible: false }, 12345);

  const editedWaves = getElliottWaveEditorWaves(updated);
  assert.equal(editedWaves[2]?.label, '(2)');
  assert.equal(editedWaves[2]?.visible, false);
  assert.equal(editedWaves[1]?.label, '1');
  assert.equal(editedWaves[1]?.visible, true);
  assert.equal(updated.updatedAt, 12345);
  assert.equal(getActiveElliottWavePresetId(editedWaves), null);
});

test('elliott wave presets apply and reset restores the default numbering', () => {
  const triangle = applyElliottWavePreset(baseElliott, 'triangle', 10);
  assert.deepEqual(triangle.waves?.map((wave) => wave.label), ['', 'A', 'B', 'C', 'D', 'E']);
  assert.equal(triangle.updatedAt, 10);
  assert.equal(getActiveElliottWavePresetId(getElliottWaveEditorWaves(triangle)), 'triangle');

  const reset = resetElliottWaves(triangle, 11);
  assert.equal(reset.waves, undefined);
  assert.equal(reset.updatedAt, 11);
  assert.deepEqual(getElliottWaveEditorWaves(reset).map((wave) => wave.label), ['', '1', '2', '3', '4', '5']);
});

test('elliott wave labels are trimmed and length limited', () => {
  const waves = getElliottWaveEditorWaves(baseElliott);
  const updated = applyElliottWavePatch(baseElliott, waves[1]!.id, { label: '  a very very long label  ' });
  const label = getElliottWaveEditorWaves(updated)[1]?.label ?? '';
  assert.equal(label, 'a very very');
  assert.ok(label.length <= 12);
});

test('elliott wave editor ignores non-elliott drawings and describes pivots', () => {
  const fib: PersistedChartDrawing = { ...baseElliott, id: 'fib_1', kind: 'fib' };
  assert.deepEqual(getElliottWaveEditorWaves(fib), []);
  assert.equal(applyElliottWavePreset(fib, 'triangle'), fib);
  assert.equal(resetElliottWaves(fib), fib);
  assert.equal(describeElliottWavePivot(0), 'Origin pivot');
  assert.equal(describeElliottWavePivot(3), 'Wave 3 pivot');
});

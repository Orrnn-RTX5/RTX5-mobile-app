import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDrawingStylePatch,
  drawingSupportsStyleEditor,
  getDrawingStyleEditorValues,
} from './drawingStyleEditor';
import type { PersistedChartDrawing } from '../drawingPersistence';

const baseTrendLine: PersistedChartDrawing = {
  id: 'trend_1',
  kind: 'trendline',
  label: 'Trend Line 1',
  hidden: false,
  points: [
    { time: 1, price: 100 },
    { time: 2, price: 110 },
  ],
  style: {
    color: '#2962FF',
    width: 2,
    lineStyle: 'solid',
    opacity: 1,
  },
  extendMode: 'none',
};

test('drawing style editor values resolve persisted style and extend mode', () => {
  const values = getDrawingStyleEditorValues({
    ...baseTrendLine,
    style: {
      color: '#EF4444',
      width: 4,
      lineStyle: 'dashed',
      opacity: 0.6,
    },
    extendMode: 'right',
  });

  assert.deepEqual(values, {
    color: '#EF4444',
    width: 4,
    lineStyle: 'dashed',
    opacity: 0.6,
    extendMode: 'right',
    supportsExtendMode: true,
  });
});

test('applyDrawingStylePatch updates color width line style opacity and extend mode', () => {
  const updated = applyDrawingStylePatch(
    baseTrendLine,
    {
      color: '#14B8A6',
      width: 5,
      lineStyle: 'dotted',
      opacity: 0.5,
      extendMode: 'both',
    },
    12345,
  );

  assert.equal(updated.style?.color, '#14B8A6');
  assert.equal(updated.style?.lineColor, '#14B8A6');
  assert.equal(updated.style?.borderColor, '#14B8A6');
  assert.equal(updated.style?.width, 5);
  assert.equal(updated.style?.lineWidth, 5);
  assert.equal(updated.style?.borderWidth, 5);
  assert.equal(updated.style?.lineStyle, 'dotted');
  assert.equal(updated.style?.borderStyle, 'dotted');
  assert.equal(updated.style?.opacity, 0.5);
  assert.equal(updated.extendMode, 'both');
  assert.equal(updated.updatedAt, 12345);
});

test('line shortcut tools expose the expected style editor defaults', () => {
  assert.deepEqual(
    getDrawingStyleEditorValues({
      id: 'horizontal_ray_1',
      kind: 'horizontalRay',
      label: 'Horizontal Ray 1',
      hidden: false,
      points: [
        { time: 1, price: 100 },
        { time: 2, price: 100 },
      ],
    }),
    {
      color: '#0EA5E9',
      width: 2,
      lineStyle: 'solid',
      opacity: 1,
      extendMode: 'none',
      supportsExtendMode: false,
    },
  );

  assert.deepEqual(
    getDrawingStyleEditorValues({
      id: 'extended_line_1',
      kind: 'extendedLine',
      label: 'Extended Line 1',
      hidden: false,
      points: [
        { time: 1, price: 100 },
        { time: 2, price: 110 },
      ],
    }),
    {
      color: '#7C3AED',
      width: 2,
      lineStyle: 'solid',
      opacity: 1,
      extendMode: 'both',
      supportsExtendMode: true,
    },
  );
});

test('applyDrawingStylePatch updates text level line controls', () => {
  const textLevel: PersistedChartDrawing = {
    id: 'level_1',
    kind: 'textLevel',
    label: 'Entry',
    hidden: false,
    points: [{ time: 1, price: 100 }],
    levelLine: {
      enabled: true,
      extendMode: 'right',
      lineColor: '#2962FF',
      lineWidth: 1,
      lineStyle: 'solid',
      opacity: 0.9,
    },
  };

  const updated = applyDrawingStylePatch(
    textLevel,
    {
      color: '#F59E0B',
      width: 3,
      lineStyle: 'dashed',
      opacity: 0.7,
      extendMode: 'left',
    },
    12345,
  );

  assert.equal(updated.levelLine?.lineColor, '#F59E0B');
  assert.equal(updated.levelLine?.lineWidth, 3);
  assert.equal(updated.levelLine?.lineStyle, 'dashed');
  assert.equal(updated.levelLine?.opacity, 0.7);
  assert.equal(updated.levelLine?.extendMode, 'left');
  assert.equal(updated.extendMode, 'left');
});

test('applyDrawingStylePatch cascades fib style changes to levels', () => {
  const fib: PersistedChartDrawing = {
    id: 'fib_1',
    kind: 'fib',
    label: 'Fibonacci Retracement 1',
    hidden: false,
    points: [
      { time: 1, price: 100 },
      { time: 2, price: 110 },
    ],
    levels: [
      { id: 'fib_0', value: 0, visible: true, label: '0' },
      { id: 'fib_1', value: 1, visible: true, label: '1' },
    ],
  };

  const updated = applyDrawingStylePatch(
    fib,
    {
      color: '#8B5CF6',
      width: 4,
      lineStyle: 'dashed',
      opacity: 0.4,
      extendMode: 'right',
    },
    12345,
  );

  assert.equal(updated.style?.anchorLineColor, '#8B5CF6');
  assert.equal(updated.style?.anchorLineWidth, 4);
  assert.equal(updated.style?.anchorLineStyle, 'dashed');
  assert.equal(updated.style?.fillOpacity, 0.4);
  assert.equal(updated.extendMode, 'right');
  assert.equal(updated.levels?.[0]?.lineColor, '#8B5CF6');
  assert.equal(updated.levels?.[0]?.lineWidth, 4);
  assert.equal(updated.levels?.[0]?.lineStyle, 'dashed');
  assert.equal(updated.levels?.[0]?.fillOpacity, 0.4);
});

test('applyDrawingStylePatch updates box-style tools with fill and border controls', () => {
  const measure: PersistedChartDrawing = {
    id: 'measure_1',
    kind: 'measure',
    label: 'Scale 1',
    hidden: false,
    points: [
      { time: 1, price: 100 },
      { time: 2, price: 110 },
    ],
  };

  const updated = applyDrawingStylePatch(
    measure,
    {
      color: '#64748B',
      width: 3,
      lineStyle: 'dashed',
      opacity: 0.35,
    },
    12345,
  );

  assert.equal(updated.style?.color, '#64748B');
  assert.equal(updated.style?.borderColor, '#64748B');
  assert.equal(updated.style?.fillColor, 'rgba(100, 116, 139, 0.32)');
  assert.equal(updated.style?.borderWidth, 3);
  assert.equal(updated.style?.borderStyle, 'dashed');
  assert.equal(updated.style?.opacity, 0.35);
  assert.equal(updated.style?.fillOpacity, 0.35);
});

test('style editor is exposed only for drawing kinds that restore saved style', () => {
  assert.equal(drawingSupportsStyleEditor('trendline'), true);
  assert.equal(drawingSupportsStyleEditor('arrow'), true);
  assert.equal(drawingSupportsStyleEditor('horizontalLine'), true);
  assert.equal(drawingSupportsStyleEditor('horizontalRay'), true);
  assert.equal(drawingSupportsStyleEditor('extendedLine'), true);
  assert.equal(drawingSupportsStyleEditor('ellipse'), true);
  assert.equal(drawingSupportsStyleEditor('freehand'), true);
  assert.equal(drawingSupportsStyleEditor('parallelChannel'), true);
  assert.equal(drawingSupportsStyleEditor('textLevel'), true);
  assert.equal(drawingSupportsStyleEditor('patterns'), true);
  assert.equal(drawingSupportsStyleEditor('prediction'), true);
  assert.equal(drawingSupportsStyleEditor('shortPosition'), true);
  assert.equal(drawingSupportsStyleEditor('pitchfork'), true);
  assert.equal(drawingSupportsStyleEditor('measure'), true);
  assert.equal(drawingSupportsStyleEditor('text'), true);
  assert.equal(drawingSupportsStyleEditor('smiley'), true);
});

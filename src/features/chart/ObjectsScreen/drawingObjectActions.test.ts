import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistedChartDrawing } from '../drawingPersistence';
import {
  cloneDrawingObjectRecord,
  drawingSupportsPriceAlert,
  getDrawingObjectPriceAlertDraft,
  renameDrawingObjectRecord,
  sanitizeDrawingObjectLabel,
  toggleDrawingObjectLock,
} from './drawingObjectActions';

const baseDrawing: PersistedChartDrawing = {
  id: 'trend_1',
  kind: 'trendline',
  label: 'Trend Line 1',
  hidden: false,
  locked: false,
  selected: true,
  points: [
    { time: 1, price: 100, dataIndex: 1 },
    { time: 2, price: 110, dataIndex: 2 },
  ],
  style: {
    color: '#EF4444',
    width: 3,
    lineStyle: 'dotted',
    opacity: 0.9,
  },
  extendMode: 'both',
  createdAt: 10,
  updatedAt: 20,
};

test('sanitizeDrawingObjectLabel trims unsafe labels and falls back when empty', () => {
  assert.equal(sanitizeDrawingObjectLabel('  My <Level>\nName  ', 'Fallback'), 'My Level Name');
  assert.equal(sanitizeDrawingObjectLabel('   ', 'Fallback'), 'Fallback');
});

test('renameDrawingObjectRecord updates only the selected object label', () => {
  const drawings = [
    baseDrawing,
    { ...baseDrawing, id: 'trend_2', label: 'Trend Line 2' },
  ];

  const renamed = renameDrawingObjectRecord(drawings, 'trend_1', '  Breakout Line  ', 12345);

  assert.equal(renamed[0]?.label, 'Breakout Line');
  assert.equal(renamed[0]?.updatedAt, 12345);
  assert.equal(renamed[1]?.label, 'Trend Line 2');
});

test('toggleDrawingObjectLock flips per-object lock and clears selected state', () => {
  const [locked] = toggleDrawingObjectLock([baseDrawing], 'trend_1', 12345);

  assert.equal(locked?.locked, true);
  assert.equal(locked?.selected, false);
  assert.equal(locked?.updatedAt, 12345);

  const [unlocked] = toggleDrawingObjectLock([locked!], 'trend_1', 12346);
  assert.equal(unlocked?.locked, false);
  assert.equal(unlocked?.updatedAt, 12346);
});

test('cloneDrawingObjectRecord inserts an exact drawing clone with unique id and label', () => {
  const cloned = cloneDrawingObjectRecord([baseDrawing], 'trend_1', 12345);

  assert.equal(cloned.length, 2);
  assert.equal(cloned[1]?.id, 'trend_1_clone_12345');
  assert.equal(cloned[1]?.label, 'Trend Line 1 Copy');
  assert.equal(cloned[1]?.selected, false);
  assert.equal(cloned[1]?.locked, baseDrawing.locked);
  assert.deepEqual(cloned[1]?.points, baseDrawing.points);
  assert.deepEqual(cloned[1]?.style, baseDrawing.style);
  assert.equal(cloned[1]?.extendMode, baseDrawing.extendMode);
  assert.equal(cloned[1]?.createdAt, 12345);
  assert.equal(cloned[1]?.updatedAt, 12345);

  cloned[1]!.points[0]!.price = 999;
  assert.equal(baseDrawing.points[0]?.price, 100);
});

test('cloneDrawingObjectRecord avoids duplicate clone names and ids', () => {
  const existingClone: PersistedChartDrawing = {
    ...baseDrawing,
    id: 'trend_1_clone_12345',
    label: 'Trend Line 1 Copy',
  };

  const cloned = cloneDrawingObjectRecord([baseDrawing, existingClone], 'trend_1', 12345);

  assert.equal(cloned[1]?.id, 'trend_1_clone_12345_2');
  assert.equal(cloned[1]?.label, 'Trend Line 1 Copy 2');
});

test('price alert drafts are created only from supported price-level objects', () => {
  const horizontalLine: PersistedChartDrawing = {
    ...baseDrawing,
    id: 'horizontal_1',
    kind: 'horizontalLine',
    label: 'Breakout level',
    points: [
      { time: 1, price: 1.2345 },
      { time: 2, price: 1.2345 },
    ],
  };
  const textLevel: PersistedChartDrawing = {
    ...baseDrawing,
    id: 'text_level_1',
    kind: 'textLevel',
    label: 'Entry level',
    points: [{ time: 1, price: 2500 }],
    text: 'Entry',
  };
  const horizontalRay: PersistedChartDrawing = {
    ...baseDrawing,
    id: 'horizontal_ray_1',
    kind: 'horizontalRay',
    label: 'Ray level',
    points: [
      { time: 1, price: 1.1111 },
      { time: 2, price: 1.1111 },
    ],
  };

  assert.equal(drawingSupportsPriceAlert(horizontalLine), true);
  assert.equal(drawingSupportsPriceAlert(horizontalRay), true);
  assert.equal(drawingSupportsPriceAlert(textLevel), true);
  assert.equal(drawingSupportsPriceAlert(baseDrawing), false);

  assert.deepEqual(getDrawingObjectPriceAlertDraft(horizontalLine, 'eur/usd'), {
    condition: 'above',
    drawingId: 'horizontal_1',
    drawingKind: 'horizontalLine',
    message: 'Breakout level price alert',
    price: '1.2345',
    symbol: 'EURUSD',
  });

  assert.deepEqual(getDrawingObjectPriceAlertDraft(horizontalRay, 'gbpusd'), {
    condition: 'above',
    drawingId: 'horizontal_ray_1',
    drawingKind: 'horizontalRay',
    message: 'Ray level price alert',
    price: '1.1111',
    symbol: 'GBPUSD',
  });

  assert.deepEqual(getDrawingObjectPriceAlertDraft(textLevel, 'xauusd'), {
    condition: 'above',
    drawingId: 'text_level_1',
    drawingKind: 'textLevel',
    message: 'Entry level price alert',
    price: '2500',
    symbol: 'XAUUSD',
  });
});

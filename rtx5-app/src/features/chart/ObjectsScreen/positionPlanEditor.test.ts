import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistedChartDrawing } from '../drawingPersistence';
import {
  applyPositionPlanPatch,
  drawingSupportsPositionPlanEditor,
  formatPositionPlanNumber,
  formatPositionPlanRiskReward,
  getPositionPlanEditorValues,
  parsePositionPlanNumber,
  parsePositionPlanRiskPercent,
  resetPositionPlan,
} from './positionPlanEditor';

const baseLong: PersistedChartDrawing = {
  id: 'long_1',
  kind: 'prediction',
  label: 'Position 1',
  hidden: false,
  points: [
    { time: 1, price: 90 },
    { time: 3, price: 94 },
  ],
};

const baseShort: PersistedChartDrawing = {
  ...baseLong,
  id: 'short_1',
  kind: 'shortPosition',
  label: 'Short 1',
  points: [
    { time: 1, price: 94 },
    { time: 3, price: 90 },
  ],
};

test('position plan editor is limited to long and short position drawings', () => {
  assert.equal(drawingSupportsPositionPlanEditor('prediction'), true);
  assert.equal(drawingSupportsPositionPlanEditor('shortPosition'), true);
  assert.equal(drawingSupportsPositionPlanEditor('rectangle'), false);
});

test('position plan defaults the stop to a 1:1 mirror of the target distance', () => {
  const longValues = getPositionPlanEditorValues(baseLong);
  assert.equal(longValues?.direction, 'long');
  assert.equal(longValues?.entryPrice, 90);
  assert.equal(longValues?.targetPrice, 94);
  assert.equal(longValues?.stopPrice, 86);
  assert.equal(longValues?.stopIsCustom, false);
  assert.equal(longValues?.riskReward, 1);

  const shortValues = getPositionPlanEditorValues(baseShort);
  assert.equal(shortValues?.direction, 'short');
  assert.equal(shortValues?.stopPrice, 98);
  assert.equal(shortValues?.rewardPerUnit, 4);
  assert.equal(shortValues?.riskReward, 1);
});

test('custom stop and account sizing drive the risk-reward math', () => {
  const withPlan = applyPositionPlanPatch(baseLong, {
    stopPrice: 88,
    accountSize: 10000,
    riskPercent: 2,
  }, 12345);
  assert.equal(withPlan.updatedAt, 12345);

  const values = getPositionPlanEditorValues(withPlan);
  assert.equal(values?.stopPrice, 88);
  assert.equal(values?.stopIsCustom, true);
  assert.equal(values?.riskPerUnit, 2);
  assert.equal(values?.rewardPerUnit, 4);
  assert.equal(values?.riskReward, 2);
  assert.equal(values?.riskAmount, 200);
  assert.equal(values?.rewardAmount, 400);
  assert.equal(values?.quantity, 100);
});

test('entry and target patches update the drawing points in place', () => {
  const updated = applyPositionPlanPatch(baseLong, { entryPrice: 91, targetPrice: 97 }, 55);
  assert.equal(updated.points[0]?.price, 91);
  assert.equal(updated.points[0]?.time, 1);
  assert.equal(updated.points[1]?.price, 97);
  assert.equal(updated.points[1]?.time, 3);
  assert.equal(updated.position, undefined);
  assert.equal(updated.updatedAt, 55);
});

test('clearing every plan field drops the persisted position object', () => {
  const withPlan = applyPositionPlanPatch(baseLong, { stopPrice: 88, accountSize: 5000 });
  assert.notEqual(withPlan.position, undefined);

  const cleared = applyPositionPlanPatch(withPlan, { stopPrice: null, accountSize: null });
  assert.equal(cleared.position, undefined);

  const reset = resetPositionPlan(withPlan, 77);
  assert.equal(reset.position, undefined);
  assert.equal(reset.updatedAt, 77);
});

test('invalid stop placement yields no risk-reward instead of a bogus ratio', () => {
  const badStop = applyPositionPlanPatch(baseLong, { stopPrice: 95 });
  const values = getPositionPlanEditorValues(badStop);
  assert.equal(values?.riskReward, null);
  assert.equal(values?.quantity, null);
  assert.equal(formatPositionPlanRiskReward(values?.riskReward ?? null), '—');
});

test('position plan parsing and formatting are stable', () => {
  assert.equal(parsePositionPlanNumber(' 1.2345 '), 1.2345);
  assert.equal(parsePositionPlanNumber('0'), null);
  assert.equal(parsePositionPlanNumber('-5'), null);
  assert.equal(parsePositionPlanNumber('bad'), null);
  assert.equal(parsePositionPlanRiskPercent('250'), 100);
  assert.equal(formatPositionPlanNumber(86), '86');
  assert.equal(formatPositionPlanNumber(1.61803, 2), '1.62');
  assert.equal(formatPositionPlanNumber(null), '');
  assert.equal(formatPositionPlanRiskReward(2), '1 : 2');
  assert.equal(formatPositionPlanRiskReward(1.987), '1 : 1.99');
});

test('position plan editor ignores non-position drawings', () => {
  const fib: PersistedChartDrawing = { ...baseLong, id: 'fib_1', kind: 'fib' };
  assert.equal(getPositionPlanEditorValues(fib), null);
  assert.equal(applyPositionPlanPatch(fib, { stopPrice: 88 }), fib);
  assert.equal(resetPositionPlan(fib), fib);
});

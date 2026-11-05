import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartTimeframePickerController } from './chartTimeframePickerController';

test('route-local timeframe picker controllers do not reveal each other', () => {
  const chartController = createChartTimeframePickerController();
  const schemaController = createChartTimeframePickerController();
  const chartApplied: boolean[] = [];
  const schemaApplied: boolean[] = [];

  chartController.registerApplier((visible) => chartApplied.push(visible));
  schemaController.registerApplier((visible) => schemaApplied.push(visible));

  schemaController.show();

  assert.equal(schemaController.getSnapshot().visible, true);
  assert.equal(chartController.getSnapshot().visible, false);
  assert.deepEqual(schemaApplied, [false, true]);
  assert.deepEqual(chartApplied, [false]);

  schemaController.hide();

  assert.equal(schemaController.getSnapshot().visible, false);
  assert.equal(chartController.getSnapshot().visible, false);
  assert.deepEqual(schemaApplied, [false, true, false]);
  assert.deepEqual(chartApplied, [false]);
});

test('timeframe picker applies native visibility before publishing React state', () => {
  const controller = createChartTimeframePickerController();
  const events: string[] = [];

  controller.registerApplier((visible) => {
    events.push(`apply:${visible}:${controller.getSnapshot().visible}`);
  });
  controller.subscribe(() => {
    events.push(`publish:${controller.getSnapshot().visible}`);
  });

  controller.show();

  assert.deepEqual(events, [
    'apply:false:false',
    'apply:true:false',
    'publish:true',
  ]);
});

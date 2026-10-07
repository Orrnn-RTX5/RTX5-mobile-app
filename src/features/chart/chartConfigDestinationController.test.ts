import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartConfigDestinationController } from './chartConfigDestinationController';

test('a chart config destination is not revealed until its mounted revision lays out', () => {
  const controller = createChartConfigDestinationController();
  const events: string[] = [];

  controller.registerVisualApplier((destination) => {
    events.push(`visual:${destination ?? 'hidden'}`);
  });
  events.length = 0;
  controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
    events.push(`publish:${snapshot.destination}:${snapshot.ready}`);
  });

  const revision = controller.show('schema-colors');

  assert.deepEqual(events, ['publish:schema-colors:false']);
  assert.deepEqual(controller.getSnapshot(), {
    destination: 'schema-colors',
    ready: false,
    revision,
    visible: true,
  });

  events.length = 0;
  assert.equal(controller.revealMounted(revision), true);
  assert.deepEqual(events, [
    'visual:schema-colors',
    'publish:schema-colors:true',
  ]);
});

test('stale layout acknowledgements cannot reveal a replaced destination', () => {
  const controller = createChartConfigDestinationController();
  const visuals: Array<string | null> = [];
  controller.registerVisualApplier((destination) => visuals.push(destination));
  visuals.length = 0;

  const schemaRevision = controller.show('schema-colors');
  const alertsRevision = controller.show('alerts');

  assert.equal(controller.revealMounted(schemaRevision), false);
  assert.deepEqual(visuals, []);
  assert.equal(controller.revealMounted(alertsRevision), true);
  assert.deepEqual(visuals, ['alerts']);
  assert.equal(controller.getSnapshot().destination, 'alerts');
  assert.equal(controller.getSnapshot().ready, true);
});

test('a hidden mounting destination cannot be revealed by a queued layout event', () => {
  const controller = createChartConfigDestinationController();
  const visuals: Array<string | null> = [];
  controller.registerVisualApplier((destination) => visuals.push(destination));
  visuals.length = 0;

  const revision = controller.show('schema-colors');
  assert.equal(controller.hide(revision), true);
  visuals.length = 0;

  assert.equal(controller.revealMounted(revision), false);
  assert.deepEqual(visuals, []);
  assert.equal(controller.getSnapshot().visible, false);
  assert.equal(controller.getSnapshot().ready, false);
});

test('switching from a revealed destination hides it while the next body mounts', () => {
  const controller = createChartConfigDestinationController();
  const visuals: Array<string | null> = [];
  controller.registerVisualApplier((destination) => visuals.push(destination));
  visuals.length = 0;

  const priceRevision = controller.show('price-source');
  assert.equal(controller.revealMounted(priceRevision), true);
  visuals.length = 0;

  const orderModeRevision = controller.show('open-order-mode');

  assert.deepEqual(visuals, [null]);
  assert.equal(controller.getSnapshot().revision, orderModeRevision);
  assert.equal(controller.getSnapshot().ready, false);
  assert.equal(controller.getSnapshot().visible, true);
});

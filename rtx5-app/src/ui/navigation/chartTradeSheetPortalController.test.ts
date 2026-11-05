import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartTradeSheetPortalController } from './chartTradeSheetPortalController';

test('chart trade sheet portal publishes presentation and visible content invalidation', () => {
  const controller = createChartTradeSheetPortalController();
  const owner = Symbol('chart');
  let publications = 0;
  const unsubscribe = controller.subscribe(() => {
    publications += 1;
  });

  const unregister = controller.register(owner, () => 'sheet');
  assert.equal(publications, 1);
  assert.equal(controller.getSnapshot().keepMounted, false);

  assert.equal(controller.setPresentation(owner, {
    keepMounted: true,
    visible: true,
    top: 72,
    bottom: 24,
  }), true);
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.getSnapshot().renderCurrent?.(), 'sheet');

  const visibleRevision = controller.getSnapshot().revision;
  assert.equal(controller.invalidate(owner), true);
  assert.equal(controller.getSnapshot().revision, visibleRevision + 1);

  assert.equal(controller.setPresentation(owner, {
    keepMounted: true,
    visible: false,
    top: 72,
    bottom: 24,
  }), true);
  const hiddenRevision = controller.getSnapshot().revision;
  assert.equal(controller.invalidate(owner), false);
  assert.equal(controller.getSnapshot().revision, hiddenRevision);

  unregister();
  unsubscribe();
  assert.equal(controller.getSnapshot().owner, null);
});

test('stale portal cleanup cannot remove a newer chart owner', () => {
  const controller = createChartTradeSheetPortalController();
  const firstOwner = Symbol('first');
  const secondOwner = Symbol('second');
  const unregisterFirst = controller.register(firstOwner, () => 'first');
  const unregisterSecond = controller.register(secondOwner, () => 'second');

  unregisterFirst();
  assert.equal(controller.getSnapshot().owner, secondOwner);
  assert.equal(controller.getSnapshot().renderCurrent?.(), 'second');

  unregisterSecond();
  assert.equal(controller.getSnapshot().owner, null);
});

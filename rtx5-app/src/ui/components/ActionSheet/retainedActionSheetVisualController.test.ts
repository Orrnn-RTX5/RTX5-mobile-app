import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acknowledgeRetainedActionSheetVisible,
  cancelRetainedActionSheetPreview,
  commitRetainedActionSheetPreview,
  getRetainedActionSheetVisualSnapshot,
  parkRetainedActionSheetHostForConfigSwap,
  registerRetainedActionSheetHostParker,
  registerRetainedActionSheetVisualApplier,
  requestRetainedActionSheetPreview,
  resetRetainedActionSheetVisualControllerForTests,
  syncRetainedActionSheetVisual,
  type RetainedActionSheetVisualSnapshot,
} from './retainedActionSheetVisualController';

test.afterEach(() => {
  resetRetainedActionSheetVisualControllerForTests();
});

test('a matching retained preparation reveals only after the tap is committed', () => {
  const applied: RetainedActionSheetVisualSnapshot[] = [];
  registerRetainedActionSheetVisualApplier((snapshot) => {
    applied.push({ ...snapshot });
    return true;
  });

  const revision = requestRetainedActionSheetPreview('quotes|tap|EURUSD');
  assert.equal(applied.at(-1)?.mode, 'preview');
  assert.equal(applied.at(-1)?.visualKey, 'quotes|tap|EURUSD');

  assert.equal(
    commitRetainedActionSheetPreview(revision, 'quotes|tap|EURUSD'),
    true,
  );
  assert.equal(applied.at(-1)?.mode, 'committed');

  const appliedCountBeforeReactHandoff = applied.length;
  assert.equal(acknowledgeRetainedActionSheetVisible('quotes|tap|EURUSD'), true);
  assert.equal(applied.length, appliedCountBeforeReactHandoff);
  assert.equal(getRetainedActionSheetVisualSnapshot().mode, 'hidden');
});

test('stale gestures cannot commit or cancel a newer symbol preview', () => {
  const applied: RetainedActionSheetVisualSnapshot[] = [];
  registerRetainedActionSheetVisualApplier((snapshot) => {
    applied.push({ ...snapshot });
    return true;
  });

  const firstRevision = requestRetainedActionSheetPreview('quotes|tap|EURUSD');
  const secondRevision = requestRetainedActionSheetPreview('quotes|tap|BTCUSD');

  assert.equal(commitRetainedActionSheetPreview(firstRevision, 'quotes|tap|EURUSD'), false);
  assert.equal(cancelRetainedActionSheetPreview(firstRevision), false);
  assert.equal(getRetainedActionSheetVisualSnapshot().revision, secondRevision);
  assert.equal(getRetainedActionSheetVisualSnapshot().visualKey, 'quotes|tap|BTCUSD');
  assert.deepEqual(
    applied.slice(-2).map(({ mode, visualKey }) => ({ mode, visualKey })),
    [
      { mode: 'hidden', visualKey: null },
      { mode: 'preview', visualKey: 'quotes|tap|BTCUSD' },
    ],
  );
});

test('a drag cancellation is retained when the native applier registers late', () => {
  const revision = requestRetainedActionSheetPreview('quotes|tap|XAUUSD');
  assert.equal(cancelRetainedActionSheetPreview(revision), true);

  const applied: RetainedActionSheetVisualSnapshot[] = [];
  registerRetainedActionSheetVisualApplier((snapshot) => {
    applied.push({ ...snapshot });
    return true;
  });

  assert.deepEqual(applied.map(({ mode, visualKey }) => ({ mode, visualKey })), [
    { mode: 'hidden', visualKey: null },
  ]);
});

test('an exact pending preview can be synchronized after its content commits', () => {
  const applied: RetainedActionSheetVisualSnapshot[] = [];
  let contentReady = false;
  registerRetainedActionSheetVisualApplier((snapshot) => {
    applied.push({ ...snapshot });
    return snapshot.mode === 'hidden' || contentReady;
  });

  requestRetainedActionSheetPreview('quotes|tap|ETHUSD');
  assert.equal(applied.at(-1)?.mode, 'preview');
  contentReady = true;
  assert.equal(syncRetainedActionSheetVisual(), true);
  assert.equal(applied.at(-1)?.visualKey, 'quotes|tap|ETHUSD');
});

test('commit reports false when no mounted sheet owns the exact visual key', () => {
  registerRetainedActionSheetVisualApplier((snapshot) => (
    snapshot.mode === 'hidden' || snapshot.visualKey === 'quotes|tap|EURUSD'
  ));

  const revision = requestRetainedActionSheetPreview('quotes|tap|BTCUSD');
  assert.equal(commitRetainedActionSheetPreview(revision, 'quotes|tap|BTCUSD'), false);
  assert.equal(getRetainedActionSheetVisualSnapshot().mode, 'committed');
  assert.equal(cancelRetainedActionSheetPreview(revision), true);
});

test('multiple mounted ActionSheets keep their appliers until each one unregisters', () => {
  const firstApplied: RetainedActionSheetVisualSnapshot[] = [];
  const secondApplied: RetainedActionSheetVisualSnapshot[] = [];
  const unregisterFirst = registerRetainedActionSheetVisualApplier((snapshot) => {
    firstApplied.push({ ...snapshot });
    return snapshot.visualKey === 'quotes|tap|EURUSD';
  });
  registerRetainedActionSheetVisualApplier((snapshot) => {
    secondApplied.push({ ...snapshot });
    return snapshot.visualKey === 'quotes|tap|BTCUSD';
  });

  requestRetainedActionSheetPreview('quotes|tap|EURUSD');
  assert.equal(firstApplied.at(-1)?.visualKey, 'quotes|tap|EURUSD');
  assert.equal(secondApplied.at(-1)?.visualKey, 'quotes|tap|EURUSD');

  unregisterFirst();
  requestRetainedActionSheetPreview('quotes|tap|BTCUSD');
  assert.equal(firstApplied.at(-1)?.visualKey, 'quotes|tap|EURUSD');
  assert.equal(secondApplied.at(-1)?.visualKey, 'quotes|tap|BTCUSD');
});

test('a config swap parks only the mounted host that owns the outgoing visual key', () => {
  const parked: string[] = [];
  const unregisterFirst = registerRetainedActionSheetHostParker((visualKey) => {
    if (visualKey !== 'chart.symbolPicker') {
      return false;
    }
    parked.push(`first:${visualKey}`);
    return true;
  });
  registerRetainedActionSheetHostParker((visualKey) => {
    if (visualKey !== 'trade.bulk') {
      return false;
    }
    parked.push(`second:${visualKey}`);
    return true;
  });

  assert.equal(
    parkRetainedActionSheetHostForConfigSwap('chart.symbolPicker'),
    true,
  );
  assert.deepEqual(parked, ['first:chart.symbolPicker']);

  unregisterFirst();
  assert.equal(
    parkRetainedActionSheetHostForConfigSwap('chart.symbolPicker'),
    false,
  );
  assert.deepEqual(parked, ['first:chart.symbolPicker']);
});

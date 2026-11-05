import assert from 'node:assert/strict';
import test from 'node:test';

import {
  disposeChartSymbolPickerSheet,
  getChartSymbolPickerSheetSnapshot,
  hideChartSymbolPickerSheet,
  isChartSymbolPickerSheetActive,
  preloadChartSymbolPickerSheet,
  resetChartSymbolPickerSheetControllerForTests,
  showChartSymbolPickerSheet,
  subscribeChartSymbolPickerSheet,
  type ChartSymbolPickerSheetConfig,
} from './chartSymbolPickerSheetController';

const createConfig = (visualKey: string): ChartSymbolPickerSheetConfig => Object.freeze({
  actions: [{ label: visualKey }],
  visualKey,
});

test.afterEach(() => {
  resetChartSymbolPickerSheetControllerForTests();
});

test('a first tap before preload opens synchronously through React visibility', () => {
  const config = createConfig('chart.symbolPicker:first-tap');
  const revisions: number[] = [];
  const unsubscribe = subscribeChartSymbolPickerSheet(() => {
    revisions.push(getChartSymbolPickerSheetSnapshot().revision);
  });

  assert.equal(showChartSymbolPickerSheet(config), true);
  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config,
    hostEpoch: 0,
    revision: 1,
    visible: true,
  });
  assert.equal(isChartSymbolPickerSheetActive(), true);
  assert.deepEqual(revisions, [1]);

  assert.equal(hideChartSymbolPickerSheet(), true);
  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config,
    hostEpoch: 1,
    revision: 2,
    visible: false,
  });
  assert.deepEqual(revisions, [1, 2]);
  unsubscribe();
});

test('twenty reopen cycles replace the hidden native host after every close', () => {
  const config = createConfig('chart.symbolPicker:repeated');

  assert.equal(preloadChartSymbolPickerSheet(config), true);
  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config,
    hostEpoch: 0,
    revision: 1,
    visible: false,
  });

  for (let cycle = 0; cycle < 20; cycle += 1) {
    const revisionBeforeOpen = getChartSymbolPickerSheetSnapshot().revision;

    assert.equal(showChartSymbolPickerSheet(config), true);
    assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
      config,
      hostEpoch: cycle,
      revision: revisionBeforeOpen + 1,
      visible: true,
    });
    assert.equal(isChartSymbolPickerSheetActive(), true);

    assert.equal(hideChartSymbolPickerSheet(), true);
    assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
      config,
      hostEpoch: cycle + 1,
      revision: revisionBeforeOpen + 2,
      visible: false,
    });
    assert.equal(isChartSymbolPickerSheetActive(), false);
  }
});

test('a duplicate show while open does not restart or republish the sheet', () => {
  const config = createConfig('chart.symbolPicker:duplicate');
  let notifications = 0;
  const unsubscribe = subscribeChartSymbolPickerSheet(() => {
    notifications += 1;
  });

  preloadChartSymbolPickerSheet(config);
  assert.equal(showChartSymbolPickerSheet(config), true);
  const openSnapshot = getChartSymbolPickerSheetSnapshot();
  const notificationsAfterOpen = notifications;

  assert.equal(showChartSymbolPickerSheet(config), false);
  assert.equal(getChartSymbolPickerSheetSnapshot(), openSnapshot);
  assert.equal(notifications, notificationsAfterOpen);
  assert.equal(isChartSymbolPickerSheetActive(), true);

  hideChartSymbolPickerSheet();
  unsubscribe();
});

test('an already hidden sheet is not republished or replaced again', () => {
  const config = createConfig('chart.symbolPicker:hidden-idempotence');
  let notifications = 0;
  const unsubscribe = subscribeChartSymbolPickerSheet(() => {
    notifications += 1;
  });

  preloadChartSymbolPickerSheet(config);
  showChartSymbolPickerSheet(config);
  hideChartSymbolPickerSheet();
  const hiddenSnapshot = getChartSymbolPickerSheetSnapshot();
  const notificationsAfterClose = notifications;

  assert.equal(hideChartSymbolPickerSheet(), false);
  assert.equal(getChartSymbolPickerSheetSnapshot(), hiddenSnapshot);
  assert.equal(getChartSymbolPickerSheetSnapshot().hostEpoch, 1);
  assert.equal(notifications, notificationsAfterClose);
  unsubscribe();
});

test('config updates received while open are deferred until the sheet closes', () => {
  const initialConfig = createConfig('chart.symbolPicker:initial');
  const deferredConfig = createConfig('chart.symbolPicker:deferred');
  const latestDeferredConfig = createConfig('chart.symbolPicker:latest');

  assert.equal(preloadChartSymbolPickerSheet(initialConfig), true);
  assert.equal(showChartSymbolPickerSheet(initialConfig), true);
  assert.equal(getChartSymbolPickerSheetSnapshot().config, initialConfig);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, true);

  assert.equal(preloadChartSymbolPickerSheet(deferredConfig), false);
  assert.equal(showChartSymbolPickerSheet(latestDeferredConfig), false);
  assert.equal(getChartSymbolPickerSheetSnapshot().config, initialConfig);

  assert.equal(hideChartSymbolPickerSheet(), true);
  assert.equal(getChartSymbolPickerSheetSnapshot().config, latestDeferredConfig);
  assert.equal(getChartSymbolPickerSheetSnapshot().hostEpoch, 1);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, false);

  assert.equal(showChartSymbolPickerSheet(latestDeferredConfig), true);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, true);
});

test('dispose and test reset clear visible and deferred controller state', () => {
  const firstConfig = createConfig('chart.symbolPicker:dispose');
  const deferredConfig = createConfig('chart.symbolPicker:deferred-dispose');
  const resetConfig = createConfig('chart.symbolPicker:reset');
  let notifications = 0;
  const unsubscribe = subscribeChartSymbolPickerSheet(() => {
    notifications += 1;
  });

  preloadChartSymbolPickerSheet(firstConfig);
  assert.equal(showChartSymbolPickerSheet(firstConfig), true);
  preloadChartSymbolPickerSheet(deferredConfig);
  disposeChartSymbolPickerSheet();

  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config: null,
    hostEpoch: 0,
    revision: 3,
    visible: false,
  });
  assert.equal(isChartSymbolPickerSheetActive(), false);

  preloadChartSymbolPickerSheet(resetConfig);
  assert.equal(showChartSymbolPickerSheet(resetConfig), true);
  resetChartSymbolPickerSheetControllerForTests();

  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config: null,
    hostEpoch: 0,
    revision: 0,
    visible: false,
  });
  assert.equal(isChartSymbolPickerSheetActive(), false);
  assert.equal(hideChartSymbolPickerSheet(), false);
  assert.equal(notifications, 6);
  unsubscribe();
});

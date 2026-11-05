import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  chartActionLaunchController,
  createChartActionLaunchController,
  scheduleChartActionLaunchCovered,
  scheduleChartActionLaunchNavigation,
  type ChartActionLaunchDestination,
} from './chartActionLaunchController';

const DESTINATIONS: ChartActionLaunchDestination[] = [
  'objects',
  'calculator',
  'analytics',
  'specification',
];

test('chart action launch controller reveals every retained shell before route coverage', () => {
  const controller = createChartActionLaunchController();
  const visualEvents: Array<ChartActionLaunchDestination | null> = [];
  const unregister = controller.registerVisualApplier((destination) => {
    visualEvents.push(destination);
  });
  visualEvents.length = 0;

  controller.prepare('XAUUSDm');
  assert.equal(controller.getSnapshot().symbol, 'XAUUSDM');
  assert.equal(controller.getSnapshot().phase, 'prepared');

  for (const destination of DESTINATIONS) {
    const revision = controller.show(destination, 'XAUUSDm');
    assert.equal(visualEvents.at(-1), destination);
    assert.equal(controller.getSnapshot().visible, true);
    controller.prepare('XAUUSDm');
    controller.prepare('BTCUSD');
    assert.equal(controller.getSnapshot().revision, revision);
    assert.equal(controller.getSnapshot().destination, destination);
    assert.equal(controller.getSnapshot().visible, true);
    assert.equal(visualEvents.at(-1), destination);
    assert.equal(controller.startNavigation(revision + 1), false);
    assert.equal(controller.startNavigation(revision), true);
    assert.equal(controller.startNavigation(revision), false);
    assert.equal(controller.markCovered(destination, revision + 1), false);
    assert.equal(controller.markCovered(destination, revision), true);
    assert.equal(visualEvents.at(-1), null);
    assert.equal(controller.getSnapshot().phase, 'covered');
    assert.equal(controller.complete(destination, revision), true);
    assert.equal(controller.getSnapshot().phase, 'hidden');
  }

  unregister();
});

test('chart action launch navigation waits for one cover frame', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let frameQueue: Array<(timestamp: number) => void> = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
  });

  try {
    const revision = chartActionLaunchController.show('analytics', 'BTCUSD');
    let navigations = 0;
    scheduleChartActionLaunchNavigation(revision, () => {
      navigations += 1;
    });
    assert.equal(navigations, 0);

    const callbacks = frameQueue;
    frameQueue = [];
    callbacks.forEach((callback) => callback(0));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));

    assert.equal(navigations, 1);
    assert.equal(chartActionLaunchController.getSnapshot().navigationStarted, true);
  } finally {
    chartActionLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('hiding a chart action cover cancels its scheduled route', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let frameQueue: Array<(timestamp: number) => void> = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
  });

  try {
    const revision = chartActionLaunchController.show('objects', 'EURUSD');
    let navigations = 0;
    scheduleChartActionLaunchNavigation(revision, () => {
      navigations += 1;
    });
    chartActionLaunchController.hide(revision);

    const callbacks = frameQueue;
    frameQueue = [];
    callbacks.forEach((callback) => callback(0));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));

    assert.equal(navigations, 0);
    assert.equal(chartActionLaunchController.isVisible(), false);
  } finally {
    chartActionLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('real route coverage waits two frames and requires the exact explicit revision', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let frameQueue: Array<(timestamp: number) => void> = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
  });

  try {
    const revision = chartActionLaunchController.show('calculator', 'BTCUSD');
    scheduleChartActionLaunchCovered('calculator');
    scheduleChartActionLaunchCovered('analytics', revision);
    scheduleChartActionLaunchCovered('calculator', revision + 1);
    assert.equal(frameQueue.length, 0);

    scheduleChartActionLaunchCovered('calculator', revision);
    assert.equal(frameQueue.length, 1);
    assert.equal(chartActionLaunchController.getSnapshot().phase, 'launching');

    const firstFrame = frameQueue;
    frameQueue = [];
    firstFrame.forEach((callback) => callback(0));
    assert.equal(frameQueue.length, 1);
    assert.equal(chartActionLaunchController.getSnapshot().phase, 'launching');

    const secondFrame = frameQueue;
    frameQueue = [];
    secondFrame.forEach((callback) => callback(16));
    assert.equal(chartActionLaunchController.getSnapshot().phase, 'launching', 'coverage follows the second paint');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(chartActionLaunchController.getSnapshot().phase, 'covered');
  } finally {
    chartActionLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('chart action launch singleton is versioned across development refreshes', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/chartActionLaunchController.ts'),
    'utf8',
  );
  assert.match(source, /CHART_ACTION_LAUNCH_CONTROLLER_VERSION = 6/);
  assert.match(source, /__rtx5ChartActionLaunchControllerVersion === CHART_ACTION_LAUNCH_CONTROLLER_VERSION/);
  assert.match(source, /__rtx5ChartActionLaunchControllerVersion = CHART_ACTION_LAUNCH_CONTROLLER_VERSION/);
});

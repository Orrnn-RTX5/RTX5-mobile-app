import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createQuoteInfoLaunchController,
  quoteInfoLaunchController,
  scheduleQuoteInfoLaunchNavigation,
} from './quoteInfoLaunchController';

test('quote-info launch controller prepares both exact shells and tracks route coverage', () => {
  const controller = createQuoteInfoLaunchController();
  const visualEvents: Array<string | null> = [];
  const unregisterVisual = controller.registerVisualApplier((destination) => {
    visualEvents.push(destination);
  });
  visualEvents.length = 0;

  controller.prepare('XAUUSDm');
  assert.equal(controller.getSnapshot().symbol, 'XAUUSDM');
  assert.equal(controller.getSnapshot().phase, 'prepared');

  const revision = controller.show('market-statistics', 'XAUUSDm');
  assert.deepEqual(visualEvents, ['market-statistics']);
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.startNavigation(revision + 1), false);
  assert.equal(controller.startNavigation(revision), true);
  assert.equal(controller.markCovered('properties'), false);
  assert.equal(controller.markCovered('market-statistics'), true);
  assert.deepEqual(visualEvents, ['market-statistics', null]);
  assert.equal(controller.getSnapshot().phase, 'covered');
  assert.equal(controller.getSnapshot().visible, false);
  assert.equal(controller.complete('market-statistics'), true);
  assert.equal(controller.getSnapshot().phase, 'hidden');
  assert.deepEqual(
    visualEvents,
    ['market-statistics', null],
    'covered routes must not repeat the synchronous UI hide during Back',
  );

  unregisterVisual();
});

test('quote-info launch singleton is versioned so a cleared bundle cannot reuse stale logic', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/quotes/quoteInfoLaunchController.ts'),
    'utf8',
  );
  assert.match(source, /QUOTE_INFO_LAUNCH_CONTROLLER_VERSION = 2/);
  assert.match(source, /__rtx5QuoteInfoLaunchControllerVersion === QUOTE_INFO_LAUNCH_CONTROLLER_VERSION/);
  assert.match(source, /__rtx5QuoteInfoLaunchControllerVersion = QUOTE_INFO_LAUNCH_CONTROLLER_VERSION/);
});

test('closing the quote-info shell cancels scheduled native navigation', async () => {
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
    const revision = quoteInfoLaunchController.show('properties', 'EURUSD');
    let navigations = 0;
    scheduleQuoteInfoLaunchNavigation(revision, () => {
      navigations += 1;
    });
    quoteInfoLaunchController.hide(revision);

    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(navigations, 0);
    assert.equal(quoteInfoLaunchController.isVisible(), false);
  } finally {
    quoteInfoLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('quote-info back cover re-reveals the shell and marks navigation started', () => {
  const controller = createQuoteInfoLaunchController();
  const visualEvents: Array<string | null> = [];
  const unregisterVisual = controller.registerVisualApplier((destination) => {
    visualEvents.push(destination);
  });
  visualEvents.length = 0;

  const openRevision = controller.show('properties', 'EURUSD');
  assert.equal(controller.startNavigation(openRevision), true);
  assert.equal(controller.markCovered('properties'), true);
  assert.equal(controller.getSnapshot().visible, false);
  visualEvents.length = 0;

  // Back cover must paint the shell again even after markCovered hid it.
  const backRevision = controller.show('properties', 'EURUSD');
  assert.deepEqual(visualEvents, ['properties']);
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.startNavigation(backRevision), true);
  assert.equal(controller.hide(backRevision), true);
  assert.equal(controller.getSnapshot().visible, false);

  unregisterVisual();
});

test('quote-info launch navigation starts after one paint frame', async () => {
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
    const revision = quoteInfoLaunchController.show('market-statistics', 'XAUUSD');
    let navigations = 0;
    scheduleQuoteInfoLaunchNavigation(revision, () => {
      navigations += 1;
    });

    assert.equal(navigations, 0);
    const callbacks = frameQueue;
    frameQueue = [];
    callbacks.forEach((callback) => callback(0));
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(navigations, 1);
    assert.equal(quoteInfoLaunchController.getSnapshot().navigationStarted, true);
  } finally {
    quoteInfoLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

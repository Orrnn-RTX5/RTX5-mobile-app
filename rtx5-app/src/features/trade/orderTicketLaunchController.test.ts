import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOrderTicketLaunchController,
  scheduleOrderTicketLaunchNavigation,
  orderTicketLaunchController,
} from './orderTicketLaunchController';

test('order-ticket launch controller prepares, reveals, and hides synchronously', () => {
  const controller = createOrderTicketLaunchController();
  const visualEvents: boolean[] = [];
  const snapshotEvents: string[] = [];
  const unregisterVisual = controller.registerVisualApplier((visible) => {
    visualEvents.push(visible);
  });
  const unsubscribe = controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
    snapshotEvents.push(`${snapshot.visible}:${snapshot.symbol}:${snapshot.origin}:${snapshot.navigationStarted}`);
  });
  visualEvents.length = 0;

  controller.prepare('XAUUSDm', 'chart');
  assert.equal(controller.getSnapshot().symbol, 'XAUUSDM');
  assert.equal(controller.getSnapshot().visible, false);
  assert.equal(controller.getSnapshot().origin, 'chart');

  const revision = controller.show('XAUUSDm', 'quotes');
  assert.deepEqual(visualEvents, [true]);
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.getSnapshot().origin, 'quotes');
  // Idle prepare must not kill a visible shell mid Buy/Sell navigation race.
  controller.prepare('EURUSD', 'trade');
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.getSnapshot().symbol, 'XAUUSDM');
  assert.equal(controller.getSnapshot().origin, 'quotes');
  assert.equal(controller.startNavigation(revision + 1), false);
  assert.equal(controller.startNavigation(revision), true);
  assert.equal(controller.getSnapshot().navigationStarted, true);
  assert.equal(controller.startNavigation(revision), false);
  assert.equal(controller.hide(revision + 1), false);
  assert.equal(controller.hide(revision), true);
  assert.deepEqual(visualEvents, [true, false]);
  assert.equal(controller.getSnapshot().visible, false);
  assert.ok(snapshotEvents.includes('true:XAUUSDM:quotes:false'));
  assert.ok(snapshotEvents.includes('true:XAUUSDM:quotes:true'));

  unregisterVisual();
  unsubscribe();
});

test('scheduled native navigation is cancelled when the optimistic shell closes', async () => {
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
    const revision = orderTicketLaunchController.show('EURUSD');
    let navigations = 0;
    let cancellations = 0;
    scheduleOrderTicketLaunchNavigation(revision, () => {
      navigations += 1;
    }, () => {
      cancellations += 1;
    });
    orderTicketLaunchController.hide(revision);

    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };
    flushFrame();
    flushFrame();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(navigations, 0);
    assert.equal(cancellations, 1);
    assert.equal(orderTicketLaunchController.isVisible(), false);
  } finally {
    orderTicketLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('order-ticket launch navigation starts after the shell paint frames', async () => {
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
    const revision = orderTicketLaunchController.show('EURUSD', 'chart');
    let navigations = 0;
    scheduleOrderTicketLaunchNavigation(revision, () => {
      navigations += 1;
    });

    assert.equal(navigations, 0);
    // rAF is before paint; route construction must wait until after it.
    const first = frameQueue;
    frameQueue = [];
    first.forEach((callback) => callback(0));
    assert.equal(navigations, 0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(navigations, 1);
    assert.equal(orderTicketLaunchController.getSnapshot().navigationStarted, true);
    assert.equal(orderTicketLaunchController.getSnapshot().origin, 'chart');
  } finally {
    orderTicketLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

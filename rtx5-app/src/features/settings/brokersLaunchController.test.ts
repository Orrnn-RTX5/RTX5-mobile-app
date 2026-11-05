import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brokersLaunchController,
  createBrokersLaunchController,
  scheduleBrokersLaunchCoverRemoval,
  scheduleBrokersLaunchNavigation,
  showBrokersReturnLaunch,
} from './brokersLaunchController';

test('brokers launch controller reveals, starts navigation, and hides synchronously', () => {
  const controller = createBrokersLaunchController();
  const visualEvents: boolean[] = [];
  const snapshotEvents: string[] = [];
  const unregisterVisual = controller.registerVisualApplier((visible) => {
    visualEvents.push(visible);
  });
  const unsubscribe = controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
    snapshotEvents.push(`${snapshot.visible}:${snapshot.navigationStarted}:${snapshot.revision}`);
  });
  visualEvents.length = 0;

  assert.deepEqual(controller.getSnapshot(), {
    visible: false,
    navigationStarted: false,
    revision: 0,
  });
  assert.equal(Object.isFrozen(controller.getSnapshot()), true);

  const revision = controller.show();
  assert.deepEqual(visualEvents, [true]);
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.startNavigation(revision + 1), false);
  assert.equal(controller.startNavigation(revision), true);
  assert.equal(controller.startNavigation(revision), false);
  assert.equal(controller.getSnapshot().navigationStarted, true);
  assert.equal(controller.hide(revision + 1), false);
  assert.equal(controller.hide(revision), true);
  assert.deepEqual(visualEvents, [true, false]);
  assert.equal(controller.getSnapshot().visible, false);
  assert.ok(snapshotEvents.includes(`true:false:${revision}`));
  assert.ok(snapshotEvents.includes(`true:true:${revision}`));

  unregisterVisual();
  unsubscribe();
});

test('Brokers return launch is immediately marked committed for a chained Back', () => {
  brokersLaunchController.hide();

  try {
    const revision = showBrokersReturnLaunch();
    const snapshot = brokersLaunchController.getSnapshot();

    assert.equal(snapshot.visible, true);
    assert.equal(snapshot.navigationStarted, true);
    assert.equal(snapshot.revision, revision);
    assert.equal(brokersLaunchController.startNavigation(revision), false);
  } finally {
    brokersLaunchController.hide();
  }
});

test('scheduled Brokers cover removal waits for two paints and cannot hide a newer launch', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let frameQueue: Array<(timestamp: number) => void> = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
  });

  const flushFrame = () => {
    const callbacks = frameQueue;
    frameQueue = [];
    callbacks.forEach((callback) => callback(0));
  };

  try {
    const revision = brokersLaunchController.show();
    scheduleBrokersLaunchCoverRemoval(revision);

    assert.equal(frameQueue.length, 1);
    assert.equal(brokersLaunchController.isVisible(), true);
    flushFrame();
    assert.equal(frameQueue.length, 1);
    assert.equal(brokersLaunchController.isVisible(), true);
    flushFrame();
    assert.equal(frameQueue.length, 0);
    assert.equal(brokersLaunchController.isVisible(), true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(brokersLaunchController.isVisible(), false);

    const staleRevision = brokersLaunchController.show();
    scheduleBrokersLaunchCoverRemoval(staleRevision);
    const latestRevision = brokersLaunchController.show();
    flushFrame();
    flushFrame();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(brokersLaunchController.isVisible(), true);
    assert.equal(brokersLaunchController.getSnapshot().revision, latestRevision);
  } finally {
    brokersLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('scheduled Brokers navigation waits for two preview paint frames', async () => {
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
    const revision = brokersLaunchController.show();
    let navigations = 0;
    scheduleBrokersLaunchNavigation(revision, () => {
      navigations += 1;
    });

    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };

    assert.equal(navigations, 0);
    assert.equal(frameQueue.length, 1);
    flushFrame();
    assert.equal(navigations, 0);
    assert.equal(frameQueue.length, 1);
    flushFrame();
    assert.equal(navigations, 0);
    assert.equal(frameQueue.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(navigations, 1);
    assert.equal(brokersLaunchController.getSnapshot().navigationStarted, true);
  } finally {
    brokersLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('scheduled Brokers navigation is cancelled when the shell closes', async () => {
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
    const revision = brokersLaunchController.show();
    let navigations = 0;
    scheduleBrokersLaunchNavigation(revision, () => {
      navigations += 1;
    });
    brokersLaunchController.hide(revision);

    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };
    flushFrame();
    flushFrame();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(navigations, 0);
    assert.equal(brokersLaunchController.isVisible(), false);
  } finally {
    brokersLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('hiding Brokers launch always forces its native visual layer down', () => {
  const controller = createBrokersLaunchController();
  const visualEvents: boolean[] = [];
  controller.registerVisualApplier((visible) => visualEvents.push(visible));
  visualEvents.length = 0;

  assert.equal(controller.hide(), false);
  assert.deepEqual(visualEvents, [false]);

  controller.show();
  assert.equal(controller.hide(), true);
  visualEvents.length = 0;
  assert.equal(controller.hide(), false);
  assert.deepEqual(visualEvents, [false]);
});

test('Brokers shell has a five-second safety fallback', () => {
  const originalSetTimeout = globalThis.setTimeout;
  let fallbackCallback: (() => void) | null = null;
  let fallbackDelay: number | undefined;

  globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number) => {
    fallbackCallback = callback;
    fallbackDelay = delay;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    const controller = createBrokersLaunchController();
    const visualEvents: boolean[] = [];
    controller.registerVisualApplier((visible) => visualEvents.push(visible));
    visualEvents.length = 0;

    const revision = controller.show();
    assert.equal(fallbackDelay, 5_000);
    assert.ok(fallbackCallback);
    const runFallback = fallbackCallback as unknown as () => void;
    runFallback();

    assert.deepEqual(visualEvents, [true, false]);
    assert.equal(controller.getSnapshot().visible, false);
    assert.equal(controller.getSnapshot().revision, revision + 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brokerDetailLaunchController,
  createBrokerDetailLaunchController,
  scheduleBrokerDetailLaunchCoverRemoval,
  scheduleBrokerDetailLaunchNavigation,
  showBrokerDetailReturnLaunch,
  type BrokerDetailLaunchSelection,
} from './brokerDetailLaunchController';

const GTA: BrokerDetailLaunchSelection = {
  brokerId: 'gta_broker',
  brokerName: 'Grow Trading Academy',
  brokerServer: 'RTX5-Live',
  brokerServerUrl: 'https://example.test',
  brokerLogoUrl: 'https://example.test/logo.png',
  brokerDomain: 'growtradingacademy.com',
};

test('broker-detail launch keeps the exact prepared live broker and reveals synchronously', () => {
  const controller = createBrokerDetailLaunchController();
  const visualEvents: boolean[] = [];
  controller.registerVisualApplier((visible) => visualEvents.push(visible));
  visualEvents.length = 0;

  controller.prepare(GTA);
  assert.equal(controller.getSnapshot().visible, false);
  assert.deepEqual(controller.getSnapshot().selection, GTA);
  const preparedSelection = controller.getSnapshot().selection;

  const revision = controller.show(GTA);
  assert.deepEqual(visualEvents, [true]);
  assert.equal(controller.getSnapshot().revision, revision);
  assert.deepEqual(controller.getSnapshot().selection, GTA);
  assert.equal(controller.getSnapshot().selection, preparedSelection);
  assert.equal(controller.startNavigation(revision + 1), false);
  assert.equal(controller.startNavigation(revision), true);
  assert.equal(controller.startNavigation(revision), false);
  assert.equal(controller.hide(revision + 1), false);
  assert.equal(controller.hide(revision), true);
  assert.deepEqual(visualEvents, [true, false]);
});

test('broker-detail return launch is immediately marked committed for a chained Back', () => {
  brokerDetailLaunchController.hide();

  try {
    const revision = showBrokerDetailReturnLaunch(GTA);
    const snapshot = brokerDetailLaunchController.getSnapshot();

    assert.equal(snapshot.visible, true);
    assert.equal(snapshot.navigationStarted, true);
    assert.equal(snapshot.revision, revision);
    assert.deepEqual(snapshot.selection, GTA);
    assert.equal(brokerDetailLaunchController.startNavigation(revision), false);
  } finally {
    brokerDetailLaunchController.hide();
  }
});

test('scheduled broker-detail cover removal waits for two paints and cannot hide a newer launch', async () => {
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
    const revision = brokerDetailLaunchController.show(GTA);
    scheduleBrokerDetailLaunchCoverRemoval(revision);

    assert.equal(frameQueue.length, 1);
    assert.equal(brokerDetailLaunchController.isVisible(), true);
    flushFrame();
    assert.equal(frameQueue.length, 1);
    assert.equal(brokerDetailLaunchController.isVisible(), true);
    flushFrame();
    assert.equal(frameQueue.length, 0);
    assert.equal(brokerDetailLaunchController.isVisible(), true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(brokerDetailLaunchController.isVisible(), false);

    const staleRevision = brokerDetailLaunchController.show(GTA);
    scheduleBrokerDetailLaunchCoverRemoval(staleRevision);
    const latestRevision = brokerDetailLaunchController.show(GTA);
    flushFrame();
    flushFrame();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(brokerDetailLaunchController.isVisible(), true);
    assert.equal(brokerDetailLaunchController.getSnapshot().revision, latestRevision);
  } finally {
    brokerDetailLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('scheduled broker-detail navigation waits for two preview paint frames', async () => {
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
    const revision = brokerDetailLaunchController.show(GTA);
    let navigations = 0;
    scheduleBrokerDetailLaunchNavigation(revision, () => { navigations += 1; });
    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };

    assert.equal(frameQueue.length, 1);
    flushFrame();
    assert.equal(navigations, 0);
    assert.equal(frameQueue.length, 1);
    flushFrame();
    assert.equal(navigations, 0);
    assert.equal(frameQueue.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(navigations, 1);
  } finally {
    brokerDetailLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('closing a broker-detail preview cancels its stale scheduled navigation', async () => {
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
    const revision = brokerDetailLaunchController.show(GTA);
    let navigations = 0;
    scheduleBrokerDetailLaunchNavigation(revision, () => { navigations += 1; });
    brokerDetailLaunchController.hide(revision);
    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };
    flushFrame();
    flushFrame();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(navigations, 0);
  } finally {
    brokerDetailLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('hiding broker-detail launch forces the visual layer down even after the snapshot is hidden', () => {
  const controller = createBrokerDetailLaunchController();
  const visualEvents: boolean[] = [];
  controller.registerVisualApplier((visible) => visualEvents.push(visible));
  visualEvents.length = 0;

  assert.equal(controller.hide(), false);
  assert.deepEqual(visualEvents, [false]);

  const revision = controller.show(GTA);
  assert.equal(controller.markCovered(), true);
  assert.equal(controller.getSnapshot().visible, false);
  visualEvents.length = 0;

  assert.equal(controller.hide(revision), false);
  assert.deepEqual(visualEvents, []);

  assert.equal(controller.hide(), false);
  assert.deepEqual(visualEvents, [false]);
});

test('broker-detail preview has a five-second failure fallback', () => {
  const originalSetTimeout = globalThis.setTimeout;
  let fallbackCallback: (() => void) | null = null;
  let fallbackDelay: number | undefined;
  globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number) => {
    fallbackCallback = callback;
    fallbackDelay = delay;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    const controller = createBrokerDetailLaunchController();
    controller.show(GTA);
    assert.equal(fallbackDelay, 5_000);
    assert.ok(fallbackCallback);
    (fallbackCallback as unknown as () => void)();
    assert.equal(controller.isVisible(), false);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

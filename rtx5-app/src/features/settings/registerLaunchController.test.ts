import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRegisterLaunchController,
  registerLaunchController,
  scheduleRegisterLaunchCoverRemoval,
  scheduleRegisterLaunchNavigation,
} from './registerLaunchController';
import type { BrokerDetailLaunchSelection } from './brokerDetailLaunchController';

const GTA: BrokerDetailLaunchSelection = Object.freeze({
  brokerId: 'gta_broker',
  brokerName: 'Grow Trading Academy',
  brokerServer: 'GrowTradingAcademy-Live',
  brokerServerUrl: 'https://services.growtradingacademy.com',
  brokerLogoUrl: 'https://example.test/gta-logo.png',
  brokerDomain: 'growtradingacademy.com',
});

type FrameCallback = (timestamp: number) => void;

function installFrameQueue() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let frameQueue: FrameCallback[] = [];

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameCallback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
  });

  return {
    count: () => frameQueue.length,
    flush: () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    },
    restore: () => {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
      } else {
        delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      }
    },
  };
}

test('register launch reveals, navigates single-flight, and hides with revision guards', () => {
  const controller = createRegisterLaunchController();
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
    routeMounted: false,
    backRequested: false,
    selection: null,
    revision: 0,
  });
  assert.equal(Object.isFrozen(controller.getSnapshot()), true);

  const revision = controller.show(GTA);
  assert.deepEqual(visualEvents, [true]);
  assert.equal(controller.getSnapshot().selection, GTA);
  assert.equal(controller.startNavigation(revision + 1), false);
  assert.equal(controller.startNavigation(revision), true);
  assert.equal(controller.startNavigation(revision), false);
  assert.equal(controller.hide(revision + 1), false);
  assert.equal(controller.hide(revision), true);
  assert.deepEqual(visualEvents, [true, false]);
  assert.ok(snapshotEvents.includes(`true:false:${revision}`));
  assert.ok(snapshotEvents.includes(`true:true:${revision}`));

  unregisterVisual();
  unsubscribe();
});

test('requesting Back before register navigation starts cancels the preview intent', () => {
  const controller = createRegisterLaunchController();
  const revision = controller.show(GTA);

  try {
    assert.equal(controller.requestBack(revision + 1), 'stale');
    assert.equal(controller.requestBack(revision), 'cancel');
    assert.equal(controller.getSnapshot().navigationStarted, false);
    assert.equal(controller.getSnapshot().routeMounted, false);
    assert.equal(controller.getSnapshot().backRequested, false);
  } finally {
    controller.hide();
  }
});

test('Back after navigation starts waits for mount and duplicate Back is handled once', () => {
  const controller = createRegisterLaunchController();
  const revision = controller.show(GTA);

  try {
    assert.equal(controller.startNavigation(revision), true);
    assert.equal(controller.requestBack(revision), 'wait');
    assert.equal(controller.getSnapshot().backRequested, true);
    assert.equal(controller.getSnapshot().routeMounted, false);
    assert.equal(controller.requestBack(revision), 'handled');
    assert.equal(controller.markRouteMounted(revision), 'back-requested');
    assert.equal(controller.getSnapshot().routeMounted, true);
    assert.equal(controller.markRouteMounted(revision + 1), 'stale');
  } finally {
    controller.hide();
  }
});

test('Back requests pop immediately after the register route is mounted', () => {
  const controller = createRegisterLaunchController();
  const revision = controller.show(GTA);

  try {
    assert.equal(controller.startNavigation(revision), true);
    assert.equal(controller.markRouteMounted(revision), 'mounted');
    assert.equal(controller.getSnapshot().routeMounted, true);
    assert.equal(controller.getSnapshot().backRequested, false);
    assert.equal(controller.requestBack(revision), 'pop');
    assert.equal(controller.getSnapshot().backRequested, true);
    assert.equal(controller.requestBack(revision), 'handled');
  } finally {
    controller.hide();
  }
});

test('scheduled register navigation waits for two paints and cancels stale work', async () => {
  const frames = installFrameQueue();

  try {
    const revision = registerLaunchController.show(GTA);
    let navigations = 0;
    scheduleRegisterLaunchNavigation(revision, () => {
      navigations += 1;
    });

    assert.equal(frames.count(), 1);
    frames.flush();
    assert.equal(navigations, 0);
    assert.equal(frames.count(), 1);
    frames.flush();
    assert.equal(navigations, 0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(navigations, 1);
    assert.equal(registerLaunchController.getSnapshot().navigationStarted, true);

    const staleRevision = registerLaunchController.show(GTA);
    scheduleRegisterLaunchNavigation(staleRevision, () => {
      navigations += 1;
    });
    registerLaunchController.hide(staleRevision);
    frames.flush();
    frames.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(navigations, 1);
  } finally {
    registerLaunchController.hide();
    frames.restore();
  }
});

test('scheduled register cover removal cannot hide a newer launch', async () => {
  const frames = installFrameQueue();

  try {
    const revision = registerLaunchController.show(GTA);
    scheduleRegisterLaunchCoverRemoval(revision);

    assert.equal(frames.count(), 1);
    frames.flush();
    assert.equal(registerLaunchController.isVisible(), true);
    assert.equal(frames.count(), 1);
    frames.flush();
    assert.equal(registerLaunchController.isVisible(), true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(registerLaunchController.isVisible(), false);

    const staleRevision = registerLaunchController.show(GTA);
    scheduleRegisterLaunchCoverRemoval(staleRevision);
    const latestRevision = registerLaunchController.show(GTA);
    frames.flush();
    frames.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(registerLaunchController.isVisible(), true);
    assert.equal(registerLaunchController.getSnapshot().revision, latestRevision);
  } finally {
    registerLaunchController.hide();
    frames.restore();
  }
});

test('hiding register launch always forces its native visual layer down', () => {
  const controller = createRegisterLaunchController();
  const visualEvents: boolean[] = [];
  controller.registerVisualApplier((visible) => visualEvents.push(visible));
  visualEvents.length = 0;

  assert.equal(controller.hide(), false);
  assert.deepEqual(visualEvents, [false]);

  controller.show(GTA);
  assert.equal(controller.hide(), true);
  visualEvents.length = 0;
  assert.equal(controller.hide(), false);
  assert.deepEqual(visualEvents, [false]);
});

test('register preview keeps its five-second route-commit watchdog after navigation starts', () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let fallbackCallback: (() => void) | null = null;
  let fallbackDelay: number | undefined;
  let fallbackCleared = false;
  const fallbackHandle = 1 as unknown as ReturnType<typeof setTimeout>;

  globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number) => {
    fallbackCallback = callback;
    fallbackDelay = delay;
    return fallbackHandle;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
    if (handle === fallbackHandle) {
      fallbackCleared = true;
    }
  }) as typeof clearTimeout;

  try {
    const controller = createRegisterLaunchController();
    const visualEvents: boolean[] = [];
    controller.registerVisualApplier((visible) => visualEvents.push(visible));
    visualEvents.length = 0;

    const revision = controller.show(GTA);
    assert.equal(fallbackDelay, 5_000);
    assert.ok(fallbackCallback);
    assert.equal(controller.startNavigation(revision), true);
    assert.equal(fallbackCleared, false);
    (fallbackCallback as unknown as () => void)();

    assert.deepEqual(visualEvents, [true, false]);
    assert.equal(controller.getSnapshot().visible, false);
    assert.equal(controller.getSnapshot().selection, GTA);
    assert.equal(controller.getSnapshot().revision, revision + 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

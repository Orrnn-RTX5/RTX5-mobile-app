import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSidebarDestinationController,
  getSidebarDestinationPath,
  normalizeSidebarDestinationPath,
  resolveSidebarHostDestination,
} from './sidebarDestinationHostController';

test('sidebar host resolver accepts stable names and Expo Router paths', () => {
  assert.equal(resolveSidebarHostDestination('journal'), 'journal');
  assert.equal(resolveSidebarHostDestination('/(tabs)/economic-calendar'), 'economic-calendar');
  assert.equal(resolveSidebarHostDestination('/(tabs)/user-guide/?from=drawer#top'), 'user-guide');
  assert.equal(resolveSidebarHostDestination('/help/index'), 'help');
  assert.equal(resolveSidebarHostDestination('/settings/accounts'), 'accounts');
  assert.equal(resolveSidebarHostDestination('/settings/interface'), 'interface');
  assert.equal(resolveSidebarHostDestination('/settings'), null);
  assert.equal(resolveSidebarHostDestination('/trade'), null);
});

test('Settings-hosted destinations paint before focus without an animation wait', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let scheduledFrames = 0;
  let nextFrame: FrameRequestCallback | undefined;
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      nextFrame = callback;
      scheduledFrames += 1;
      return scheduledFrames;
    },
  });

  try {
    const controller = createSidebarDestinationController();
    const focusEvents: string[] = [];
    controller.subscribe(() => {
      focusEvents.push(controller.getFocusSnapshot().activeDestination ?? 'closed');
    });

    assert.equal(controller.show('accounts', 'settings'), true);
    assert.equal(controller.getSnapshot().activeDestination, 'accounts');
    assert.equal(controller.getFocusSnapshot().activeDestination, null);
    assert.equal(focusEvents.length, 0);
    assert.equal(scheduledFrames, 1);
    nextFrame?.(0);
    assert.equal(focusEvents.length, 0, 'focus work must not run before paint');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(controller.getFocusSnapshot().activeDestination, 'accounts');
    assert.deepEqual(focusEvents, ['accounts']);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('path normalization removes route groups and suffixes without fuzzy matching', () => {
  assert.equal(normalizeSidebarDestinationPath(' /(tabs)//about/?source=sidebar '), '/about');
  assert.equal(normalizeSidebarDestinationPath('/(app)/(tabs)/help/index#faq'), '/help');
  assert.equal(normalizeSidebarDestinationPath('/settings/help'), '/settings/help');
  assert.equal(getSidebarDestinationPath('economic-calendar'), '/economic-calendar');
});

test('show and hide publish immutable visual and focus snapshots synchronously without a frame clock', () => {
  const controller = createSidebarDestinationController();
  const observed: string[] = [];
  const unsubscribe = controller.subscribe(() => {
    const focusSnapshot = controller.getFocusSnapshot();
    observed.push(`${focusSnapshot.activeDestination}:${focusSnapshot.revision}`);
  });

  assert.equal(controller.show('/journal', 'sidebar'), true);
  assert.equal(controller.getSnapshot().activeDestination, 'journal');
  assert.equal(controller.getSnapshot().activePath, '/journal');
  assert.equal(controller.getSnapshot().source, 'sidebar');
  assert.equal(Object.isFrozen(controller.getSnapshot()), true);
  assert.equal(controller.getFocusSnapshot(), controller.getSnapshot());
  assert.deepEqual(observed, ['journal:1']);

  assert.equal(controller.hide(), true);
  assert.equal(controller.getSnapshot().activeDestination, null);
  assert.equal(controller.getFocusSnapshot(), controller.getSnapshot());
  assert.deepEqual(observed, ['journal:1', 'null:2']);

  unsubscribe();
  assert.equal(controller.show('/about'), true);
  assert.deepEqual(observed, ['journal:1', 'null:2']);
});

test('unsupported routes do not change state and duplicate requests avoid notifications', () => {
  const controller = createSidebarDestinationController('/help');
  let notifications = 0;
  controller.subscribe(() => {
    notifications += 1;
  });

  const initialSnapshot = controller.getSnapshot();
  assert.equal(controller.show('/trade', 'sidebar'), false);
  assert.equal(controller.getSnapshot(), initialSnapshot);
  assert.equal(notifications, 0);

  assert.equal(controller.show('/help'), true);
  assert.equal(controller.getSnapshot(), initialSnapshot);
  assert.equal(notifications, 0);

  assert.equal(controller.show('/help', 'sidebar'), true);
  assert.equal(controller.getSnapshot().revision, initialSnapshot.revision + 1);
  assert.equal(notifications, 1);

  assert.equal(controller.hide(), true);
  assert.equal(controller.hide(), false);
  assert.equal(notifications, 2);
});

test('a duplicate show repairs an interrupted visual and focus split', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let nextFrameId = 1;
  let frameQueue: Array<(timestamp: number) => void> = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => {
      frameQueue.push(callback);
      return nextFrameId++;
    },
  });

  try {
    const controller = createSidebarDestinationController();
    const visualEvents: string[] = [];
    const focusEvents: string[] = [];
    controller.registerVisualApplier((destination) => {
      visualEvents.push(destination ?? 'closed');
    });
    controller.subscribe(() => {
      focusEvents.push(controller.getFocusSnapshot().activeDestination ?? 'closed');
    });
    visualEvents.length = 0;

    assert.equal(controller.show('accounts', 'sidebar'), true);
    assert.equal(controller.getSnapshot().activeDestination, 'accounts');
    assert.equal(controller.getFocusSnapshot().activeDestination, null);

    // Simulate the app being refreshed or paused before either scheduled frame
    // can publish focus. The already-visible Accounts layer must be recoverable
    // when Manage accounts is requested again.
    frameQueue = [];
    assert.equal(controller.show('accounts', 'sidebar'), true);
    assert.equal(frameQueue.length, 1);
    assert.deepEqual(visualEvents, ['accounts', 'accounts']);

    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };
    flushFrame();
    flushFrame();
    await new Promise((resolve) => setTimeout(resolve, 160));

    assert.equal(controller.getFocusSnapshot(), controller.getSnapshot());
    assert.deepEqual(focusEvents, ['accounts']);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('the focus failsafe heals a visible destination when frame callbacks are dropped', async () => {
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
    const controller = createSidebarDestinationController();
    const focusEvents: string[] = [];
    controller.subscribe(() => {
      focusEvents.push(controller.getFocusSnapshot().activeDestination ?? 'closed');
    });

    controller.show('accounts', 'sidebar');
    frameQueue = [];
    await new Promise((resolve) => setTimeout(resolve, 320));

    assert.equal(controller.getFocusSnapshot(), controller.getSnapshot());
    assert.deepEqual(focusEvents, ['accounts']);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('active destinations can own hardware Back without hiding the host early', () => {
  const controller = createSidebarDestinationController();
  let handled = 0;
  const unregister = controller.registerBackHandler('accounts', () => {
    handled += 1;
    return true;
  });

  assert.equal(controller.requestBack(), false);
  controller.show('accounts', 'route-sync');
  assert.equal(controller.requestBack(), true);
  assert.equal(handled, 1);
  assert.equal(controller.getSnapshot().activeDestination, 'accounts');

  controller.show('help', 'sidebar');
  assert.equal(controller.requestBack(), false);
  assert.equal(handled, 1);

  unregister();
  controller.show('accounts', 'route-sync');
  assert.equal(controller.requestBack(), false);
});

test('retained visual layer switches before subscribers receive focus work', () => {
  const controller = createSidebarDestinationController();
  const events: string[] = [];
  const unregisterVisual = controller.registerVisualApplier((destination) => {
    events.push(`visual:${destination ?? 'closed'}`);
  });
  const unsubscribe = controller.subscribe(() => {
    events.push(`focus:${controller.getFocusSnapshot().activeDestination ?? 'closed'}`);
  });

  // Registration synchronizes the retained layer with the current snapshot.
  assert.deepEqual(events, ['visual:closed']);
  events.length = 0;

  assert.equal(controller.show('/help', 'sidebar'), true);
  assert.deepEqual(events, ['visual:help', 'focus:help']);

  events.length = 0;
  assert.equal(controller.hide(), true);
  assert.deepEqual(events, ['visual:closed', 'focus:closed']);

  unregisterVisual();
  unsubscribe();
});

test('rapid visual selections publish only the latest focus after the first paint opportunity', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let nextFrameId = 1;
  let frameQueue: Array<(timestamp: number) => void> = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => {
      frameQueue.push(callback);
      return nextFrameId++;
    },
  });

  try {
    const controller = createSidebarDestinationController();
    const visualEvents: string[] = [];
    const visualStoreEvents: string[] = [];
    const focusEvents: string[] = [];
    controller.registerVisualApplier((destination) => {
      visualEvents.push(destination ?? 'closed');
    });
    controller.subscribeVisual(() => {
      visualStoreEvents.push(
        `${controller.getSnapshot().activeDestination ?? 'closed'}`
        + `/focus:${controller.getFocusSnapshot().activeDestination ?? 'closed'}`,
      );
    });
    controller.subscribe(() => {
      focusEvents.push(controller.getFocusSnapshot().activeDestination ?? 'closed');
    });
    visualEvents.length = 0;

    controller.show('/help', 'sidebar');
    controller.show('/about', 'sidebar');
    controller.hide();
    controller.show('/journal', 'sidebar');

    assert.deepEqual(visualEvents, ['help', 'about', 'closed', 'journal']);
    assert.deepEqual(visualStoreEvents, [
      'help/focus:closed',
      'about/focus:closed',
      'closed/focus:closed',
      'journal/focus:closed',
    ]);
    assert.deepEqual(focusEvents, []);
    assert.equal(controller.getSnapshot().activeDestination, 'journal');
    assert.equal(controller.getFocusSnapshot().activeDestination, null);
    assert.notEqual(controller.getFocusSnapshot(), controller.getSnapshot());

    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };
    flushFrame();
    assert.deepEqual(focusEvents, []);
    assert.equal(frameQueue.length, 0, 'selection needs no second frame or close-animation delay');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(focusEvents, ['journal']);
    assert.equal(controller.getFocusSnapshot(), controller.getSnapshot());
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

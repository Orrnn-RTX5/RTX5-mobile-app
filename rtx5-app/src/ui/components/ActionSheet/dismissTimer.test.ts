import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scheduleActionSheetVisualHandoffCloseCommit,
  scheduleDismissSettledAction,
} from './dismissTimer';

test('action sheet settled actions run after one visual frame', () => {
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
    let calls = 0;
    scheduleDismissSettledAction(() => {
      calls += 1;
    });
    assert.equal(calls, 0);
    const frame = frameQueue;
    frameQueue = [];
    frame.forEach((callback) => callback(0));
    assert.equal(calls, 1);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('retained destination close cleanup waits for two visual frames', () => {
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
    let calls = 0;
    scheduleActionSheetVisualHandoffCloseCommit(() => {
      calls += 1;
    });
    assert.equal(calls, 0);

    for (const timestamp of [0, 16]) {
      const frame = frameQueue;
      frameQueue = [];
      frame.forEach((callback) => callback(timestamp));
      assert.equal(calls, timestamp === 16 ? 1 : 0);
    }
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleAfterVisualFrame } from './afterVisualFrame';

test('after-paint work runs once, and cancellation works before and after rAF', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = key => { frames.delete(key); };
  let calls = 0;
  const cancels: Array<() => void> = [];
  try {
    cancels.push(scheduleAfterVisualFrame(() => calls++, 30));
    assert.equal(calls, 0);
    frames.get(1)?.(0);
    assert.equal(calls, 0, 'rAF runs before paint');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls, 1);
    const before = scheduleAfterVisualFrame(() => calls++, 30);
    cancels.push(before);
    before();
    assert.equal(frames.has(2), false);
    const after = scheduleAfterVisualFrame(() => calls++, 30);
    cancels.push(after);
    frames.get(3)?.(0);
    after();
    await new Promise(resolve => setTimeout(resolve, 45));
    assert.equal(calls, 1, 'cancelled actions and completed fallbacks must not run');
  } finally {
    cancels.forEach(cancel => cancel());
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (originalCancel) globalThis.cancelAnimationFrame = originalCancel;
    else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  }
});

test('a dropped native frame still completes once within the fallback window', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  let callback: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = action => { callback = action; return 1; };
  let calls = 0;
  const cancel = scheduleAfterVisualFrame(() => calls++, 20);
  try {
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(calls, 1);
    callback?.(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls, 1);
  } finally {
    cancel();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { invalidateSidebarOpenVisualWork, openSidebarDrawerImmediately, registerSidebarOpenHandler, scheduleAfterSidebarOpenVisual } from './sidebarDrawerController';

test('hamburger invokes the active retained drawer synchronously, including after an older host disposes', () => {
  const opened: string[] = [];
  const removeOld = registerSidebarOpenHandler(() => opened.push('old'));
  const removeCurrent = registerSidebarOpenHandler(() => opened.push('current'));
  try {
    openSidebarDrawerImmediately();
    assert.deepEqual(opened, ['current']);
    removeOld();
    openSidebarDrawerImmediately();
    assert.deepEqual(opened, ['current', 'current']);
  } finally { removeOld(); removeCurrent(); }
});

test('bookkeeping waits for a paint opportunity and can be cancelled by immediate close', async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = id => { frames.delete(id); };
  const cancels: Array<() => void> = [];
  let committed = 0;
  try {
    cancels.push(scheduleAfterSidebarOpenVisual(() => committed++));
    assert.equal(committed, 0, 'React/account work must not run in the touch turn');
    frames.get(1)?.(0);
    assert.equal(committed, 0, 'rAF itself precedes paint and must remain lightweight');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(committed, 1);

    const closeBeforeFrame = scheduleAfterSidebarOpenVisual(() => committed++);
    cancels.push(closeBeforeFrame);
    closeBeforeFrame();
    assert.equal(frames.has(2), false);

    const closeAfterFrame = scheduleAfterSidebarOpenVisual(() => committed++);
    cancels.push(closeAfterFrame);
    frames.get(3)?.(16);
    closeAfterFrame();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(committed, 1, 'cancelled work and the fallback must not reopen a closed drawer');
  } finally {
    cancels.forEach(cancel => cancel());
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (originalCancelRaf) globalThis.cancelAnimationFrame = originalCancelRaf;
    else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  }
});

test('a stalled paint callback has a single bounded bookkeeping fallback', async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  let calls = 0;
  const cancel = scheduleAfterSidebarOpenVisual(() => calls++);
  try {
    assert.equal(calls, 0);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(calls, 1);
  } finally {
    cancel();
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

test('selection and reopening invalidate old header cleanup as well as drawer bookkeeping', async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  const effects: string[] = [];
  const cancels: Array<() => void> = [];
  try {
    openSidebarDrawerImmediately();
    cancels.push(scheduleAfterSidebarOpenVisual(() => effects.push('old header cleanup')));
    frames[0](0);
    // A destination popup now owns the UI before the old cleanup gets a turn.
    invalidateSidebarOpenVisualWork();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(effects.length, 0);

    cancels.push(scheduleAfterSidebarOpenVisual(() => effects.push('old drawer commit')));
    openSidebarDrawerImmediately();
    cancels.push(scheduleAfterSidebarOpenVisual(() => effects.push('current open')));
    frames.slice(1).forEach(callback => callback(16));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(effects, ['current open'], 'stale frames and fallbacks cannot reapply the old flow');
  } finally {
    cancels.forEach(cancel => cancel());
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

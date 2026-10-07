import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleAfterFirstFrame, scheduleIdleWork } from './startupScheduler';

const timerTurn = () => new Promise(resolve => setTimeout(resolve, 0));

test('optional warmups yield between jobs rather than all starting in one painted frame', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const originalIdle = globalThis.requestIdleCallback;
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = id => { frames.delete(id); };
  Reflect.deleteProperty(globalThis, 'requestIdleCallback');
  const calls: number[] = [];
  const cancels: Array<() => void> = [];
  const paint = async () => {
    const callbacks = Array.from(frames.values());
    frames.clear();
    callbacks.forEach(callback => callback(0));
    await timerTurn();
  };
  try {
    cancels.push(scheduleIdleWork(() => { calls.push(1); }));
    cancels.push(scheduleIdleWork(() => { calls.push(2); }));
    cancels.push(scheduleIdleWork(() => { calls.push(3); }));
    assert.equal(frames.size, 1);
    await paint();
    assert.deepEqual(calls, [1]);
    await paint();
    assert.deepEqual(calls, [1, 2]);
    cancels[2]();
    assert.equal(frames.size, 0, 'cancelling the last job releases the scheduled callback');
    await paint();
    assert.deepEqual(calls, [1, 2]);
  } finally {
    cancels.forEach(cancel => cancel());
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
    globalThis.requestIdleCallback = originalIdle;
  }
});

test('a lost native idle callback recovers once and honours shorter deadlines and cancellation', async () => {
  const originalIdle = globalThis.requestIdleCallback;
  const originalCancel = globalThis.cancelIdleCallback;
  const callbacks: IdleRequestCallback[] = [];
  globalThis.requestIdleCallback = callback => { callbacks.push(callback); return callbacks.length; };
  globalThis.cancelIdleCallback = () => {};
  const calls: string[] = [];
  const cancels: Array<() => void> = [];
  try {
    cancels.push(scheduleIdleWork(() => { calls.push('first'); }, { timeoutMs: 10_000 }));
    cancels.push(scheduleIdleWork(() => { calls.push('second'); }, { timeoutMs: 20 }));
    await new Promise(resolve => setTimeout(resolve, 65));
    assert.deepEqual(calls, ['first', 'second']);
    callbacks.forEach(callback => callback({ didTimeout: true, timeRemaining: () => 0 }));
    assert.deepEqual(calls, ['first', 'second'], 'late idle callbacks cannot run work twice');
    const cancel = scheduleIdleWork(() => { calls.push('cancelled'); }, { delayMs: 10, timeoutMs: 10 });
    cancels.push(cancel);
    cancel();
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.deepEqual(calls, ['first', 'second']);
  } finally {
    cancels.forEach(cancel => cancel());
    globalThis.requestIdleCallback = originalIdle;
    globalThis.cancelIdleCallback = originalCancel;
  }
});

test('lost first frames and failing optional work cannot strand later warmups', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const originalIdle = globalThis.requestIdleCallback;
  const originalError = console.error;
  globalThis.requestAnimationFrame = () => 1;
  Reflect.deleteProperty(globalThis, 'requestIdleCallback');
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => { errors.push(args); };
  let calls = 0;
  const cancels = [
    scheduleAfterFirstFrame(() => { calls++; }),
    scheduleIdleWork(() => { throw new Error('optional work failed'); }),
    scheduleIdleWork(async () => { throw new Error('optional async work failed'); }),
    scheduleIdleWork(() => { calls++; }),
  ];
  try {
    await new Promise(resolve => setTimeout(resolve, 360));
    assert.equal(calls, 2);
    assert.equal(errors.length, 2);
  } finally {
    cancels.forEach(cancel => cancel());
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.requestIdleCallback = originalIdle;
    console.error = originalError;
  }
});

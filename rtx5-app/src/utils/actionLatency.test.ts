import assert from 'node:assert/strict';
import test from 'node:test';
import { runImmediateAction, scheduleActionLatencyCheck } from './actionLatency';

test('ordinary actions execute immediately without allocating profiling callbacks', () => {
  const originalDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  const originalRaf = globalThis.requestAnimationFrame;
  const originalSetting = process.env.EXPO_PUBLIC_ENABLE_ACTION_LATENCY_LOGS;
  let scheduledFrames = 0;
  globalThis.requestAnimationFrame = () => { scheduledFrames++; return scheduledFrames; };
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
  delete process.env.EXPO_PUBLIC_ENABLE_ACTION_LATENCY_LOGS;
  try {
    const events: string[] = [];
    assert.equal(runImmediateAction('sidebar.menu.help', () => { events.push('opened'); return 42; }), 42);
    assert.deepEqual(events, ['opened']);
    assert.equal(scheduledFrames, 0);
    assert.throws(() => runImmediateAction('action.error', () => { throw new Error('original'); }), /original/);
    assert.equal(scheduledFrames, 0);

    process.env.EXPO_PUBLIC_ENABLE_ACTION_LATENCY_LOGS = 'true';
    scheduleActionLatencyCheck('test.action', performance.now());
    assert.equal(scheduledFrames, 1, 'profiling remains available when explicitly enabled');
  } finally {
    if (originalDev) Object.defineProperty(globalThis, '__DEV__', originalDev);
    else Reflect.deleteProperty(globalThis, '__DEV__');
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (originalSetting === undefined) delete process.env.EXPO_PUBLIC_ENABLE_ACTION_LATENCY_LOGS;
    else process.env.EXPO_PUBLIC_ENABLE_ACTION_LATENCY_LOGS = originalSetting;
  }
});

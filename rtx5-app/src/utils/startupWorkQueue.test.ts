import assert from 'node:assert/strict';
import test from 'node:test';
import { allowsStartupBackgroundWork, createStartupWorkQueue } from './startupWorkQueue';

const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(tasks: Array<() => void | Promise<unknown>>) {
  let allowed = true;
  let serial = 0;
  const callbacks = new Map<number, () => void>();
  const errors: unknown[] = [];
  const queue = createStartupWorkQueue({
    tasks,
    canRun: () => allowed,
    schedule: (callback) => {
      const id = ++serial;
      callbacks.set(id, callback);
      return () => { callbacks.delete(id); };
    },
    onError: error => errors.push(error),
  });
  return {
    queue, callbacks, errors,
    setAllowed(value: boolean) { allowed = value; queue.refresh(); },
    runIdleTurn() {
      const entry = callbacks.entries().next().value;
      assert.ok(entry, 'an idle callback should be pending');
      callbacks.delete(entry[0]);
      entry[1]();
    },
  };
}

test('module warmup evaluates only one module in each idle turn', async () => {
  const loaded: number[] = [];
  const f = fixture([0, 1, 2].map(index => () => { loaded.push(index); }));
  f.queue.setActive(true);
  assert.equal(f.callbacks.size, 1);
  assert.deepEqual(loaded, []);
  f.runIdleTurn();
  await flushPromises();
  assert.deepEqual(loaded, [0]);
  assert.equal(f.callbacks.size, 1);
  f.runIdleTurn();
  await flushPromises();
  assert.deepEqual(loaded, [0, 1]);
  f.runIdleTurn();
  await flushPromises();
  assert.deepEqual(loaded, [0, 1, 2]);
  assert.equal(f.callbacks.size, 0);
});

test('auth/background pause cancels queued work and rejects an already-dispatched stale callback', async () => {
  let loads = 0;
  const f = fixture([() => { loads += 1; }]);
  f.queue.setActive(true);
  const staleCallback = f.callbacks.values().next().value!;
  f.setAllowed(false);
  assert.equal(f.callbacks.size, 0);
  staleCallback();
  await flushPromises();
  assert.equal(loads, 0);
  f.setAllowed(true);
  f.runIdleTurn();
  await flushPromises();
  assert.equal(loads, 1);
});

test('an in-flight import finishes once but its successor waits for eligibility to resume', async () => {
  const loaded: number[] = [];
  let finish!: () => void;
  const f = fixture([
    () => { loaded.push(0); return new Promise<void>(resolve => { finish = resolve; }); },
    () => { loaded.push(1); },
  ]);
  f.queue.setActive(true);
  f.runIdleTurn();
  f.setAllowed(false);
  finish();
  await flushPromises();
  assert.deepEqual(loaded, [0]);
  assert.equal(f.callbacks.size, 0);
  f.setAllowed(true);
  f.runIdleTurn();
  await flushPromises();
  assert.deepEqual(loaded, [0, 1]);
});

test('unmount and remount resume unfinished modules without repeating completed modules', async () => {
  const loaded: number[] = [];
  const f = fixture([0, 1].map(index => () => { loaded.push(index); }));
  f.queue.setActive(true);
  f.runIdleTurn();
  await flushPromises();
  f.queue.setActive(false);
  assert.equal(f.callbacks.size, 0);
  f.queue.setActive(true);
  f.queue.setActive(true);
  assert.equal(f.callbacks.size, 1);
  f.runIdleTurn();
  await flushPromises();
  assert.deepEqual(loaded, [0, 1]);
});

test('failed optional imports cannot block later warmups', async () => {
  const failure = new Error('optional module unavailable');
  let laterLoaded = false;
  const f = fixture([() => { throw failure; }, () => { laterLoaded = true; }]);
  f.queue.setActive(true);
  f.runIdleTurn();
  await flushPromises();
  f.runIdleTurn();
  await flushPromises();
  assert.deepEqual(f.errors, [failure]);
  assert.equal(laterLoaded, true);
});

test('startup prewarming only runs outside authentication with verified broker and foreground demand', () => {
  for (const screen of ['guest', 'ready']) {
    assert.equal(allowsStartupBackgroundWork('active', screen, true), true);
    assert.equal(allowsStartupBackgroundWork(null, screen, true), true);
    assert.equal(allowsStartupBackgroundWork('background', screen, true), false);
    assert.equal(allowsStartupBackgroundWork('inactive', screen, true), false);
    assert.equal(allowsStartupBackgroundWork('active', screen, false), false);
  }
  for (const screen of ['choice', 'login', 'demo', 'submitting', 'hydrating', 'recoverable-error']) {
    assert.equal(allowsStartupBackgroundWork('active', screen, true), false);
  }
});

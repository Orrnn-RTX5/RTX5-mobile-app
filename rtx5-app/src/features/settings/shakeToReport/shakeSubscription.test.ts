import assert from 'node:assert/strict';
import test from 'node:test';
import { type MotionSample } from './shakeDetector';
import { SHAKE_COOLDOWN_MS, subscribeToShake, type ShakeSensor } from './shakeSubscription';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture(initialState = 'active') {
  let time = 0;
  let currentState = initialState;
  let canOpen = true;
  let opens = 0;
  let removals = 0;
  let lifecycleRemovals = 0;
  let interval = 0;
  const listeners = new Set<(sample: MotionSample) => void>();
  let stateListener: ((state: string) => void) | null = null;
  const sensor: ShakeSensor = {
    isAvailableAsync: async () => true,
    setUpdateInterval: (next) => { interval = next; },
    addListener: (callback) => {
      listeners.add(callback);
      return { remove: () => { removals++; listeners.delete(callback); } };
    },
  };
  const lifecycle = {
    get currentState() { return currentState; },
    addEventListener: (_event: 'change', callback: (state: string) => void) => {
      stateListener = callback;
      return { remove: () => { lifecycleRemovals++; stateListener = null; } };
    },
  };
  return {
    sensor,
    start: (loadSensor = async () => sensor) => subscribeToShake({
      loadSensor, lifecycle, canOpen: () => canOpen,
      onShake: () => { opens++; }, now: () => time,
    }),
    changeState: (state: string) => { currentState = state; stateListener?.(state); },
    block: () => { canOpen = false; },
    unblock: () => { canOpen = true; },
    advance: (ms: number) => { time += ms; },
    shake: () => {
      for (const x of [0, 2, -2, 2]) {
        time += 100;
        listeners.forEach((listener) => listener({ x, y: 0, z: 1, timestamp: time / 1000 }));
      }
    },
    get opens() { return opens; },
    get removals() { return removals; },
    get lifecycleRemovals() { return lifecycleRemovals; },
    get listeners() { return listeners.size; },
    get interval() { return interval; },
  };
}

test('a deliberate shake opens once and respects the cooldown', async () => {
  const f = fixture();
  const dispose = f.start();
  await flush();
  assert.equal(f.listeners, 1);
  assert.equal(f.interval, 50);
  f.shake();
  f.shake();
  assert.equal(f.opens, 1);
  f.advance(SHAKE_COOLDOWN_MS);
  f.shake();
  assert.equal(f.opens, 2);
  dispose();
  assert.equal(f.listeners, 0);
  assert.equal(f.lifecycleRemovals, 1);
});

test('an already open report is neither reopened nor replaced', async () => {
  const f = fixture();
  const dispose = f.start();
  await flush();
  f.block();
  f.shake();
  assert.equal(f.opens, 0);
  f.unblock();
  f.shake();
  assert.equal(f.opens, 1);
  dispose();
});

test('backgrounding removes the sensor; foregrounding installs only one listener', async () => {
  const f = fixture();
  const dispose = f.start();
  await flush();
  f.changeState('inactive');
  f.changeState('background');
  assert.equal(f.listeners, 0);
  f.shake();
  assert.equal(f.opens, 0);
  f.changeState('active');
  f.changeState('active');
  await flush();
  assert.equal(f.listeners, 1);
  f.shake();
  assert.equal(f.opens, 1);
  dispose();
  assert.equal(f.removals, 2);
});

test('does not subscribe until an initially backgrounded app becomes active', async () => {
  const f = fixture('background');
  let loads = 0;
  const dispose = f.start(async () => { loads++; return f.sensor; });
  await flush();
  assert.equal(loads, 0);
  f.changeState('active');
  await flush();
  assert.equal(f.listeners, 1);
  dispose();
});

test('late availability results cannot subscribe after backgrounding or disposal', async () => {
  for (const end of ['background', 'dispose']) {
    const f = fixture();
    let resolve!: (available: boolean) => void;
    f.sensor.isAvailableAsync = () => new Promise((done) => { resolve = done; });
    const dispose = f.start();
    await flush();
    if (end === 'dispose') dispose();
    else f.changeState('background');
    resolve(true);
    await flush();
    assert.equal(f.listeners, 0);
    dispose();
  }
});

test('a rapid background/foreground transition discards the stale subscription', async () => {
  const f = fixture();
  const pending: Array<(value: ShakeSensor) => void> = [];
  const dispose = f.start(() => new Promise((resolve) => pending.push(resolve)));
  f.changeState('background');
  f.changeState('active');
  pending[1](f.sensor);
  await flush();
  pending[0](f.sensor);
  await flush();
  assert.equal(f.listeners, 1);
  f.shake();
  assert.equal(f.opens, 1);
  dispose();
});

test('missing, unavailable and failing native sensors leave normal app use intact', async () => {
  for (const failure of ['missing', 'unavailable', 'availability', 'listener']) {
    const f = fixture();
    if (failure === 'unavailable') f.sensor.isAvailableAsync = async () => false;
    if (failure === 'availability') f.sensor.isAvailableAsync = async () => { throw new Error('Unavailable'); };
    if (failure === 'listener') f.sensor.addListener = () => { throw new Error('Unavailable'); };
    const dispose = f.start(async () => {
      if (failure === 'missing') throw new Error('Native module not installed');
      return f.sensor;
    });
    await flush();
    f.shake();
    assert.equal(f.opens, 0);
    assert.equal(f.listeners, 0);
    dispose();
  }
});

test('cooldown survives background and foreground transitions', async () => {
  const f = fixture();
  const dispose = f.start();
  await flush();
  f.shake();
  f.changeState('background');
  f.changeState('active');
  await flush();
  f.shake();
  assert.equal(f.opens, 1);
  dispose();
});

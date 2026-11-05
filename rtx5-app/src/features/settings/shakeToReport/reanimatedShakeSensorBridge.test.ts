import assert from 'node:assert/strict';
import test from 'node:test';
import { createReanimatedShakeSensorBridge } from './reanimatedShakeSensorBridge';
import { SHAKE_COOLDOWN_MS, subscribeToShake } from './shakeSubscription';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('Reanimated metres per second squared become detector g units with hardware timestamps', () => {
  const bridge = createReanimatedShakeSensorBridge();
  const samples: unknown[] = [];
  const subscription = bridge.sensor.addListener((sample) => samples.push(sample));
  bridge.emit(bridge.getSnapshot(), 19.62, -9.81, 0, 5000);
  assert.deepEqual(samples, [{ x: 2, y: -1, z: 0, timestamp: 5 }]);
  subscription.remove();
  bridge.emit(0, 19.62, 0, 0, 5100);
  assert.equal(samples.length, 1);
});

test('only subscription lifecycle changes notify React; old queued samples cannot reach resumed listeners', () => {
  const bridge = createReanimatedShakeSensorBridge();
  let activityChanges = 0;
  let samples = 0;
  const unsubscribe = bridge.subscribeActivity(() => { activityChanges++; });
  const first = bridge.sensor.addListener(() => { samples++; });
  const firstGeneration = bridge.getSnapshot();
  for (let time = 100; time <= 1000; time += 50) bridge.emit(firstGeneration, 0, 0, 9.81, time);
  assert.equal(activityChanges, 1);
  first.remove();
  first.remove();
  assert.equal(bridge.getSnapshot(), 0);
  assert.equal(activityChanges, 2);
  const next = bridge.sensor.addListener(() => { samples++; });
  const before = samples;
  assert.notEqual(bridge.getSnapshot(), firstGeneration);
  bridge.emit(firstGeneration, 19.62, 0, 0, 1100);
  assert.equal(samples, before);
  bridge.emit(bridge.getSnapshot(), 19.62, 0, 0, 1150);
  assert.equal(samples, before + 1);
  next.remove();
  unsubscribe();
});

function fixture(initialState = 'active') {
  const bridge = createReanimatedShakeSensorBridge();
  let state = initialState;
  let changeState: ((state: string) => void) | undefined;
  let time = 10_000;
  let opens = 0;
  let allowed = true;
  const dispose = subscribeToShake({
    loadSensor: async () => bridge.sensor,
    lifecycle: {
      get currentState() { return state; },
      addEventListener: (_event, listener) => {
        changeState = listener;
        return { remove: () => { changeState = undefined; } };
      },
    },
    canOpen: () => allowed,
    onShake: () => { opens++; },
    now: () => time,
  });
  return {
    bridge, dispose,
    changeState: (value: string) => { state = value; changeState?.(value); },
    setAllowed: (value: boolean) => { allowed = value; },
    advance: (ms: number) => { time += ms; },
    shake: (generation = bridge.getSnapshot(), gravity = 9.81) => {
      for (const x of [0, 19.62, -19.62, 19.62]) {
        time += 100;
        bridge.emit(generation, x, 0, gravity, time);
      }
    },
    get opens() { return opens; },
  };
}

test('Android linear acceleration and iOS gravity-inclusive samples both open the existing report once', async () => {
  for (const gravity of [0, 9.81, -9.81]) {
    const f = fixture();
    await flush();
    f.shake(undefined, gravity);
    f.shake(undefined, gravity);
    assert.equal(f.opens, 1);
    f.advance(SHAKE_COOLDOWN_MS);
    f.setAllowed(false);
    f.shake(undefined, gravity);
    assert.equal(f.opens, 1);
    f.setAllowed(true);
    f.shake(undefined, gravity);
    assert.equal(f.opens, 2);
    f.dispose();
    assert.equal(f.bridge.getSnapshot(), 0);
  }
});

test('hardware is unmounted in background and cooldown survives a new foreground subscription', async () => {
  const f = fixture();
  await flush();
  f.shake();
  assert.equal(f.opens, 1);
  const oldGeneration = f.bridge.getSnapshot();
  f.changeState('background');
  assert.equal(f.bridge.getSnapshot(), 0);
  f.shake(oldGeneration);
  assert.equal(f.opens, 1);
  f.changeState('active');
  await flush();
  assert.ok(f.bridge.getSnapshot() > oldGeneration);
  f.shake(oldGeneration);
  f.shake();
  assert.equal(f.opens, 1);
  f.advance(SHAKE_COOLDOWN_MS);
  f.shake();
  assert.equal(f.opens, 2);
  f.dispose();
});

test('background startup and unavailable hardware do not create reports', async () => {
  const f = fixture('background');
  await flush();
  assert.equal(f.bridge.getSnapshot(), 0);
  f.changeState('active');
  await flush();
  // Missing hardware emits nothing; the initial empty sensor value must not
  // manufacture a shake. Invalid native coordinates reset the detector.
  f.bridge.emit(f.bridge.getSnapshot(), 0, 0, 0, 11_000);
  f.bridge.emit(f.bridge.getSnapshot(), NaN, 0, 0, 11_100);
  assert.equal(f.opens, 0);
  f.dispose();
});

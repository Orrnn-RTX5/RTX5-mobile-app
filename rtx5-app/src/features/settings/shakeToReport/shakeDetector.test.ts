import assert from 'node:assert/strict';
import test from 'node:test';
import { createShakeDetector, type MotionSample } from './shakeDetector';

function feed(values: number[], axis: 'x' | 'y' | 'z' = 'x', step = 100) {
  const detector = createShakeDetector();
  return values.map((value, index) => detector.add({ x: 0, y: 0, z: 1, [axis]: value }, index * step));
}

for (const axis of ['x', 'y', 'z'] as const) {
  test(`detects a deliberate shake along ${axis} regardless of gravity direction`, () => {
    assert.deepEqual(feed([0, 2, -2, 2], axis), [false, false, false, true]);
  });
}

test('stationary readings and small walking movements do not open a report', () => {
  assert.ok(feed(Array.from({ length: 100 }, (_, i) => Math.sin(i) * 0.3)).every((value) => !value));
  assert.ok(feed(Array(30).fill(1), 'z').every((value) => !value));
});

test('one bump and steady movement in one direction are ignored', () => {
  assert.ok(feed([0, 3, 0, 0, 0, 0]).every((value) => !value));
  assert.ok(feed([0, 2, 4, 6, 8]).every((value) => !value));
});

test('slow rotation does not count as a shake', () => {
  const detector = createShakeDetector();
  for (let i = 0; i < 40; i++) {
    assert.equal(detector.add({ x: Math.sin(i / 10), y: 0, z: Math.cos(i / 10) }, i * 50), false);
  }
});

test('isolated movements cannot accumulate across missing readings', () => {
  assert.ok(feed([0, 2, -2, 2], 'x', 500).every((value) => !value));
});

test('reset discards a partial shake', () => {
  const detector = createShakeDetector();
  detector.add({ x: 0, y: 0, z: 1 }, 0);
  detector.add({ x: 2, y: 0, z: 1 }, 100);
  detector.add({ x: -2, y: 0, z: 1 }, 200);
  detector.reset();
  assert.equal(detector.add({ x: 2, y: 0, z: 1 }, 300), false);
});

test('invalid and duplicate readings cannot complete a shake', () => {
  const detector = createShakeDetector();
  const sample = (x: number): MotionSample => ({ x, y: 0, z: 1 });
  detector.add(sample(0), 0);
  detector.add(sample(2), 100);
  assert.equal(detector.add(sample(-2), 100), false);
  assert.equal(detector.add(sample(NaN), 200), false);
  assert.equal(detector.add(sample(2), 300), false);
  assert.equal(detector.add(sample(-2), 400), false);
});

test('sensor bursts faster than a hand shake do not trigger', () => {
  assert.ok(feed([0, 2, -2, 2, -2], 'x', 10).every((value) => !value));
});

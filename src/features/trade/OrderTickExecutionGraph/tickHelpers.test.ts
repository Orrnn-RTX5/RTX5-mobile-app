import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialTickHistory, isValidTickPoint } from './tickHelpers';

test('order execution graph ignores zero-price seed ticks', () => {
  assert.equal(isValidTickPoint({ time: Date.now(), bid: 0, ask: 0.00015 }), false);
  assert.equal(isValidTickPoint({ time: Date.now(), bid: 1.3444, ask: 1.3445 }), true);
});

test('order execution graph seeds only the observed broker tick', () => {
  const latest = { time: 100000, bid: 1.3444, ask: 1.3445 };
  const history = createInitialTickHistory(latest, 5, 100);

  assert.deepEqual(history, [latest]);
  assert.ok(history.every(isValidTickPoint));
});

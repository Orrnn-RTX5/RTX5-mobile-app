import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasStableConnectionSucceeded,
  resolveFullJitterBackoffMs,
  resolveNextReconnectAttempt,
} from './reconnectBackoff';

test('full-jitter reconnect delay stays inside the exponential attempt window', () => {
  assert.equal(resolveFullJitterBackoffMs({ attempt: 0, baseMs: 1_000, capMs: 15_000, random: () => 0 }), 0);
  assert.equal(resolveFullJitterBackoffMs({ attempt: 2, baseMs: 1_000, capMs: 15_000, random: () => 0.5 }), 2_000);
  assert.equal(resolveFullJitterBackoffMs({ attempt: 4, baseMs: 1_000, capMs: 15_000, random: () => 0.999999 }), 14_999);
});

test('full-jitter reconnect delay caps large and invalid attempts safely', () => {
  assert.equal(resolveFullJitterBackoffMs({ attempt: 99, baseMs: 750, capMs: 5_000, random: () => 0.5 }), 2_500);
  assert.equal(resolveFullJitterBackoffMs({ attempt: -4, baseMs: 750, capMs: 5_000, random: () => -1 }), 0);
});

test('stable reconnect success requires elapsed time and an accepted payload', () => {
  const base = { connectedAt: 1_000, stableAfterMs: 10_000 };
  assert.equal(hasStableConnectionSucceeded({ ...base, now: 11_000, acceptedPayloadCount: 0 }), false);
  assert.equal(hasStableConnectionSucceeded({ ...base, now: 10_999, acceptedPayloadCount: 2 }), false);
  assert.equal(hasStableConnectionSucceeded({ ...base, now: 11_000, acceptedPayloadCount: 1 }), true);
  assert.equal(hasStableConnectionSucceeded({ ...base, connectedAt: 0, now: 11_000, acceptedPayloadCount: 1 }), false);
});

test('every reconnect path advances one capped attempt before applying jitter', () => {
  assert.deepEqual(resolveNextReconnectAttempt({
    currentAttempt: 0,
    maxAttempts: 3,
    baseMs: 750,
    capMs: 5_000,
    random: () => 0.5,
  }), {
    exhausted: false,
    attempt: 1,
    delayMs: 375,
  });
  assert.deepEqual(resolveNextReconnectAttempt({
    currentAttempt: 2,
    maxAttempts: 3,
    baseMs: 750,
    capMs: 5_000,
    random: () => 0.5,
  }), {
    exhausted: false,
    attempt: 3,
    delayMs: 1_500,
  });
  assert.deepEqual(resolveNextReconnectAttempt({
    currentAttempt: 3,
    maxAttempts: 3,
    baseMs: 750,
    capMs: 5_000,
  }), { exhausted: true });
});

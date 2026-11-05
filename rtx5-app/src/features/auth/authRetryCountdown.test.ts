import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleAuthRetryCountdown } from './authRetryCountdown';

function withClock(run: (clock: { advance: (ms: number) => void; pending: () => number }) => void) {
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let now = 10_000;
  let nextId = 0;
  const pending = new Map<number, { due: number; callback: () => void }>();
  Date.now = () => now;
  globalThis.setTimeout = ((callback: () => void, delay = 0) => {
    const id = ++nextId;
    pending.set(id, { due: now + delay, callback });
    return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => pending.delete(id)) as unknown as typeof clearTimeout;
  try {
    run({
      pending: () => pending.size,
      advance: ms => {
        const end = now + ms;
        while (true) {
          const next = [...pending.entries()].sort((a, b) => a[1].due - b[1].due)[0];
          if (!next || next[1].due > end) break;
          now = next[1].due;
          pending.delete(next[0]);
          next[1].callback();
        }
        now = end;
      },
    });
  } finally {
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

test('Retry-After countdown publishes immediately and stops exactly at a fractional deadline', () => {
  withClock(clock => {
    const updates: number[] = [];
    scheduleAuthRetryCountdown(12_500, now => updates.push(now));
    assert.deepEqual(updates, [10_000]);
    clock.advance(2_500);
    assert.deepEqual(updates, [10_000, 11_000, 12_000, 12_500]);
    assert.equal(clock.pending(), 0);
    clock.advance(60_000);
    assert.equal(updates.length, 4, 'an expired rate limit must not rerender auth forever');
  });
});

test('dismissing authentication cancels remaining countdown work', () => {
  withClock(clock => {
    const updates: number[] = [];
    const cancel = scheduleAuthRetryCountdown(20_000, now => updates.push(now));
    clock.advance(1_000);
    cancel();
    cancel();
    assert.equal(clock.pending(), 0);
    clock.advance(20_000);
    assert.deepEqual(updates, [10_000, 11_000]);
  });
});

test('reopening after expiry clears the displayed wait without starting another timer', () => {
  withClock(clock => {
    const updates: number[] = [];
    scheduleAuthRetryCountdown(9_000, now => updates.push(now));
    assert.deepEqual(updates, [10_000]);
    assert.equal(clock.pending(), 0);
  });
});

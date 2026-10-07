import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeHistoryRetryPlan,
  HISTORY_FAILURE_RETRY_BACKOFF_MS,
  HISTORY_RETRY_STEADY_INTERVAL_MS,
} from './historyRetryPolicy';

// Schedule: fast backoff ramp [1000, 3000, 7000], then an unbounded
// steady-state retry every HISTORY_RETRY_STEADY_INTERVAL_MS while the entry
// stays subscribed with no history (disposeEntry clears the timer).

test('schedules the first retry after a failed initial load with no history', () => {
  const plan = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 0 }, false);
  assert.deepEqual(plan, { shouldRetry: true, delayMs: 1000, nextAttempt: 1 });
});

test('walks the fast backoff ramp on consecutive failures', () => {
  const second = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 1 }, false);
  assert.deepEqual(second, { shouldRetry: true, delayMs: 3000, nextAttempt: 2 });
  const third = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 2 }, false);
  assert.deepEqual(third, { shouldRetry: true, delayMs: 7000, nextAttempt: 3 });
});

test('keeps retrying at the slow steady interval after the fast ramp (never strands an empty chart)', () => {
  const rampLength = HISTORY_FAILURE_RETRY_BACKOFF_MS.length;
  const first = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: rampLength }, false);
  assert.deepEqual(first, {
    shouldRetry: true,
    delayMs: HISTORY_RETRY_STEADY_INTERVAL_MS,
    nextAttempt: rampLength + 1,
  });
  const muchLater = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 50 }, false);
  assert.deepEqual(muchLater, {
    shouldRetry: true,
    delayMs: HISTORY_RETRY_STEADY_INTERVAL_MS,
    nextAttempt: 51,
  });
});

test('does not retry when history already arrived (cache/prefetch healed it)', () => {
  const plan = computeHistoryRetryPlan({ historyCandles: [{}], historyRetryAttempt: 0 }, false);
  assert.equal(plan.shouldRetry, false);
});

test('never retries a pagination (older-history) failure', () => {
  // Even with an empty fresh budget, pagination must not trigger a full-window retry.
  const plan = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 0 }, true);
  assert.equal(plan.shouldRetry, false);
});

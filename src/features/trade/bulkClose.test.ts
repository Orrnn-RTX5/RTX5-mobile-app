import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createTradingApiError } from '../../api/tradingErrors';
import { resolveBulkCloseFeedback, runBulkClose } from './bulkClose';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSessionProvenance,
  isActiveBrokerSessionCurrent,
  isActiveBrokerSessionProvenanceCurrent,
  updateActiveBrokerSessionCredentials,
} from '../../state/activeBrokerSession';

test('503 ENGINE_CLOSE_UNAVAILABLE on the first close stops the batch without retries', async () => {
  const attempted: number[] = [];
  const summary = await runBulkClose([1, 2, 3, 4], async (ticket) => {
    attempted.push(ticket);
    throw createTradingApiError(503, {
      error: 'ENGINE_CLOSE_UNAVAILABLE',
      message: 'engine close unavailable',
    });
  });
  assert.deepEqual(attempted, [1], 'only one close is sent');
  assert.equal(summary.failed, 4);
  assert.ok(summary.stopError);
  assert.deepEqual(
    summary.results.map((result) => result.status === 'rejected' && result.skipped),
    [false, true, true, true],
  );
});

test('ordinary failures do not stop the rest of the batch', async () => {
  const attempted: number[] = [];
  const summary = await runBulkClose([1, 2, 3], async (ticket) => {
    attempted.push(ticket);
    if (ticket === 1) {
      throw createTradingApiError(409, { error: 'POSITION_STATE_CHANGED', message: 'changed' });
    }
  });
  assert.deepEqual(attempted.sort(), [1, 2, 3]);
  assert.equal(summary.failed, 1);
  assert.equal(summary.stopError, null);
});

test('an engine outage later in the batch stops all subsequent sends', async () => {
  const attempted: number[] = [];
  const summary = await runBulkClose([1, 2, 3, 4], async (ticket) => {
    attempted.push(ticket);
    if (ticket === 2) {
      throw createTradingApiError(503, { error: 'ENGINE_CLOSE_UNAVAILABLE', message: 'x' });
    }
  });
  assert.deepEqual(attempted, [1, 2]);
  assert.equal(summary.failed, 3);
  assert.equal(summary.results[0].status, 'fulfilled');
  assert.ok(summary.stopError);
});

test('BulkOperationScreen presents the original error and guards each send against account switches', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/trade/BulkOperationScreen.tsx'),
    'utf8',
  );
  assert.match(source, /await runBulkClose\(\s*snapshots,\s*\(position\) => positionsApi\.closePosition\(position\.id\),/);
  assert.doesNotMatch(source, /Promise\.allSettled\(/);
  assert.match(source, /const feedback = resolveBulkCloseFeedback\(summary\)/);
  assert.match(source, /Alert\.alert\(t\(feedback\.title\), t\(feedback\.message\)\)/);
  assert.doesNotMatch(source, /closes failed|Some positions could not be closed/);
  assert.match(source, /assertCurrent: \(\) => \{[\s\S]*isActiveBrokerSessionCurrent\(actionProvenance\.identity\)/);
  assert.doesNotMatch(source, /isActiveBrokerSessionProvenanceCurrent/);
  assert.match(source, /const retainLivePositions = isScreenFocused && !isRunning && !runningRef\.current/);
  assert.doesNotMatch(source, /if \(!isScreenFocused\) \{\s*return <View/);
});

test('only one close is in flight and every ticket is sent exactly once', async () => {
  let inFlight = 0;
  let peakInFlight = 0;
  const attempted: number[] = [];
  const releases: Array<() => void> = [];
  const batch = runBulkClose([1, 2, 3], async (ticket) => {
    attempted.push(ticket);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise<void>((resolve) => releases.push(resolve));
    inFlight -= 1;
  });
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(attempted, [1, 2, 3].slice(0, index + 1));
    releases[index]();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const summary = await batch;
  assert.equal(peakInFlight, 1);
  assert.equal(summary.failed, 0);
  assert.equal(resolveBulkCloseFeedback(summary), null);
});

for (const { error, title, kind } of [
  { error: new TypeError('Network request failed'), title: 'Trading Connection Failed', kind: 'backend-unavailable' },
  { error: new Error('Request timed out after 35000ms'), title: 'Trading Request Timed Out', kind: 'backend-unavailable' },
  { error: createTradingApiError(429, { message: 'Too many requests' }, { 'retry-after': '4' }), title: 'Rate Limited', kind: 'rate-limit' },
  { error: createTradingApiError(429, { error: 'ORDER_RATE_LIMITED', message: 'Slow down' }), title: 'Rate Limited', kind: 'rate-limit' },
  { error: createTradingApiError(401, { message: 'Session expired' }), title: 'Session Expired', kind: 'session-expired' },
  { error: createTradingApiError(503, { error: 'NO_FRESH_QUOTE', message: 'Price unavailable' }), title: 'Request Rejected', kind: 'backend-rejection' },
  { error: createTradingApiError(202, { error: 'ORDER_CONFIRMATION_PENDING', message: 'Still processing' }), title: 'Confirmation Pending', kind: 'backend-rejection' },
]) {
  test(`${title} stops remaining closes without retrying and preserves the actual feedback`, async () => {
    const attempted: number[] = [];
    const summary = await runBulkClose([1, 2, 3], async (ticket) => {
      attempted.push(ticket);
      throw error;
    });
    assert.deepEqual(attempted, [1]);
    assert.equal(summary.stopError, error);
    assert.deepEqual(summary.results.map(result => result.status === 'rejected' && result.skipped), [false, true, true]);
    const feedback = resolveBulkCloseFeedback(summary);
    assert.equal(feedback?.title, title);
    assert.equal(feedback?.kind, kind);
    if ('status' in error) assert.equal(feedback?.status, error.status);
    if (feedback?.status === 429 && !('data' in error && (error.data as { error?: string }).error)) {
      assert.equal(feedback.retryAfterSeconds, 4);
    }
  });
}

test('position-specific failures preserve the real rejection while other positions close', async () => {
  const error = createTradingApiError(409, { error: 'MARKET_CLOSED', message: 'Closed for this symbol' });
  const attempted: number[] = [];
  const summary = await runBulkClose([1, 2, 3], async (ticket) => {
    attempted.push(ticket);
    if (ticket === 2) throw error;
  });
  assert.deepEqual(attempted, [1, 2, 3]);
  assert.equal(summary.failed, 1);
  assert.equal(summary.stopError, null);
  assert.equal(resolveBulkCloseFeedback(summary)?.title, 'Market Closed');
  assert.equal(resolveBulkCloseFeedback(summary)?.status, 409);
});

test('a later batch-wide error takes priority over an earlier position rejection', async () => {
  const summary = await runBulkClose([1, 2, 3], async (ticket) => {
    if (ticket === 1) throw createTradingApiError(409, { error: 'MARKET_CLOSED' });
    throw new TypeError('Network request failed');
  });
  assert.equal(resolveBulkCloseFeedback(summary)?.title, 'Trading Connection Failed');
});

test('empty batches send nothing and have no error feedback', async () => {
  const summary = await runBulkClose([], async () => { assert.fail('must not send'); });
  assert.equal(summary.failed, 0);
  assert.equal(resolveBulkCloseFeedback(summary), null);
});

test('a token refresh keeps the batch current, but an account switch prevents further sends', async () => {
  __resetActiveBrokerSessionForTests();
  try {
    activateBrokerSession(beginActiveBrokerSessionTransition(), {
      brokerId: 'broker-a', accountLogin: '10001',
      apiBase: 'https://services.broker-a.com/api/v2',
      feedWsBase: 'wss://services.broker-a.com/ws/feed',
      feedStatusUrl: 'https://services.broker-a.com/ws/feed/status',
      servicesDomain: 'services.broker-a.com', configVersion: 'cfg-1',
    }, { accessToken: 'access-a', refreshToken: 'refresh-a', expiresAt: '2099-01-01T00:00:00Z' });
    const provenance = captureActiveBrokerSessionProvenance()!;
    const attempted: number[] = [];
    const summary = await runBulkClose([1, 2, 3, 4], async (ticket) => {
      attempted.push(ticket);
      if (ticket === 1) {
        assert.equal(updateActiveBrokerSessionCredentials(provenance.identity, {
          accessToken: 'access-new', refreshToken: 'refresh-new', expiresAt: '2099-01-01T00:00:00Z',
        }), true);
        assert.equal(isActiveBrokerSessionProvenanceCurrent(provenance), false);
        assert.equal(isActiveBrokerSessionCurrent(provenance.identity), true);
      }
      if (ticket === 2) beginActiveBrokerSessionTransition();
    }, {
      assertCurrent: () => {
        if (!isActiveBrokerSessionCurrent(provenance.identity)) {
          throw Object.assign(new Error('Session changed'), { name: 'StaleBrokerSessionError' });
        }
      },
    });
    assert.deepEqual(attempted, [1, 2]);
    assert.deepEqual(summary.results.map(result => result.status), ['fulfilled', 'fulfilled', 'rejected', 'rejected']);
    assert.ok(summary.stopError);
  } finally {
    __resetActiveBrokerSessionForTests();
  }
});

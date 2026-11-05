import assert from 'node:assert/strict';
import test from 'node:test';
import { readBootstrapSnapshot } from './bootstrapSnapshotRetry';

const response = (status: number, retryAfter?: string) => ({ ok: status >= 200 && status < 300, status, retryAfter });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('a transient failure of each required startup snapshot gets one independent retry', async () => {
  for (const endpoint of ['/auth/me', '/account/10001', '/instruments', '/positions/10001']) {
    const delays: number[] = [];
    let reads = 0;
    const result = await readBootstrapSnapshot({
      endpoint, isCurrent: () => true,
      read: async () => response(++reads === 1 ? 503 : 200),
      wait: async delay => { delays.push(delay); },
    });
    assert.equal(result?.ok, true);
    assert.equal(reads, 2);
    assert.deepEqual(delays, [500]);
  }
});

test('a second failure ends recovery and leaves the failed snapshot unavailable', async () => {
  let reads = 0;
  const result = await readBootstrapSnapshot({
    endpoint: '/auth/me', isCurrent: () => true,
    read: async () => { reads += 1; return response(503); },
    wait: async () => {},
  });
  assert.equal(result?.ok, false);
  assert.equal(reads, 2);
});

test('successful, unauthorized, forbidden and permanent failures never retry', async () => {
  for (const status of [200, 401, 403, 404, 422, 429]) {
    let reads = 0;
    await readBootstrapSnapshot({
      endpoint: '/auth/me', isCurrent: () => true,
      read: async () => { reads += 1; return response(status); },
      wait: async () => { assert.fail('must not delay'); },
    });
    assert.equal(reads, 1, `HTTP ${status}`);
  }
});

test('ancillary snapshots and authentication mutations have no bootstrap retry', async () => {
  for (const endpoint of ['/orders/10001', '/market/status', '/auth/login', '/auth/register', '/auth/refresh']) {
    let reads = 0;
    await readBootstrapSnapshot({
      endpoint, isCurrent: () => true,
      read: async () => { reads += 1; return response(503); },
      wait: async () => { assert.fail('must not retry'); },
    });
    assert.equal(reads, 1);
  }
});

test('identified network errors, request timeouts and HTTP 408 recover once', async () => {
  const errors = [
    new TypeError('Network request failed'),
    new TypeError('Failed to fetch'),
    Object.assign(new Error('Request timed out after 7000ms'), { name: 'AbortError' }),
    Object.assign(new Error('Failed to fetch the instrument catalog'), { status: 503 }),
  ];
  for (const error of errors) {
    let reads = 0;
    const result = await readBootstrapSnapshot({
      endpoint: '/instruments', isCurrent: () => true,
      read: async () => { if (++reads === 1) throw error; return response(200); },
      wait: async () => {},
    });
    assert.equal(result?.ok, true);
    assert.equal(reads, 2);
  }
  let reads = 0;
  assert.equal((await readBootstrapSnapshot({
    endpoint: '/account/10001', isCurrent: () => true,
    read: async () => response(++reads === 1 ? 408 : 200), wait: async () => {},
  }))?.ok, true);
});

test('stale sessions, caller cancellation and invalid response parsing are not retried', async () => {
  for (const error of [
    Object.assign(new Error('stale session'), { name: 'StaleBrokerSessionError' }),
    Object.assign(new Error('The request was aborted.'), { name: 'AbortError' }),
    new SyntaxError('Unexpected token in JSON'),
    new Error('No authenticated broker session available.'),
    Object.assign(new Error('Unauthorized'), { status: 401 }),
  ]) {
    let reads = 0;
    await assert.rejects(readBootstrapSnapshot({
      endpoint: '/instruments', isCurrent: () => true,
      read: async () => { reads += 1; throw error; },
      wait: async () => { assert.fail('must not retry'); },
    }), caught => caught === error);
    assert.equal(reads, 1);
  }
});

test('429 only retries with a valid bounded Retry-After and never earlier than requested', async () => {
  const now = Date.parse('2026-10-06T00:00:00Z');
  for (const retryAfter of ['2', 'Tue, 06 Oct 2026 00:00:02 GMT']) {
    const delays: number[] = [];
    let reads = 0;
    const result = await readBootstrapSnapshot({
      endpoint: '/auth/me', isCurrent: () => true, now: () => now,
      read: async () => response(++reads === 1 ? 429 : 200, retryAfter),
      wait: async delay => { delays.push(delay); },
    });
    assert.equal(result?.ok, true);
    assert.deepEqual(delays, [2000]);
  }
  for (const retryAfter of [undefined, '', 'invalid', '60', '-1']) {
    let reads = 0;
    await readBootstrapSnapshot({
      endpoint: '/auth/me', isCurrent: () => true, now: () => now,
      read: async () => { reads += 1; return response(429, retryAfter); },
      wait: async () => { assert.fail('must not retry'); },
    });
    assert.equal(reads, 1);
  }
});

test('logout or account/credential change during retry delay cancels further requests', async () => {
  let current = true;
  let reads = 0;
  const result = await readBootstrapSnapshot({
    endpoint: '/auth/me', isCurrent: () => current,
    read: async () => { reads += 1; return response(503); },
    wait: async () => { current = false; },
  });
  assert.equal(result, null);
  assert.equal(reads, 1);
  await readBootstrapSnapshot({
    endpoint: '/auth/me', isCurrent: () => false,
    read: async () => { assert.fail('stale work cannot start'); },
  });
});

test('a recovered core snapshot becomes ready while ancillary work remains pending', async () => {
  const ancillary = deferred<void>();
  let ancillaryReady = false;
  void ancillary.promise.then(() => { ancillaryReady = true; });
  let accountReads = 0;
  const snapshots = await Promise.all([
    readBootstrapSnapshot({ endpoint: '/auth/me', read: async () => response(200), isCurrent: () => true }),
    readBootstrapSnapshot({
      endpoint: '/account/10001', read: async () => response(++accountReads === 1 ? 503 : 200),
      isCurrent: () => true, wait: async () => {},
    }),
    readBootstrapSnapshot({ endpoint: '/instruments', read: async () => response(200), isCurrent: () => true }),
  ]);
  assert.equal(snapshots.every(snapshot => snapshot?.ok), true);
  assert.equal(ancillaryReady, false);
  ancillary.resolve();
});

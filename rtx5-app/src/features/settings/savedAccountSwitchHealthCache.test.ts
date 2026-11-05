import assert from 'node:assert/strict';
import test from 'node:test';
import { createSavedAccountSwitchHealthCache } from './savedAccountSwitchHealthCache';

const createDeferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

test('saved-account switch reuses an in-flight exact-server health warm-up', async () => {
  const deferred = createDeferred();
  const requestedUrls: string[] = [];
  const cache = createSavedAccountSwitchHealthCache({
    checkHealth: async (serverUrl) => {
      requestedUrls.push(serverUrl);
      await deferred.promise;
    },
    ttlMs: 30_000,
  });

  const warmup = cache.ensureHealthy('https://broker.example');
  const switchVerification = cache.ensureHealthy('https://broker.example');
  await Promise.resolve();

  assert.deepEqual(requestedUrls, ['https://broker.example']);
  deferred.resolve();
  await Promise.all([warmup, switchVerification]);
  assert.deepEqual(requestedUrls, ['https://broker.example']);
});

test('successful saved-account health is reused only within its TTL', async () => {
  let now = 1_000;
  let calls = 0;
  const cache = createSavedAccountSwitchHealthCache({
    checkHealth: async () => { calls += 1; },
    ttlMs: 30_000,
    now: () => now,
  });

  await cache.ensureHealthy('https://broker.example');
  now = 30_999;
  await cache.ensureHealthy('https://broker.example');
  assert.equal(calls, 1);

  now = 31_000;
  await cache.ensureHealthy('https://broker.example');
  assert.equal(calls, 2);
});

test('failed saved-account health is evicted so the next switch retries', async () => {
  let calls = 0;
  const cache = createSavedAccountSwitchHealthCache({
    checkHealth: async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
    },
    ttlMs: 30_000,
  });

  await assert.rejects(cache.ensureHealthy('https://broker.example'), /offline/);
  await cache.ensureHealthy('https://broker.example');
  assert.equal(calls, 2);
});

test('saved-account health warm-ups never cross broker server URLs', async () => {
  const requestedUrls: string[] = [];
  const cache = createSavedAccountSwitchHealthCache({
    checkHealth: async (serverUrl) => { requestedUrls.push(serverUrl); },
    ttlMs: 30_000,
  });

  await Promise.all([
    cache.ensureHealthy('https://broker-a.example'),
    cache.ensureHealthy('https://broker-b.example'),
  ]);

  assert.deepEqual(requestedUrls.sort(), [
    'https://broker-a.example',
    'https://broker-b.example',
  ]);
});

test('clearing saved-account health ignores late warm-up completions', async () => {
  const deferred = createDeferred();
  let calls = 0;
  const cache = createSavedAccountSwitchHealthCache({
    checkHealth: async () => {
      calls += 1;
      if (calls === 1) await deferred.promise;
    },
    ttlMs: 30_000,
  });

  const staleWarmup = cache.ensureHealthy('https://broker.example');
  await Promise.resolve();
  cache.clear();
  deferred.resolve();
  await staleWarmup;

  await cache.ensureHealthy('https://broker.example');
  assert.equal(calls, 2);
});

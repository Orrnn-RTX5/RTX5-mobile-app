import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrokerDirectoryReadCache } from './brokerDirectoryReadCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

test('successful directory reads are reused only within their short lifetime', async () => {
  let now = 0; let calls = 0;
  const cache = createBrokerDirectoryReadCache<string>(30_000, () => now);
  const load = async () => `directory-${++calls}`;
  assert.equal(await cache.read('primary', load), 'directory-1');
  now = 29_999;
  assert.equal(await cache.read('primary', load), 'directory-1');
  now = 30_000;
  assert.equal(await cache.read('primary', load), 'directory-2');
  assert.equal(calls, 2);
});

test('full refreshes bypass cached values but join requests already underway', async () => {
  const cache = createBrokerDirectoryReadCache<string>(30_000, () => 0);
  await cache.read('primary', async () => 'old directory');
  const pending = deferred<string>(); let calls = 0;
  const load = () => { calls += 1; return pending.promise; };
  const first = cache.read('primary', load, true);
  const second = cache.read('primary', load, true);
  const targeted = cache.read('primary', load);
  assert.equal(first, second); assert.equal(first, targeted);
  pending.resolve('fresh directory');
  assert.deepEqual(await Promise.all([first, second, targeted]), ['fresh directory', 'fresh directory', 'fresh directory']);
  assert.equal(calls, 1);
});

test('a backward device clock cannot extend the cached directory lifetime', async () => {
  let now = 100_000; let calls = 0;
  const cache = createBrokerDirectoryReadCache<string>(30_000, () => now);
  const load = async () => `directory-${++calls}`;
  assert.equal(await cache.read('primary', load), 'directory-1');
  now = 99_999;
  assert.equal(await cache.read('primary', load), 'directory-2');
  assert.equal(await cache.read('primary', load), 'directory-2');
  assert.equal(calls, 2);
});

test('each approved directory origin has an independent cache and in-flight request', async () => {
  const cache = createBrokerDirectoryReadCache<string>(30_000, () => 0);
  const primary = deferred<string>(); const additional = deferred<string>();
  const first = cache.read('primary', () => primary.promise);
  const second = cache.read('additional', () => additional.promise);
  primary.resolve('primary'); additional.resolve('additional');
  assert.deepEqual(await Promise.all([first, second]), ['primary', 'additional']);
});

test('rejected reads are not cached and cannot revive the previous directory', async () => {
  const cache = createBrokerDirectoryReadCache<string>(30_000, () => 0);
  await cache.read('primary', async () => 'old directory');
  await assert.rejects(cache.read('primary', async () => { throw new Error('directory unavailable'); }, true), /directory unavailable/);
  let calls = 0;
  assert.equal(await cache.read('primary', async () => { calls += 1; return 'retried'; }), 'retried');
  assert.equal(calls, 1);
});

test('concurrent callers observe the same failure and a later read can retry', async () => {
  const cache = createBrokerDirectoryReadCache<string>(30_000, () => 0);
  const pending = deferred<string>(); let calls = 0;
  const load = () => { calls += 1; return pending.promise; };
  const first = assert.rejects(cache.read('primary', load), /failed/);
  const second = assert.rejects(cache.read('primary', load), /failed/);
  pending.reject(new Error('failed'));
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(await cache.read('primary', async () => 'retry'), 'retry');
});

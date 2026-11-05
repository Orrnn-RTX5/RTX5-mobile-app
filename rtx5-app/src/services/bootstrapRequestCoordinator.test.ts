import assert from 'node:assert/strict';
import test from 'node:test';
import { createBootstrapRequestCoordinator } from './bootstrapRequestCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('trading readiness resolves while ancillary bootstrap requests remain pending', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  const ready = deferred<string>();
  const complete = deferred<string>();
  let starts = 0;
  const start = () => {
    starts += 1;
    return { ready: ready.promise, complete: complete.promise };
  };
  const trading = coordinate('account:1:credentials:1', 'trading', start);
  let allFinished = false;
  const full = coordinate('account:1:credentials:1', 'complete', start);
  void full.then(() => { allFinished = true; });

  ready.resolve('policy and symbols ready');
  assert.equal(await trading, 'policy and symbols ready');
  assert.equal(allFinished, false);
  assert.equal(starts, 1);

  complete.resolve('all snapshots ready');
  assert.equal(await full, 'all snapshots ready');
});

test('complete callers arriving after trading readiness join the original run', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  const ready = deferred<string>();
  const complete = deferred<string>();
  let starts = 0;
  const start = () => {
    starts += 1;
    return { ready: ready.promise, complete: complete.promise };
  };
  const trading = coordinate('account:1:credentials:1', 'trading', start);
  ready.resolve('ready');
  await trading;

  const full = coordinate('account:1:credentials:1', 'complete', start);
  assert.equal(full, complete.promise);
  assert.equal(coordinate('account:1:credentials:1', 'trading', start), ready.promise);
  assert.equal(starts, 1);
  complete.resolve('complete');
  await full;
});

test('account namespaces and credential generations cannot join another run', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  const keys = ['broker-a:account-1:generation-1', 'broker-a:account-1:generation-2', 'broker-b:account-1:generation-1'];
  const pending = keys.map(() => ({ ready: deferred<string>(), complete: deferred<string>() }));
  let starts = 0;
  const calls = keys.map((key, index) => coordinate(key, 'trading', () => {
    starts += 1;
    return { ready: pending[index].ready.promise, complete: pending[index].complete.promise };
  }));

  pending.forEach((run, index) => {
    run.ready.resolve(keys[index]);
    run.complete.resolve(keys[index]);
  });
  assert.deepEqual(await Promise.all(calls), keys);
  assert.equal(starts, 3);
});

test('completed work is released so a later refresh starts new requests', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  let starts = 0;
  const start = () => {
    starts += 1;
    return { ready: Promise.resolve('ready'), complete: Promise.resolve(`complete-${starts}`) };
  };

  assert.equal(await coordinate('account:1:credentials:1', 'complete', start), 'complete-1');
  assert.equal(await coordinate('account:1:credentials:1', 'complete', start), 'complete-2');
  assert.equal(starts, 2);
});

test('a rejected background completion is handled and does not prevent retry', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  const complete = deferred<string>();
  const trading = coordinate('account:1:credentials:1', 'trading', () => ({
    ready: Promise.resolve('ready'), complete: complete.promise,
  }));
  assert.equal(await trading, 'ready');

  complete.reject(new Error('ancillary request failed'));
  // Flush the completion handler, without creating a consumer of that stage.
  await Promise.resolve();
  let starts = 0;
  const retried = coordinate('account:1:credentials:1', 'complete', () => {
    starts += 1;
    return { ready: Promise.resolve('ready again'), complete: Promise.resolve('retried') };
  });
  assert.equal(await retried, 'retried');
  assert.equal(starts, 1);
});

test('readiness failures reach callers and are released when the run finishes', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  const ready = deferred<string>();
  const complete = deferred<string>();
  const run = { ready: ready.promise, complete: complete.promise };
  const tradingFailure = assert.rejects(coordinate('account:1:credentials:1', 'trading', () => run), /policy unavailable/);
  const completeFailure = assert.rejects(coordinate('account:1:credentials:1', 'complete', () => run), /policy unavailable/);
  ready.reject(new Error('policy unavailable'));
  complete.reject(new Error('policy unavailable'));
  await Promise.all([tradingFailure, completeFailure]);

  assert.equal(await coordinate('account:1:credentials:1', 'trading', () => ({
    ready: Promise.resolve('recovered'), complete: Promise.resolve('recovered'),
  })), 'recovered');
});

test('a complete-only caller does not leave a readiness rejection unhandled', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  assert.equal(await coordinate('account:1:credentials:1', 'complete', () => ({
    ready: Promise.reject(new Error('readiness failed')),
    complete: Promise.resolve('completed with failed snapshot'),
  })), 'completed with failed snapshot');
});

test('synchronous startup errors do not leave an in-flight entry', async () => {
  const coordinate = createBootstrapRequestCoordinator<string>();
  await assert.rejects(coordinate('account:1:credentials:1', 'trading', () => {
    throw new Error('startup failed');
  }), /startup failed/);
  assert.equal(await coordinate('account:1:credentials:1', 'complete', () => ({
    ready: Promise.resolve('ready'), complete: Promise.resolve('retry completed'),
  })), 'retry completed');
});

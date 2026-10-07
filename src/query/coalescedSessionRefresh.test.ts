import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoalescedSessionRefreshScheduler } from './coalescedSessionRefresh.ts';

const waitUntil = async (condition: () => boolean, timeoutMs = 1_000) => {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for coalesced refresh');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
};

test('50 refresh requests in one burst collapse into one refresh', async () => {
  const scheduler = createCoalescedSessionRefreshScheduler(0);
  const owner = {};
  let refreshCalls = 0;

  for (let index = 0; index < 50; index += 1) {
    scheduler.schedule(owner, 'session-a', () => {
      refreshCalls += 1;
    });
  }

  await waitUntil(() => refreshCalls === 1);
  await new Promise<void>((resolve) => setTimeout(resolve, 5));
  assert.equal(refreshCalls, 1);
});

test('requests arriving during a refresh produce only one trailing refresh', async () => {
  const scheduler = createCoalescedSessionRefreshScheduler(0);
  const owner = {};
  let refreshCalls = 0;
  let releaseFirst: () => void = () => {};
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  scheduler.schedule(owner, 'session-a', async () => {
    refreshCalls += 1;
    await firstGate;
  });
  await waitUntil(() => refreshCalls === 1);

  for (let index = 0; index < 50; index += 1) {
    scheduler.schedule(owner, 'session-a', () => {
      refreshCalls += 1;
    });
  }
  assert.equal(refreshCalls, 1);
  releaseFirst();

  await waitUntil(() => refreshCalls === 2);
  await new Promise<void>((resolve) => setTimeout(resolve, 5));
  assert.equal(refreshCalls, 2);
});

test('different owners and namespaces never share a refresh batch', async () => {
  const scheduler = createCoalescedSessionRefreshScheduler(0);
  const ownerA = {};
  const ownerB = {};
  const calls: string[] = [];

  scheduler.schedule(ownerA, 'session-a', () => calls.push('a'));
  scheduler.schedule(ownerA, 'session-b', () => calls.push('b'));
  scheduler.schedule(ownerB, 'session-a', () => calls.push('c'));

  await waitUntil(() => calls.length === 3);
  assert.deepEqual([...calls].sort(), ['a', 'b', 'c']);
});

test('cancel removes a pending refresh before it can run', async () => {
  const scheduler = createCoalescedSessionRefreshScheduler(5);
  const owner = {};
  let refreshCalls = 0;

  scheduler.schedule(owner, 'session-a', () => {
    refreshCalls += 1;
  });
  scheduler.cancel(owner, 'session-a');
  await new Promise<void>((resolve) => setTimeout(resolve, 15));

  assert.equal(refreshCalls, 0);
});

test('a rejected refresh is contained and a later batch can still run', async () => {
  const scheduler = createCoalescedSessionRefreshScheduler(0);
  const owner = {};
  let errors = 0;
  let successfulCalls = 0;

  scheduler.schedule(
    owner,
    'session-a',
    async () => {
      throw new Error('refresh failed');
    },
    () => {
      errors += 1;
    },
  );
  await waitUntil(() => errors === 1);
  scheduler.schedule(owner, 'session-a', () => {
    successfulCalls += 1;
  });
  await waitUntil(() => successfulCalls === 1);

  assert.equal(errors, 1);
});

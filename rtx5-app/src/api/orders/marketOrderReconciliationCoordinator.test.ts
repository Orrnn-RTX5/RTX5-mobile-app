import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginCoalescedMarketOrderReconciliation,
  resetMarketOrderReconciliationCoordinatorForTests,
} from './marketOrderReconciliationCoordinator.ts';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test.afterEach(() => {
  resetMarketOrderReconciliationCoordinatorForTests();
});

test('50 overlapping order transports share one trailing reconciliation without delaying transport', async () => {
  let reconciliationCalls = 0;
  let releaseReconciliation: () => void = () => {};
  const reconciliationGate = new Promise<void>((resolve) => {
    releaseReconciliation = resolve;
  });
  const released: number[] = [];
  const handles = Array.from({ length: 50 }, (_, index) => (
    beginCoalescedMarketOrderReconciliation({
      ownerKey: 'broker:10001:g1',
      isOwnerCurrent: () => true,
      reconcile: async (evidence, isBatchCurrent) => {
        reconciliationCalls += 1;
        assert.equal(evidence.length, 50);
        assert.equal(isBatchCurrent(), true);
        await reconciliationGate;
        assert.equal(isBatchCurrent(), true);
      },
      releaseBarrier: () => released.push(index + 1),
    })
  ));

  handles.forEach((handle) => handle.markTransportStarted());
  assert.equal(reconciliationCalls, 0, 'transport admission must not wait for reconciliation');
  handles.forEach((handle) => handle.finish(null));
  await flushMicrotasks();

  assert.equal(reconciliationCalls, 1);
  assert.equal(released.length, 0, 'barriers remain held until the shared read settles');
  releaseReconciliation();
  await flushMicrotasks();

  assert.deepEqual(released, Array.from({ length: 50 }, (_, index) => index + 1));
});

test('a newer transport invalidates an older read and owns the final commit window', async () => {
  const currentChecks: Array<() => boolean> = [];
  const resolvers: Array<() => void> = [];
  const released: string[] = [];
  const createHandle = (label: string) => beginCoalescedMarketOrderReconciliation({
    ownerKey: 'broker:10001:g1',
    isOwnerCurrent: () => true,
    reconcile: async (_evidence, isBatchCurrent) => {
      currentChecks.push(isBatchCurrent);
      await new Promise<void>((resolve) => resolvers.push(resolve));
    },
    releaseBarrier: () => released.push(label),
  });

  const first = createHandle('first');
  first.markTransportStarted();
  first.finish(null);
  await flushMicrotasks();
  assert.equal(currentChecks.length, 1);
  assert.equal(currentChecks[0](), true);

  const second = createHandle('second');
  second.markTransportStarted();
  assert.equal(currentChecks[0](), false, 'new transport must fence the older read');
  second.finish(null);
  resolvers[0]();
  await flushMicrotasks();

  assert.equal(currentChecks.length, 2);
  assert.deepEqual(released, []);
  assert.equal(currentChecks[1](), true);
  resolvers[1]();
  await flushMicrotasks();

  assert.deepEqual(released, ['first', 'second']);
});

test('an operation that never reaches transport releases immediately and does not reconcile', async () => {
  let reconciliationCalls = 0;
  let releaseCalls = 0;
  const handle = beginCoalescedMarketOrderReconciliation({
    ownerKey: 'broker:10001:g1',
    isOwnerCurrent: () => true,
    reconcile: async () => {
      reconciliationCalls += 1;
    },
    releaseBarrier: () => {
      releaseCalls += 1;
    },
  });

  handle.finish(null);
  await flushMicrotasks();

  assert.equal(reconciliationCalls, 0);
  assert.equal(releaseCalls, 1);
});

test('a stale broker owner cannot commit and releases every held barrier', async () => {
  let ownerCurrent = true;
  let commits = 0;
  let releaseRead: () => void = () => {};
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const released: number[] = [];
  const handles = Array.from({ length: 50 }, (_, index) => (
    beginCoalescedMarketOrderReconciliation({
      ownerKey: 'broker:10001:g1',
      isOwnerCurrent: () => ownerCurrent,
      reconcile: async (_evidence, isBatchCurrent) => {
        await readGate;
        if (isBatchCurrent()) commits += 1;
      },
      releaseBarrier: () => released.push(index + 1),
    })
  ));

  handles.forEach((handle) => {
    handle.markTransportStarted();
    handle.finish(null);
  });
  await flushMicrotasks();
  ownerCurrent = false;
  releaseRead();
  await flushMicrotasks();

  assert.equal(commits, 0);
  assert.equal(released.length, 50);
});

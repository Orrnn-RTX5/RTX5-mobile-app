import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetQuoteSnapshotReconcileForTests,
  requestQuoteSnapshotReconcile,
  subscribeQuoteSnapshotReconcile,
} from './quoteSnapshotReconcileRuntime';

test('foreground snapshot reconciliation is identity-bound and unsubscribable', () => {
  __resetQuoteSnapshotReconcileForTests();
  const received: unknown[] = [];
  const unsubscribe = subscribeQuoteSnapshotReconcile((identity) => received.push(identity));
  const identity = { brokerId: 'broker-a', accountLogin: '1001', sessionEpoch: 3 };

  requestQuoteSnapshotReconcile(identity);
  unsubscribe();
  requestQuoteSnapshotReconcile({ ...identity, sessionEpoch: 4 });

  assert.deepEqual(received, [identity]);
  __resetQuoteSnapshotReconcileForTests();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuestSessionReadiness } from './guestSessionReadiness';

test('guest shortcut requires completed secure cleanup and synchronously invalidates old attempts', () => {
  const readiness = createGuestSessionReadiness();
  let epoch = 0;
  const input = { hasActiveSession: false, hasAuthenticatedPreferences: false, invalidate: () => { epoch += 1; } };
  assert.equal(readiness.tryPrepare(input), false, 'initial memory state is not proof that storage is empty');
  assert.equal(epoch, 0);
  readiness.markSecureAuthorityEmpty();
  assert.equal(readiness.tryPrepare(input), true);
  assert.equal(epoch, 1);
  assert.equal(readiness.tryPrepare(input), true);
  assert.equal(epoch, 2, 'each selection invalidates even an unqueued old login');
});

test('a queued restore, logout or commit blocks the shortcut until every mutation completes', () => {
  const readiness = createGuestSessionReadiness();
  readiness.markSecureAuthorityEmpty();
  const input = { hasActiveSession: false, hasAuthenticatedPreferences: false, invalidate: () => {} };
  const finishFirst = readiness.beginMutation();
  const finishSecond = readiness.beginMutation();
  assert.equal(readiness.tryPrepare(input), false);
  finishFirst();
  finishFirst();
  assert.equal(readiness.tryPrepare(input), false, 'finishing one mutation twice cannot hide another queued writer');
  finishSecond();
  assert.equal(readiness.tryPrepare(input), true);
});

test('new credential writes, active sessions or stale authenticated preferences require full cleanup', () => {
  const readiness = createGuestSessionReadiness();
  const input = { hasActiveSession: false, hasAuthenticatedPreferences: false, invalidate: () => assert.fail('must not take fast path') };
  readiness.markSecureAuthorityEmpty();
  assert.equal(readiness.tryPrepare({ ...input, hasActiveSession: true }), false);
  assert.equal(readiness.tryPrepare({ ...input, hasAuthenticatedPreferences: true }), false);
  readiness.markSecureAuthorityPresent();
  assert.equal(readiness.tryPrepare(input), false, 'a failed or pending replacement cannot reuse prior empty proof');
});

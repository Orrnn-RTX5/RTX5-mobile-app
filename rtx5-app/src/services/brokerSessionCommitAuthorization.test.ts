import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetBrokerSessionCommitAuthorizationForTests,
  cancelBrokerSessionCommitAuthorization,
  consumeBrokerSessionCommitAuthorization,
  issueBrokerSessionCommitAuthorization,
  StaleBrokerSessionCommitError,
} from './brokerSessionCommitAuthorization';

test.beforeEach(() => __resetBrokerSessionCommitAuthorizationForTests());

test('only the newest concurrent login attempt can commit', () => {
  const older = issueBrokerSessionCommitAuthorization(4);
  const newer = issueBrokerSessionCommitAuthorization(4);

  assert.throws(
    () => consumeBrokerSessionCommitAuthorization(older, 4),
    StaleBrokerSessionCommitError,
  );
  assert.doesNotThrow(() => consumeBrokerSessionCommitAuthorization(newer, 4));
  assert.throws(
    () => consumeBrokerSessionCommitAuthorization(newer, 4),
    StaleBrokerSessionCommitError,
  );
});

test('logout or another transition invalidates a pending login response', () => {
  const pending = issueBrokerSessionCommitAuthorization(7);

  assert.throws(
    () => consumeBrokerSessionCommitAuthorization(pending, 8),
    StaleBrokerSessionCommitError,
  );
});

test('unmount cancellation prevents a late response from committing', () => {
  const pending = issueBrokerSessionCommitAuthorization(2);
  cancelBrokerSessionCommitAuthorization(pending);

  assert.throws(
    () => consumeBrokerSessionCommitAuthorization(pending, 2),
    StaleBrokerSessionCommitError,
  );
});

test('cancelling an older attempt cannot cancel the newer authorization', () => {
  const older = issueBrokerSessionCommitAuthorization(3);
  const newer = issueBrokerSessionCommitAuthorization(3);
  cancelBrokerSessionCommitAuthorization(older);

  assert.doesNotThrow(() => consumeBrokerSessionCommitAuthorization(newer, 3));
});

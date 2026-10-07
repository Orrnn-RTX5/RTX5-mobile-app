import assert from 'node:assert/strict';
import test from 'node:test';

import {
  failClosedPersistedAuthState,
  injectRuntimeCredentials,
  sanitizePreferenceAuthStorageValue,
} from './authPersistence';

const legacyStorageValue = {
  state: {
    isLoggedIn: true,
    brokerId: 'broker-a',
    themeMode: 'dark',
    feed_broker_token: 'legacy-feed',
    accountDetails: {
      id: '1001',
      name: 'Trader',
      server: 'Broker A',
      credentials: {
        accessToken: 'legacy-access',
        refreshToken: 'legacy-refresh',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    },
  },
  version: 21,
};

test('preference sanitizer extracts legacy credentials but persists identity only', () => {
  const result = sanitizePreferenceAuthStorageValue(legacyStorageValue);
  const serialized = JSON.stringify(result.sanitizedStorageValue);

  assert.deepEqual(result.accountIdentity, {
    id: '1001',
    name: 'Trader',
    server: 'Broker A',
  });
  assert.deepEqual(result.legacyCredentials, {
    accessToken: 'legacy-access',
    refreshToken: 'legacy-refresh',
    expiresAt: '2030-01-01T00:00:00.000Z',
  });
  assert.equal(result.containedAuthSecrets, true);
  assert.doesNotMatch(serialized, /legacy-access|legacy-refresh|legacy-feed|credentials/);
  assert.deepEqual(
    (result.sanitizedStorageValue.state as Record<string, unknown>).accountDetails,
    result.accountIdentity,
  );
});

test('secure credentials are injected into runtime only and fail-closed state drops identity', () => {
  const sanitized = sanitizePreferenceAuthStorageValue(legacyStorageValue);
  const runtime = injectRuntimeCredentials(
    sanitized.sanitizedStorageValue,
    {
      version: 1,
      brokerId: 'broker-a',
      accountLogin: '1001',
      accessToken: 'secure-access',
      refreshToken: 'secure-refresh',
      expiresAt: '2031-01-01T00:00:00.000Z',
    },
    sanitized.accountIdentity!,
  );

  assert.match(JSON.stringify(runtime), /secure-access/);
  assert.doesNotMatch(JSON.stringify(sanitized.sanitizedStorageValue), /secure-access|credentials/);

  const failed = failClosedPersistedAuthState(sanitized.sanitizedStorageValue);
  const failedState = failed.state as Record<string, unknown>;
  assert.equal(failedState.isLoggedIn, false);
  assert.equal(failedState.accountDetails, null);
  assert.equal(failedState.accountType, 'unknown');
  assert.equal(failedState.accountEnvironmentSource, 'unknown');
  assert.equal(failedState.accountEnvironmentKey, '');
  assert.equal(failedState.isDemoAccount, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTH_CREDENTIAL_BUNDLE_KEY,
  LEGACY_AUTH_CREDENTIAL_KEYS,
  SecureCredentialBundleStore,
  type SecureCredentialStorage,
} from './secureCredentialBundle';

class MemorySecureStorage implements SecureCredentialStorage {
  readonly values = new Map<string, string>();
  delayFirstBundleWriteMs = 0;
  private bundleWriteCount = 0;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (key === AUTH_CREDENTIAL_BUNDLE_KEY) {
      this.bundleWriteCount += 1;
      if (this.bundleWriteCount === 1 && this.delayFirstBundleWriteMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayFirstBundleWriteMs));
      }
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const credentials = (
  brokerId: string,
  accountLogin: string,
  accessToken: string,
) => ({
  brokerId,
  accountLogin,
  accessToken,
  refreshToken: `refresh-${accountLogin}`,
  expiresAt: '2030-01-01T00:00:00.000Z',
});

test('legacy-only cleanup scrubs aliases without changing canonical authority', async () => {
  const storage = new MemorySecureStorage();
  const store = new SecureCredentialBundleStore(storage);
  await store.replace(credentials('Broker-A', '1001', 'access-a'));
  const canonical = storage.values.get(AUTH_CREDENTIAL_BUNDLE_KEY);
  LEGACY_AUTH_CREDENTIAL_KEYS.forEach(key => storage.values.set(key, 'obsolete'));
  await store.clearLegacy();
  assert.equal(storage.values.get(AUTH_CREDENTIAL_BUNDLE_KEY), canonical);
  LEGACY_AUTH_CREDENTIAL_KEYS.forEach(key => assert.equal(storage.values.has(key), false));
});

test('deferred legacy cleanup serializes behind a replacement and cannot clear its new bundle', async () => {
  const values = new Map<string, string>();
  const removed: string[] = [];
  let finishWrite!: () => void;
  const writeGate = new Promise<void>(resolve => { finishWrite = resolve; });
  const store = new SecureCredentialBundleStore({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { await writeGate; values.set(key, value); },
    removeItem: async key => { removed.push(key); values.delete(key); },
  });
  const replacement = store.replace(credentials('Broker-B', '2002', 'access-b'));
  await new Promise(resolve => setImmediate(resolve));
  const cleanup = store.clearLegacy();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(removed.length, LEGACY_AUTH_CREDENTIAL_KEYS.length, 'background cleanup must wait for the active credential writer');
  finishWrite();
  await Promise.all([replacement, cleanup]);
  assert.equal(removed.length, LEGACY_AUTH_CREDENTIAL_KEYS.length * 2);
  assert.equal(removed.includes(AUTH_CREDENTIAL_BUNDLE_KEY), false);
  assert.equal((await store.get())?.accessToken, 'access-b');
});

test('failed legacy-only cleanup does not roll back current credentials', async () => {
  const storage = new MemorySecureStorage();
  const store = new SecureCredentialBundleStore(storage);
  await store.replace(credentials('Broker-A', '1001', 'access-a'));
  const canonical = storage.values.get(AUTH_CREDENTIAL_BUNDLE_KEY);
  storage.removeItem = async key => { if (key === LEGACY_AUTH_CREDENTIAL_KEYS[0]) throw new Error('legacy delete failed'); storage.values.delete(key); };
  await assert.rejects(store.clearLegacy(), /legacy delete failed/);
  assert.equal(storage.values.get(AUTH_CREDENTIAL_BUNDLE_KEY), canonical);
});

test('credential replacement is broker/account bound and removes legacy feed-token aliases', async () => {
  const storage = new MemorySecureStorage();
  const store = new SecureCredentialBundleStore(storage);
  LEGACY_AUTH_CREDENTIAL_KEYS.forEach((key) => storage.values.set(key, `legacy-${key}`));

  await store.replace(credentials('Broker-A', '1001', 'access-a'));
  const brokerA = await store.get({ brokerId: 'Broker-A', accountLogin: '1001' });
  assert.equal(brokerA?.accessToken, 'access-a');
  assert.equal('feedToken' in (brokerA ?? {}), false);
  assert.equal(await store.get({ brokerId: 'broker-b', accountLogin: '1001' }), null);
  LEGACY_AUTH_CREDENTIAL_KEYS.forEach((key) => assert.equal(storage.values.has(key), false));

  storage.values.set('feed_token', 'stale-feed-a');
  storage.values.set('broker_feed_token', 'stale-feed-a-alias');
  await store.replace(credentials('broker-b', '2002', 'access-b'));

  const brokerB = await store.get({ brokerId: 'broker-b', accountLogin: '2002' });
  assert.equal(brokerB?.accessToken, 'access-b');
  assert.equal('feedToken' in (brokerB ?? {}), false);
  LEGACY_AUTH_CREDENTIAL_KEYS.forEach((key) => assert.equal(storage.values.has(key), false));
});

test('serialized replacements cannot let an earlier slow write overwrite the newer session', async () => {
  const storage = new MemorySecureStorage();
  storage.delayFirstBundleWriteMs = 25;
  const store = new SecureCredentialBundleStore(storage);

  const first = store.replace(credentials('broker-a', '1001', 'access-a'));
  const second = store.replace(credentials('broker-b', '2002', 'access-b'));
  await Promise.all([first, second]);

  const current = await store.get();
  assert.equal(current?.brokerId, 'broker-b');
  assert.equal(current?.accountLogin, '2002');
  assert.equal(current?.accessToken, 'access-b');
  assert.equal('feedToken' in (current ?? {}), false);
});

test('legacy credentials migrate once into the versioned bundle and are erased', async () => {
  const storage = new MemorySecureStorage();
  storage.values.set('feed_broker_token', 'legacy-feed');
  storage.values.set('refresh_token', 'unbound-legacy-refresh');
  const store = new SecureCredentialBundleStore(storage);

  const migrated = await store.migrateLegacy({
    brokerId: 'broker-a',
    accountLogin: '1001',
    credentials: {
      accessToken: 'legacy-access',
      refreshToken: 'bound-legacy-refresh',
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  });

  assert.equal(migrated?.accessToken, 'legacy-access');
  assert.equal(migrated?.refreshToken, 'bound-legacy-refresh');
  assert.equal('feedToken' in (migrated ?? {}), false);
  LEGACY_AUTH_CREDENTIAL_KEYS.forEach((key) => assert.equal(storage.values.has(key), false));

  const restored = await store.migrateLegacy({
    brokerId: 'broker-a',
    accountLogin: '1001',
  });
  assert.deepEqual(restored, migrated);
});

test('stale preference identity cannot erase the current secure session bundle', async () => {
  const storage = new MemorySecureStorage();
  const store = new SecureCredentialBundleStore(storage);
  await store.replace(credentials('broker-a', '1001', 'access-a'));

  const migrated = await store.migrateLegacy({ brokerId: 'broker-b', accountLogin: '2002' });

  assert.equal(migrated, null);
  assert.equal(
    JSON.parse(storage.values.get(AUTH_CREDENTIAL_BUNDLE_KEY) ?? '{}').brokerId,
    'broker-a',
  );
  assert.equal(
    JSON.parse(storage.values.get(AUTH_CREDENTIAL_BUNDLE_KEY) ?? '{}').accountLogin,
    '1001',
  );
});

test('stale legacy credentials cannot overwrite the current secure session bundle', async () => {
  const storage = new MemorySecureStorage();
  const store = new SecureCredentialBundleStore(storage);
  await store.replace(credentials('achiever-financials', '200002', 'achiever-access'));

  const migrated = await store.migrateLegacy({
    brokerId: 'gta',
    accountLogin: '100001',
    credentials: {
      accessToken: 'stale-gta-access',
      refreshToken: 'stale-gta-refresh',
    },
  });

  assert.equal(migrated, null);
  const current = await store.get();
  assert.equal(current?.brokerId, 'achiever-financials');
  assert.equal(current?.accountLogin, '200002');
  assert.equal(current?.accessToken, 'achiever-access');
});

test('unbound individual legacy tokens are erased rather than rebound to a broker', async () => {
  const storage = new MemorySecureStorage();
  storage.values.set('access_token', 'unbound-access');
  storage.values.set('refresh_token', 'unbound-refresh');
  storage.values.set('feed_token', 'unbound-feed');
  const store = new SecureCredentialBundleStore(storage);

  const migrated = await store.migrateLegacy({ brokerId: 'broker-b', accountLogin: '2002' });

  assert.equal(migrated, null);
  assert.equal(storage.values.has(AUTH_CREDENTIAL_BUNDLE_KEY), false);
  LEGACY_AUTH_CREDENTIAL_KEYS.forEach((key) => assert.equal(storage.values.has(key), false));
});

test('pre-v3 feed-token fields on an input are never persisted', async () => {
  const storage = new MemorySecureStorage();
  const store = new SecureCredentialBundleStore(storage);
  const legacyInput = {
    ...credentials('trivanta-markets', '200074', 'access-a'),
    feedToken: 'legacy-feed-secret',
    feedAuthContext: {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token',
      brokerIdQueryParam: 'broker_id',
    },
  };

  const stored = await store.replace(legacyInput);

  assert.deepEqual(Object.keys(stored).sort(), [
    'accessToken',
    'accountLogin',
    'brokerId',
    'expiresAt',
    'refreshToken',
    'version',
  ]);
  assert.doesNotMatch(
    storage.values.get(AUTH_CREDENTIAL_BUNDLE_KEY) ?? '',
    /legacy-feed-secret|feedToken|feedAuthContext/,
  );
});

test('a pre-v3 bundle carrying feed-token fields still restores the session', async () => {
  const storage = new MemorySecureStorage();
  storage.values.set(AUTH_CREDENTIAL_BUNDLE_KEY, JSON.stringify({
    version: 1,
    brokerId: 'orrnn',
    accountLogin: '200074',
    accessToken: 'access-old',
    refreshToken: 'rtx5_rt_old',
    expiresAt: '2030-01-01T00:00:00.000Z',
    feedToken: 'legacy-feed-secret',
    feedAuthContext: { mode: 'disabled_unconfigured', reason: 'missing_credential' },
  }));
  const store = new SecureCredentialBundleStore(storage);

  const restored = await store.get({ brokerId: 'orrnn', accountLogin: 200074 });

  assert.deepEqual(restored, {
    version: 1,
    brokerId: 'orrnn',
    accountLogin: '200074',
    accessToken: 'access-old',
    refreshToken: 'rtx5_rt_old',
    expiresAt: '2030-01-01T00:00:00.000Z',
  });
});

test('legacy cleanup overlaps a slow bundle write, but a cleanup failure waits before erasing it', async () => {
  const storage = new MemorySecureStorage();
  let finishWrite!: () => void;
  const pendingWrite = new Promise<void>(resolve => { finishWrite = resolve; });
  const removed: string[] = [];
  const cleanupError = new Error('legacy delete failed');
  let failCleanup = true;
  storage.setItem = async (key, value) => {
    await pendingWrite;
    storage.values.set(key, value);
  };
  storage.removeItem = async key => {
    removed.push(key);
    if (failCleanup && key === LEGACY_AUTH_CREDENTIAL_KEYS[0]) {
      failCleanup = false;
      throw cleanupError;
    }
    storage.values.delete(key);
  };
  const store = new SecureCredentialBundleStore(storage);
  let settled = false;
  const replacement = store.replace(credentials('Broker-A', '1001', 'access-a'))
    .catch(error => { settled = true; assert.equal(error, cleanupError); });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(removed.includes(LEGACY_AUTH_CREDENTIAL_KEYS[0]), 'cleanup starts before the bundle write finishes');
  assert.equal(removed.includes(AUTH_CREDENTIAL_BUNDLE_KEY), false, 'rollback waits for the pending writer');
  assert.equal(settled, false);
  finishWrite(); await replacement;
  assert.equal(storage.values.has(AUTH_CREDENTIAL_BUNDLE_KEY), false);
  assert.equal(await store.get(), null);
});

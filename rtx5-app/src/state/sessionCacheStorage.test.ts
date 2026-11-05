import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANDLE_SESSION_CACHE_STORAGE_PREFIX,
  OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX,
  isAsyncStorageCapacityError,
  pruneObsoleteSessionCaches,
  selectObsoleteSessionCacheKeys,
} from './sessionCacheStorage';

const cacheKey = (prefix: string, namespace: string) =>
  `${prefix}:${encodeURIComponent(namespace)}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('cache pruning selects stale candle and position namespaces only', () => {
  const currentNamespace = 'achiever-financials:200002:new-session:7';
  const staleNamespace = 'gta:100001:old-session:3';
  const currentCandle = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, currentNamespace);
  const currentPositions = cacheKey(OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX, currentNamespace);
  const staleCandle = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, staleNamespace);
  const stalePositions = cacheKey(OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX, staleNamespace);

  assert.deepEqual(
    selectObsoleteSessionCacheKeys(
      [
        currentCandle,
        currentPositions,
        staleCandle,
        stalePositions,
        'rtx5-user-preferences-v2',
        'savedAccounts',
        'rtx5-terminal-journal-v1',
        CANDLE_SESSION_CACHE_STORAGE_PREFIX,
        `${CANDLE_SESSION_CACHE_STORAGE_PREFIX}-lookalike:value`,
      ],
      currentNamespace,
    ),
    [staleCandle, stalePositions],
  );
});

test('cache pruning without an active namespace selects every disposable session cache', () => {
  const keys = [
    cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, 'broker-a:1:first'),
    cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, 'broker-b:2:second'),
    cacheKey(OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX, 'broker-a:1:first'),
  ];

  assert.deepEqual(selectObsoleteSessionCacheKeys(keys), keys);
});

test('background pruning preserves the session activated while storage enumeration was pending', async () => {
  const enumeration = deferred<readonly string[]>();
  const oldNamespace = 'broker-a:1:old-session';
  const newNamespace = 'broker-b:2:new-session';
  let currentNamespace = oldNamespace;
  let removed: readonly string[] = [];
  const oldKey = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, oldNamespace);
  const currentKeys = [
    cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, newNamespace),
    cacheKey(OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX, newNamespace),
  ];
  const pruning = pruneObsoleteSessionCaches(() => currentNamespace, {
    getAllKeys: () => enumeration.promise,
    multiRemove: async keys => { removed = keys; },
  });

  currentNamespace = newNamespace;
  enumeration.resolve([oldKey, ...currentKeys, 'savedAccounts']);

  assert.equal(await pruning, 1);
  assert.deepEqual(removed, [oldKey]);
});

test('background pruning started while logged out preserves a newly logged-in account', async () => {
  const enumeration = deferred<readonly string[]>();
  let currentNamespace: string | null = null;
  let removed: readonly string[] = [];
  const oldKey = cacheKey(OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX, 'broker:1:old');
  const currentKey = cacheKey(OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX, 'broker:1:new');
  const pruning = pruneObsoleteSessionCaches(() => currentNamespace, {
    getAllKeys: () => enumeration.promise,
    multiRemove: async keys => { removed = keys; },
  });

  currentNamespace = 'broker:1:new';
  enumeration.resolve([oldKey, currentKey]);

  assert.equal(await pruning, 1);
  assert.deepEqual(removed, [oldKey]);
});

test('an account activated after deletion is queued keeps its new cache namespace', async () => {
  const deletion = deferred<void>();
  const oldKey = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, 'broker:1:old');
  const activeKey = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, 'broker:1:active');
  const futureKey = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, 'broker:2:future');
  const stored = new Set([oldKey, activeKey, 'rtx5-user-preferences-v2']);
  let currentNamespace = 'broker:1:active';
  const pruning = pruneObsoleteSessionCaches(() => currentNamespace, {
    getAllKeys: async () => [...stored],
    multiRemove: async keys => {
      // A subsequent login can finish while the native delete is pending.
      currentNamespace = 'broker:2:future';
      stored.add(futureKey);
      await deletion.promise;
      keys.forEach(key => stored.delete(key));
    },
  });
  await Promise.resolve();
  deletion.resolve();

  assert.equal(await pruning, 1);
  assert.deepEqual([...stored], [activeKey, 'rtx5-user-preferences-v2', futureKey]);
});

test('logout during enumeration makes all old session caches disposable', async () => {
  const enumeration = deferred<readonly string[]>();
  let currentNamespace: string | null = 'broker:1:active';
  const oldKey = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, currentNamespace);
  let removed: readonly string[] = [];
  const pruning = pruneObsoleteSessionCaches(() => currentNamespace, {
    getAllKeys: () => enumeration.promise,
    multiRemove: async keys => { removed = keys; },
  });

  currentNamespace = null;
  enumeration.resolve([oldKey, 'savedAccounts']);

  assert.equal(await pruning, 1);
  assert.deepEqual(removed, [oldKey]);
});

test('failed cache deletion excludes active caches and reports the storage failure', async () => {
  const currentNamespace = 'broker:1:active';
  const currentKey = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, currentNamespace);
  const oldKey = cacheKey(CANDLE_SESSION_CACHE_STORAGE_PREFIX, 'broker:1:old');
  const failure = new Error('cache storage is unavailable');
  let attempted: readonly string[] = [];
  await assert.rejects(pruneObsoleteSessionCaches(() => currentNamespace, {
    getAllKeys: async () => [currentKey, oldKey],
    multiRemove: async keys => { attempted = keys; throw failure; },
  }), error => error === failure);

  assert.deepEqual(attempted, [oldKey]);
});

test('failed enumeration does not attempt any cache removal', async () => {
  const failure = new Error('cache storage is unavailable');
  let removalAttempted = false;
  await assert.rejects(pruneObsoleteSessionCaches(() => 'broker:1:active', {
    getAllKeys: async () => { throw failure; },
    multiRemove: async () => { removalAttempted = true; },
  }), error => error === failure);
  assert.equal(removalAttempted, false);
});

test('AsyncStorage capacity errors are recognized without treating generic failures as full storage', () => {
  assert.equal(
    isAsyncStorageCapacityError(new Error('database or disk is full (code 13 SQLITE_FULL)')),
    true,
  );
  assert.equal(isAsyncStorageCapacityError({ code: 13, message: 'database is full' }), true);
  assert.equal(isAsyncStorageCapacityError(new Error('database is locked')), false);
  assert.equal(isAsyncStorageCapacityError(null), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANDLE_SESSION_CACHE_STORAGE_PREFIX,
  OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX,
  isAsyncStorageCapacityError,
  selectObsoleteSessionCacheKeys,
} from './sessionCacheStorage';

const cacheKey = (prefix: string, namespace: string) =>
  `${prefix}:${encodeURIComponent(namespace)}`;

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

test('AsyncStorage capacity errors are recognized without treating generic failures as full storage', () => {
  assert.equal(
    isAsyncStorageCapacityError(new Error('database or disk is full (code 13 SQLITE_FULL)')),
    true,
  );
  assert.equal(isAsyncStorageCapacityError({ code: 13, message: 'database is full' }), true);
  assert.equal(isAsyncStorageCapacityError(new Error('database is locked')), false);
  assert.equal(isAsyncStorageCapacityError(null), false);
});

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * These caches are disposable, session-scoped accelerators. Their keys include
 * a new immutable session namespace on every activation, so an older namespace
 * can never be read by a later login or cold start.
 */
export const CANDLE_SESSION_CACHE_STORAGE_PREFIX = 'rtx5:chart-candle-cache:v2';
export const OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX = 'rtx5-open-positions-v2';

const SESSION_CACHE_STORAGE_PREFIXES = [
  CANDLE_SESSION_CACHE_STORAGE_PREFIX,
  OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX,
] as const;

const getSessionCacheStorageKey = (prefix: string, cacheNamespace: string): string =>
  `${prefix}:${encodeURIComponent(cacheNamespace)}`;

/**
 * Pure selector kept separate from AsyncStorage so the deletion boundary is
 * easy to audit and test. It never selects preferences, saved accounts,
 * journals, credentials, or any key outside the two disposable cache families.
 */
export const selectObsoleteSessionCacheKeys = (
  storageKeys: readonly string[],
  preserveCacheNamespace?: string | null,
): string[] => {
  const preservedKeys = preserveCacheNamespace
    ? new Set(
        SESSION_CACHE_STORAGE_PREFIXES.map((prefix) =>
          getSessionCacheStorageKey(prefix, preserveCacheNamespace),
        ),
      )
    : null;

  return storageKeys.filter((key) => {
    const isDisposableSessionCache = SESSION_CACHE_STORAGE_PREFIXES.some((prefix) =>
      key.startsWith(`${prefix}:`),
    );
    return isDisposableSessionCache && !preservedKeys?.has(key);
  });
};

/** Removes only cache namespaces that the active session can no longer use. */
export const pruneObsoleteSessionCaches = async (
  preserveCacheNamespace?: string | null,
): Promise<number> => {
  const storageKeys = await AsyncStorage.getAllKeys();
  const obsoleteKeys = selectObsoleteSessionCacheKeys(
    storageKeys,
    preserveCacheNamespace,
  );
  if (obsoleteKeys.length > 0) {
    await AsyncStorage.multiRemove(obsoleteKeys);
  }
  return obsoleteKeys.length;
};

/** React Native surfaces SQLite capacity errors with different wrapper shapes. */
export const isAsyncStorageCapacityError = (error: unknown): boolean => {
  if (!error) return false;

  const record = typeof error === 'object'
    ? error as Record<string, unknown>
    : null;
  const diagnostic = [
    typeof error === 'string' ? error : '',
    record?.name,
    record?.message,
    record?.code,
  ]
    .filter((value): value is string | number =>
      typeof value === 'string' || typeof value === 'number')
    .join(' ');

  return /SQLITE_FULL|database (?:or disk )?is full|code\s*13\b/i.test(diagnostic);
};

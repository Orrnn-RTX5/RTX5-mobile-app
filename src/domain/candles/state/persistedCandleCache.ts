import AsyncStorage from '@react-native-async-storage/async-storage';

import { sanitizeCandlesForChart } from '../normalization/chartAdapter';
import {
  MAX_PERSISTED_CANDLE_CACHE_ENTRIES,
  MAX_CANDLE_SERIES_LENGTH,
  isTrustworthyCandleBootstrapSeed,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/candles';
import type { Candle } from '../../../state/tradingState';
import { useTradingState } from '../../../state/tradingState';
import { CANDLE_SESSION_CACHE_STORAGE_PREFIX } from '../../../state/sessionCacheStorage';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  subscribeActiveBrokerSession,
  type ActiveBrokerSessionIdentity,
  type ActiveBrokerSessionProvenance,
} from '../../../state/activeBrokerSession';

const STORAGE_KEY_PREFIX = CANDLE_SESSION_CACHE_STORAGE_PREFIX;
/** Schema version. Bump this if `PersistedCandleCacheEntry` structure changes. */
const STORAGE_VERSION = 4;
/** Minimum delay between writing to device storage to prevent IO thrashing. */
const PERSIST_THROTTLE_MS = 5000;

/** Represents a single cached candle series on disk. */
type PersistedCandleCacheEntry = {
  symbol: string;
  timeframe: string;
  /** Unix timestamp of when this entry was last saved. */
  updatedAt: number;
  candles: Candle[];
};

/** The full payload saved to AsyncStorage. */
type PersistedCandleCacheState = {
  version: typeof STORAGE_VERSION;
  cacheNamespace: string;
  /** Map of normalized string keys (e.g. "EURUSD.M1") to their cache entries. */
  entries: Record<string, PersistedCandleCacheEntry>;
};

/** Returns an empty shell for the persistent state. */
const emptyStorage = (cacheNamespace: string): PersistedCandleCacheState => ({
  version: STORAGE_VERSION,
  cacheNamespace,
  entries: {},
});

type CandleCacheScope = Readonly<{
  cacheNamespace: string;
  identity: ActiveBrokerSessionIdentity;
  resetGeneration: number;
}>;

type PendingPersistedCandleWrite = Readonly<{
  scope: CandleCacheScope;
  entry: PersistedCandleCacheEntry;
}>;

const getPersistedCandleStorageKey = (cacheNamespace: string): string =>
  `${STORAGE_KEY_PREFIX}:${encodeURIComponent(cacheNamespace)}`;

const normalizeCacheKey = (symbol: string, timeframe: string) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);

  if (!normalizedSymbol || !normalizedTimeframe) {
    return null;
  }

  return {
    key: `${normalizedSymbol}.${normalizedTimeframe}`,
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  };
};

/** Ensures a restored array of candles fits within safe memory limits. */
const sanitizeCandles = (candles: Candle[], timeframe: string): Candle[] =>
  sanitizeCandlesForChart(candles, { timeframe }).slice(-MAX_CANDLE_SERIES_LENGTH);

/** 
 * Enforces a maximum number of cached chart series on disk. 
 * Evicts the least-recently-updated charts if the limit is exceeded.
 */
const trimEntries = (entries: Record<string, PersistedCandleCacheEntry>) => {
  const ordered = Object.entries(entries).sort(
    (left, right) => right[1].updatedAt - left[1].updatedAt,
  );
  return Object.fromEntries(ordered.slice(0, MAX_PERSISTED_CANDLE_CACHE_ENTRIES));
};

/**
 * Safely parses the raw JSON string from AsyncStorage into the typed state object.
 * Validates OHLCV structure and silently discards corrupted or outdated entries.
 */
const parseStorage = (
  raw: string | null,
  expectedCacheNamespace: string,
): PersistedCandleCacheState => {
  if (!raw) {
    return emptyStorage(expectedCacheNamespace);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCandleCacheState>;
    if (
      parsed.version !== STORAGE_VERSION ||
      parsed.cacheNamespace !== expectedCacheNamespace ||
      !parsed.entries ||
      typeof parsed.entries !== 'object'
    ) {
      return emptyStorage(expectedCacheNamespace);
    }

    const sanitizedEntries: Record<string, PersistedCandleCacheEntry> = {};
    for (const [key, entry] of Object.entries(parsed.entries as Record<string, Partial<PersistedCandleCacheEntry> & { candles?: Candle[] }>)) {
      if (!entry.symbol || !entry.timeframe || !Array.isArray(entry.candles)) {
        continue;
      }

      const timeframe = normalizeTimeframeStrict(entry.timeframe);
      if (!timeframe) {
        continue;
      }
      const candles = sanitizeCandles(entry.candles, timeframe);
      if (!isTrustworthyCandleBootstrapSeed(candles, timeframe)) {
        continue;
      }

      sanitizedEntries[key] = {
        symbol: normalizeSymbol(entry.symbol),
        timeframe,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
        candles,
      };
    }

    return {
      version: STORAGE_VERSION,
      cacheNamespace: expectedCacheNamespace,
      entries: trimEntries(sanitizedEntries),
    };
  } catch (error) {
    console.error('[persistedCandleCache] Failed to parse candle cache', error);
    return emptyStorage(expectedCacheNamespace);
  }
};

let storageSnapshot: PersistedCandleCacheState | null = null;
let storageReadPromise: Promise<PersistedCandleCacheState> | null = null;
let storageWriteQueue: Promise<void> = Promise.resolve();
let boundCacheNamespace: string | null = null;
let candleCacheResetGeneration = 0;
const pendingWrites = new Map<string, PendingPersistedCandleWrite>();
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastWriteAt = new Map<string, number>();
const lastScheduledSignature = new Map<string, string>();
const hydrationPromises = new Map<string, Promise<Candle[]>>();

const clearPersistedCandleCacheRuntime = (): void => {
  candleCacheResetGeneration += 1;
  for (const timer of writeTimers.values()) {
    clearTimeout(timer);
  }
  writeTimers.clear();
  pendingWrites.clear();
  lastWriteAt.clear();
  lastScheduledSignature.clear();
  hydrationPromises.clear();
  storageSnapshot = null;
  storageReadPromise = null;
  storageWriteQueue = Promise.resolve();
  boundCacheNamespace = null;
};

const bindPersistedCandleCacheNamespace = (cacheNamespace: string): void => {
  if (boundCacheNamespace === cacheNamespace) {
    return;
  }
  clearPersistedCandleCacheRuntime();
  boundCacheNamespace = cacheNamespace;
};

const captureCandleCacheScope = (
  expectedProvenance?: ActiveBrokerSessionProvenance,
): CandleCacheScope | null => {
  const capture = captureActiveBrokerSession();
  if (!capture) {
    return null;
  }

  if (
    expectedProvenance &&
    (
      expectedProvenance.cacheNamespace !== capture.session.cacheNamespace ||
      !isActiveBrokerSessionCurrent(expectedProvenance.identity)
    )
  ) {
    return null;
  }

  bindPersistedCandleCacheNamespace(capture.session.cacheNamespace);
  return Object.freeze({
    cacheNamespace: capture.session.cacheNamespace,
    identity: expectedProvenance?.identity ?? getActiveBrokerSessionIdentity(capture.session),
    resetGeneration: candleCacheResetGeneration,
  });
};

const isCandleCacheScopeCurrent = (scope: CandleCacheScope): boolean => {
  const capture = captureActiveBrokerSession();
  return (
    scope.resetGeneration === candleCacheResetGeneration &&
    boundCacheNamespace === scope.cacheNamespace &&
    capture?.session.cacheNamespace === scope.cacheNamespace &&
    isActiveBrokerSessionCurrent(scope.identity)
  );
};

const readStorage = async (
  scope: CandleCacheScope,
): Promise<PersistedCandleCacheState> => {
  if (!isCandleCacheScopeCurrent(scope)) {
    return emptyStorage(scope.cacheNamespace);
  }

  if (storageSnapshot) {
    return storageSnapshot;
  }

  if (!storageReadPromise) {
    storageReadPromise = AsyncStorage.getItem(getPersistedCandleStorageKey(scope.cacheNamespace))
      .then((raw) => parseStorage(raw, scope.cacheNamespace))
      .catch((error) => {
        console.error('[persistedCandleCache] Failed to read candle cache', error);
        return emptyStorage(scope.cacheNamespace);
      })
      .then((state) => {
        if (isCandleCacheScopeCurrent(scope)) {
          storageSnapshot = state;
        }
        return state;
      });
  }

  return storageReadPromise;
};

/**
 * Asynchronously writes a specific pending entry to disk.
 * Uses a chained Promise queue (`storageWriteQueue`) to ensure atomic writes
 * and prevent data corruption from overlapping saves.
 */
const flushPersistedEntry = (key: string, scheduledScope: CandleCacheScope) => {
  const pendingWrite = pendingWrites.get(key);
  if (
    !pendingWrite ||
    pendingWrite.scope.resetGeneration !== scheduledScope.resetGeneration ||
    pendingWrite.scope.cacheNamespace !== scheduledScope.cacheNamespace
  ) {
    return;
  }

  pendingWrites.delete(key);
  if (!isCandleCacheScopeCurrent(pendingWrite.scope)) {
    return;
  }

  const { entry, scope } = pendingWrite;
  lastWriteAt.set(key, Date.now());

  storageWriteQueue = storageWriteQueue
    .then(async () => {
      if (!isCandleCacheScopeCurrent(scope)) {
        return;
      }

      const current = await readStorage(scope);
      if (!isCandleCacheScopeCurrent(scope)) {
        return;
      }

      const nextState: PersistedCandleCacheState = {
        version: STORAGE_VERSION,
        cacheNamespace: scope.cacheNamespace,
        entries: trimEntries({
          ...current.entries,
          [key]: entry,
        }),
      };

      storageSnapshot = nextState;
      await AsyncStorage.setItem(
        getPersistedCandleStorageKey(scope.cacheNamespace),
        JSON.stringify(nextState),
      );
    })
    .catch((error) => {
      console.error('[persistedCandleCache] Failed to write candle cache', error);
    });
};

/**
 * Throttles writes to disk for a specific chart key.
 * Ensures we don't hammer the device storage when a high-frequency WS stream
 * tries to cache every few seconds.
 */
const schedulePersistedEntry = (key: string, scope: CandleCacheScope) => {
  if (writeTimers.has(key)) {
    return;
  }

  const elapsed = Date.now() - (lastWriteAt.get(key) ?? 0);
  const delay = Math.max(0, PERSIST_THROTTLE_MS - elapsed);
  const timer = setTimeout(() => {
    writeTimers.delete(key);
    flushPersistedEntry(key, scope);
  }, delay);
  writeTimers.set(key, timer);
};

/**
 * Creates a fast string representation of the tail of the candle series.
 * Used to skip redundant disk writes if the newest candle hasn't changed.
 */
const buildSignature = (candles: Candle[]): string => {
  const last = candles[candles.length - 1];
  return last ? `${candles.length}:${last.time}:${last.open}:${last.high}:${last.low}:${last.close}:${last.volume}` : 'empty';
};

/**
 * Queues an array of historical candles to be saved to device storage.
 * - Rejects empty arrays or data lacking enough candles to bootstrap a chart.
 * - Deduplicates writes using a string signature of the latest candle.
 * - Throttles the actual disk IO.
 */
export const persistCanonicalCandleCache = (
  symbol: string,
  timeframe: string,
  candles: Candle[],
  provenance?: ActiveBrokerSessionProvenance,
): void => {
  const scope = captureCandleCacheScope(provenance);
  if (!scope) {
    return;
  }

  const normalized = normalizeCacheKey(symbol, timeframe);
  if (!normalized || candles.length === 0) {
    return;
  }

  const safeCandles = sanitizeCandles(candles, normalized.timeframe);
  if (!isTrustworthyCandleBootstrapSeed(safeCandles, normalized.timeframe)) {
    return;
  }

  const signature = buildSignature(safeCandles);
  if (lastScheduledSignature.get(normalized.key) === signature) {
    return;
  }

  lastScheduledSignature.set(normalized.key, signature);
  pendingWrites.set(normalized.key, {
    scope,
    entry: {
      symbol: normalized.symbol,
      timeframe: normalized.timeframe,
      updatedAt: Date.now(),
      candles: safeCandles,
    },
  });
  schedulePersistedEntry(normalized.key, scope);
};

/**
 * Loads a cached series from device storage and injects it into the in-memory Zustand state.
 * Enables "zero-latency" chart rendering when navigating back to a previously viewed symbol.
 * - Deduplicates concurrent hydration requests for the same key.
 * - Silently catches and handles corrupted storage scenarios.
 */
export const hydratePersistedCandleCache = async (
  symbol: string,
  timeframe: string,
): Promise<Candle[]> => {
  const scope = captureCandleCacheScope();
  if (!scope) {
    return [];
  }

  const normalized = normalizeCacheKey(symbol, timeframe);
  if (!normalized) {
    return [];
  }

  const existingHydration = hydrationPromises.get(normalized.key);
  if (existingHydration) {
    return existingHydration;
  }

  const hydration = readStorage(scope)
    .then((state) => {
      if (!isCandleCacheScopeCurrent(scope)) {
        return [];
      }

      const entry = state.entries[normalized.key];
      if (!entry || !Array.isArray(entry.candles)) {
        return [];
      }

      const safeCandles = sanitizeCandles(entry.candles, normalized.timeframe);
      if (!isTrustworthyCandleBootstrapSeed(safeCandles, normalized.timeframe)) {
        return [];
      }

      if (!isCandleCacheScopeCurrent(scope)) {
        return [];
      }

      useTradingState.getState().setCandleHistory(
        normalized.symbol,
        normalized.timeframe,
        safeCandles,
      );
      return safeCandles;
    })
    .catch((error) => {
      console.error('[persistedCandleCache] Failed to hydrate candle cache', error);
      return [];
    })
    .finally(() => {
      if (hydrationPromises.get(normalized.key) === hydration) {
        hydrationPromises.delete(normalized.key);
      }
    });

  hydrationPromises.set(normalized.key, hydration);
  return hydration;
};

/**
 * Cancels delayed persistence/hydration work and clears the in-memory candle
 * state for the broker session being left. The coordinator separately removes
 * the now-unreachable on-disk namespace during login, restore, and logout.
 */
export const resetPersistedCandleCacheSession = (): void => {
  clearPersistedCandleCacheRuntime();
  useTradingState.setState({ candles: {} });
};

subscribeActiveBrokerSession((event) => {
  if (event.type === 'transition') {
    resetPersistedCandleCacheSession();
  }
});

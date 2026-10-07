import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { apiClient } from '../../api/apiClient';
import { normalizeQuoteTickPayload } from '../../api/ws/quoteTickNormalizer';
import { quotesWsService, type QuoteTickEvent } from '../../api/ws/quotesSocket';
import { orrnnDemoPublicMarketSocket } from '../../api/ws/orrnnDemoPublicMarketSocket';
import {
  isOrrnnDemoPublicMarketSelection,
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
} from '../../api/orrnnDemoPublicMarket';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';
import { normalizeQuoteVolume } from '../../utils/quoteVolume';
import { useTradingState } from '../../state/tradingState';
import { useUserPreferences } from '../../state/userPreferences';
import {
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  isActiveBrokerSessionCurrent,
  isActiveBrokerSessionOwnerStampCurrent,
  subscribeActiveBrokerSession,
} from '../../state/activeBrokerSession';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import {
  quoteLatencyMonotonicNow,
  recordQuoteCacheCommit,
  resetQuoteLatencyMetrics,
} from '../../market/quoteLatencyMetrics';
import { subscribeQuoteSnapshotReconcile } from '../../market/quoteSnapshotReconcileRuntime';
import { subscribePublicBrokerContext } from '../../state/publicBrokerContext';
import { subscribePublicQuoteInvalidation } from '../../state/publicQuoteAvailability';
import { markQuoteSnapshotUnavailable, QuoteSnapshotContinuity } from './quoteSnapshotContinuity';
import {
  applyLiveQuoteTickToSnapshot,
  buildInitialLiveQuoteSnapshot,
  getQuoteFreshnessAnchor,
  hasDisplayableLiveQuotePrice,
  type LiveQuoteSnapshot,
} from './liveQuoteSnapshot';

type SnapshotListener = () => void;

const snapshotsBySymbol = new Map<string, LiveQuoteSnapshot | undefined>();
const quoteSnapshotContinuity = new QuoteSnapshotContinuity();
const listenersBySymbol = new Map<string, Set<SnapshotListener>>();
const pendingNotifySymbols = new Set<string>();
let updateSeq = 0;
let quoteRuntimeGeneration = 0;
let notifyAnimationFrame: number | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotNotificationPauseDepth = 0;
const snapshotPauseTimers = new Set<ReturnType<typeof setTimeout>>();
const WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS = 16;
const QUOTE_REST_SNAPSHOT_STALE_MS = 2_000;
const QUOTE_SNAPSHOT_NOTIFICATION_PAUSE_MS = 2_500;

// Quote snapshots are memory-only and scoped by the immutable active namespace.
// Persisting a symbol-only volume cache could leak broker A display data into
// broker B, so the bounded REST snapshot repair repopulates volume per session.
const getQuoteCacheNamespace = (): string =>
  (() => {
    const { brokerId, isLoggedIn } = useUserPreferences.getState();
    if (isOrrnnDemoPublicMarketSelection({ brokerId, isLoggedIn })) {
      return ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE;
    }
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (owner) {
      return [
          owner.cacheNamespace,
          owner.credentialGeneration,
          owner.credentialIdentity,
        ].join(':');
    }
    return '';
  })();

const getQuoteDisplayScope = () => ({
  // The active namespace is unique to an activation; rotating its token is the
  // only boundary allowed to retain display prices. Public configuration has
  // its own generation-scoped namespace and never shares authenticated data.
  sessionKey: isOrrnnDemoPublicMarketSelection(useUserPreferences.getState())
    ? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE
    : captureActiveBrokerSession()?.session.cacheNamespace ?? '',
  credentialKey: getQuoteCacheNamespace(),
});

const subscribeQuoteCacheNamespace = (listener: () => void): (() => void) => {
  const unsubscribePublic = subscribePublicBrokerContext(listener);
  const unsubscribeSession = subscribeActiveBrokerSession(() => listener());
  const unsubscribePreferences = useUserPreferences.subscribe((state, previous) => {
    if (
      state.isLoggedIn !== previous.isLoggedIn ||
      state.brokerId !== previous.brokerId
    ) {
      listener();
    }
  });
  return () => {
    unsubscribeSession();
    unsubscribePreferences();
    unsubscribePublic();
  };
};

const getQuoteCacheNamespaceSnapshot = (): string =>
  getQuoteCacheNamespace();

const getServerQuoteCacheNamespaceSnapshot = (): string => '';

const useActiveQuoteCacheNamespace = (): string =>
  useSyncExternalStore(
    subscribeQuoteCacheNamespace,
    getQuoteCacheNamespaceSnapshot,
    getServerQuoteCacheNamespaceSnapshot,
  );

const scopeQuoteSnapshotKey = (symbolKey: string): string => {
  const namespace = getQuoteCacheNamespace();
  return namespace && symbolKey ? `${namespace}|${symbolKey}` : '';
};

const getTickSymbolKey = (tick: QuoteTickEvent): string =>
  normalizeQuoteSymbolKey(tick.rawSymbol ?? tick.symbol);

const getSnapshotKeys = (symbol: string): string[] => {
  const rawKey = normalizeQuoteSymbolKey(symbol);
  const baseKey = normalizeSymbol(symbol);
  return Array.from(new Set([rawKey, baseKey].filter(Boolean)));
};

const uniqueQuoteSymbolKeys = (symbols: string[]): string[] =>
  Array.from(new Set(symbols.flatMap(getSnapshotKeys)));

const notifySymbol = (symbol: string): void => {
  const listeners = listenersBySymbol.get(symbol);
  if (!listeners) return;
  listeners.forEach((listener) => listener());
};

const flushPendingNotifications = (): void => {
  if (notifyAnimationFrame !== null) {
    cancelAnimationFrame(notifyAnimationFrame);
    notifyAnimationFrame = null;
  }
  if (notifyTimer) {
    clearTimeout(notifyTimer);
    notifyTimer = null;
  }

  if (pendingNotifySymbols.size === 0) {
    return;
  }

  if (snapshotNotificationPauseDepth > 0) {
    return;
  }

  const symbols = Array.from(pendingNotifySymbols);
  pendingNotifySymbols.clear();
  symbols.forEach(notifySymbol);
};

export const areLiveQuoteSnapshotNotificationsPaused = (): boolean =>
  snapshotNotificationPauseDepth > 0;

export const pauseLiveQuoteSnapshotNotifications = (
  durationMs = QUOTE_SNAPSHOT_NOTIFICATION_PAUSE_MS,
): (() => void) => {
  snapshotNotificationPauseDepth += 1;
  let released = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const release = () => {
    if (released) {
      return;
    }
    released = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      snapshotPauseTimers.delete(timeoutId);
      timeoutId = null;
    }
    snapshotNotificationPauseDepth = Math.max(0, snapshotNotificationPauseDepth - 1);
    if (snapshotNotificationPauseDepth === 0) {
      flushPendingNotifications();
    }
  };

  timeoutId = setTimeout(release, Math.max(0, durationMs));
  snapshotPauseTimers.add(timeoutId);
  return release;
};

const notifySymbolImmediately = (symbol: string): void => {
  pendingNotifySymbols.delete(symbol);
  notifySymbol(symbol);
};

subscribePublicQuoteInvalidation(symbol => {
  if (!isOrrnnDemoPublicMarketSelection(useUserPreferences.getState())) return;
  for (const key of getSnapshotKeys(symbol)) {
    const scopedKey = scopeQuoteSnapshotKey(key);
    const retained = markQuoteSnapshotUnavailable(
      snapshotsBySymbol.get(scopedKey) ?? getStateQuote(key),
    );
    snapshotsBySymbol.set(scopedKey, retained);
    quoteSnapshotContinuity.retain(getQuoteDisplayScope(), key, retained);
    notifySymbolImmediately(scopedKey);
  }
});

const scheduleSymbolNotification = (symbol: string, immediate = false): void => {
  if (snapshotNotificationPauseDepth > 0) {
    pendingNotifySymbols.add(symbol);
    return;
  }

  if (immediate) {
    notifySymbolImmediately(symbol);
    return;
  }

  pendingNotifySymbols.add(symbol);

  if (notifyAnimationFrame !== null || notifyTimer) {
    return;
  }

  // Market feeds can deliver many ticks in one frame. Notify quote rows on a
  // short timer so touch handling and navigation keep priority while the
  // latest bid/ask still paints promptly.
  notifyTimer = setTimeout(flushPendingNotifications, WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS);
};

const getStateQuote = (symbol: string): LiveQuoteSnapshot | undefined => {
  const state = useTradingState.getState();
  const symbolKey = normalizeQuoteSymbolKey(symbol);
  const baseSymbol = normalizeSymbol(symbol);
  return buildInitialLiveQuoteSnapshot(
    symbol,
    state.quotes[symbolKey] ?? state.quotes[baseSymbol],
  );
};

const ensureSnapshot = (symbol: string): LiveQuoteSnapshot | undefined => {
  const normalizedSymbol = normalizeQuoteSymbolKey(symbol);
  const scopedKey = scopeQuoteSnapshotKey(normalizedSymbol);
  if (!normalizedSymbol || !scopedKey) return undefined;

  if (!snapshotsBySymbol.has(scopedKey)) {
    const displayScope = getQuoteDisplayScope();
    const snapshot = quoteSnapshotContinuity.read(displayScope, normalizedSymbol)
      ?? getStateQuote(normalizedSymbol);
    snapshotsBySymbol.set(
      scopedKey,
      snapshot,
    );
    quoteSnapshotContinuity.retain(displayScope, normalizedSymbol, snapshot);
  }

  return snapshotsBySymbol.get(scopedKey);
};

const subscribeSnapshot = (symbol: string, listener: SnapshotListener): (() => void) => {
  const keys = getSnapshotKeys(symbol)
    .map(scopeQuoteSnapshotKey)
    .filter(Boolean);
  if (keys.length === 0) return () => {};

  for (const key of keys) {
    let listeners = listenersBySymbol.get(key);
    if (!listeners) {
      listeners = new Set();
      listenersBySymbol.set(key, listeners);
    }
    listeners.add(listener);
  }

  return () => {
    for (const key of keys) {
      const current = listenersBySymbol.get(key);
      if (!current) continue;
      current.delete(listener);
      if (current.size === 0) {
        listenersBySymbol.delete(key);
      }
    }
  };
};

const resolveSnapshot = (symbol: string): LiveQuoteSnapshot | undefined => {
  const keys = getSnapshotKeys(symbol);
  const snapshots = keys
    .map((key) => ensureSnapshot(key))
    .filter((snapshot): snapshot is LiveQuoteSnapshot => snapshot !== undefined);

  return snapshots.find((snapshot) => getQuoteFreshnessAnchor(snapshot) !== undefined) ?? snapshots[0];
};

/**
 * Imperative latest-value read for execution-time integrity checks.
 *
 * A screen may coalesce render notifications to keep touch work responsive,
 * while this accessor still returns the newest in-memory websocket snapshot.
 */
export const getCurrentLiveQuoteSnapshot = (
  symbol: string,
): LiveQuoteSnapshot | undefined => resolveSnapshot(normalizeQuoteSymbolKey(symbol));

export const subscribeLiveQuoteSnapshots = (
  symbols: string[],
  listener: SnapshotListener,
): (() => void) => {
  const normalizedSymbols = uniqueQuoteSymbolKeys(symbols);
  if (normalizedSymbols.length === 0) {
    return () => {};
  }

  const unsubscribers = normalizedSymbols.map((symbol) =>
    subscribeSnapshot(symbol, listener),
  );
  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
};

export const getLiveQuoteFreshnessAnchorForSymbols = (symbols: string[]): number => {
  const normalizedSymbols = uniqueQuoteSymbolKeys(symbols);
  return normalizedSymbols.reduce((latest, symbol) => {
    const snapshot = resolveSnapshot(symbol);
    if (!hasDisplayableLiveQuotePrice(snapshot)) {
      return latest;
    }

    const freshnessAnchor = getQuoteFreshnessAnchor(snapshot);
    return freshnessAnchor === undefined ? latest : Math.max(latest, freshnessAnchor);
  }, 0);
};

export const ingestLiveQuoteTick = (tick: QuoteTickEvent, notifyImmediately = true): void => {
  const symbol = getTickSymbolKey(tick);
  const scopedKey = scopeQuoteSnapshotKey(symbol);
  if (!symbol || !scopedKey) return;

  const previous = ensureSnapshot(symbol);
  const nextUpdateSeq = ++updateSeq;
  const next = applyLiveQuoteTickToSnapshot(symbol, previous, tick, nextUpdateSeq);
  snapshotsBySymbol.set(scopedKey, next);
  quoteSnapshotContinuity.retain(getQuoteDisplayScope(), symbol, next);
  if (tick.transport === 'websocket' && next?.updateSeq === nextUpdateSeq) {
    recordQuoteCacheCommit({
      sessionKey: getQuoteCacheNamespace(),
      updateSeq: nextUpdateSeq,
      sourceTimestampMs: tick.feedTickAt,
      receivedTimestampMs: tick.receivedAt,
      receiptMonotonicTimestampMs: tick.receiptMonotonicAt,
      cacheTimestampMs: Date.now(),
      cacheMonotonicTimestampMs: quoteLatencyMonotonicNow(),
    });
  }
  scheduleSymbolNotification(scopedKey, notifyImmediately);
};

const ingestRestQuoteSnapshot = (requestedSymbol: string, payload: unknown): boolean => {
  const now = Date.now();
  const normalized = normalizeQuoteTickPayload(
    {
      symbol: requestedSymbol,
      ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    },
    now,
  );

  if (!normalized.ok) {
    return false;
  }

  const { update } = normalized;
  const timestamp = update.timestamp ?? now;
  const feedTickAt = update.timestampSource === 'feed' ? timestamp : undefined;
  ingestLiveQuoteTick(
    {
      symbol: update.symbol,
      rawSymbol: update.rawSymbol,
      bid: update.bid,
      ask: update.ask,
      last: update.last,
      high: update.high,
      low: update.low,
      open: update.open,
      dailyOpen: update.dailyOpen,
      previousClose: update.previousClose,
      changePct: update.changePct,
      spread: update.spread,
      volume: update.volume,
      digits: update.digits,
      transport: 'rest_snapshot',
      tradable: false,
      degraded: true,
      feedTickAt,
      receivedAt: now,
      timestamp,
    },
    false,
  );
  useTradingState.getState().setQuote(update.rawSymbol || update.symbol, {
    bid: update.bid,
    ask: update.ask,
    lastTickAt: timestamp,
    lastReceivedAt: now,
    feedTickAt,
    ...(update.last !== undefined ? { close: update.last } : {}),
    ...(update.high !== undefined ? { high: update.high } : {}),
    ...(update.low !== undefined ? { low: update.low } : {}),
    ...(update.open !== undefined ? { open: update.open } : {}),
    ...(update.spread !== undefined ? { spread: update.spread } : {}),
    ...(update.volume !== undefined ? { volume: update.volume, volumeSource: 'backend' as const } : {}),
    ...(update.digits !== undefined ? { digits: update.digits } : {}),
    transport: 'rest_snapshot',
    tradable: false,
    degraded: true,
  });
  return true;
};

// Backfill ONLY backend volume onto an already-fresh live snapshot. Live WS
// ticks usually omit volume, so when fresh bid/ask keep the snapshot "fresh"
// the REST /quotes payload (the lone volume source) would otherwise be dropped
// by the freshness guard — leaving "Vol: --" for seconds after the app opens.
// This applies the volume without disturbing the live price.
const ingestRestQuoteVolumeOnly = (requestedSymbol: string, payload: unknown): void => {
  const now = Date.now();
  const normalized = normalizeQuoteTickPayload(
    {
      symbol: requestedSymbol,
      ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    },
    now,
  );
  if (!normalized.ok) {
    return;
  }

  const { update } = normalized;
  const volume = normalizeQuoteVolume(update.volume);
  if (volume === undefined) {
    return;
  }

  const symbolKey = normalizeQuoteSymbolKey(update.rawSymbol ?? update.symbol);
  const scopedKey = scopeQuoteSnapshotKey(symbolKey);
  if (!scopedKey) {
    return;
  }
  const previous = ensureSnapshot(symbolKey);
  if (!previous) {
    return;
  }
  if (previous.volumeSource === 'backend' && normalizeQuoteVolume(previous.volume) === volume) {
    return;
  }

  snapshotsBySymbol.set(scopedKey, {
    ...previous,
    volume,
    volumeSource: 'backend',
    updateSeq: ++updateSeq,
  });
  scheduleSymbolNotification(scopedKey);

  // Mirror onto an existing tradingState quote so other consumers see volume,
  // but never create a price-less quote from a volume-only update.
  const stateSymbol = update.rawSymbol || update.symbol;
  if (useTradingState.getState().quotes[normalizeSymbol(stateSymbol)]) {
    useTradingState.getState().setQuote(stateSymbol, { volume });
  }
};

const asQuoteSnapshotArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data;
    }
    if (Array.isArray(record.items)) {
      return record.items;
    }
    if (Array.isArray(record.quotes)) {
      return record.quotes;
    }
    return [record];
  }

  return [];
};

const isRestQuotePriceStale = (symbol: string, now = Date.now()): boolean => {
  const snapshot = resolveSnapshot(symbol);
  const freshnessAnchor = getQuoteFreshnessAnchor(snapshot);
  return freshnessAnchor === undefined || now - freshnessAnchor > QUOTE_REST_SNAPSHOT_STALE_MS;
};

const hasBackendQuoteVolume = (snapshot: LiveQuoteSnapshot | undefined): boolean =>
  snapshot?.volumeSource === 'backend' && normalizeQuoteVolume(snapshot?.volume) !== undefined;

const needsRestQuoteSnapshot = (symbol: string, now = Date.now()): boolean => {
  if (isRestQuotePriceStale(symbol, now)) {
    return true;
  }
  // A single REST request may backfill display-only volume; it never becomes a
  // high-frequency live-price loop.
  return !hasBackendQuoteVolume(resolveSnapshot(symbol));
};

const fetchRestQuoteSnapshots = async (
  symbols: string[],
  requestGeneration = quoteRuntimeGeneration,
): Promise<void> => {
  if (symbols.length === 0) {
    return;
  }

  const requestedKeys = new Set(symbols.flatMap(getSnapshotKeys));
  const symbolsQuery = symbols.map(encodeURIComponent).join(',');
  const sessionCapture = captureActiveBrokerSession();
  const requestOwner = captureActiveBrokerSessionOwnerStamp();
  if (!sessionCapture || !requestOwner) {
    return;
  }

  const response = await apiClient(`/quotes?symbols=${symbolsQuery}`);
  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  if (
    requestGeneration !== quoteRuntimeGeneration ||
    !isActiveBrokerSessionOwnerStampCurrent(requestOwner)
  ) {
    return;
  }
  asQuoteSnapshotArray(payload).forEach((snapshot) => {
    const record = snapshot && typeof snapshot === 'object'
      ? (snapshot as Record<string, unknown>)
      : null;
    const symbol = String(record?.symbol ?? record?.Symbol ?? record?.s ?? '');
    if (!symbol) {
      return;
    }
    const matchesRequestedSymbol = getSnapshotKeys(symbol).some((key) => requestedKeys.has(key));
    if (!matchesRequestedSymbol) {
      return;
    }
    if (isRestQuotePriceStale(symbol)) {
      // Price stale/absent — safe to adopt the whole REST snapshot.
      ingestRestQuoteSnapshot(symbol, snapshot);
    } else {
      // Live ticks already own a fresh price; keep it and only backfill volume.
      ingestRestQuoteVolumeOnly(symbol, snapshot);
    }
  });

  // One /quotes response received for the batch — stop letting missing volume
  // force further fetches (price staleness still triggers normal refreshes).
};

const useRestQuoteSnapshotRepair = (
  symbols: string[],
  active: boolean,
  cacheNamespace: string,
): void => {
  const symbolsKey = JSON.stringify(symbols);

  useEffect(() => {
    if (!active || !cacheNamespace || symbols.length === 0) {
      return;
    }

    let cancelled = false;
    const requestGeneration = quoteRuntimeGeneration;

    const repairSnapshots = async () => {
      if (cancelled || areLiveQuoteSnapshotNotificationsPaused()) {
        return;
      }

      const symbolsNeedingFallback = symbols.filter((symbol) => needsRestQuoteSnapshot(symbol));
      if (symbolsNeedingFallback.length === 0) {
        return;
      }

      try {
        await fetchRestQuoteSnapshots(symbolsNeedingFallback, requestGeneration);
      } catch (error) {
        // Expected when offline; the socket or the next pass repairs it.
        if (!cancelled && typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            '[Quotes REST] One-shot snapshot repair failed',
            redactDiagnosticValue(error),
          );
        }
      }
    };

    void repairSnapshots();

    const unsubscribeReconcile = subscribeQuoteSnapshotReconcile((identity) => {
      const capture = captureActiveBrokerSession();
      if (
        cancelled ||
        !capture ||
        getQuoteCacheNamespace() !== cacheNamespace ||
        !isActiveBrokerSessionCurrent(identity)
      ) {
        return;
      }
      void repairSnapshots();
    });

    return () => {
      cancelled = true;
      unsubscribeReconcile();
    };
  }, [active, cacheNamespace, symbolsKey]);
};

export function useLiveQuoteSubscription(symbol: string, active: boolean): void {
  const cacheNamespace = useActiveQuoteCacheNamespace();
  const symbolKeys = useMemo(
    () => getSnapshotKeys(symbol),
    [symbol],
  );
  const symbolKeysKey = symbolKeys.join('|');

  useEffect(() => {
    if (!active || !cacheNamespace || !symbol || symbolKeys.length === 0) {
      return;
    }

    symbolKeys.forEach(ensureSnapshot);
    const socket = cacheNamespace === ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE
      ? orrnnDemoPublicMarketSocket
      : quotesWsService;
    return socket.subscribeToSymbol(symbol, (tick) => {
      ingestLiveQuoteTick({ ...tick, transport: tick.transport ?? 'websocket' });
    });
  }, [active, cacheNamespace, symbol, symbolKeysKey]);
}

export function useWatchlistLiveQuotes(
  symbols: string[],
  active: boolean,
  options?: { restFallbackActive?: boolean },
): string[] {
  const cacheNamespace = useActiveQuoteCacheNamespace();
  const symbolsKey = JSON.stringify(symbols);

  const subscriptionSymbols = useMemo(
    () => Array.from(new Set(symbols.map((symbol) => normalizeQuoteSymbolKey(symbol)).filter(Boolean))),
    [symbolsKey],
  );
  const normalizedSymbols = useMemo(
    () => uniqueQuoteSymbolKeys(symbols),
    [symbolsKey],
  );
  const subscriptionSymbolsKey = subscriptionSymbols.join('|');
  const normalizedSymbolsKey = normalizedSymbols.join('|');

  useEffect(() => {
    if (!active || !cacheNamespace || subscriptionSymbols.length === 0) {
      return;
    }

    normalizedSymbols.forEach(ensureSnapshot);
    const symbolSet = new Set(normalizedSymbols);
    const listener = (tick: QuoteTickEvent) => {
      const tickKeys = getSnapshotKeys(tick.rawSymbol ?? tick.symbol);
      if (!tickKeys.some((key) => symbolSet.has(key))) {
        return;
      }

      ingestLiveQuoteTick({ ...tick, transport: tick.transport ?? 'websocket' }, true);
    };

    if (cacheNamespace === ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE) {
      return orrnnDemoPublicMarketSocket.subscribeToSymbols(
        subscriptionSymbols,
        listener,
      );
    }

    const unsubscribers = subscriptionSymbols.map((symbol) =>
      quotesWsService.subscribeToSymbol(symbol, listener),
    );
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [active, cacheNamespace, normalizedSymbolsKey, subscriptionSymbolsKey]);

  useRestQuoteSnapshotRepair(
    normalizedSymbols,
    cacheNamespace === ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE
      ? false
      : options?.restFallbackActive ?? active,
    cacheNamespace,
  );

  return active && cacheNamespace ? subscriptionSymbols : [];
}

export function useLiveQuoteSnapshot(
  symbol: string,
  active = true,
  renderIntervalMs = 0,
): LiveQuoteSnapshot | undefined {
  const cacheNamespace = useActiveQuoteCacheNamespace();
  const normalizedSymbol = useMemo(() => normalizeQuoteSymbolKey(symbol), [symbol]);
  const safeRenderIntervalMs = Math.max(0, Math.floor(renderIntervalMs));
  const renderScopeKey = active && cacheNamespace && normalizedSymbol
    ? `${cacheNamespace}|${normalizedSymbol}`
    : '';
  const renderSnapshotRef = useRef<{
    scopeKey: string;
    value: LiveQuoteSnapshot | undefined;
  }>({ scopeKey: '', value: undefined });
  if (renderSnapshotRef.current.scopeKey !== renderScopeKey) {
    renderSnapshotRef.current = {
      scopeKey: renderScopeKey,
      value: renderScopeKey ? resolveSnapshot(normalizedSymbol) : undefined,
    };
  }

  const subscribe = useCallback(
    (listener: SnapshotListener) => {
      if (!active || !cacheNamespace || !normalizedSymbol) {
        return () => {};
      }

      if (safeRenderIntervalMs === 0) {
        return subscribeSnapshot(normalizedSymbol, listener);
      }

      // Catch a tick that landed between render and subscription. React's
      // post-subscribe consistency check will observe this committed value.
      renderSnapshotRef.current = {
        scopeKey: renderScopeKey,
        value: resolveSnapshot(normalizedSymbol),
      };
      let renderTimer: ReturnType<typeof setTimeout> | null = null;
      let cancelled = false;
      const notifyAtRenderCadence = () => {
        if (renderTimer) {
          return;
        }
        // Leading ticks update the in-memory snapshot synchronously; one
        // trailing notification then commits the latest value to this screen.
        renderTimer = setTimeout(() => {
          renderTimer = null;
          if (!cancelled) {
            renderSnapshotRef.current = {
              scopeKey: renderScopeKey,
              value: resolveSnapshot(normalizedSymbol),
            };
            listener();
          }
        }, safeRenderIntervalMs);
      };
      const unsubscribe = subscribeSnapshot(normalizedSymbol, notifyAtRenderCadence);

      return () => {
        cancelled = true;
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
        unsubscribe();
      };
    },
    [active, cacheNamespace, normalizedSymbol, renderScopeKey, safeRenderIntervalMs],
  );

  const getSnapshot = useCallback(
    // Mirrors the subscribe gate (like useLiveQuoteFreshnessAnchor below). An
    // inactive instance is not subscribed, so its snapshot must not track the
    // live per-symbol object — that made every tick fail React's
    // store-consistency check and sync-re-render hidden shells and screens.
    () => {
      if (!active || !cacheNamespace || !normalizedSymbol) {
        return undefined;
      }
      return safeRenderIntervalMs === 0
        ? resolveSnapshot(normalizedSymbol)
        : renderSnapshotRef.current.value;
    },
    [active, cacheNamespace, normalizedSymbol, safeRenderIntervalMs],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLiveQuoteFreshnessAnchor(symbols: string[], active: boolean): number {
  const cacheNamespace = useActiveQuoteCacheNamespace();
  const symbolsKey = JSON.stringify(symbols);
  const normalizedSymbols = useMemo(
    () => uniqueQuoteSymbolKeys(symbols),
    [symbolsKey],
  );
  const normalizedSymbolsKey = normalizedSymbols.join('|');

  const subscribe = useCallback(
    (listener: SnapshotListener) => {
      if (!active || !cacheNamespace || normalizedSymbols.length === 0) {
        return () => {};
      }

      return subscribeLiveQuoteSnapshots(normalizedSymbols, listener);
    },
    [active, cacheNamespace, normalizedSymbolsKey],
  );

  const getSnapshot = useCallback(() => {
    if (!active || !cacheNamespace || normalizedSymbols.length === 0) {
      return 0;
    }

    return getLiveQuoteFreshnessAnchorForSymbols(normalizedSymbols);
  }, [active, cacheNamespace, normalizedSymbolsKey]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Clears session-scoped quote snapshots, listeners, one-shot REST state, and
 * pending notification/cache timers without touching the user's watchlist.
 */
export const resetLiveQuoteSnapshotRuntimeState = (): void => {
  quoteRuntimeGeneration += 1;
  resetQuoteLatencyMetrics();
  if (notifyAnimationFrame !== null) {
    cancelAnimationFrame(notifyAnimationFrame);
    notifyAnimationFrame = null;
  }
  if (notifyTimer) {
    clearTimeout(notifyTimer);
    notifyTimer = null;
  }
  snapshotPauseTimers.forEach((timer) => clearTimeout(timer));
  snapshotPauseTimers.clear();
  snapshotsBySymbol.clear();
  quoteSnapshotContinuity.clear();
  listenersBySymbol.clear();
  pendingNotifySymbols.clear();
  snapshotNotificationPauseDepth = 0;
  updateSeq = 0;
};

// No symbol-only quote cache is restored across broker sessions.

/**
 * Core module: websocket.ts
 */

import React, { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';

import { apiClient } from '../api/apiClient';
import { wsService } from '../api/ws/socket';
import { quotesWsService } from '../api/ws/quotesSocket';
import { orrnnDemoPublicMarketSocket } from '../api/ws/orrnnDemoPublicMarketSocket';
import type { QuoteTickEvent } from '../api/ws/quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from '../api/ws/quoteTimestamp';
import { useTradingState } from '../state/tradingState';
import { useUserPreferences } from '../state/userPreferences';
import {
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionOwnerStampCurrent,
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../state/activeBrokerSession';
import { redactDiagnosticValue } from '../utils/securityRedaction';
import type { QuoteItem } from '../dev/mock/tradingData';
import { normalizeSymbol } from '../domain/symbols';
import { hasQuotePriceChange } from '../utils/quotePriceChange';
import { calculateQuoteSpreadPoints, resolveQuoteDisplayDigits } from '../utils/quoteSpread';
import { resolveBackendQuoteVolume } from '../utils/quoteVolume';
import { buildRestQuoteTickEvent } from './restQuoteTick';
import {
  useActiveBrokerCredentialScopeKey,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';
import { commitQuoteSnapshotIfSessionCurrent } from './quoteCommitProvenance';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../market/quotePolicy';
import { isOrrnnDemoPublicMarketSelection } from '../api/orrnnDemoPublicMarket';
import { resolveContextBoundLiveSymbolQuote } from './liveSymbolQuoteContext';
import { SymbolQuoteBatch } from './symbolQuoteBatch';
import { scheduleAfterVisualFrame } from '../utils/afterVisualFrame';

const LIVE_QUOTE_STALE_MS = MARKET_QUOTE_STALE_AFTER_MS;
const LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS = 16;
const LIVE_SYMBOL_REST_DIRECT_TICK_SUPPRESS_MS = 2_000;
// Closed markets can be silent on websocket by design. Retry only a few times
// so a transient 409/503 from the exact quote snapshot cannot permanently hide
// the retained Bid line, while still avoiding a background polling loop.
const LIVE_SYMBOL_REST_RETRY_DELAYS_MS = [0, 750, 2_000, 4_000] as const;
const EMPTY_LIVE_QUOTES: Record<string, any> = Object.freeze({});

type LiveSymbolQuoteListener = (tick: QuoteTickEvent) => void;
type LiveSymbolDirectTickAnchor = () => number;

let liveSymbolNotificationPauseDepth = 0;
const pendingLiveSymbolTicks = new Map<LiveSymbolQuoteListener, QuoteTickEvent>();
const liveSymbolPauseTimers = new Set<ReturnType<typeof setTimeout>>();
let liveQuoteRuntimeGeneration = 0;

const deliverLiveSymbolTick = (listener: LiveSymbolQuoteListener, tick: QuoteTickEvent): void => {
  if (liveSymbolNotificationPauseDepth > 0) {
    pendingLiveSymbolTicks.set(listener, tick);
    return;
  }
  try {
    listener(tick);
  } catch (error) {
    console.error('[Quotes] Symbol listener error', error);
  }
};

const flushPausedLiveSymbolTicks = (): void => {
  if (liveSymbolNotificationPauseDepth > 0 || pendingLiveSymbolTicks.size === 0) {
    return;
  }
  const pending = Array.from(pendingLiveSymbolTicks.entries());
  pendingLiveSymbolTicks.clear();
  pending.forEach(([listener, tick]) => deliverLiveSymbolTick(listener, tick));
};

/**
 * Temporarily buffers the newest direct tick per listener without stopping the
 * socket. Drawer and sheet motion can therefore remain responsive, then every
 * visible quote catches up to the latest value when the interaction settles.
 */
export const pauseLiveSymbolQuoteNotifications = (durationMs = 2_500): (() => void) => {
  liveSymbolNotificationPauseDepth += 1;
  let released = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      liveSymbolPauseTimers.delete(timeoutId);
      timeoutId = null;
    }
    liveSymbolNotificationPauseDepth = Math.max(0, liveSymbolNotificationPauseDepth - 1);
    flushPausedLiveSymbolTicks();
  };
  timeoutId = setTimeout(release, Math.max(0, durationMs));
  liveSymbolPauseTimers.add(timeoutId);
  return release;
};

type RestQuoteFallbackEntry = {
  symbol: string;
  listeners: Set<LiveSymbolQuoteListener>;
  directTickAnchors: Map<LiveSymbolQuoteListener, LiveSymbolDirectTickAnchor>;
  attemptCount: number;
  completed: boolean;
  inFlight: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

type RestQuoteFallbackOutcome = 'resolved' | 'retry' | 'stop';

const restQuoteFallbackEntries = new Map<string, RestQuoteFallbackEntry>();

const hasRecentDirectSymbolTick = (entry: RestQuoteFallbackEntry, now = Date.now()): boolean => {
  for (const getDirectTickAt of entry.directTickAnchors.values()) {
    const directTickAt = getDirectTickAt();
    if (
      Number.isFinite(directTickAt) &&
      directTickAt > 0 &&
      now - directTickAt <= LIVE_SYMBOL_REST_DIRECT_TICK_SUPPRESS_MS
    ) {
      return true;
    }
  }

  return false;
};

const hasObservedDirectSymbolTick = (entry: RestQuoteFallbackEntry): boolean => {
  for (const getDirectTickAt of entry.directTickAnchors.values()) {
    const directTickAt = getDirectTickAt();
    if (Number.isFinite(directTickAt) && directTickAt > 0) {
      return true;
    }
  }

  return false;
};

const hasExactQuotePair = (quote?: Partial<QuoteItem>): boolean => {
  const bid = Number(quote?.bid);
  const ask = Number(quote?.ask);
  return Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask >= bid;
};

function getQuoteFreshnessAnchorMs(liveQuote?: Partial<QuoteItem>): number | null {
  return (
    normalizeQuoteTickTimestampToMs(liveQuote?.lastReceivedAt) ??
    normalizeQuoteTickTimestampToMs(liveQuote?.lastTickAt)
  );
}

function isFreshLiveQuote(liveQuote?: Partial<QuoteItem>): boolean {
  const liveQuoteTickAt = getQuoteFreshnessAnchorMs(liveQuote);
  return !!liveQuote && liveQuoteTickAt !== null && Date.now() - liveQuoteTickAt <= LIVE_QUOTE_STALE_MS;
}

export function hasLiveQuoteFeedData(liveQuote?: Partial<QuoteItem>): boolean {
  const liveQuoteTickAt = getQuoteFreshnessAnchorMs(liveQuote);
  return !!liveQuote && liveQuoteTickAt !== null && Date.now() - liveQuoteTickAt <= LIVE_QUOTE_STALE_MS;
}

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

const publishQuoteTickToSharedStores = (tick: QuoteTickEvent): void => {
  useTradingState.getState().setQuote(tick.rawSymbol || tick.symbol, {
    bid: tick.bid,
    ask: tick.ask,
    lastTickAt: tick.timestamp,
    lastReceivedAt: tick.receivedAt,
    feedTickAt: tick.feedTickAt ?? tick.timestamp,
    ...(tick.last !== undefined ? { close: tick.last } : {}),
    ...(tick.high !== undefined ? { high: tick.high } : {}),
    ...(tick.low !== undefined ? { low: tick.low } : {}),
    ...(tick.open !== undefined ? { open: tick.open } : {}),
    ...(tick.spread !== undefined ? { spread: tick.spread } : {}),
    ...(tick.volume !== undefined ? { volume: tick.volume, volumeSource: 'backend' as const } : {}),
    ...(tick.digits !== undefined ? { digits: tick.digits } : {}),
    ...(tick.digits !== undefined ? { digitsSource: 'backend' as const } : {}),
    ...(tick.point !== undefined ? { point: tick.point } : {}),
    ...(tick.tickSize !== undefined ? { tickSize: tick.tickSize } : {}),
    transport: tick.transport,
    stale: tick.stale,
    tradable: tick.tradable,
    degraded: tick.degraded,
    degradationReason: tick.degradationReason,
    sequence: tick.sequence,
    tickId: tick.tickId,
    source: tick.source,
    authority: tick.authority,
  });

};

const fetchRestQuoteSnapshotForEntry = async (
  entry: RestQuoteFallbackEntry,
): Promise<RestQuoteFallbackOutcome> => {
  if (entry.inFlight || entry.listeners.size === 0) {
    return 'stop';
  }

  // A real websocket tick is authoritative and permanently settles this
  // subscription's fallback. Do not wake a live/24x7 symbol with later retries.
  if (hasObservedDirectSymbolTick(entry)) {
    return 'resolved';
  }

  const liveQuote = useTradingState.getState().quotes[entry.symbol];
  if (isFreshLiveQuote(liveQuote) && hasExactQuotePair(liveQuote)) {
    return 'resolved';
  }

  entry.inFlight = true;
  entry.attemptCount += 1;
  const requestGeneration = liveQuoteRuntimeGeneration;
  try {
    const sessionCapture = captureActiveBrokerSession();
    if (!sessionCapture) {
      return 'stop';
    }
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (!owner) {
      return 'stop';
    }

    const response = await apiClient(`/quotes?symbols=${encodeURIComponent(entry.symbol)}`);
    if (!response.ok) {
      return 'retry';
    }

    const payload = await response.json();
    const receivedAt = Date.now();
    const requestedSymbol = normalizeSymbol(entry.symbol);
    let selectedTick: QuoteTickEvent | null = null;
    for (const snapshot of asQuoteSnapshotArray(payload)) {
      const tick = buildRestQuoteTickEvent(entry.symbol, snapshot, receivedAt);
      if (!tick) {
        continue;
      }
      if (!requestedSymbol || normalizeSymbol(tick.symbol) === requestedSymbol) {
        selectedTick = tick;
        break;
      }
    }

    if (!selectedTick) {
      return 'retry';
    }

    if (
      requestGeneration !== liveQuoteRuntimeGeneration ||
      !isActiveBrokerSessionOwnerStampCurrent(owner) ||
      entry.listeners.size === 0
    ) {
      return 'stop';
    }
    if (hasRecentDirectSymbolTick(entry) || hasObservedDirectSymbolTick(entry)) {
      return 'resolved';
    }

    publishQuoteTickToSharedStores(selectedTick);
    entry.listeners.forEach((listener) => listener(selectedTick));
    return 'resolved';
  } catch (error) {
    // Expected when offline; the caller retries.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        '[Quotes REST] Bounded symbol snapshot repair failed',
        redactDiagnosticValue(error),
      );
    }
    return 'retry';
  } finally {
    entry.inFlight = false;
  }
};

const scheduleRestQuoteSnapshotFallback = (entry: RestQuoteFallbackEntry): void => {
  if (
    entry.completed ||
    entry.inFlight ||
    entry.retryTimer !== null ||
    entry.listeners.size === 0 ||
    hasObservedDirectSymbolTick(entry)
  ) {
    return;
  }

  const delayMs = LIVE_SYMBOL_REST_RETRY_DELAYS_MS[entry.attemptCount];
  if (delayMs === undefined) {
    entry.completed = true;
    return;
  }

  const requestGeneration = liveQuoteRuntimeGeneration;
  entry.retryTimer = setTimeout(() => {
    entry.retryTimer = null;
    if (
      requestGeneration !== liveQuoteRuntimeGeneration ||
      restQuoteFallbackEntries.get(entry.symbol) !== entry ||
      entry.listeners.size === 0 ||
      hasObservedDirectSymbolTick(entry)
    ) {
      entry.completed = true;
      return;
    }

    void fetchRestQuoteSnapshotForEntry(entry).then((outcome) => {
      if (outcome !== 'retry') {
        entry.completed = true;
        return;
      }
      scheduleRestQuoteSnapshotFallback(entry);
    });
  }, delayMs);
};

const subscribeLiveSymbolRestQuoteFallback = (
  symbol: string,
  listener: LiveSymbolQuoteListener,
  getDirectTickAt?: LiveSymbolDirectTickAnchor,
): (() => void) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    return () => {};
  }

  let entry = restQuoteFallbackEntries.get(normalizedSymbol);
  if (!entry) {
    entry = {
      symbol: normalizedSymbol,
      listeners: new Set(),
      directTickAnchors: new Map(),
      attemptCount: 0,
      completed: false,
      inFlight: false,
      retryTimer: null,
    };
    restQuoteFallbackEntries.set(normalizedSymbol, entry);
  }

  entry.listeners.add(listener);
  entry.directTickAnchors.set(listener, getDirectTickAt ?? (() => 0));
  if (entry.completed && !hasObservedDirectSymbolTick(entry)) {
    // A previous bounded cycle may have ended on transient 409/503 responses.
    // A later screen consumer is a new explicit demand signal, so give it one
    // fresh bounded cycle. The fetch path still exits before network I/O when
    // an exact recent snapshot is already present.
    entry.attemptCount = 0;
    entry.completed = false;
  }
  scheduleRestQuoteSnapshotFallback(entry);

  return () => {
    const activeEntry = restQuoteFallbackEntries.get(normalizedSymbol);
    if (!activeEntry) {
      return;
    }
    activeEntry.listeners.delete(listener);
    activeEntry.directTickAnchors.delete(listener);
    if (activeEntry.listeners.size > 0) {
      return;
    }
    if (activeEntry.retryTimer !== null) {
      clearTimeout(activeEntry.retryTimer);
      activeEntry.retryTimer = null;
    }
    restQuoteFallbackEntries.delete(normalizedSymbol);
  };
};

/** Clears module-level quote listeners and bounded REST repair state on epoch changes. */
export const resetLiveSymbolQuoteRuntimeState = (): void => {
  liveQuoteRuntimeGeneration += 1;
  liveSymbolPauseTimers.forEach((timer) => clearTimeout(timer));
  liveSymbolPauseTimers.clear();
  liveSymbolNotificationPauseDepth = 0;
  pendingLiveSymbolTicks.clear();
  restQuoteFallbackEntries.forEach((entry) => {
    if (entry.retryTimer !== null) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
    entry.listeners.clear();
    entry.directTickAnchors.clear();
  });
  restQuoteFallbackEntries.clear();
};

// ─── WebSocket Global Connection Hook ───────────────────────────────────────

/**
 * Initializes and manages the global WebSocket connection.
 * Mount this in a top-level provider (e.g., _layout.tsx) so the WS connection
 * persists across screens.
 */
export function useWebSocketConnection() {
  useEffect(() => {
    // Attempt connection on mount
    wsService.connect();

    // Clean up on unmount
    return () => {
      wsService.disconnect();
    };
  }, []);

  return { connected: wsService.getConnectionStatus() };
}

// ─── Component Data Hooks (TanStack Query + Zustand) ────────────────────────

/**
 * Hook to subscribe to live price ticks for a specific array of symbols.
 * 
 * NOTE ON ARCHITECTURE:
 * We use `useEffect` to tell the WebSocketService to subscribe.
 * The WebSocketService independently dispatches ticks directly to `useTradingState`.
 * We return the `useTradingState` selector so the component only re-renders
 * when the specific symbols it cares about update.
 */
export function useMarketData(symbols: string[] = [], active = true) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const selectedBrokerId = useUserPreferences((state) => state.brokerId);
  const isPublicDemoMarket = isOrrnnDemoPublicMarketSelection({
    brokerId: selectedBrokerId,
    isLoggedIn,
  });
  const isActive = active && (isLoggedIn || isPublicDemoMarket);
  const symbolsKey = JSON.stringify(symbols);
  const transportSymbols = React.useMemo(
    () => Array.from(new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))),
    [symbolsKey],
  );
  const normalizedSymbols = React.useMemo(
    () => Array.from(new Set(symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean))),
    [symbolsKey],
  );

  // Selector that picks ONLY the quotes this component cares about.
  // Zustand + shallow comparison ensures we only re-render when one of
  // OUR symbols changes — not when an unrelated symbol ticks.
  // This is the key optimization: a QuoteDetails page watching EURUSD
  // no longer re-renders when BTCUSD ticks.
  const stableKey = JSON.stringify(normalizedSymbols);
  const selector = useCallback(
    (state: any) => {
      if (!isActive || normalizedSymbols.length === 0) return EMPTY_LIVE_QUOTES;
      const result: Record<string, any> = {};
      for (const sym of normalizedSymbols) {
        if (state.quotes[sym]) result[sym] = state.quotes[sym];
      }
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, stableKey],
  );
  const liveQuotes = useTradingState(useShallow(selector));

  useEffect(() => {
    if (!isActive || transportSymbols.length === 0) return;
    if (isPublicDemoMarket) {
      const unsubscribers = transportSymbols.map((symbol) =>
        orrnnDemoPublicMarketSocket.subscribeToSymbol(symbol, () => {}),
      );
      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    }
    quotesWsService.connect();
    quotesWsService.subscribe(transportSymbols);

    return () => {
      quotesWsService.unsubscribe(transportSymbols);
    };
  }, [isActive, isPublicDemoMarket, transportSymbols]);

  if (!isActive || symbols.length === 0) return liveQuotes;
  return symbols.reduce((acc, sym) => {
    const normalizedSymbol = normalizeSymbol(sym);
    const live = liveQuotes[sym] || liveQuotes[normalizedSymbol];
    if (live && !isFreshLiveQuote(live)) {
      return acc;
    }
    if (live) {
      acc[sym] = { ...live, symbol: normalizedSymbol };
    }
    return acc;
  }, {} as Record<string, any>);
}

function resolveMergedQuoteSnapshot(
  requestedSymbol: string,
  liveQuote?: Partial<QuoteItem>,
): Partial<QuoteItem> | undefined {
  const normalizedSymbol = normalizeSymbol(requestedSymbol);
  if (!normalizedSymbol) {
    return undefined;
  }

  const freshLiveQuote = isFreshLiveQuote(liveQuote) ? liveQuote : undefined;

  if (liveQuote && !freshLiveQuote) {
    return undefined;
  }

  if (!freshLiveQuote) {
    return undefined;
  }

  return {
    ...freshLiveQuote,
    symbol: normalizedSymbol,
  };
}

const areQuoteSnapshotsEqual = (
  left: Partial<QuoteItem> | undefined,
  right: Partial<QuoteItem> | undefined,
): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.symbol === right.symbol &&
    left.bid === right.bid &&
    left.ask === right.ask &&
    left.digits === right.digits &&
    left.digitsSource === right.digitsSource &&
    left.point === right.point &&
    left.tickSize === right.tickSize &&
    left.feedTickAt === right.feedTickAt &&
    left.lastTickAt === right.lastTickAt &&
    left.lastReceivedAt === right.lastReceivedAt &&
    left.lastPriceChangedAt === right.lastPriceChangedAt &&
    left.spread === right.spread &&
    left.volume === right.volume &&
    left.volumeSource === right.volumeSource &&
    left.changePct === right.changePct &&
    left.transport === right.transport &&
    left.stale === right.stale &&
    left.tradable === right.tradable &&
    left.degraded === right.degraded &&
    left.degradationReason === right.degradationReason &&
    left.sequence === right.sequence &&
    left.tickId === right.tickId
  );
};

const mergeQuoteTickIntoSnapshot = (
  requestedSymbol: string,
  currentSnapshot: Partial<QuoteItem> | undefined,
  tick: QuoteTickEvent,
): Partial<QuoteItem> | undefined => {
  const normalizedSymbol = normalizeSymbol(requestedSymbol);
  if (!normalizedSymbol) {
    return undefined;
  }

  const lastReceivedAt = normalizeQuoteTickTimestampToMs(tick.receivedAt) ?? Date.now();
  if (Date.now() - lastReceivedAt > LIVE_QUOTE_STALE_MS) {
    return undefined;
  }
  const feedTickAt = normalizeQuoteTickTimestampToMs(tick.feedTickAt ?? tick.timestamp);
  const lastTickAt = feedTickAt ?? lastReceivedAt;
  const priceChanged = hasQuotePriceChange(currentSnapshot, tick);
  const lastPriceChangedAt = priceChanged
    ? lastReceivedAt
    : currentSnapshot?.lastPriceChangedAt;
  const volume = resolveBackendQuoteVolume({ incoming: tick.volume, previous: currentSnapshot });

  const backendDigits =
    typeof tick.digits === 'number' && Number.isFinite(tick.digits)
      ? tick.digits
      : undefined;
  const digits = resolveQuoteDisplayDigits(
    normalizedSymbol,
    tick.bid,
    backendDigits ?? currentSnapshot?.digits,
    tick.point ?? currentSnapshot?.point,
  );

  return resolveMergedQuoteSnapshot(requestedSymbol, {
    ...(currentSnapshot || {}),
    symbol: normalizedSymbol,
    bid: tick.bid,
    ask: tick.ask,
    digits,
    ...(backendDigits !== undefined ? { digitsSource: 'backend' as const } : {}),
    ...(tick.point !== undefined ? { point: tick.point } : {}),
    ...(tick.tickSize !== undefined ? { tickSize: tick.tickSize } : {}),
    feedTickAt: feedTickAt ?? undefined,
    lastTickAt,
    lastReceivedAt,
    lastPriceChangedAt,
    volume,
    volumeSource: volume === undefined ? undefined : 'backend',
    transport: tick.transport,
    stale: tick.stale,
    tradable: tick.tradable,
    degraded: tick.degraded,
    degradationReason: tick.degradationReason,
    sequence: tick.sequence,
    tickId: tick.tickId,
    source: tick.source,
    authority: tick.authority,
    spread: calculateQuoteSpreadPoints(tick.bid, tick.ask, digits),
  });
};

function useOrrnnDemoPublicLiveSymbolQuote(
  symbol: string,
  active: boolean,
  commitIntervalMs: number,
): Partial<QuoteItem> | undefined {
  const normalizedSymbol = React.useMemo(() => normalizeSymbol(symbol), [symbol]);
  const safeCommitIntervalMs = Math.max(0, Math.floor(commitIntervalMs));
  const quoteContextKey = `${active ? 'active' : 'inactive'}:${normalizedSymbol}`;
  const [quote, setQuote] = React.useState<Partial<QuoteItem> | undefined>();
  const [quoteOwnerContextKey, setQuoteOwnerContextKey] = React.useState(quoteContextKey);
  const quoteRef = React.useRef<Partial<QuoteItem> | undefined>(undefined);
  const commitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuoteOwnerContextKey(quoteContextKey);
    if (!active || !normalizedSymbol) {
      quoteRef.current = undefined;
      setQuote(undefined);
      return;
    }

    const seed = resolveMergedQuoteSnapshot(
      symbol,
      useTradingState.getState().quotes[normalizedSymbol],
    );
    quoteRef.current = seed;
    setQuote(seed);

    const commit = () => {
      commitTimerRef.current = null;
      const next = quoteRef.current;
      setQuote((current) =>
        areQuoteSnapshotsEqual(current, next) ? current : next,
      );
    };
    const scheduleCommit = () => {
      if (safeCommitIntervalMs === 0) {
        commit();
        return;
      }
      if (!commitTimerRef.current) {
        commitTimerRef.current = setTimeout(commit, safeCommitIntervalMs);
      }
    };
    const unsubscribe = orrnnDemoPublicMarketSocket.subscribeToSymbol(
      normalizedSymbol,
      (tick) => {
        if (normalizeSymbol(tick.symbol) !== normalizedSymbol) {
          return;
        }
        quoteRef.current = mergeQuoteTickIntoSnapshot(
          symbol,
          quoteRef.current,
          { ...tick, transport: 'websocket' },
        );
        scheduleCommit();
      },
    );

    return () => {
      unsubscribe();
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      quoteRef.current = undefined;
    };
  }, [active, normalizedSymbol, quoteContextKey, safeCommitIntervalMs, symbol]);

  return active && quoteOwnerContextKey === quoteContextKey
    ? resolveContextBoundLiveSymbolQuote(symbol, quote)
    : undefined;
}

export function useLiveSymbolQuote(
  symbol: string,
  active = true,
  commitIntervalMs = LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS,
): Partial<QuoteItem> | undefined {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const selectedBrokerId = useUserPreferences((state) => state.brokerId);
  const isPublicDemoActive = active && isOrrnnDemoPublicMarketSelection({
    brokerId: selectedBrokerId,
    isLoggedIn,
  });
  const publicDemoQuote = useOrrnnDemoPublicLiveSymbolQuote(
    symbol,
    isPublicDemoActive,
    commitIntervalMs,
  );
  const activeSession = useActiveBrokerQuerySession();
  const credentialScopeKey = useActiveBrokerCredentialScopeKey();
  const isActive = active && isLoggedIn && Boolean(activeSession);
  const safeCommitIntervalMs = Math.max(0, Math.floor(commitIntervalMs));
  const normalizedSymbol = React.useMemo(() => normalizeSymbol(symbol), [symbol]);
  const liveQuoteContextKey = `${isActive ? 'active' : 'inactive'}:${credentialScopeKey}:${normalizedSymbol}`;
  const seedQuote = React.useMemo(
    () =>
      isActive
        ? resolveMergedQuoteSnapshot(
            symbol,
            normalizedSymbol ? useTradingState.getState().quotes[normalizedSymbol] : undefined,
          )
        : undefined,
    [credentialScopeKey, isActive, normalizedSymbol, symbol],
  );
  const [liveQuote, setLiveQuote] = React.useState<Partial<QuoteItem> | undefined>(seedQuote);
  const [liveQuoteOwnerContextKey, setLiveQuoteOwnerContextKey] = React.useState(liveQuoteContextKey);
  const liveQuoteRef = React.useRef<Partial<QuoteItem> | undefined>(seedQuote);
  const directQuoteTickAtRef = React.useRef(0);
  const quoteCommitCancelRef = React.useRef<(() => void) | null>(null);
  const quoteCommitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledCommitProvenanceRef = React.useRef<ActiveBrokerSessionProvenance | null>(null);

  const cancelScheduledCommit = React.useCallback(() => {
    quoteCommitCancelRef.current?.();
    quoteCommitCancelRef.current = null;
    if (quoteCommitTimerRef.current) {
      clearTimeout(quoteCommitTimerRef.current);
      quoteCommitTimerRef.current = null;
    }
    scheduledCommitProvenanceRef.current = null;
  }, []);

  const scheduleQuoteCommit = React.useCallback((provenance: ActiveBrokerSessionProvenance) => {
    if (quoteCommitCancelRef.current !== null || quoteCommitTimerRef.current) {
      return;
    }
    scheduledCommitProvenanceRef.current = provenance;

    const commit = () => {
      quoteCommitCancelRef.current = null;
      if (quoteCommitTimerRef.current) {
        clearTimeout(quoteCommitTimerRef.current);
        quoteCommitTimerRef.current = null;
      }
      const scheduledProvenance = scheduledCommitProvenanceRef.current;
      scheduledCommitProvenanceRef.current = null;

      const updateLiveQuote = () => {
        commitQuoteSnapshotIfSessionCurrent(scheduledProvenance, () => {
          const nextSnapshot = liveQuoteRef.current;
          setLiveQuote((current) => {
            let guardedSnapshot = current;
            commitQuoteSnapshotIfSessionCurrent(scheduledProvenance, () => {
              guardedSnapshot = areQuoteSnapshotsEqual(current, nextSnapshot) ? current : nextSnapshot;
            });
            return guardedSnapshot;
          });
        });
      };

      if (safeCommitIntervalMs <= 16) {
        updateLiveQuote();
      } else {
        React.startTransition(updateLiveQuote);
      }
    };

    if (safeCommitIntervalMs === 0) {
      commit();
      return;
    }

    if (safeCommitIntervalMs <= 16) {
      quoteCommitCancelRef.current = scheduleAfterVisualFrame(commit);
      return;
    }

    quoteCommitTimerRef.current = setTimeout(commit, safeCommitIntervalMs);
  }, [safeCommitIntervalMs]);

  useEffect(() => {
    setLiveQuoteOwnerContextKey(liveQuoteContextKey);
    if (!activeSession) {
      liveQuoteRef.current = undefined;
      setLiveQuote(undefined);
      return;
    }
    const seedProvenance = getActiveBrokerSessionProvenance(activeSession);
    if (!isActiveBrokerSessionProvenanceCurrent(seedProvenance)) {
      return;
    }
    liveQuoteRef.current = seedQuote;
    setLiveQuote((current) => {
      let guardedSnapshot = current;
      commitQuoteSnapshotIfSessionCurrent(seedProvenance, () => {
        guardedSnapshot = areQuoteSnapshotsEqual(current, seedQuote) ? current : seedQuote;
      });
      return guardedSnapshot;
    });
  }, [activeSession, credentialScopeKey, liveQuoteContextKey, seedQuote]);

  useEffect(() => {
    if (!isActive || !activeSession || !normalizedSymbol) {
      cancelScheduledCommit();
      liveQuoteRef.current = undefined;
      directQuoteTickAtRef.current = 0;
      setLiveQuote(undefined);
      return;
    }
    const effectProvenance = getActiveBrokerSessionProvenance(activeSession);
    if (!isActiveBrokerSessionProvenanceCurrent(effectProvenance)) {
      return;
    }

    const applyQuoteTick = (tick: QuoteTickEvent) => {
      if (normalizeSymbol(tick.symbol) !== normalizedSymbol) {
        return;
      }

      commitQuoteSnapshotIfSessionCurrent(effectProvenance, () => {
        liveQuoteRef.current = mergeQuoteTickIntoSnapshot(symbol, liveQuoteRef.current, tick);
        scheduleQuoteCommit(effectProvenance);
      });
    };

    const wsListener: LiveSymbolQuoteListener = (tick) => {
      directQuoteTickAtRef.current = Date.now();
      applyQuoteTick({ ...tick, transport: 'websocket' });
    };
    const restListener: LiveSymbolQuoteListener = applyQuoteTick;
    const guardedWsListener: LiveSymbolQuoteListener = (tick) => deliverLiveSymbolTick(wsListener, tick);
    const guardedRestListener: LiveSymbolQuoteListener = (tick) => deliverLiveSymbolTick(restListener, tick);

    const unsubscribe = quotesWsService.subscribeToSymbol(symbol, guardedWsListener);
    const unsubscribeRestFallback = subscribeLiveSymbolRestQuoteFallback(
      symbol,
      guardedRestListener,
      () => directQuoteTickAtRef.current,
    );

    return () => {
      unsubscribe();
      unsubscribeRestFallback();
      pendingLiveSymbolTicks.delete(wsListener);
      pendingLiveSymbolTicks.delete(restListener);
      directQuoteTickAtRef.current = 0;
      cancelScheduledCommit();
    };
  }, [
    activeSession,
    cancelScheduledCommit,
    credentialScopeKey,
    isActive,
    normalizedSymbol,
    scheduleQuoteCommit,
    symbol,
  ]);

  if (!active) return undefined;
  if (isPublicDemoActive) {
    return resolveContextBoundLiveSymbolQuote(symbol, publicDemoQuote);
  }
  return liveQuoteOwnerContextKey === liveQuoteContextKey
    ? resolveContextBoundLiveSymbolQuote(symbol, liveQuote)
    : undefined;
}

/**
 * Multi-symbol sibling of {@link useLiveSymbolQuote}.
 *
 * Subscribes to several symbols through the SAME synchronous per-symbol tick
 * path the position rows use (`subscribeToSymbol` → `emitSymbolTick`), then
 * commits one coalesced snapshot map per frame. This deliberately bypasses the
 * global `useTradingState` flush pipeline, which can stall under the Trade
 * screen's load and leave the aggregate floating P&L frozen even while the rows
 * tick. The returned map is keyed by normalized symbol.
 */
export function useLiveSymbolQuotes(
  symbols: string[],
  active = true,
  commitIntervalMs = LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS,
): Record<string, Partial<QuoteItem>> {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const activeSession = useActiveBrokerQuerySession();
  const credentialScopeKey = useActiveBrokerCredentialScopeKey();
  const isActive = active && isLoggedIn && Boolean(activeSession);
  const safeCommitIntervalMs = Math.max(0, Math.floor(commitIntervalMs));
  const symbolsKey = JSON.stringify(symbols);
  // Key the result map by the ORIGINAL position symbol, because consumers look
  // up quotes via `quotesBySymbol[position.symbol]` (see sumLivePositionPnl).
  const requestedSymbols = React.useMemo(
    () => Array.from(new Set(symbols.map((sym) => sym?.trim?.() || sym).filter(Boolean))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbolsKey],
  );
  const stableKey = JSON.stringify(requestedSymbols);

  const buildSeed = React.useCallback(() => {
    if (!isActive || requestedSymbols.length === 0) {
      return EMPTY_LIVE_QUOTES;
    }
    const storeQuotes = useTradingState.getState().quotes;
    const seed: Record<string, Partial<QuoteItem>> = {};
    for (const sym of requestedSymbols) {
      const normalized = normalizeSymbol(sym);
      const snapshot = resolveMergedQuoteSnapshot(sym, storeQuotes[sym] ?? (normalized ? storeQuotes[normalized] : undefined));
      if (snapshot) {
        seed[sym] = snapshot;
      }
    }
    return seed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialScopeKey, isActive, stableKey]);

  const liveQuotesRef = React.useRef<Record<string, Partial<QuoteItem>>>(EMPTY_LIVE_QUOTES);
  const quoteBatchRef = React.useRef<SymbolQuoteBatch<Partial<QuoteItem>> | null>(null);
  if (quoteBatchRef.current === null) quoteBatchRef.current = new SymbolQuoteBatch();
  const quoteBatch = quoteBatchRef.current;
  const directQuoteTickAtBySymbolRef = React.useRef<Record<string, number>>({});
  const [liveQuotes, setLiveQuotes] = React.useState<Record<string, Partial<QuoteItem>>>(() => {
    const seed = buildSeed();
    liveQuotesRef.current = seed;
    return seed;
  });
  const commitCancelRef = React.useRef<(() => void) | null>(null);
  const commitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledCommitProvenanceRef = React.useRef<ActiveBrokerSessionProvenance | null>(null);

  const cancelScheduledCommit = React.useCallback(() => {
    commitCancelRef.current?.();
    commitCancelRef.current = null;
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    scheduledCommitProvenanceRef.current = null;
    quoteBatch.clear();
  }, [quoteBatch]);

  const scheduleCommit = React.useCallback((provenance: ActiveBrokerSessionProvenance) => {
    if (commitCancelRef.current !== null || commitTimerRef.current) {
      return;
    }
    scheduledCommitProvenanceRef.current = provenance;
    const commit = () => {
      commitCancelRef.current = null;
      commitTimerRef.current = null;
      const scheduledProvenance = scheduledCommitProvenanceRef.current;
      scheduledCommitProvenanceRef.current = null;
      commitQuoteSnapshotIfSessionCurrent(scheduledProvenance, () => {
        const nextSnapshots = quoteBatch.commit(liveQuotesRef.current);
        liveQuotesRef.current = nextSnapshots;
        setLiveQuotes((current) => {
          let guardedSnapshots = current;
          commitQuoteSnapshotIfSessionCurrent(scheduledProvenance, () => {
            guardedSnapshots = nextSnapshots;
          });
          return guardedSnapshots;
        });
      });
    };
    if (safeCommitIntervalMs <= 16) {
      commitCancelRef.current = scheduleAfterVisualFrame(commit);
      return;
    }
    commitTimerRef.current = setTimeout(commit, safeCommitIntervalMs);
  }, [quoteBatch, safeCommitIntervalMs]);

  useEffect(() => {
    if (!isActive || !activeSession || requestedSymbols.length === 0) {
      cancelScheduledCommit();
      liveQuotesRef.current = EMPTY_LIVE_QUOTES;
      directQuoteTickAtBySymbolRef.current = {};
      setLiveQuotes(EMPTY_LIVE_QUOTES);
      return;
    }
    const effectProvenance = getActiveBrokerSessionProvenance(activeSession);
    if (!isActiveBrokerSessionProvenanceCurrent(effectProvenance)) {
      return;
    }

    quoteBatch.clear();
    liveQuotesRef.current = buildSeed();
    directQuoteTickAtBySymbolRef.current = {};
    setLiveQuotes((current) => {
      let guardedSnapshots = current;
      commitQuoteSnapshotIfSessionCurrent(effectProvenance, () => {
        guardedSnapshots = liveQuotesRef.current;
      });
      return guardedSnapshots;
    });

    const unsubscribers = requestedSymbols.map((requestedSymbol) => {
      const normalizedSymbol = normalizeSymbol(requestedSymbol);
      const applyQuoteTick = (tick: QuoteTickEvent) => {
        if (normalizeSymbol(tick.symbol) !== normalizedSymbol) {
          return;
        }
        commitQuoteSnapshotIfSessionCurrent(effectProvenance, () => {
          const current = quoteBatch.get(requestedSymbol, liveQuotesRef.current);
          const merged = mergeQuoteTickIntoSnapshot(requestedSymbol, current, tick);
          if (!merged || areQuoteSnapshotsEqual(current, merged)) {
            return;
          }
          quoteBatch.set(requestedSymbol, merged);
          scheduleCommit(effectProvenance);
        });
      };

      const wsListener: LiveSymbolQuoteListener = (tick) => {
        directQuoteTickAtBySymbolRef.current[requestedSymbol] = Date.now();
        applyQuoteTick({ ...tick, transport: 'websocket' });
      };
      const restListener: LiveSymbolQuoteListener = applyQuoteTick;
      const guardedWsListener: LiveSymbolQuoteListener = (tick) => deliverLiveSymbolTick(wsListener, tick);
      const guardedRestListener: LiveSymbolQuoteListener = (tick) => deliverLiveSymbolTick(restListener, tick);

      const unsubscribeWs = quotesWsService.subscribeToSymbol(requestedSymbol, guardedWsListener);
      const unsubscribeRest = subscribeLiveSymbolRestQuoteFallback(
        requestedSymbol,
        guardedRestListener,
        () => directQuoteTickAtBySymbolRef.current[requestedSymbol] ?? 0,
      );
      return () => {
        unsubscribeWs();
        unsubscribeRest();
        pendingLiveSymbolTicks.delete(wsListener);
        pendingLiveSymbolTicks.delete(restListener);
        delete directQuoteTickAtBySymbolRef.current[requestedSymbol];
      };
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      cancelScheduledCommit();
    };
  }, [
    activeSession,
    buildSeed,
    cancelScheduledCommit,
    credentialScopeKey,
    isActive,
    quoteBatch,
    scheduleCommit,
    stableKey,
  ]);

  return liveQuotes;
}

/**
 * Hook to subscribe to live account metrics (equity, balance, etc).
 */
export function useLiveAccount(accountId: string) {
  const account = useTradingState(state => state.account);

  useEffect(() => {
    if (!accountId) return;

    const channel = `account.${accountId}`;
    wsService.subscribe(channel);

    return () => {
      wsService.unsubscribe(channel);
    };
  }, [accountId]);

  return account;
}

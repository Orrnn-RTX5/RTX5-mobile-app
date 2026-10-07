import { normalizeLiveCandle } from '../../normalization/candleNormalizer';
import {
  applyLiveCandleToCandleMap,
  applyQuoteTickExtensionToCandleMap,
} from '../../series/liveCandleAggregator';
import {
  buildFreshHistoryLiveCandleSeries,
  materializeLiveCandleMap,
} from '../../series/freshHistoryLiveSeries';
import { hydratePersistedCandleCache } from '../../state/persistedCandleCache';
import {
  createCandleStreamKey,
  getTimeframeSeconds,
  normalizeSymbol,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
} from '../../core/timeframeUtils';
import { logCandleSeriesDiagnosticsInDevelopment } from '../../core/candleValidator';
import { sanitizeCandlesForChart } from '../../normalization/chartAdapter';
import type { CandleStreamState, Timeframe } from '../../core/candleTypes';
import { candleMemoryCache } from '../candleMemoryCache';
import {
  EMPTY_CANDLES,
  FLUSH_INTERVAL_MS,
  MAX_BUFFERED_LIVE_EVENTS,
  INITIAL_HISTORY_LIMIT,
  MAX_RENDERED_HISTORY_CANDLES,
  MAX_RETAINED_HISTORY_CANDLES,
  PAGINATED_HISTORY_LIMIT,
  type BufferedLiveEvent,
  type CandleParams,
  type StreamEntry,
  type StreamListener,
  type UnorderedLiveEvent,
} from './types';
import {
  getEventTime,
  isSameSeries,
  logDebug,
  toCandleParams,
} from './helpers';
import {
  runLoadHistory,
  runPrefetchHistory,
  waitForHistoryPrefetchSettlement,
  defaultCandleHistoryFetcher,
  HISTORY_REQUEST_TIMEOUT_MS,
  type CandleHistoryFetcher,
  type HistoryPrefetchRecord,
  type HistoryFetchManagerBridge,
} from './historyFetching';
import { splitRestHistoryCandles, getConfiguredCandlePriceBasis } from '../../core/candleProvenance';

const getHistoryPageLookbackMultiplier = (timeframe: Timeframe): number => {
  if (timeframe === 'W1' || timeframe === 'MN') {
    return 1;
  }
  if (timeframe === 'D1') {
    return 3;
  }
  return 6;
};

/**
 * The central orchestrator for charting data in the RTX5 application.
 * 
 * Responsibilities:
 * - Manages concurrent streams of (symbol x timeframe) candle data.
 * - Handles the async fetching of REST historical data and coordinates it with real-time WS ticks.
 * - Buffers, sorts, and flushes high-frequency WebSocket ticks at a controlled mobile cadence to prevent React render-thrashing.
 * - Caches and deduplicates state to avoid memory leaks or redundant network requests.
 * 
 * Note: Implements `HistoryFetchManagerBridge` to allow history fetching logic to live in a separate, testable file.
 */
export type LiveCandleStreamManagerOptions = Readonly<{
  fetchHistory?: CandleHistoryFetcher;
  historyRequestTimeoutMs?: number;
}>;

export class LiveCandleStreamManager implements HistoryFetchManagerBridge {
  /** @internal Exposed only for sibling modules in this folder. */
  public readonly entries = new Map<string, StreamEntry>();
  /** @internal Exposed only for sibling modules in this folder. */
  public readonly historyPrefetches = new Map<string, HistoryPrefetchRecord>();
  /** @internal Injectable so request lifecycle tests never depend on network timing. */
  public readonly fetchHistory: CandleHistoryFetcher;
  public readonly historyRequestTimeoutMs: number;

  public constructor(options: LiveCandleStreamManagerOptions = {}) {
    this.fetchHistory = options.fetchHistory ?? defaultCandleHistoryFetcher;
    this.historyRequestTimeoutMs = Number.isFinite(options.historyRequestTimeoutMs)
      ? Math.max(1, Math.floor(options.historyRequestTimeoutMs as number))
      : HISTORY_REQUEST_TIMEOUT_MS;
  }

  /**
   * Subscribes a UI component to a specific (symbol, timeframe) candle stream.
   * If the stream doesn't exist, it boots it up and initiates the initial REST fetch.
   * 
   * @param symbol The market symbol (e.g. 'EURUSD').
   * @param timeframe The requested bucket size (e.g. 'M1').
   * @param listener A callback fired whenever the canonical UI series changes.
   * @returns A cleanup function to unsubscribe and eventually GC the stream.
   */
  public subscribe(symbol: string, timeframe: string, listener: StreamListener): () => void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return () => { };
    }

    const entry = this.ensureEntry(normalizedSymbol, normalizedTimeframe);
    entry.listeners.add(listener);
    entry.consumers += 1;
    this.reloadEmptyIdleHistory(entry);

    if (entry.candles.length > 0 || entry.error) {
      listener();
    }

    return () => this.unsubscribeListener(entry.key, listener);
  }

  /** Synchronously returns the currently materialized, UI-ready candle array. */
  public getCandles(symbol: string, timeframe: string): CandleParams[] {
    return this.entries.get(this.getKey(symbol, timeframe))?.candles ?? (EMPTY_CANDLES as CandleParams[]);
  }

  /** Returns metadata about the stream (loading status, error states, etc.) for UI overlays. */
  public getState(symbol: string, timeframe: string): CandleStreamState | null {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry) {
      return null;
    }

    return {
      symbol: entry.symbol,
      timeframe: entry.timeframe,
      streamKey: entry.streamKey,
      requestId: entry.requestId,
      candles: entry.candles,
      loading: entry.loading,
      error: entry.error,
      isLiveConnected: entry.isLiveConnected,
      lastUpdateTime: entry.lastUpdateTime,
      seededFromCache: entry.seededFromCache,
    };
  }

  /** Forces a hard reset and re-fetch of the historical baseline for a given stream. */
  public refresh(symbol: string, timeframe: string): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry) {
      return;
    }

    this.loadFreshHistory(entry);
  }

  /**
   * Requests a fresh REST baseline for an already-known chart context.
   * If the target stream does not exist yet, the next `subscribe()` call owns
   * the first load so symbol/timeframe switches never issue duplicate requests.
   */
  public refreshHistoryForContext(symbol: string, timeframe: string): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    const entry = this.entries.get(this.getKey(normalizedSymbol, normalizedTimeframe));
    if (!entry || this.isHistoryRequestActive(entry)) {
      return;
    }

    this.loadFreshHistory(entry);
  }

  /**
   * Fetches the next chunk of older historical data when the user scrolls
   * to the left edge of the chart.
   */
  public paginateHistory(symbol: string, timeframe: string): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry || entry.loading || entry.historyPageLoading || entry.historyCandles.length === 0) {
      return;
    }
    const activeRenderLimit = Math.min(
      MAX_RENDERED_HISTORY_CANDLES,
      Math.max(INITIAL_HISTORY_LIMIT, entry.renderHistoryLimit || INITIAL_HISTORY_LIMIT),
    );
    if (entry.historyCandles.length > activeRenderLimit) {
      // Cache hydration retains older exact backend bars internally. Reveal
      // those first; pagination should hit the network only after local truth
      // has been exhausted.
      entry.renderHistoryLimit = Math.min(
        MAX_RENDERED_HISTORY_CANDLES,
        entry.historyCandles.length,
        activeRenderLimit + PAGINATED_HISTORY_LIMIT,
      );
      this.commit(entry);
      return;
    }
    if (activeRenderLimit >= MAX_RENDERED_HISTORY_CANDLES && entry.candles.length >= MAX_RENDERED_HISTORY_CANDLES) {
      return;
    }
    const pageToTime = entry.historyPaginationCursorTime ?? entry.historyCandles[0].time;
    if (!(pageToTime > 1)) {
      return;
    }
    const requestToTime = Math.max(1, pageToTime - 1);
    const timeframeSeconds = getTimeframeSeconds(entry.timeframe);
    const lookbackSeconds =
      PAGINATED_HISTORY_LIMIT * timeframeSeconds * getHistoryPageLookbackMultiplier(entry.timeframe);
    const fromTime = Math.max(1, pageToTime - lookbackSeconds);
    if (fromTime >= requestToTime) {
      return;
    }
    runLoadHistory(this, entry, PAGINATED_HISTORY_LIMIT, { to: requestToTime, from: fromTime });
  }

  /** Proactively fetches and caches REST history in the background before a user explicitly opens the chart. */
  public async prefetchHistory(
    symbol: string,
    timeframe: string,
    limit = INITIAL_HISTORY_LIMIT,
  ): Promise<number> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return 0;
    }

    const finiteRequestedLimit = Number.isFinite(limit)
      ? Math.floor(limit)
      : INITIAL_HISTORY_LIMIT;
    const requestedLimit = Math.min(
      MAX_RENDERED_HISTORY_CANDLES,
      Math.max(INITIAL_HISTORY_LIMIT, finiteRequestedLimit),
    );
    const key = this.getKey(normalizedSymbol, normalizedTimeframe);
    const entry = this.entries.get(key);
    const shouldLoadIntoActiveEntry = Boolean(
      entry && (
        requestedLimit > entry.renderHistoryLimit ||
        (
          requestedLimit === entry.renderHistoryLimit &&
          entry.historyCandles.length < requestedLimit &&
          !this.isHistoryRequestActive(entry)
        )
      ),
    );
    if (entry && shouldLoadIntoActiveEntry) {
      entry.renderHistoryLimit = requestedLimit;
      if (entry.historyCandles.length >= requestedLimit) {
        // Older exact bars are already retained: reveal them synchronously and
        // avoid another REST round trip.
        this.commit(entry);
        return entry.candles.length;
      }

      const pendingPrefetch = this.historyPrefetches.get(key);
      if (pendingPrefetch && pendingPrefetch.limit >= requestedLimit) {
        // A Quotes/action-sheet warm-up may already own this exact deep
        // request. Reuse it instead of launching a duplicate 500-bar request
        // when the retained Chart subscribes before that warm-up completes.
        return pendingPrefetch.promise;
      }

      // Upgrade an in-flight shallow initial load when backend status confirms
      // closure. runLoadHistory safely aborts/supersedes the old request.
      runLoadHistory(this, entry, requestedLimit);
      return entry.candles.length;
    }

    return runPrefetchHistory(
      this,
      normalizedSymbol,
      normalizedTimeframe,
      (s, t) => this.getKey(s, t),
      requestedLimit,
    );
  }

  /**
   * Restores a stream's initial state from local storage (SQLite/AsyncStorage)
   * to provide a zero-latency chart render while fresh REST history fetches in the background.
   */
  public hydrateFromCache(
    symbol: string,
    timeframe: string,
    candles: CandleParams[],
    renderLimit = INITIAL_HISTORY_LIMIT,
  ): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    // Show saved candles only until fresh history arrives.
    // Fresh history always replaces this cached starting point.
    if (!entry || candles.length === 0 || entry.historyCandles.length > 0) {
      return;
    }

    const finiteRenderLimit = Number.isFinite(renderLimit)
      ? Math.floor(renderLimit)
      : INITIAL_HISTORY_LIMIT;
    const safeRenderLimit = Math.min(
      MAX_RENDERED_HISTORY_CANDLES,
      Math.max(INITIAL_HISTORY_LIMIT, finiteRenderLimit),
    );
    // Retain validated older bars even though the first viewport materializes a
    // much smaller tail. A closed-market recovery can expose these exact bars
    // synchronously instead of throwing them away and calling REST again.
    const safeCandles = sanitizeCandlesForChart(candles, { timeframe: entry.timeframe })
      .slice(-MAX_RETAINED_HISTORY_CANDLES);
    if (safeCandles.length === 0) {
      return;
    }

    entry.historyCandles = safeCandles;
    // Preserve any live ticks that arrived while saved candles were loading.
    entry.renderHistoryLimit = safeRenderLimit;
    entry.historyPaginationCursorTime = null;
    entry.seededFromCache = true;

    const { closedHistory } = splitRestHistoryCandles(
      safeCandles,
      entry.timeframe,
      getConfiguredCandlePriceBasis(),
    );
    entry.historyLastTime = closedHistory[closedHistory.length - 1]?.time ?? null;
    this.commit(entry);
  }

  /**
   * Enqueues an authoritative live candle update from the WebSocket backend.
   * This is buffered and eventually flushed into the UI state.
   */
  public ingestLiveCandle(rawCandle: unknown, symbol?: string, timeframe?: string): void {
    const candle = normalizeLiveCandle(rawCandle);
    if (!candle) {
      return;
    }

    const normalizedSymbol = normalizeSymbol(candle.symbol ?? symbol ?? '');
    let normalizedTimeframe =
      normalizeTimeframeStrict(candle.timeframe) ??
      normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol) {
      return;
    }
    if (!normalizedTimeframe) {
      const candidates = Array.from(this.entries.values()).filter((entry) => entry.symbol === normalizedSymbol);
      if (candidates.length !== 1) {
        logDebug('live_candle_ignored', {
          symbol: normalizedSymbol,
          reason: 'missing_timeframe_context',
          activeTimeframes: candidates.map((entry) => entry.timeframe),
        });
        return;
      }
      normalizedTimeframe = candidates[0].timeframe;
    }

    const entry = this.entries.get(this.getKey(normalizedSymbol, normalizedTimeframe));
    if (!entry) {
      return;
    }

    this.enqueueLiveEvent(entry, this.makeLiveEvent(entry, { type: 'live_candle', candle }));
  }

  /**
   * Extend the active candle of every (symbol, *) subscription using a single
   * real-time price tick from the quote feed.
   *   - Updates an existing backend bucket when one is present.
   *   - Opens the current tick bucket when the candle backend is stale, while
   *     preserving any missing backend buckets as visible gaps.
   *   - Never modifies closed history (gated by `historyLastTime`).
   *   - Backend `live_candle` snapshots can still overwrite a bucket, but
   *     only when the server-candle source mode is explicitly enabled.
   *
   * Why this exists: most broker WS candle channels emit on bar-close (or on
   * a slow cadence), but real-time price movement within the active bar
   * arrives only via the quote feed. This forwards tick data into a live
   * bucket so the forming candle visibly ticks in real time even when the
   * candle backend is late or only publishes history.
   */
  public extendActiveCandlesFromQuoteTick(
    symbol: string,
    options: {
      price: number;
      time: unknown;
      volume?: number;
      high?: number;
      low?: number;
      allowFlatNewBucket?: boolean;
    },
  ): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedSymbol) {
      return;
    }
    if (!Number.isFinite(options.price) || options.price <= 0) {
      return;
    }
    const timeSeconds = normalizeTimestampToSeconds(options.time);
    if (timeSeconds === null) {
      return;
    }
    const high = Number.isFinite(options.high) && (options.high as number) > 0
      ? Math.max(options.price, options.high as number)
      : options.price;
    const low = Number.isFinite(options.low) && (options.low as number) > 0
      ? Math.min(options.price, options.low as number)
      : options.price;

    for (const entry of this.entries.values()) {
      if (entry.symbol !== normalizedSymbol) {
        continue;
      }
      this.enqueueLiveEvent(
        entry,
        this.makeLiveEvent(entry, {
          type: 'quote_tick_extension',
          price: options.price,
          high,
          low,
          time: timeSeconds,
          volume: options.volume,
          allowFlatNewBucket: options.allowFlatNewBucket,
        }),
      );
    }
  }

  public dispose(): void {
    for (const key of Array.from(this.entries.keys())) {
      this.disposeEntry(key);
    }
  }

  /** @internal Used by historyFetching helpers; not part of the public API. */
  public notify(entry: StreamEntry): void {
    entry.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('[CANDLE-STREAM] listener failed', error);
      }
    });
  }

  /** @internal Used by historyFetching helpers; not part of the public API. */
  public applyLiveEvents(entry: StreamEntry, events: BufferedLiveEvent[]): boolean {
    let changed = false;
    for (const event of events) {
      if (event.type === 'live_candle') {
        if (event.candle.symbol && normalizeSymbol(event.candle.symbol) !== entry.symbol) {
          continue;
        }
        if (event.candle.timeframe !== undefined) {
          const candleTimeframe = normalizeTimeframeStrict(event.candle.timeframe);
          if (!candleTimeframe || candleTimeframe !== entry.timeframe) {
            continue;
          }
        }
        const result = applyLiveCandleToCandleMap(entry.liveCandleMap, event.candle, entry.timeframe, {
          historyCutoffTime: entry.historyLastTime,
        });
        if (result.ignored) {
          logDebug('live_candle_ignored', {
            symbol: entry.symbol,
            timeframe: entry.timeframe,
            reason: result.reason,
            candleTime: event.candle.time,
            historyLastTime: entry.historyLastTime,
          });
        }
        changed = changed || result.changed;
      } else if (event.type === 'quote_tick_extension') {
        if (this.applyQuoteTickExtension(entry, event)) {
          changed = true;
        }
      }
    }

    return changed;
  }

  /** @internal Used by historyFetching helpers; not part of the public API. */
  public commit(entry: StreamEntry): void {
    const liveCandles = materializeLiveCandleMap(entry.liveCandleMap, entry.historyLastTime, {
      preserveProvenance: true,
    });
    // History is fetched ONLY on a fresh load (app open / symbol / timeframe
    // change) and on user-driven pagination. We deliberately do NOT auto-refresh
    // here: live ticks update the forming candle in place, and a closed candle is
    // never re-pulled or replaced, so a finalized candle stays exactly as it
    // looked while forming (no reload/flicker, no live→history shape change).
    const renderHistoryLimit = Math.min(
      MAX_RENDERED_HISTORY_CANDLES,
      Math.max(INITIAL_HISTORY_LIMIT, entry.renderHistoryLimit || INITIAL_HISTORY_LIMIT),
    );
    const nextCandles = buildFreshHistoryLiveCandleSeries(
      entry.historyCandles,
      liveCandles,
      entry.timeframe,
      renderHistoryLimit,
      { closedHistoryLastTime: entry.historyLastTime, preserveProvenance: true },
    );
    const safeNextCandles = sanitizeCandlesForChart(nextCandles, { timeframe: entry.timeframe });
    logCandleSeriesDiagnosticsInDevelopment(
      'live_stream_commit',
      safeNextCandles,
      {
        symbol: entry.symbol,
        timeframe: entry.timeframe,
        source: 'history_live_merge',
        requestId: entry.requestId,
        subscriptionId: entry.streamKey,
        componentName: 'LiveCandleStreamManager',
        timeframeMs: getTimeframeSeconds(entry.timeframe) * 1000,
      },
    );
    const nextParams = toCandleParams(safeNextCandles);
    const previousLoading = entry.loading;
    const previousLiveConnected = entry.isLiveConnected;
    entry.loading = entry.historyLoading || entry.historyPageLoading;
    entry.isLiveConnected = true;
    entry.lastUpdateTime = Date.now();

    candleMemoryCache.set(entry.symbol, entry.timeframe, safeNextCandles);

    if (isSameSeries(entry.candles, nextParams)) {
      // Revisiting a symbol re-seeds this entry from candleMemoryCache, so the
      // REST refresh that follows can return history identical to the seed. The
      // series then never changes — but the loading and connectivity flags just
      // did, and both are part of the store snapshot key. Returning without a
      // notification strands `loading: false` inside the engine while React keeps
      // rendering the spinner, which is why a revisited symbol could load forever
      // until the app was restarted. On a busy symbol the next live tick changed
      // the series and masked it; on a quiet one nothing ever did.
      // Notify only on an observable change, so redundant commits from live
      // flushes still cost nothing. (`error` is owned by the history callers, not
      // by commit(), and that failure path already notifies explicitly.)
      if (
        entry.loading !== previousLoading
        || entry.isLiveConnected !== previousLiveConnected
      ) {
        this.notify(entry);
      }
      return;
    }

    entry.candles = Object.freeze(
      nextParams.map((candle) => Object.freeze({ ...candle })),
    ) as unknown as CandleParams[];
    this.notify(entry);
  }

  private ensureEntry(symbol: string, timeframe: Timeframe): StreamEntry {
    const key = this.getKey(symbol, timeframe);
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }

    const entry: StreamEntry = {
      key,
      symbol,
      timeframe,
      requestId: 0,
      streamKey: createCandleStreamKey(symbol, timeframe),
      historyCandles: [],
      liveCandleMap: new Map(),
      historyLastTime: null,
      lastLiveEdgeGapRefreshBoundary: null,
      historyPaginationCursorTime: null,
      renderHistoryLimit: INITIAL_HISTORY_LIMIT,
      candles: EMPTY_CANDLES as CandleParams[],
      listeners: new Set(),
      consumers: 0,
      loading: true,
      historyLoading: false,
      historyPageLoading: false,
      error: null,
      isLiveConnected: false,
      lastUpdateTime: null,
      abortController: null,
      historyRequestTimeoutTimer: null,
      bufferedEvents: [],
      pendingEvents: [],
      flushFrame: null,
      flushTimer: null,
      eventOrder: 0,
      historyRetryTimer: null,
      historyRetryAttempt: 0,
      seededFromCache: false,
    };

    this.entries.set(key, entry);

    const memoryCachedCandles = candleMemoryCache.get(symbol, timeframe);
    if (memoryCachedCandles.length > 0) {
      // Startup prefetch stores fresh history in memory before the Chart tab is
      // opened.  Seed the new stream from it synchronously so first tab entry
      // can paint immediately while REST refreshes in the background.
      this.hydrateFromCache(
        symbol,
        timeframe,
        memoryCachedCandles as CandleParams[],
        Math.min(PAGINATED_HISTORY_LIMIT, memoryCachedCandles.length),
      );
    } else {
      void hydratePersistedCandleCache(symbol, timeframe).then((persisted) => {
        const live = this.entries.get(key);
        if (!live || live.historyCandles.length > 0 || persisted.length === 0) {
          return;
        }
        this.hydrateFromCache(symbol, timeframe, persisted as CandleParams[]);
      });
    }

    this.loadFreshHistory(entry);
    return entry;
  }

  private isHistoryRequestActive(entry: StreamEntry): boolean {
    // A pending background prefetch deliberately does NOT count as active:
    // loadFreshHistory chains onto it and issues a real load only if the
    // prefetch yields no candles. Treating it as active made a failed
    // prefetch permanently swallow the history load for symbol switches and
    // re-subscribes (blank history while live ticks keep painting).
    return (
      entry.historyLoading ||
      entry.historyPageLoading ||
      Boolean(entry.abortController)
    );
  }

  private loadFreshHistory(entry: StreamEntry): void {
    const initialLoadLimit = Math.min(
      PAGINATED_HISTORY_LIMIT,
      Math.max(INITIAL_HISTORY_LIMIT, entry.renderHistoryLimit || INITIAL_HISTORY_LIMIT),
    );
    entry.renderHistoryLimit = initialLoadLimit;
    entry.historyPaginationCursorTime = null;

    const pendingPrefetchRecord = this.historyPrefetches.get(entry.key);
    if (pendingPrefetchRecord) {
      // If a warm-up is already fetching this history, wait for it.
      // Start another request only if it produced no usable candles.
      // A warm-up join is background work when a cache seed already exists.
      // Keep that seed visible and keep live ticks flowing while it settles.
      entry.loading = entry.historyCandles.length === 0;
      this.notify(entry);
      this.joinPendingHistoryPrefetch(entry, pendingPrefetchRecord, initialLoadLimit);
      return;
    }

    runLoadHistory(this, entry, initialLoadLimit);
  }

  private joinPendingHistoryPrefetch(
    entry: StreamEntry,
    pendingPrefetchRecord: HistoryPrefetchRecord,
    initialLoadLimit: number,
  ): void {
    const settlePendingPrefetch = (result: 'settled' | 'timed_out') => {
      // A timed-out warm-up must stop owning this key. Otherwise every future
      // A -> B -> A revisit joins the same never-settling promise and only a
      // full JS-runtime/app restart can recover it.
      if (
        result === 'timed_out'
        && this.historyPrefetches.get(entry.key) === pendingPrefetchRecord
      ) {
        this.historyPrefetches.delete(entry.key);
      }
      const live = this.entries.get(entry.key);
      if (!live) {
        return;
      }
      if (
        live.historyCandles.length > 0 ||
        live.historyLoading ||
        live.historyPageLoading ||
        live.abortController
      ) {
        // Either the warm-up already supplied renderable history, or a real
        // load is in flight and owns the flag (settleIdleLoading leaves it
        // raised in that case). The first branch is taken by construction on a
        // revisit, because ensureEntry seeds historyCandles from
        // candleMemoryCache before we get here — and since no load was issued,
        // nothing else would ever recompute `loading`. Settle it here instead
        // of leaving the spinner up until some unrelated live tick commits.
        this.settleIdleLoading(live);
        return;
      }

      // A deeper warm-up (market-closed history depth) replaced the shallow
      // one joined here; the replaced request settles with 0 while the deeper
      // response is still in flight. Join that one instead of issuing a third
      // request for the same history.
      const supersedingPrefetchRecord = this.historyPrefetches.get(entry.key);
      if (supersedingPrefetchRecord && supersedingPrefetchRecord !== pendingPrefetchRecord) {
        this.joinPendingHistoryPrefetch(live, supersedingPrefetchRecord, initialLoadLimit);
        return;
      }

      const fallbackLoadLimit = Math.min(
        PAGINATED_HISTORY_LIMIT,
        Math.max(INITIAL_HISTORY_LIMIT, live.renderHistoryLimit || initialLoadLimit),
      );
      runLoadHistory(this, live, fallbackLoadLimit);
    };
    // Rejections and transport-level hangs both settle this join. The latter
    // falls back after a bounded wait instead of gating this context forever.
    void waitForHistoryPrefetchSettlement(pendingPrefetchRecord.promise)
      .then(settlePendingPrefetch);
  }

  /**
   * Recomputes `loading` from the two flags that actually own it and publishes
   * the result. Used on paths that finish without issuing a history request of
   * their own, where no `commit()` is guaranteed to follow and would otherwise
   * leave `loading` stranded true for the lifetime of the entry.
   */
  private settleIdleLoading(entry: StreamEntry): void {
    const previousLoading = entry.loading;
    entry.loading = entry.historyLoading || entry.historyPageLoading;
    if (entry.loading !== previousLoading) {
      this.notify(entry);
    }
  }

  private reloadEmptyIdleHistory(entry: StreamEntry): void {
    if (entry.historyCandles.length > 0 || this.isHistoryRequestActive(entry)) {
      return;
    }

    this.loadFreshHistory(entry);
  }

  private unsubscribeListener(key: string, listener: StreamListener): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    entry.listeners.delete(listener);
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (entry.consumers === 0) {
      this.disposeEntry(key);
    }
  }

  private disposeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    entry.abortController?.abort();
    if (entry.historyRequestTimeoutTimer) {
      clearTimeout(entry.historyRequestTimeoutTimer);
      entry.historyRequestTimeoutTimer = null;
    }
    if (entry.flushFrame !== null) {
      if (typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(entry.flushFrame);
      }
      entry.flushFrame = null;
    }
    if (entry.flushTimer) {
      clearTimeout(entry.flushTimer);
      entry.flushTimer = null;
    }
    if (entry.historyRetryTimer) {
      clearTimeout(entry.historyRetryTimer);
      entry.historyRetryTimer = null;
    }
    entry.bufferedEvents = [];
    entry.pendingEvents = [];
    entry.listeners.clear();
    this.entries.delete(key);
  }

  private enqueueLiveEvent(entry: StreamEntry, event: BufferedLiveEvent): void {
    if (!this.entries.has(entry.key)) {
      return;
    }

    if (entry.historyLoading) {
      entry.bufferedEvents.push(event);
      if (entry.bufferedEvents.length > MAX_BUFFERED_LIVE_EVENTS) {
        entry.bufferedEvents = entry.bufferedEvents.slice(-MAX_BUFFERED_LIVE_EVENTS);
      }
      return;
    }

    entry.pendingEvents.push(event);
    if (entry.pendingEvents.length > MAX_BUFFERED_LIVE_EVENTS) {
      // Burst of live events: keep only the most recent ones and flush them. We
      // intentionally do NOT re-pull history here — history loads only on a fresh
      // open / symbol / timeframe change, never as an automatic resync.
      entry.pendingEvents = entry.pendingEvents.slice(-MAX_BUFFERED_LIVE_EVENTS);
    }

    this.scheduleFlush(entry);
  }

  private scheduleFlush(entry: StreamEntry): void {
    if (entry.flushFrame !== null || entry.flushTimer) {
      return;
    }

    const flushPendingEvents = () => {
      if (entry.flushFrame !== null) {
        try {
          if (typeof globalThis.cancelAnimationFrame === 'function') {
            globalThis.cancelAnimationFrame(entry.flushFrame);
          }
        } catch (_error) {
          // The frame may already be executing.
        }
      }
      if (entry.flushTimer) {
        clearTimeout(entry.flushTimer);
      }
      entry.flushFrame = null;
      entry.flushTimer = null;
      const live = this.entries.get(entry.key);
      if (!live || live.pendingEvents.length === 0) {
        return;
      }

      const events = live.pendingEvents
        .splice(0)
        .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
      const changed = this.applyLiveEvents(live, events);
      if (changed) {
        this.commit(live);
      }
    };

    // Paint on the next frame while merging bursts, but arm a simultaneous
    // timeout. Android can indefinitely defer a retained/hidden surface rAF;
    // whichever callback wins cancels the other and clears both handles.
    entry.flushTimer = setTimeout(flushPendingEvents, FLUSH_INTERVAL_MS);
    if (typeof globalThis.requestAnimationFrame === 'function') {
      try {
        entry.flushFrame = globalThis.requestAnimationFrame(flushPendingEvents);
      } catch (_error) {
        entry.flushFrame = null;
      }
    }
  }

  private applyQuoteTickExtension(
    entry: StreamEntry,
    event: {
      price: number;
      time: number;
      volume?: number;
      high?: number;
      low?: number;
      allowFlatNewBucket?: boolean;
    },
  ): boolean {
    const restTail = entry.historyCandles[entry.historyCandles.length - 1] ?? null;
    const result = applyQuoteTickExtensionToCandleMap(
      entry.liveCandleMap,
      {
        price: event.price,
        high: event.high,
        low: event.low,
        time: event.time,
        volume: event.volume,
      },
      entry.timeframe,
      {
        historyCutoffTime: entry.historyLastTime,
        latestHistoryCandle: restTail,
        allowFlatNewBucket: event.allowFlatNewBucket,
      },
    );
    return result.changed;
  }

  private makeLiveEvent(
    entry: StreamEntry,
    event: UnorderedLiveEvent,
  ): BufferedLiveEvent {
    entry.eventOrder += 1;
    return { ...event, order: entry.eventOrder } as BufferedLiveEvent;
  }

  private getKey(symbol: string, timeframe: string): string {
    return createCandleStreamKey(symbol, timeframe);
  }
}

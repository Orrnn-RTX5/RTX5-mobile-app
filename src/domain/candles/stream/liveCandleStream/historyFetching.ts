/**
 * REST history loading for the candle stream.
 *
 * Both `runLoadHistory` and `runPrefetchHistory` were lifted out of the
 * original `LiveCandleStreamManager` so the manager class stays under the
 * 500-line ceiling. They take a small `HistoryFetchManagerBridge` interface
 * so they remain unit-testable without the full class.
 */
import { getCandleHistory } from '../../api/candles';
import { syncMergedCandleCache } from '../../state/candleCache';
import {
  foldCoveredLiveExtremesIntoHistory,
  pruneLiveCandleMapCoveredByHistory,
} from '../../series/freshHistoryLiveSeries';
import {
  normalizeCandleHistoryTimeframeStrict,
  normalizeSymbol,
} from '../../core/timeframeUtils';
import { candleMemoryCache } from '../candleMemoryCache';
import { getEventTime, getHistorySeedSnapshot, logDebug } from './helpers';
import {
  INITIAL_HISTORY_LIMIT,
  MAX_RENDERED_HISTORY_CANDLES,
  MAX_RETAINED_HISTORY_CANDLES,
  type BufferedLiveEvent,
  type StreamEntry,
} from './types';

/**
 * A minimal interface that exposes only the methods of LiveCandleStreamManager
 * needed by the history fetching logic. This prevents circular dependencies 
 * and makes the history logic easily mockable/testable.
 */
export interface HistoryFetchManagerBridge {
  readonly entries: Map<string, StreamEntry>;
  readonly historyPrefetches: Map<string, HistoryPrefetchRecord>;
  readonly fetchHistory: CandleHistoryFetcher;
  readonly historyRequestTimeoutMs: number;
  notify(entry: StreamEntry): void;
  applyLiveEvents(entry: StreamEntry, events: BufferedLiveEvent[]): boolean;
  commit(entry: StreamEntry): void;
}

export type HistoryPrefetchRecord = {
  limit: number;
  promise: Promise<number>;
};

export type CandleHistoryFetcher = typeof getCandleHistory;
export const defaultCandleHistoryFetcher: CandleHistoryFetcher = getCandleHistory;
export const HISTORY_REQUEST_TIMEOUT_MS = 15_000;
export const HISTORY_REQUEST_TIMEOUT_ERROR_MESSAGE = 'Candle history request timed out.';

export const HISTORY_PREFETCH_JOIN_TIMEOUT_MS = 5_000;

/**
 * A picker warm-up is intentionally best-effort. Never let an unresolved
 * warm-up promise become a permanent gate for the real chart subscription:
 * mobile transports can occasionally leave a request pending until the JS
 * runtime is destroyed, which previously made every revisit join the same
 * dead promise and spin until the app was restarted.
 */
export const waitForHistoryPrefetchSettlement = (
  promise: Promise<number>,
  timeoutMs = HISTORY_PREFETCH_JOIN_TIMEOUT_MS,
): Promise<'settled' | 'timed_out'> => new Promise((resolve) => {
  let finished = false;
  const finish = (result: 'settled' | 'timed_out') => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timeout);
    resolve(result);
  };
  const timeout = setTimeout(() => finish('timed_out'), Math.max(0, timeoutMs));
  void promise.then(
    () => finish('settled'),
    () => finish('settled'),
  );
});

import { sanitizeCandlesForChart } from '../../normalization/chartAdapter';
import { computeHistoryRetryPlan } from './historyRetryPolicy';
import {
  captureActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../../../state/activeBrokerSession';

/**
 * Self-heal for an initial history load that produced no candles (network
 * failure, empty 200, or a not-yet-hydrated broker session on cold open).
 * Schedules a self-cancelling retry so the chart recovers automatically
 * instead of staying history-less until the user switches symbol. The timer
 * no-ops if a newer request superseded it or history arrived meanwhile, and
 * `disposeEntry` clears it when the last subscriber leaves.
 */
const scheduleInitialHistoryRetry = (
  manager: HistoryFetchManagerBridge,
  entry: StreamEntry,
  limit: number,
  requestId: number,
  isPaginationRequest: boolean,
): void => {
  const retryPlan = computeHistoryRetryPlan(entry, isPaginationRequest);
  if (!retryPlan.shouldRetry) {
    return;
  }
  entry.historyRetryAttempt = retryPlan.nextAttempt;
  const attemptNumber = retryPlan.nextAttempt;
  if (entry.historyRetryTimer) {
    clearTimeout(entry.historyRetryTimer);
  }
  entry.historyRetryTimer = setTimeout(() => {
    const retryEntry = manager.entries.get(entry.key);
    if (!retryEntry) {
      return;
    }
    retryEntry.historyRetryTimer = null;
    // Superseded by a symbol/timeframe switch, manual refresh, or a
    // request that already started: the requestId moved on — no-op.
    if (retryEntry.requestId !== requestId) {
      return;
    }
    // Cache/prefetch already filled history while we waited — no-op.
    if (retryEntry.historyCandles.length > 0) {
      return;
    }
    logDebug('history_retry', {
      symbol: entry.symbol,
      timeframe: entry.timeframe,
      attempt: attemptNumber,
    });
    runLoadHistory(manager, retryEntry, limit, { isRetry: true });
  }, retryPlan.delayMs);
};

/**
 * Releases the in-flight flags of a history request whose broker session was
 * superseded while it was on the wire.
 *
 * The payload itself must be discarded — it belongs to a session we are no
 * longer allowed to render — but the flags this request raised still have to
 * come down. Returning with `historyLoading` left true wedges the entry
 * permanently: `enqueueLiveEvent` diverts every subsequent quote tick into
 * `bufferedEvents` while that flag is set, and those buffers are only drained by
 * this request's own settle handlers. No `commit()` can then run, so `loading`
 * is never recomputed, React is never notified, and the chart spins until the
 * app is restarted.
 */
const releaseSupersededHistoryRequest = (
  manager: HistoryFetchManagerBridge,
  live: StreamEntry,
): void => {
  live.loading = false;
  live.historyLoading = false;
  live.historyPageLoading = false;
  const replayEvents = live.bufferedEvents
    .splice(0)
    .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
  manager.applyLiveEvents(live, replayEvents);
  manager.commit(live);
  manager.notify(live);
};

const clearHistoryRequestTimeout = (entry: StreamEntry): void => {
  if (entry.historyRequestTimeoutTimer) {
    clearTimeout(entry.historyRequestTimeoutTimer);
    entry.historyRequestTimeoutTimer = null;
  }
};

/**
 * Owns the terminal state transition for a transport that never settles.
 * Aborting the fetch is not enough by itself because the normal catch handler
 * deliberately ignores owned AbortErrors. Release the flags, replay any cold-
 * load ticks, publish the retained series, and let the empty-history retry
 * policy schedule the next self-heal attempt.
 */
const releaseTimedOutHistoryRequest = (
  manager: HistoryFetchManagerBridge,
  entry: StreamEntry,
  requestId: number,
  controller: AbortController,
  limit: number,
  isPaginationRequest: boolean,
): void => {
  const live = manager.entries.get(entry.key);
  if (
    !live
    || live.requestId !== requestId
    || live.abortController !== controller
  ) {
    return;
  }

  clearHistoryRequestTimeout(live);
  controller.abort();
  live.abortController = null;
  live.historyLoading = false;
  live.historyPageLoading = false;
  live.error = HISTORY_REQUEST_TIMEOUT_ERROR_MESSAGE;
  const replayEvents = live.bufferedEvents
    .splice(0)
    .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
  manager.applyLiveEvents(live, replayEvents);
  manager.commit(live);
  manager.notify(live);
  logDebug('history_timeout', {
    symbol: live.symbol,
    timeframe: live.timeframe,
    requestId,
    replayedLiveEvents: replayEvents.length,
  });
  scheduleInitialHistoryRetry(manager, live, limit, requestId, isPaginationRequest);
};

/**
 * Executes an async fetch of authoritative historical candles from the REST API.
 *
 * - Handles race conditions via `abortController` and `requestId`.
 * - Replays any live websocket ticks that buffered while history was downloading.
 * - Safely stitches the trusted history underneath the live mutating candles.
 * 
 * @param manager The bridge to the main stream manager.
 * @param entry The specific stream state being updated.
 * @param limit Max number of candles to fetch.
 * @param options Optional parameters for pagination (e.g. fetching older history).
 */
export const runLoadHistory = (
  manager: HistoryFetchManagerBridge,
  entry: StreamEntry,
  limit: number,
  options?: { to?: number; from?: number; isRetry?: boolean },
): void => {
  if (!manager.entries.has(entry.key)) {
    return;
  }
  const sessionProvenance = captureActiveBrokerSessionProvenance();
  if (!sessionProvenance) {
    // Cold-open race: the chart can subscribe before the broker session
    // finishes hydrating from secure storage (notably slow on iOS). Dying
    // silently here left the entry permanently history-less, so retry until
    // the session appears or the entry is disposed (logout tears down all
    // chart subscriptions, which clears this timer).
    if (!options?.to && entry.historyCandles.length === 0) {
      scheduleInitialHistoryRetry(manager, entry, limit, entry.requestId, false);
    }
    return;
  }

  const isPaginationRequest = Boolean(options?.to);
  // A new load supersedes any pending failure-retry for this entry.
  if (entry.historyRetryTimer) {
    clearTimeout(entry.historyRetryTimer);
    entry.historyRetryTimer = null;
  }
  // A fresh (non-retry) initial load resets the bounded retry budget, so a
  // user-driven refresh or symbol re-open gets a clean set of attempts.
  if (!isPaginationRequest && !options?.isRetry) {
    entry.historyRetryAttempt = 0;
  }
  entry.requestId += 1;
  const requestId = entry.requestId;
  clearHistoryRequestTimeout(entry);
  entry.abortController?.abort();
  const controller = new AbortController();
  entry.abortController = controller;
  const hasRenderableHistorySeed = !isPaginationRequest && entry.historyCandles.length > 0;
  // A self-heal retry after a visible failure runs in the background: the
  // failure stays on screen (and live ticks keep applying) until a retry
  // succeeds. Re-raising the loader on every attempt made a broker answering
  // 503 CANDLE_HISTORY_UNAVAILABLE flip between spinner and error forever.
  const isQuietRetry =
    !isPaginationRequest &&
    !hasRenderableHistorySeed &&
    Boolean(options?.isRetry) &&
    entry.error !== null;
  // Cached candles already make this chart renderable. Refresh them in the
  // background without showing the loader again or buffering live ticks.
  entry.loading = !hasRenderableHistorySeed && !isQuietRetry;
  if (!isQuietRetry) {
    entry.error = null;
  }
  if (isPaginationRequest) {
    entry.historyPageLoading = true;
  } else {
    // A confirmed-closed warm-up may intentionally request a deeper first
    // window. Keep all of those exact backend candles renderable so genuine
    // pre-close bars are not hidden behind a second pagination request.
    entry.renderHistoryLimit = Math.min(
      MAX_RENDERED_HISTORY_CANDLES,
      Math.max(INITIAL_HISTORY_LIMIT, limit),
    );
    entry.historyPaginationCursorTime = null;
    entry.historyLoading = !hasRenderableHistorySeed && !isQuietRetry;
    entry.historyPageLoading = false;
    if (!hasRenderableHistorySeed && !isQuietRetry) {
      entry.bufferedEvents = [];
    }
  }
  manager.notify(entry);

  const symbol = entry.symbol;
  const timeframe = entry.timeframe;
  logDebug('history_request', { symbol, timeframe, requestId, to: options?.to });

  entry.historyRequestTimeoutTimer = setTimeout(() => {
    releaseTimedOutHistoryRequest(
      manager,
      entry,
      requestId,
      controller,
      limit,
      isPaginationRequest,
    );
  }, manager.historyRequestTimeoutMs);

  void manager.fetchHistory(symbol, timeframe, limit, {
    signal: controller.signal,
    to: options?.to,
    from: options?.from,
    cacheNamespace: sessionProvenance.cacheNamespace,
  })
    .then((history) => {
      const live = manager.entries.get(entry.key);
      if (!live || live.requestId !== requestId || controller.signal.aborted) {
        return;
      }
      clearHistoryRequestTimeout(live);
      if (!isActiveBrokerSessionProvenanceCurrent(history.provenance)) {
        releaseSupersededHistoryRequest(manager, live);
        return;
      }

      const historySeed = getHistorySeedSnapshot(history);
      let historyCandles = historySeed.candles;

      if (isPaginationRequest) {
        const previousOldestHistoryTime = live.historyCandles[0]?.time ?? null;
        historyCandles = sanitizeCandlesForChart([...historyCandles, ...live.historyCandles], { timeframe });
        if (historyCandles.length > MAX_RETAINED_HISTORY_CANDLES) {
          historyCandles = historyCandles.slice(-MAX_RETAINED_HISTORY_CANDLES);
        }
        const newOlderHistoryCount =
          typeof previousOldestHistoryTime === 'number'
            ? historyCandles.filter((candle) => candle.time < previousOldestHistoryTime).length
            : 0;
        if (newOlderHistoryCount > 0) {
          live.historyPaginationCursorTime = null;
          live.renderHistoryLimit = Math.min(
            MAX_RENDERED_HISTORY_CANDLES,
            Math.max(INITIAL_HISTORY_LIMIT, live.renderHistoryLimit + newOlderHistoryCount),
          );
        } else if (typeof options?.from === 'number' && Number.isFinite(options.from)) {
          live.historyPaginationCursorTime = Math.max(1, Math.floor(options.from));
        }
      }

      // A 200 with zero candles is as blank-chart-inducing as a failed
      // request: committing it would wipe any cache-hydrated candles and
      // (because the success path used to clear the retry state) end the
      // self-heal loop for good. Keep whatever we already have on screen and
      // retry like a failure instead.
      const isEmptyInitialHistory = !isPaginationRequest && historyCandles.length === 0;

      if (!isEmptyInitialHistory) {
        // Keep REST history and backend live candles separate. The visible
        // chart series is rebuilt fresh from these two sources in commit().
        live.historyCandles = historyCandles;

        if (!options?.to) {
          // Preserve wicks we observed live before the live candle is pruned, so a
          // finalized candle never renders narrower than it did while forming.
          live.historyCandles = foldCoveredLiveExtremesIntoHistory(
            live.historyCandles,
            live.liveCandleMap,
            historySeed.closedHistoryLastTime,
            timeframe,
          );
          live.liveCandleMap = pruneLiveCandleMapCoveredByHistory(
            live.liveCandleMap,
            historySeed.closedHistoryLastTime,
          );
          live.historyLastTime = historySeed.closedHistoryLastTime;
        }

        live.historyRetryAttempt = 0;
        syncMergedCandleCache(symbol, timeframe, history.closedCandles, {
          canonical: true,
          provenance: history.provenance,
        });
      }

      // `loading` is the aggregate of the two request-owned flags below and is
      // recomputed by commit(). Do not clear it first: a warm symbol revisit can
      // return history identical to its cache seed, and commit() must still see
      // the true -> false transition so React is notified to remove its loader.
      live.historyLoading = false;
      live.historyPageLoading = false;
      live.error = null;

      const replayEvents = live.bufferedEvents
        .splice(0)
        .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
      manager.applyLiveEvents(live, replayEvents);
      manager.commit(live);
      logDebug('history_success', {
        symbol,
        timeframe,
        requestId,
        historyCandles: historyCandles.length,
        currentCandleTime: history.currentCandle?.time ?? null,
        seededCurrentCandleTime: historySeed.currentCandleTime,
        trustedHistoryLastTime: live.historyLastTime,
        replayedLiveEvents: replayEvents.length,
      });

      if (isEmptyInitialHistory && live.historyCandles.length === 0) {
        logDebug('history_empty_retry', { symbol, timeframe, requestId });
        scheduleInitialHistoryRetry(manager, live, limit, requestId, isPaginationRequest);
      }
    })
    .catch((error) => {
      const live = manager.entries.get(entry.key);
      if (!live || live.requestId !== requestId || controller.signal.aborted) {
        return;
      }
      clearHistoryRequestTimeout(live);
      if (!isActiveBrokerSessionProvenanceCurrent(sessionProvenance)) {
        releaseSupersededHistoryRequest(manager, live);
        return;
      }

      live.loading = false;
      live.historyLoading = false;
      live.historyPageLoading = false;
      live.error = error instanceof Error ? error.message : String(error);
      const replayEvents = live.bufferedEvents
        .splice(0)
        .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
      manager.applyLiveEvents(live, replayEvents);
      manager.commit(live);
      manager.notify(live);
      logDebug('history_failure', {
        symbol,
        timeframe,
        requestId,
        message: live.error,
        replayedLiveEvents: replayEvents.length,
      });

      // Self-heal: the initial history load (which gates the chart render) just
      // failed and we still have no history. Schedule a self-cancelling retry
      // so a transient backend hiccup recovers automatically instead of
      // leaving the chart blank until the user switches symbol. Pagination
      // failures are excluded (they don't gate the render and already advance
      // their own cursor).
      scheduleInitialHistoryRetry(manager, live, limit, requestId, isPaginationRequest);
    })
    .finally(() => {
      const live = manager.entries.get(entry.key);
      if (live && live.requestId === requestId) {
        clearHistoryRequestTimeout(live);
        live.abortController = null;
      }
    });
};

/**
 * Initiates a background fetch of history before the UI explicitly requests it
 * (e.g., when hovering over an instrument in a watchlist).
 * 
 * - Deduplicates in-flight prefetches using `historyPrefetches`.
 * - Silently aborts or yields if a real `runLoadHistory` takes over.
 * 
 * @returns A promise resolving to the number of fetched candles, or 0 if failed.
 */
export const runPrefetchHistory = (
  manager: HistoryFetchManagerBridge,
  symbol: string,
  timeframe: string,
  resolveKey: (symbol: string, timeframe: string) => string,
  limit = INITIAL_HISTORY_LIMIT,
): Promise<number> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);
  if (!normalizedSymbol || !normalizedTimeframe) {
    return Promise.resolve(0);
  }
  const sessionProvenance = captureActiveBrokerSessionProvenance();
  if (!sessionProvenance) return Promise.resolve(0);
  const finiteRequestedLimit = Number.isFinite(limit)
    ? Math.floor(limit)
    : INITIAL_HISTORY_LIMIT;
  const requestedLimit = Math.min(
    MAX_RENDERED_HISTORY_CANDLES,
    Math.max(INITIAL_HISTORY_LIMIT, finiteRequestedLimit),
  );

  const key = resolveKey(normalizedSymbol, normalizedTimeframe);
  const activeEntry = manager.entries.get(key);
  if (activeEntry?.historyLoading && requestedLimit <= activeEntry.renderHistoryLimit) {
    return Promise.resolve(activeEntry.candles.length);
  }
  if (
    activeEntry &&
    activeEntry.historyCandles.length >= requestedLimit &&
    !activeEntry.loading
  ) {
    return Promise.resolve(activeEntry.candles.length);
  }

  // An accepted Quotes-row tap may finish this exact symbol/timeframe warm-up
  // while the ActionSheet is still open. Reuse that authoritative memory seed
  // when the user then chooses Chart instead of issuing the same REST request
  // twice. The active Chart stream still starts its normal fresh-history load
  // after synchronously painting this seed.
  const memorySeed = candleMemoryCache.get(normalizedSymbol, normalizedTimeframe);
  if (memorySeed.length >= requestedLimit) {
    return Promise.resolve(memorySeed.length);
  }

  const existing = manager.historyPrefetches.get(key);
  if (existing && existing.limit >= requestedLimit) {
    return existing.promise;
  }

  let prefetchRecord: HistoryPrefetchRecord;
  const prefetch = manager.fetchHistory(
    normalizedSymbol,
    normalizedTimeframe,
    requestedLimit,
    { cacheNamespace: sessionProvenance.cacheNamespace },
  )
    .then((history) => {
      if (!isActiveBrokerSessionProvenanceCurrent(history.provenance)) return 0;
      const seed = getHistorySeedSnapshot(history);
      const candles = seed.candles;
      // A deeper request can supersede an earlier shallow warm-up. Never let
      // the late shallow response replace the deeper exact history — but while
      // the deeper response is still in flight, the shallow one may seed an
      // empty chart so it paints now instead of after a second round trip.
      if (manager.historyPrefetches.get(key) !== prefetchRecord) {
        const deeperLanded =
          candleMemoryCache.get(normalizedSymbol, normalizedTimeframe).length >= candles.length;
        const supersededLiveEntry = manager.entries.get(key);
        if (
          deeperLanded ||
          candles.length === 0 ||
          !supersededLiveEntry ||
          supersededLiveEntry.requestId !== 0 ||
          supersededLiveEntry.historyLoading ||
          supersededLiveEntry.historyCandles.length > 0
        ) {
          return 0;
        }
      }
      candleMemoryCache.set(normalizedSymbol, normalizedTimeframe, candles);
      syncMergedCandleCache(normalizedSymbol, normalizedTimeframe, history.closedCandles, {
        canonical: true,
        provenance: history.provenance,
      });

      const liveEntry = manager.entries.get(key);
      // Do not let an older warm-up result replace history already loaded
      // by the active chart.
      if (
        liveEntry &&
        candles.length > 0 &&
        liveEntry.requestId === 0 &&
        !liveEntry.historyLoading
      ) {
        liveEntry.renderHistoryLimit = Math.min(
          MAX_RENDERED_HISTORY_CANDLES,
          Math.max(INITIAL_HISTORY_LIMIT, requestedLimit),
        );
        liveEntry.historyCandles = foldCoveredLiveExtremesIntoHistory(
          candles,
          liveEntry.liveCandleMap,
          seed.closedHistoryLastTime,
          timeframe,
        );
        liveEntry.historyLastTime = seed.closedHistoryLastTime;
        liveEntry.liveCandleMap = pruneLiveCandleMapCoveredByHistory(
          liveEntry.liveCandleMap,
          seed.closedHistoryLastTime,
        );
        manager.commit(liveEntry);
      }

      return candles.length;
    })
    .catch((error) => {
      logDebug('prefetch_failed', {
        symbol: normalizedSymbol,
        timeframe: normalizedTimeframe,
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    })
    .finally(() => {
      if (manager.historyPrefetches.get(key) === prefetchRecord) {
        manager.historyPrefetches.delete(key);
      }
    });

  prefetchRecord = { limit: requestedLimit, promise: prefetch };
  manager.historyPrefetches.set(key, prefetchRecord);
  return prefetch;
};

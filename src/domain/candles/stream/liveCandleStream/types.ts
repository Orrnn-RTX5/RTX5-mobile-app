import type { Candle, CandleStreamState, LiveCandle, MutableCandle, Timeframe } from '../../core/candleTypes';
import { MAX_CANDLE_SERIES_LENGTH } from '../../core/candles';
import type { createCandleStreamKey } from '../../core/timeframeUtils';
import type { getCandleHistory } from '../../api/candles';

/**
 * Extended Candle type used internally by the stream manager to track optional metadata 
 * like bid/ask lines and provenance source, without polluting the public Candle interface.
 */
export type CandleParams = Candle & {
  bid?: number;
  ask?: number;
  source?: 'history' | 'live_candle' | 'rest' | 'live';
  closed?: boolean;
  firstUpdateTime?: number;
  lastUpdateTime?: number;
  lastBackendUpdateTime?: number;
  lastQuoteTime?: number;
  priceBasis?: string;
  serverTimeframe?: string;
};

export type StreamListener = () => void;

/**
 * A normalized, sortable wrapper around real-time events that mutate the active candle.
 * We attach an `order` sequence number so that if multiple ticks arrive in the same
 * millisecond, we can still guarantee deterministic replay order.
 */
export type BufferedLiveEvent =
  | { type: 'live_candle'; candle: LiveCandle; order: number }
  // Quote-tick extension. Carries a single price + timestamp from the quote
  // feed and mutates an already-open active bucket's close (and widens
  // high/low), or opens the current tick bucket when the candle backend is
  // stale. The volume field is a per-tick contribution so sub-frame bursts
  // still preserve tick count before the next chart paint. It never backfills
  // missing buckets or touches closed history.
  // Backend live_candle snapshots are applied only when the server-candle
  // source mode is explicitly enabled after runtime compatibility proof.
  | {
    type: 'quote_tick_extension';
    price: number;
    high?: number;
    low?: number;
    time: number;
    volume?: number;
    allowFlatNewBucket?: boolean;
    order: number;
  };

export type UnorderedLiveEvent =
  | { type: 'live_candle'; candle: LiveCandle }
  | {
    type: 'quote_tick_extension';
    price: number;
    high?: number;
    low?: number;
    time: number;
    volume?: number;
    allowFlatNewBucket?: boolean;
  };

/**
 * The core state container for a single managed candle stream (e.g. "EURUSD:M1").
 * Tracks the historical base layer, the live overlay map, connection status, 
 * pending buffered events, and active subscribers.
 */
export type StreamEntry = {
  key: string;
  symbol: string;
  timeframe: Timeframe;
  requestId: number;
  streamKey: ReturnType<typeof createCandleStreamKey>;
  /** Authoritative closed candles from REST. */
  historyCandles: Candle[];
  /** Mutable map of real-time forming candles, keyed by bucket start time. */
  liveCandleMap: Map<number, MutableCandle>;
  /** Timestamp of the last fully closed historical candle. */
  historyLastTime: number | null;
  /**
   * The `historyLastTime` value for which we last fired a live-edge-gap history
   * refresh. Guards against re-fetching in a loop: we refresh at most once per
   * distinct history boundary, so a stale-seeded chart self-heals with one
   * fetch while a genuinely data-less span (illiquid no-trade minutes) is not
   * retried until a newer bar actually closes.
   */
  lastLiveEdgeGapRefreshBoundary: number | null;
  /**
   * Optional pagination boundary for the next older-history request.
   * It advances even when a requested page is empty so M1 weekend/session gaps
   * cannot make the frontend request the same empty window forever.
   */
  historyPaginationCursorTime: number | null;
  /**
   * Number of candles the UI stream is allowed to materialize.
   * Starts from the first-paint viewport window and grows only when
   * left-scroll pagination proves the user needs older history.
   */
  renderHistoryLimit: number;
  /** The finalized, merged, and sorted array of candles exposed to the UI. */
  candles: CandleParams[];
  /** Subscribed UI components. */
  listeners: Set<StreamListener>;
  /** Number of active UI components demanding this stream. */
  consumers: number;
  /** True only while the chart has no usable history and its cold load is pending. */
  loading: boolean;
  /** True only for a blocking cold REST history fetch. Warm refreshes use abortController instead. */
  historyLoading: boolean;
  /** True when a left-scroll older-history page fetch is in progress. */
  historyPageLoading: boolean;
  error: string | null;
  isLiveConnected: boolean;
  lastUpdateTime: number | null;
  abortController: AbortController | null;
  /** Bounded watchdog for the request currently owned by abortController. */
  historyRequestTimeoutTimer: ReturnType<typeof setTimeout> | null;
  /** Events waiting to be flushed into the liveCandleMap on the next tick. */
  bufferedEvents: BufferedLiveEvent[];
  pendingEvents: BufferedLiveEvent[];
  flushFrame: number | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  eventOrder: number;
  /**
   * Pending bounded auto-retry timer for a failed INITIAL (non-paginated)
   * history load. Cleared on a fresh load, on success, and on entry disposal so
   * a stale retry can never fire against a superseded or recreated entry.
   */
  historyRetryTimer: ReturnType<typeof setTimeout> | null;
  /** Auto-retries already attempted for the current failed initial history load. */
  historyRetryAttempt: number;
  /**
   * True when this entry's history was restored from a local cache (memory or
   * persisted) instead of a fresh REST load. Warm revisits use it to skip the
   * loading overlay while the retained WebView repaints.
   */
  seededFromCache: boolean;
};

export type CandleHistorySnapshot = Awaited<ReturnType<typeof getCandleHistory>>;

export type HistorySeedSnapshot = {
  candles: Candle[];
  closedHistoryLastTime: number | null;
  currentCandleTime: number | null;
};

/** Default max number of candles to keep in memory per stream to prevent leaks. */
export const DEFAULT_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH;
/**
 * First-paint history window. The initial REST fetch pulls only enough recent
 * bars to fill the visible mobile viewport plus a small live-edge buffer
 * instead of the full DEFAULT_HISTORY_LIMIT. Older bars are lazy-loaded on
 * left-scroll via PAGINATED_HISTORY_LIMIT, and the retained/rendered caps below
 * are unchanged so deep history still works after the user scrolls for it.
 */
export const INITIAL_VIEWPORT_HISTORY_LIMIT = 120;
export const INITIAL_HISTORY_LIMIT = Math.min(INITIAL_VIEWPORT_HISTORY_LIMIT, MAX_CANDLE_SERIES_LENGTH);
/** Smaller left-scroll page size so older history can be prepended without a heavy full-window fetch. */
export const PAGINATED_HISTORY_LIMIT = Math.min(500, MAX_CANDLE_SERIES_LENGTH);
/**
 * Deeper one-shot warm-up used only after backend status explicitly reports
 * `quote_open: false`. It finds the genuine pre-close bars even when a broker
 * incorrectly leaves many frozen rows at the newest edge.
 */
export const CLOSED_MARKET_HISTORY_WARM_LIMIT = PAGINATED_HISTORY_LIMIT;
/** Hard cap for lazily rendered history; high enough for deep M1 scroll, bounded for mobile WebView cost. */
export const MAX_RENDERED_HISTORY_CANDLES = Math.max(MAX_CANDLE_SERIES_LENGTH, 10_000);
/** Retained normalized REST history cap; larger than render cap so repeated pagination can dedupe safely. */
export const MAX_RETAINED_HISTORY_CANDLES = Math.max(MAX_RENDERED_HISTORY_CANDLES, MAX_CANDLE_SERIES_LENGTH * 8);
/** Max buffer size before we forcefully drop ticks to save memory. */
export const MAX_BUFFERED_LIVE_EVENTS = 4096;
// Keep the forming candle as fast as the Quotes bid/ask UI. The stream still
// batches bursty ticks, but one frame (~16ms) is the longest we should wait
// before painting the latest active-candle price.
export const FLUSH_INTERVAL_MS = 16;

export const EMPTY_CANDLES: readonly CandleParams[] = Object.freeze([]) as readonly CandleParams[];

export type { CandleStreamState };

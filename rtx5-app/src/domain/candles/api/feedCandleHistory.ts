import { timedFetch } from '../../../utils/apiLatency';
import { normalizeSymbol } from '../core/candles';

/**
 * Live-feed candle history: `GET {service root}/api/v1/candles?symbol&tf&limit`.
 *
 * The broker's feed service keeps the most recent bars (about a day) for every
 * quoted symbol, stays current to the live minute, and needs no auth. The web
 * terminal (Broker-Terminal-UI `fetchCandlesFromNetwork`) falls back to it when
 * the v2 history request fails or returns no bars, which is why a symbol can
 * show history there while the app's v2-only request shows none. The app uses
 * it the same way: only for an initial (unpaginated) load, and only after the
 * v2 history request failed or was empty.
 */
const FEED_CANDLE_TIMEFRAMES = Object.freeze({
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
} as const);

/** The feed service caps one read at 500 bars. */
export const FEED_CANDLE_HISTORY_LIMIT = 500;
const FEED_CANDLE_HISTORY_TIMEOUT_MS = 10_000;

/** W1/MN (and anything else) have no feed equivalent. */
export const resolveFeedCandleTimeframe = (timeframe: string): string | null =>
  FEED_CANDLE_TIMEFRAMES[timeframe as keyof typeof FEED_CANDLE_TIMEFRAMES] ?? null;

export const buildFeedCandleHistoryUrl = (
  serviceRoot: string,
  symbol: string,
  timeframe: string,
  limit: number,
): string => {
  const root = String(serviceRoot ?? '').trim().replace(/\/+$/, '');
  const tf = resolveFeedCandleTimeframe(timeframe);
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!root || !tf || !normalizedSymbol) {
    return '';
  }
  const safeLimit = Math.min(
    FEED_CANDLE_HISTORY_LIMIT,
    Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : FEED_CANDLE_HISTORY_LIMIT),
  );
  const params = new URLSearchParams({
    symbol: normalizedSymbol,
    tf,
    limit: String(safeLimit),
  });
  return `${root}/api/v1/candles?${params.toString()}`;
};

/**
 * Reads the raw feed candle rows for one exact symbol/timeframe. Returns []
 * when the timeframe has no feed equivalent; throws on HTTP failure, a
 * malformed body, or an envelope for a different selection.
 */
export const fetchFeedCandleRows = async (
  serviceRoot: string,
  symbol: string,
  timeframe: string,
  limit: number,
  signal?: AbortSignal,
): Promise<unknown[]> => {
  const url = buildFeedCandleHistoryUrl(serviceRoot, symbol, timeframe, limit);
  if (!url) {
    return [];
  }

  const response = await timedFetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
  }, {
    label: 'candles.feedHistory',
    method: 'GET',
    endpoint: '/api/v1/candles',
    source: 'candles',
    timeoutMs: FEED_CANDLE_HISTORY_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(`live-feed history HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!record || !Array.isArray(record.candles)) {
    throw new Error('live-feed history returned an invalid response');
  }
  const expectedTf = resolveFeedCandleTimeframe(timeframe);
  if (
    (typeof record.symbol === 'string' && normalizeSymbol(record.symbol) !== normalizeSymbol(symbol))
    || (typeof record.tf === 'string' && record.tf !== expectedTf)
  ) {
    throw new Error('live-feed history returned data for a different market selection');
  }
  return record.candles;
};

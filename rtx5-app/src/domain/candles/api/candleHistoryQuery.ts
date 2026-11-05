import {
  normalizeTimestampToSeconds,
  toRestCandleTf,
} from '../core/candles';
import { asRecord } from '../core/candleUtils';

/** Options for paginating historical candle requests. */
export type CandleHistoryRequestOptions = {
  signal?: AbortSignal;
  /** Immutable active-session namespace captured by the caller/query key. */
  cacheNamespace?: string;
  /** Unix timestamp in seconds. JavaScript milliseconds are accepted and normalized at the service boundary. */
  from?: number;
  /** Unix timestamp in seconds. JavaScript milliseconds are accepted and normalized at the service boundary. */
  to?: number;
};

export type CandleHistoryQueryStyle = 'timeframeLimit' | 'tfCount';

export type CandleHistoryRouteContract = Readonly<{
  pathPrefix: string;
  queryStyle: CandleHistoryQueryStyle;
}>;

/**
 * Release-configured candle-history contract.
 *
 * IMPORTANT (Expo / Metro production): `EXPO_PUBLIC_*` values are only inlined
 * when accessed as *static* property reads (`process.env.EXPO_PUBLIC_FOO`).
 * Passing the whole `process.env` object and reading `env.EXPO_PUBLIC_FOO`
 * yields `undefined` on device, so chart history fails closed after login in
 * OTA / release builds even when `.env` was correct at publish time.
 *
 * No path or query shape is selected by trial requests; absent/invalid
 * configuration still fails closed.
 */
const readCandleHistoryEnv = (
  env?: Readonly<Record<string, string | undefined>>,
): Readonly<{ path: string; queryStyle: string }> => {
  // Prefer an explicit override (tests / diagnostics). Fall back to static
  // process.env reads so Metro can replace them with string literals in OTA.
  const path =
    (env && typeof env.EXPO_PUBLIC_CANDLE_HISTORY_PATH === 'string'
      ? env.EXPO_PUBLIC_CANDLE_HISTORY_PATH
      : process.env.EXPO_PUBLIC_CANDLE_HISTORY_PATH) ?? '';
  const queryStyle =
    (env && typeof env.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE === 'string'
      ? env.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE
      : process.env.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE) ?? '';
  return { path, queryStyle };
};

export const resolveCandleHistoryRouteContract = (
  env?: Readonly<Record<string, string | undefined>>,
): CandleHistoryRouteContract | null => {
  const configured = readCandleHistoryEnv(env);
  const pathPrefix = String(configured.path)
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const queryStyle = String(configured.queryStyle).trim();
  if (
    !pathPrefix ||
    pathPrefix.includes('..') ||
    pathPrefix.includes('//') ||
    !/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(pathPrefix) ||
    (queryStyle !== 'timeframeLimit' && queryStyle !== 'tfCount')
  ) {
    return null;
  }
  return Object.freeze({ pathPrefix, queryStyle });
};

/** The normalized shape extracted from various possible backend JSON responses. */
export type ExtractedCandleHistoryPayload = {
  candles: unknown[];
  symbol?: string;
  timeframe?: string;
  priceBasis?: string;
};

const pickFirstArray = (...candidates: unknown[]): unknown[] => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

/**
 * Highly permissive extractor that searches through a JSON payload to find
 * the array of candles. Deals with various backend nesting formats like
 * `{ data: { candles: [...] } }`, `{ result: [...] }`, etc.
 */
export const extractCandleHistoryPayload = (payload: unknown): ExtractedCandleHistoryPayload => {
  if (Array.isArray(payload)) {
    return { candles: payload };
  }

  const record = asRecord(payload);
  if (!record) {
    return { candles: [] };
  }

  const nestedData = asRecord(record.data);
  const nestedResult = asRecord(record.result);
  const nestedPayload = asRecord(record.payload);

  return {
    candles: pickFirstArray(
      record.candles,
      record.data,
      record.items,
      record.results,
      record.result,
      record.payload,
      record.bars,
      nestedData?.candles,
      nestedData?.items,
      nestedData?.results,
      nestedData?.bars,
      nestedResult?.candles,
      nestedResult?.items,
      nestedPayload?.candles,
      nestedPayload?.items,
    ),
    symbol:
      (typeof record.symbol === 'string' ? record.symbol : undefined) ??
      (typeof nestedData?.symbol === 'string' ? nestedData.symbol : undefined) ??
      (typeof nestedResult?.symbol === 'string' ? nestedResult.symbol : undefined),
    timeframe:
      (typeof record.timeframe === 'string' ? record.timeframe : undefined) ??
      (typeof record.tf === 'string' ? record.tf : undefined) ??
      (typeof nestedData?.timeframe === 'string' ? nestedData.timeframe : undefined) ??
      (typeof nestedData?.tf === 'string' ? nestedData.tf : undefined) ??
      (typeof nestedResult?.timeframe === 'string' ? nestedResult.timeframe : undefined) ??
      (typeof nestedResult?.tf === 'string' ? nestedResult.tf : undefined),
    priceBasis:
      (typeof record.priceBasis === 'string' ? record.priceBasis : undefined) ??
      (typeof record.price_basis === 'string' ? record.price_basis : undefined) ??
      (typeof nestedData?.priceBasis === 'string' ? nestedData.priceBasis : undefined) ??
      (typeof nestedData?.price_basis === 'string' ? nestedData.price_basis : undefined) ??
      (typeof nestedResult?.priceBasis === 'string' ? nestedResult.priceBasis : undefined) ??
      (typeof nestedResult?.price_basis === 'string' ? nestedResult.price_basis : undefined),
  };
};

const normalizeBoundedUnixSeconds = (value: number): string | null => {
  const normalized = normalizeTimestampToSeconds(value);
  return normalized === null ? null : String(Math.max(1, normalized));
};

/**
 * Builds the URL query parameters for fetching historical candles.
 *
 * The candle backend contract uses Unix timestamps in seconds for both
 * response candle times and pagination bounds. Keeping request bounds in the
 * same unit is important for left-scroll history: sending milliseconds turns a
 * valid 2026 cursor into a far-future year and the backend returns an empty
 * page.
 */
export const buildCandleHistorySearchParams = (
  timeframe: string,
  count: number,
  options?: CandleHistoryRequestOptions,
  style: CandleHistoryQueryStyle = 'timeframeLimit',
): URLSearchParams => {
  const params = new URLSearchParams();
  const requestTimeframe = timeframe.trim();
  const normalizedRequestTimeframe =
    toRestCandleTf(requestTimeframe) ?? requestTimeframe.toUpperCase();
  if (style === 'tfCount') {
    params.set('tf', normalizedRequestTimeframe);
    params.set('count', String(count));
  } else {
    params.set('timeframe', normalizedRequestTimeframe);
    params.set('limit', String(count));
  }

  if (typeof options?.from === 'number' && Number.isFinite(options.from) && options.from > 0) {
    const normalizedFrom = normalizeBoundedUnixSeconds(options.from);
    if (normalizedFrom !== null) {
      params.set('from', normalizedFrom);
    }
  }

  if (typeof options?.to === 'number' && Number.isFinite(options.to) && options.to > 0) {
    const normalizedTo = normalizeBoundedUnixSeconds(options.to);
    if (normalizedTo !== null) {
      params.set('to', normalizedTo);
    }
  }

  return params;
};

export const getCandleHistoryRequestTimeframes = (timeframe: string): string[] => {
  const normalizedTimeframe = toRestCandleTf(timeframe);
  return normalizedTimeframe ? [normalizedTimeframe] : [];
};

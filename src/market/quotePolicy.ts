export const MARKET_QUOTE_STALE_AFTER_MS = 15_000;

export const RTX_MARKET_DATA_SOURCES = new Set([
  'rtx_market_data',
  'rtxmd',
  'cserver',
  'equinix',
  't4b',
]);

export type QuoteFreshnessInput = {
  timeMs?: number | null;
  stale?: boolean;
};

export const isMarketQuoteStale = (
  quote: QuoteFreshnessInput | null | undefined,
  now = Date.now(),
): boolean => {
  if (!quote || quote.stale === true) {
    return true;
  }
  const timeMs = Number(quote.timeMs);
  return !Number.isFinite(timeMs) || timeMs <= 0 || now - timeMs > MARKET_QUOTE_STALE_AFTER_MS;
};

export const isRecognizedMarketDataSource = (source?: string | null): boolean =>
  RTX_MARKET_DATA_SOURCES.has(String(source ?? '').trim().toLowerCase());

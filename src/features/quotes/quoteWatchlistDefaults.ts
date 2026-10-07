import { normalizeQuoteTransportSymbol } from '../../api/ws/quoteSubscriptionState';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';

export const DEFAULT_QUOTE_WATCHLIST = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'BTCUSD',
] as const;

// Some brokers expose duplicate instruments under both canonical and stale
// casings (e.g. "BTCUSD" alongside a leftover lowercase "btcusd" that delivers
// no ticks). When that happens, prefer the canonical form — the entry whose
// raw symbol already matches its normalized key — so subscriptions land on
// the instrument that actually streams prices.
const preferCanonical = (
  existing: string | undefined,
  candidate: string,
  key: string,
): string => {
  if (!existing) return candidate;
  if (existing === key) return existing;
  if (candidate === key) return candidate;
  // Both are non-canonical; keep the first-seen entry.
  return existing;
};

const buildAvailableSymbolLookup = (availableSymbols: readonly string[]): Map<string, string> => {
  const byNormalized = new Map<string, string>();

  for (const symbol of availableSymbols) {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) continue;
    byNormalized.set(normalized, preferCanonical(byNormalized.get(normalized), symbol, normalized));
  }

  return byNormalized;
};

const buildAvailableSymbolKeyLookup = (availableSymbols: readonly string[]): Map<string, string> => {
  const byKey = new Map<string, string>();

  for (const symbol of availableSymbols) {
    const key = normalizeQuoteSymbolKey(symbol);
    if (!key) continue;
    byKey.set(key, preferCanonical(byKey.get(key), symbol, key));
  }

  return byKey;
};

export const isMarketSymbolCatalogScopedToWatchlist = (
  availableSymbols: readonly string[] = [],
  watchlistSymbols: readonly string[] = [],
): boolean => {
  if (availableSymbols.length === 0 || watchlistSymbols.length === 0) {
    return false;
  }

  const watchlistKeys = new Set(
    watchlistSymbols
      .map((symbol) => normalizeQuoteSymbolKey(symbol))
      .filter(Boolean),
  );
  if (watchlistKeys.size === 0) {
    return false;
  }

  const availableKeys = Array.from(new Set(
    availableSymbols
      .map((symbol) => normalizeQuoteSymbolKey(symbol))
      .filter(Boolean),
  ));
  if (availableKeys.length === 0 || availableKeys.length > watchlistKeys.size) {
    return false;
  }

  return availableKeys.every((key) => watchlistKeys.has(key));
};

export const resolveQuoteFeedSymbols = (
  requestedSymbols: readonly string[],
  availableSymbols: readonly string[] = [],
): string[] => {
  if (availableSymbols.length === 0) {
    return requestedSymbols.map(normalizeQuoteTransportSymbol).filter(Boolean);
  }

  const availableByKey = buildAvailableSymbolKeyLookup(availableSymbols);
  const availableByNormalized = buildAvailableSymbolLookup(availableSymbols);
  return requestedSymbols.map((symbol) => {
    const exact = availableByKey.get(normalizeQuoteSymbolKey(symbol));
    if (exact) {
      return exact;
    }
    const normalized = normalizeSymbol(symbol);
    return (normalized && availableByNormalized.get(normalized)) || symbol;
  });
};

export const buildDefaultQuoteWatchlist = (availableSymbols: string[]): string[] => {
  if (availableSymbols.length === 0) {
    return [...DEFAULT_QUOTE_WATCHLIST];
  }

  const defaults = resolveQuoteFeedSymbols([...DEFAULT_QUOTE_WATCHLIST], availableSymbols)
    .filter((symbol) => availableSymbols.includes(symbol));

  return defaults.length > 0 ? defaults : availableSymbols.slice(0, 5);
};

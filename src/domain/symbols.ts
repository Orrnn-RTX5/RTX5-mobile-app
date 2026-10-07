const EXPLICIT_SYMBOL_ALIASES: Record<string, string> = {
  BTCUSDM: 'BTCUSD',
  ETHUSDM: 'ETHUSD',
  XAUUSDM: 'XAUUSD',
  XAGUSDM: 'XAGUSD',
  MBTUSDM: 'MBTUSD',
};

const LEGACY_SUFFIX_BASES = new Set([
  'BTCUSD',
  'ETHUSD',
  'XAUUSD',
  'XAGUSD',
  'MBTUSD',
]);

const CRYPTO_BASE_ASSETS = new Set([
  'AAVE',
  'ADA',
  'ALGO',
  'APT',
  'ARB',
  'ATOM',
  'AVAX',
  'BCH',
  'BNB',
  'BTC',
  'DOGE',
  'DOT',
  'ETH',
  'FIL',
  'GRT',
  'ICP',
  'IMX',
  'INJ',
  'LDO',
  'LINK',
  'LTC',
  'MATIC',
  'MKR',
  'NEAR',
  'OP',
  'RNDR',
  'RUNE',
  'SNX',
  'SOL',
  'STX',
  'TAO',
  'UNI',
  'XLM',
  'XRP',
]);

const CRYPTO_QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'BTC', 'ETH'] as const;

const KNOWN_BASE_SYMBOLS = new Set([
  'US30', 'SPX500', 'NAS100', 'GER40', 'UK100', 'FRA40', 'JP225',
  'USOIL', 'UKOIL', 'NGAS',
]);

const BROKER_SUFFIXES_RE = /(?:PRO|ECN|STD|STP|RAW|ZERO|CENT|MICRO|MINI|NANO|FIX|VAR|SWAP|NDD|PRIME|CLASSIC|STANDARD|M|C|E|X|S|R|B|F|K)$/;

export const normalizeQuoteSymbolKey = (symbol: string): string =>
  symbol.trim().toUpperCase().replace(/[\/\s]+/g, '');

// normalizeSymbol is the canonical identity key used by quote, cache, and order
// paths. Broker suffixes are part of that identity: EURUSD, EURUSD.pro, and
// EURUSDm must never share state. The set of distinct raw symbols is tiny and
// bounded, so memoizing on the raw input string keeps this safe on hot paths.
const NORMALIZE_SYMBOL_CACHE = new Map<string, string>();
const NORMALIZE_SYMBOL_CACHE_LIMIT = 1024;

export const normalizeSymbol = (symbol: string): string => {
  const cached = NORMALIZE_SYMBOL_CACHE.get(symbol);
  if (cached !== undefined) {
    return cached;
  }

  const result = normalizeQuoteSymbolKey(symbol);
  // Bounded guard: symbols are a small fixed universe, but never let an
  // unexpected flood of inputs grow the cache without limit.
  if (NORMALIZE_SYMBOL_CACHE.size >= NORMALIZE_SYMBOL_CACHE_LIMIT) {
    NORMALIZE_SYMBOL_CACHE.clear();
  }
  NORMALIZE_SYMBOL_CACHE.set(symbol, result);
  return result;
};

export const isCryptoSymbol = (symbol: string): boolean => {
  // Family normalization is deliberately display/classification-only. It must
  // not leak into quote/cache/order identity, where broker suffixes are exact.
  const normalized = computeSymbolFamily(symbol);
  if (!normalized) {
    return false;
  }

  for (const quote of CRYPTO_QUOTE_ASSETS) {
    if (!normalized.endsWith(quote) || normalized.length <= quote.length) {
      continue;
    }
    const base = normalized.slice(0, -quote.length);
    if (CRYPTO_BASE_ASSETS.has(base)) {
      return true;
    }
  }

  return false;
};

const computeSymbolFamily = (symbol: string): string => {
  const normalized = normalizeQuoteSymbolKey(symbol);
  if (!normalized) return '';

  const strippedTransportSuffix = normalized.replace(/[._-].*$/, '');

  if (EXPLICIT_SYMBOL_ALIASES[strippedTransportSuffix]) {
    return EXPLICIT_SYMBOL_ALIASES[strippedTransportSuffix];
  }

  if (strippedTransportSuffix.endsWith('M')) {
    const withoutSuffix = strippedTransportSuffix.slice(0, -1);
    if (LEGACY_SUFFIX_BASES.has(withoutSuffix)) {
      return withoutSuffix;
    }
  }

  if (KNOWN_BASE_SYMBOLS.has(strippedTransportSuffix)) {
    return strippedTransportSuffix;
  }

  if (strippedTransportSuffix.length === 6) {
    return strippedTransportSuffix;
  }

  if (strippedTransportSuffix.length > 6) {
    const strippedBrokerSuffix = strippedTransportSuffix.replace(BROKER_SUFFIXES_RE, '');
    if (strippedBrokerSuffix.length >= 5 && strippedBrokerSuffix.length <= 6) {
      return strippedBrokerSuffix;
    }
    return strippedTransportSuffix.slice(0, 6);
  }

  return strippedTransportSuffix;
};

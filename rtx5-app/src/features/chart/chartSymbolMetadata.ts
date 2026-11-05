import { isCryptoSymbol } from '../../domain/symbols';

const normalizeChartSymbolKey = (symbol: string): string => {
  const compact = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const withoutNamedSuffix = compact.replace(/(?:MICRO|PRO|RAW|STD|STP|CENT|ECN)$/i, '');
  if (withoutNamedSuffix.length > 6 && /^[A-Z]{6}[A-Z]$/.test(withoutNamedSuffix)) {
    const suffix = withoutNamedSuffix.slice(-1);
    if (suffix === 'C' || suffix === 'E' || suffix === 'M') {
      return withoutNamedSuffix.slice(0, -1);
    }
  }
  return withoutNamedSuffix;
};

const CURRENCY_NAMES: Record<string, string> = {
  AUD: 'Australian Dollar',
  BRL: 'Brazilian Real',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNH: 'Chinese Yuan',
  CZK: 'Czech Koruna',
  DKK: 'Danish Krone',
  EUR: 'Euro',
  GBP: 'British Pound',
  HKD: 'Hong Kong Dollar',
  HUF: 'Hungarian Forint',
  ILS: 'Israeli Shekel',
  INR: 'Indian Rupee',
  JPY: 'Japanese Yen',
  MXN: 'Mexican Peso',
  NOK: 'Norwegian Krone',
  NZD: 'New Zealand Dollar',
  PLN: 'Polish Zloty',
  RUB: 'Russian Ruble',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  TRY: 'Turkish Lira',
  USD: 'US Dollar',
  ZAR: 'South African Rand',
};

// Every currency the app can pair, so exotic FX (USDZAR, USDSEK, …) is
// recognised as FOREX and gets a readable subtitle. Kept in sync with the
// Quotes-screen classifier (QuotesScreen.tsx FX_CODES).
const FX_CODES = new Set(Object.keys(CURRENCY_NAMES));

// Precious metals keyed by their 3-letter base, plus long-form aliases some
// brokers use. Matched regardless of the quote currency (XAUUSD, XAUEUR, …).
const METAL_NAMES: Record<string, string> = {
  XAU: 'Gold',
  XAG: 'Silver',
  XPD: 'Palladium',
  XPT: 'Platinum',
};

const METAL_ALIASES: Record<string, string> = {
  GOLD: 'Gold',
  SILVER: 'Silver',
  PALLADIUM: 'Palladium',
  PLATINUM: 'Platinum',
};

// Energy CFDs (oil, gas). Checked before the generic index/commodity buckets.
const ENERGY_KEY_RE = /(?:USOIL|UKOIL|BRENT|WTI|NATGAS|NGAS|OIL|GAS)/;

// Soft/agricultural and industrial-metal commodity CFDs.
const COMMODITY_KEY_RE = /(?:COPPER|COFFEE|COCOA|WHEAT|CORN|SUGAR|COTTON|SOYBEAN)/;

// Cash-index CFDs whose ticker carries no digit (rare; the digit test below
// already catches SPX500 / US30 / NAS100 / GER40 / JPN225 / …).
const INDEX_KEY_RE = /(?:INDEX|IDX|DAX|DOW|NASDAQ|NIKKEI|FTSE|CAC|ASX|HANGSENG)/;

// Extended display names for instruments that arrive from the broker catalog
// but are not part of the built-in fallback pairs (SYMBOL_NAMES). Kept separate
// so DEFAULT_CHART_SYMBOLS stays limited to the known FX/metal/crypto pairs.
const EXTENDED_SYMBOL_NAMES: Record<string, string> = {
  // Indices
  SPX500: 'S&P 500 Index',
  US30: 'Dow Jones 30 Index',
  NAS100: 'Nasdaq 100 Index',
  UK100: 'FTSE 100 Index',
  GER40: 'DAX 40 Index',
  FRA40: 'CAC 40 Index',
  JPN225: 'Nikkei 225 Index',
  JP225: 'Nikkei 225 Index',
  AUS200: 'ASX 200 Index',
  HK50: 'Hang Seng Index',
  // Energies
  USOIL: 'US Crude Oil (WTI)',
  UKOIL: 'UK Crude Oil (Brent)',
  NATGAS: 'Natural Gas',
  NGAS: 'Natural Gas',
  // Commodities
  COPPER: 'Copper',
};

const resolveMetalName = (key: string): string | null => {
  const metalCode = key.slice(0, 3);
  if (METAL_NAMES[metalCode]) {
    return METAL_NAMES[metalCode];
  }
  const alias = Object.keys(METAL_ALIASES).find((name) => key.startsWith(name));
  return alias ? METAL_ALIASES[alias] : null;
};

const isForexPairKey = (key: string): boolean =>
  /^[A-Z]{6}$/.test(key) && FX_CODES.has(key.slice(0, 3)) && FX_CODES.has(key.slice(3));

export const SYMBOL_FLAGS: Record<string, [string, string]> = {
  EURUSD: ['eu', 'us'],
  GBPUSD: ['gb', 'us'],
  AUDUSD: ['au', 'us'],
  USDJPY: ['us', 'jp'],
  NZDUSD: ['nz', 'us'],
  USDCAD: ['us', 'ca'],
  EURGBP: ['eu', 'gb'],
  AUDCAD: ['au', 'ca'],
  AUDCHF: ['au', 'ch'],
  AUDJPY: ['au', 'jp'],
};

export const SYMBOL_LOGOS: Record<string, string> = {
  BTCUSD: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  XAUUSD: 'https://assets.coingecko.com/coins/images/10481/small/tether-gold.png',
};

export const SYMBOL_NAMES: Record<string, string> = {
  AUDCAD: 'Australian Dollar / Canadian Dollar',
  AUDCHF: 'Australian Dollar / Swiss Franc',
  AUDJPY: 'Australian Dollar / Japanese Yen',
  AUDUSD: 'Australian Dollar / US Dollar',
  BTCUSD: 'Bitcoin / US Dollar',
  ETHUSD: 'Ethereum / US Dollar',
  EURGBP: 'Euro / British Pound',
  EURJPY: 'Euro / Japanese Yen',
  EURUSD: 'Euro / US Dollar',
  GBPJPY: 'British Pound / Japanese Yen',
  GBPUSD: 'British Pound / US Dollar',
  NZDUSD: 'New Zealand Dollar / US Dollar',
  USDCAD: 'US Dollar / Canadian Dollar',
  USDCHF: 'US Dollar / Swiss Franc',
  USDJPY: 'US Dollar / Japanese Yen',
  XAGUSD: 'Silver / US Dollar',
  XAUUSD: 'Gold / US Dollar',
  XPDUSD: 'Palladium / US Dollar',
  XPTUSD: 'Platinum / US Dollar',
};

export const DEFAULT_CHART_SYMBOLS: readonly string[] = Object.freeze(Object.keys(SYMBOL_NAMES));

export const SYMBOL_CATEGORY: Record<string, string> = {
  BTCUSD: 'CRYPTO',
  ETHUSD: 'CRYPTO',
  XAGUSD: 'METAL',
  XAUUSD: 'METAL',
  XPDUSD: 'METAL',
  XPTUSD: 'METAL',
};

export const resolveChartSymbolKey = (symbol: string): string => normalizeChartSymbolKey(symbol);

export const resolveChartSymbolCategory = (symbol: string): string | null => {
  const key = normalizeChartSymbolKey(symbol);
  if (!key) {
    return null;
  }

  // Explicit overrides win (pins a symbol regardless of the heuristics below).
  const knownCategory = SYMBOL_CATEGORY[key];
  if (knownCategory) {
    return knownCategory;
  }

  // Order matters: FX and precious metals are matched before the broader
  // crypto/energy/commodity/index buckets so a 6-letter pair can never be
  // misread as something else.
  if (isForexPairKey(key)) {
    return 'FOREX';
  }

  if (resolveMetalName(key)) {
    return 'METAL';
  }

  if (isCryptoSymbol(key)) {
    return 'CRYPTO';
  }

  if (ENERGY_KEY_RE.test(key)) {
    return 'ENERGY';
  }

  if (COMMODITY_KEY_RE.test(key)) {
    return 'COMMODITY';
  }

  if (/\d/.test(key) || INDEX_KEY_RE.test(key)) {
    return 'INDEX';
  }

  return null;
};

export const resolveChartSymbolFullName = (symbol: string): string => {
  const key = normalizeChartSymbolKey(symbol);
  if (!key) {
    return symbol;
  }

  const knownName = SYMBOL_NAMES[key] ?? EXTENDED_SYMBOL_NAMES[key];
  if (knownName) {
    return knownName;
  }

  // Metals quoted in any currency (XAUUSD, XAUEUR, GOLD, …).
  const metalName = resolveMetalName(key);
  if (metalName) {
    const metalPrefix = METAL_NAMES[key.slice(0, 3)]
      ? key.slice(0, 3)
      : Object.keys(METAL_ALIASES).find((name) => key.startsWith(name)) ?? '';
    const quote = metalPrefix ? key.slice(metalPrefix.length) : '';
    return quote ? `${metalName} / ${CURRENCY_NAMES[quote] ?? quote}` : `${metalName} Spot`;
  }

  if (/^[A-Z]{6}$/.test(key)) {
    const base = key.slice(0, 3);
    const quote = key.slice(3);
    return `${CURRENCY_NAMES[base] ?? base} / ${CURRENCY_NAMES[quote] ?? quote}`;
  }

  return key;
};

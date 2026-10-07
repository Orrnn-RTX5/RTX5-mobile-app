/**
 * Chart-overlay symbol helpers. Normalize broker-specific suffixes to a
 * canonical base symbol and infer display precision / contract size / point
 * size from that base.
 */
import { normalizeSymbol } from '../../../domain/symbols.ts';

// Known base symbols that are NOT 6 characters (the standard XXXYYY forex
// format). Everything else is assumed to be 6-char forex (EURUSD, GBPUSD…).
const KNOWN_BASE_SYMBOLS = new Set([
  'US30', 'SPX500', 'NAS100', 'GER40', 'UK100', 'FRA40', 'JP225',
  'USOIL', 'UKOIL', 'NGAS',
]);
const KNOWN_BASE_SYMBOLS_BY_LENGTH = [...KNOWN_BASE_SYMBOLS]
  .sort((left, right) => right.length - left.length);

// Common MT5 broker suffixes that get concatenated without a separator.
// e.g. GBPUSDpro, EURUSDecn, XAUUSDmicro, BTCUSDstd
const BROKER_SUFFIXES_RE = /(?:PRO|ECN|STD|STP|RAW|ZERO|CENT|MICRO|MINI|NANO|FIX|VAR|SWAP|NDD|PRIME|CLASSIC|STANDARD|M|C|E|X|S|R|B|F|K)$/;
const BROKER_SUFFIX_ONLY_RE = /^(?:PRO|ECN|STD|STP|RAW|ZERO|CENT|MICRO|MINI|NANO|FIX|VAR|SWAP|NDD|PRIME|CLASSIC|STANDARD|M|C|E|X|S|R|B|F|K)$/;

export const normalizeChartOverlaySymbol = (symbol: string): string => {
  const normalized = normalizeSymbol(symbol ?? '');
  // Step 1: strip everything after a separator (., _, -)
  const strippedTransportSuffix = normalized.replace(/[._-].*$/, '');
  const upper = strippedTransportSuffix.toUpperCase();

  // Step 2: if already a known non-6-char base symbol, return it
  if (KNOWN_BASE_SYMBOLS.has(upper)) return upper;

  // Indices and commodities can be shorter than a forex pair, so remove a
  // broker suffix from their complete known base before applying the generic
  // six-character rule. For example: US30m -> US30, GER40m -> GER40, and
  // USOILm -> USOIL. Requiring the entire remainder to be a known suffix keeps
  // genuine symbols that merely start with the same letters distinct.
  const knownSuffixedBase = KNOWN_BASE_SYMBOLS_BY_LENGTH.find((base) => (
    upper.startsWith(base)
    && upper.length > base.length
    && BROKER_SUFFIX_ONLY_RE.test(upper.slice(base.length))
  ));
  if (knownSuffixedBase) return knownSuffixedBase;

  // Step 3: for 6-char symbols (standard forex pair), return as-is
  if (upper.length === 6) return upper;

  // Step 4: for longer symbols, strip known broker suffixes
  // e.g. GBPUSDPRO → GBPUSD, XAUUSDMICRO → XAUUSD, BTCUSDM → BTCUSD
  if (upper.length > 6) {
    const stripped = upper.replace(BROKER_SUFFIXES_RE, '');
    // Only accept the stripping if we end up with a reasonable base (≥5 chars)
    if (stripped.length >= 5 && stripped.length <= 6) return stripped;
    // Fallback: take the first 6 characters (covers GBPUSDPRO → GBPUSD etc.)
    return upper.slice(0, 6);
  }

  // Step 5: shorter symbols (US30, NGAS, etc.) — return as-is
  return upper;
};

export const resolveDisplayPrecision = (symbol: string): number => {
  const normalized = normalizeChartOverlaySymbol(symbol);
  if (normalized.includes('JPY')) return 3;
  if (normalized.includes('XAU') || normalized.includes('XAG')) return 2;
  if (normalized.includes('BTC') || normalized.includes('ETH')) return 2;
  return 5;
};

export const inferContractSize = (symbol: string): number => {
  const normalized = normalizeChartOverlaySymbol(symbol);
  if (normalized.includes('XAU') || normalized.includes('XAG')) return 100;
  if (normalized.includes('BTC') || normalized.includes('ETH')) return 1;
  if (
    normalized.includes('US30') ||
    normalized.includes('SPX') ||
    normalized.includes('NAS') ||
    normalized.includes('GER') ||
    normalized.includes('UK')
  ) {
    return 10;
  }
  if (normalized.includes('JPY')) return 1000;
  return 100000;
};

export const resolvePointSize = (symbol: string): number => {
  const precision = resolveDisplayPrecision(symbol);
  if (!Number.isFinite(precision) || precision <= 0) return 1;
  return Math.pow(10, -precision);
};

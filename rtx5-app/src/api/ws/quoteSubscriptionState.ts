import { normalizeQuoteSymbolKey } from '../../domain/symbols';

export const normalizeQuoteTransportSymbol = (symbol: string): string => {
  const compact = symbol.trim().replace(/[\/\s]+/g, '');
  if (!compact) {
    return '';
  }

  // Uppercase the instrument stem while preserving broker-authoritative suffix
  // spelling (for example `.c` or trailing `m`). Identity comparisons use the
  // canonical key elsewhere, but transport must send the broker's exact name.
  const separatorSuffixStart = compact.search(/[._-]/);
  const lowercaseSuffixStart = compact.search(/[a-z]/);
  const suffixStart = separatorSuffixStart > 0
    ? separatorSuffixStart
    : lowercaseSuffixStart > 0
      ? lowercaseSuffixStart
      : -1;
  if (suffixStart > 0) {
    return `${normalizeQuoteSymbolKey(compact.slice(0, suffixStart))}${compact.slice(suffixStart)}`;
  }

  return normalizeQuoteSymbolKey(compact);
};

export const resolveQuoteTransportSymbols = (symbol: string): string[] => {
  const transportSymbol = normalizeQuoteTransportSymbol(symbol);
  if (!transportSymbol) {
    return [];
  }

  // A base symbol is a different broker instrument, not a fallback transport
  // alias. Subscribe only the exact requested identity.
  return [transportSymbol];
};

export const expandQuoteTransportSymbols = (symbols: string[]): string[] =>
  Array.from(new Set(symbols.flatMap(resolveQuoteTransportSymbols)));

export const applyQuoteSubscriptionDelta = (
  currentCounts: ReadonlyMap<string, number>,
  symbols: string[],
  delta: 1 | -1,
): Map<string, number> => {
  const nextCounts = new Map(currentCounts);

  for (const rawSymbol of symbols) {
    const symbol = normalizeQuoteTransportSymbol(rawSymbol);
    if (!symbol) {
      continue;
    }

    const current = nextCounts.get(symbol) ?? 0;
    const next = current + delta;

    if (next <= 0) {
      nextCounts.delete(symbol);
      continue;
    }

    nextCounts.set(symbol, next);
  }

  return nextCounts;
};

export const buildActiveQuoteSymbols = (
  stickySymbols: Iterable<string>,
  consumerCounts: ReadonlyMap<string, number>,
): string[] => {
  const merged = new Set<string>();

  for (const rawSymbol of stickySymbols) {
    const symbol = normalizeQuoteTransportSymbol(rawSymbol);
    if (symbol) {
      merged.add(symbol);
    }
  }

  consumerCounts.forEach((count, rawSymbol) => {
    const symbol = normalizeQuoteTransportSymbol(rawSymbol);
    if (count > 0 && symbol) {
      merged.add(symbol);
    }
  });

  return Array.from(merged);
};

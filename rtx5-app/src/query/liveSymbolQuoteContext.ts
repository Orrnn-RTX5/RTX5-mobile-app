import { normalizeSymbol } from '../domain/symbols';

type SymbolScopedQuote = {
  symbol?: string | null;
};

/**
 * React state is preserved for one render when a hook argument changes. Never
 * let that previous symbol snapshot escape under the newly requested symbol.
 */
export const resolveContextBoundLiveSymbolQuote = <T extends SymbolScopedQuote>(
  requestedSymbol: string,
  quote: T | undefined,
): T | undefined => {
  const requestedSymbolKey = normalizeSymbol(requestedSymbol);
  const quoteSymbolKey = normalizeSymbol(quote?.symbol ?? '');

  return requestedSymbolKey && quoteSymbolKey === requestedSymbolKey ? quote : undefined;
};

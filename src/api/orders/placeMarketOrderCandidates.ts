import { normalizeSymbol } from '../../domain/symbols';

export const getAcceptedSymbolCacheKey = (cacheNamespace: string, symbol: string) =>
  `${cacheNamespace}:${normalizeSymbol(symbol) || symbol.trim().toUpperCase()}`;

const pushUniqueSymbol = (candidates: string[], symbol: string | null | undefined) => {
  const clean = (symbol ?? '').trim();
  if (clean && !candidates.includes(clean)) {
    candidates.push(clean);
  }
};

export function buildMarketOrderSymbolCandidates({
  callerSymbol,
  acceptedSymbol,
  cachedCatalogSymbol,
}: {
  callerSymbol: string;
  acceptedSymbol?: string | null;
  cachedCatalogSymbol?: string | null;
}): string[] {
  const candidates: string[] = [];
  const exactSymbolKey = normalizeSymbol(callerSymbol);
  const pushExactIdentity = (symbol: string | null | undefined) => {
    if (normalizeSymbol(symbol ?? '') === exactSymbolKey) {
      pushUniqueSymbol(candidates, symbol);
    }
  };

  // Accepted/cache values may preserve broker-authoritative spelling, but they
  // are only safe candidates when they identify the exact requested instrument.
  // Never retry a guessed base symbol or a different suffix/alias.
  pushExactIdentity(acceptedSymbol);
  pushExactIdentity(callerSymbol);
  pushExactIdentity(cachedCatalogSymbol);

  return candidates;
}

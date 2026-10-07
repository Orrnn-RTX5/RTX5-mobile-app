/**
 * Broker symbol resolver.
 *
 * The trading endpoint (POST /orders) keys live market data on the EXACT
 * symbol the broker's instrument catalog uses — e.g. "XAUUSDm" or "EURUSD.pro".
 * Broker suffixes are instrument identity, so catalog lookup may correct only
 * equivalent spelling/casing. It must never substitute a base or alias symbol.
 */
import { apiJsonClient, commitApiJson } from '../apiClient';
import { StaleBrokerSessionError } from '../brokerApi';
import { normalizeSymbol } from '../../domain/symbols';
import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import { redactSensitiveString } from '../../utils/securityRedaction';

type InstrumentCacheEntry = Readonly<{
  symbols: readonly string[];
  cachedAt: number;
}>;

const instrumentCaches = new Map<string, InstrumentCacheEntry>();
const INSTRUMENT_CACHE_TTL_MS = 5 * 60 * 1000;

function getCurrentCacheEntry(cacheNamespace: string, now = Date.now()) {
  const capture = captureActiveBrokerSession();
  if (!capture || capture.session.cacheNamespace !== cacheNamespace) {
    throw new StaleBrokerSessionError();
  }
  const entry = instrumentCaches.get(cacheNamespace);
  return entry && now - entry.cachedAt < INSTRUMENT_CACHE_TTL_MS ? entry : null;
}

async function fetchInstrumentsCached(cacheNamespace: string): Promise<readonly string[]> {
  const now = Date.now();
  const currentEntry = getCurrentCacheEntry(cacheNamespace, now);
  if (currentEntry) return currentEntry.symbols;

  try {
    const result = await apiJsonClient<unknown>('/instruments');
    if (result.ok) {
      return commitApiJson(result, cacheNamespace, (data) => {
      const record = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;
      const list: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray(record?.instruments)
          ? record.instruments
          : [];
      const symbols = list
        .map((it) => (
          typeof it === 'string'
            ? it
            : it && typeof it === 'object' && !Array.isArray(it)
              ? (it as Record<string, unknown>).symbol
              : undefined
        ))
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
        const entry = Object.freeze({
          symbols: Object.freeze(Array.from(new Set(symbols))),
          cachedAt: Date.now(),
        });
        instrumentCaches.set(cacheNamespace, entry);
        return entry.symbols;
      });
    }
  } catch (err) {
    // Never turn an epoch mismatch into a symbol fallback for a new broker.
    getCurrentCacheEntry(cacheNamespace);
    // Expected when offline; the caller falls back to the raw symbol.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        '[RTX5 Order] instruments fetch failed:',
        redactSensitiveString(err instanceof Error ? err.message : String(err ?? 'Unknown error')),
      );
    }
  }
  return getCurrentCacheEntry(cacheNamespace)?.symbols ?? [];
}

function matchBrokerSymbolFromList(symbol: string, instruments: readonly string[]): string | null {
  const raw = (symbol ?? '').trim();
  if (!raw || instruments.length === 0) return null;
  if (instruments.includes(raw)) return raw;

  const targetBase = normalizeSymbol(raw);
  return instruments.find((inst) => normalizeSymbol(inst) === targetBase) ?? null;
}

/**
 * Synchronous lookup against the already-warmed instrument catalog.
 * The order path uses this to avoid putting GET /instruments in front of
 * every BUY/SELL tap when the cache is cold.
 */
export function resolveBrokerSymbolFromCache(
  symbol: string,
  cacheNamespace: string,
): string | null {
  const entry = getCurrentCacheEntry(cacheNamespace);
  return entry ? matchBrokerSymbolFromList(symbol, entry.symbols) : null;
}

/**
 * Resolve the caller's symbol to the exact string the backend recognises.
 * Priority:
 *   1. Exact match (already valid).
 *   2. The catalog spelling whose exact identity key equals the caller's key.
 *   3. Falls back to the caller's original symbol if the catalog is empty
 *      or the symbol isn't in it.
 */
export async function resolveBrokerSymbol(
  symbol: string,
  cacheNamespace: string,
): Promise<string> {
  const raw = (symbol ?? '').trim();
  if (!raw) return raw;
  const instruments = await fetchInstrumentsCached(cacheNamespace);
  const match = matchBrokerSymbolFromList(raw, instruments);
  if (match) {
    return match;
  }
  return raw;
}

export function resetBrokerSymbolResolverCache(): void {
  instrumentCaches.clear();
}

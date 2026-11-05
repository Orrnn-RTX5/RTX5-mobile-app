import { useQuery } from '@tanstack/react-query';
import { fetchInstrumentMeta, getCachedInstrumentMeta, InstrumentMetaDTO } from '../api/instruments';
import { normalizeSymbol } from '../domain/symbols';
import {
  getSessionQueryCacheNamespace,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const INSTRUMENT_META_QUERY_VERSION = 'instrument-meta-v4';

export function useInstrumentMeta(symbol: string, enabled = true) {
  const session = useActiveBrokerQuerySession();
  const normalizedSymbol = normalizeSymbol(symbol);
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const isEnabled = enabled && Boolean(session) && !!normalizedSymbol;

  return useQuery({
    queryKey: ['instrument', cacheNamespace, INSTRUMENT_META_QUERY_VERSION, normalizedSymbol],
    queryFn: () => fetchInstrumentMeta(symbol, cacheNamespace),
    enabled: isEnabled,
    placeholderData: () => getCachedInstrumentMeta(normalizedSymbol || symbol, cacheNamespace),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour, specs rarely change
    retry: 1, // Don't retry aggressively if backend doesn't support the endpoint yet
  });
}

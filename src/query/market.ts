/**
 * Core module: market.ts
 */

import { useQuery } from '@tanstack/react-query';
import { commitApiJson } from '../api/apiClient';
import { fetchInstrumentCatalogResponse, primeInstrumentMetaCacheFromCatalogPayload } from '../api/instruments';
import { extractMarketSymbols } from '../domain/marketSymbols';
import {
  getSessionQueryCacheNamespace,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';
import { useUserPreferences } from '../state/userPreferences';
import {
  getOrrnnDemoPublicMarketCatalog,
  isOrrnnDemoPublicMarketSelection,
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
} from '../api/orrnnDemoPublicMarket';

export function useMarketSymbols(enabled = true) {
  const session = useActiveBrokerQuerySession();
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const selectedBrokerId = useUserPreferences((state) => state.brokerId);
  const isPublicDemoMarket = isOrrnnDemoPublicMarketSelection({
    brokerId: selectedBrokerId,
    isLoggedIn,
  });
  const authenticatedCacheNamespace = getSessionQueryCacheNamespace(session);
  const cacheNamespace = isPublicDemoMarket
    ? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE
    : authenticatedCacheNamespace;
  const isEnabled = enabled && (isPublicDemoMarket || Boolean(session));

  return useQuery({
    queryKey: ['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'],
    queryFn: async () => {
      if (isPublicDemoMarket) {
        const catalog = await getOrrnnDemoPublicMarketCatalog();
        return catalog.symbols;
      }
      // Use the broker's full instrument catalog instead of the WS feed
      // status. The feed-status endpoint only reports currently subscribed
      // symbols (i.e. the user's existing watchlist), which made the Add
      // Asset picker show only symbols that were already added.
      const result = await fetchInstrumentCatalogResponse(authenticatedCacheNamespace);
      return commitApiJson(result, authenticatedCacheNamespace, (data) => {
        primeInstrumentMetaCacheFromCatalogPayload(data, authenticatedCacheNamespace);
        return extractMarketSymbols(data);
      });
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5,
  });
}

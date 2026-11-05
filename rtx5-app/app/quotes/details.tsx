import { router, useLocalSearchParams } from 'expo-router';
import { QuoteInfoLaunchShell } from '../../src/features/quotes/QuoteInfoLaunchShell';
import {
  beginQuoteInfoBackCover,
  scheduleQuoteInfoBackCoverRemoval,
} from '../../src/features/quotes/quoteInfoLaunchController';
import {
  SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY,
  loadSymbolDetailsScreenRoute,
} from '../../src/features/quotes/quotesRoutePreloads';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../src/utils/navigation';

export default function DetailsRoute() {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();
  const resolvedSymbol = symbol || 'EURUSD';

  return (
    <DeferredRouteModule
      cacheKey={SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY}
      load={loadSymbolDetailsScreenRoute}
      fallback={(
        <QuoteInfoLaunchShell
          active
          destination="properties"
          symbol={resolvedSymbol}
          backLatencyLabel="quoteInfo.route.properties.back"
          onBack={() => {
            const coverRevision = beginQuoteInfoBackCover('properties', resolvedSymbol);
            scheduleBackNavigationAfterVisualFrame(() => {
              safeRouterBack(router, '/(tabs)/quotes');
              scheduleQuoteInfoBackCoverRemoval(coverRevision);
            });
          }}
        />
      )}
    />
  );
}

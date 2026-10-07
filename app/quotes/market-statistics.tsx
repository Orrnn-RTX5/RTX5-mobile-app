import { router, useLocalSearchParams } from 'expo-router';
import { QuoteInfoLaunchShell } from '../../src/features/quotes/QuoteInfoLaunchShell';
import {
  beginQuoteInfoBackCover,
  scheduleQuoteInfoBackCoverRemoval,
} from '../../src/features/quotes/quoteInfoLaunchController';
import {
  MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY,
  loadMarketStatisticsScreenRoute,
} from '../../src/features/quotes/quotesRoutePreloads';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../src/utils/navigation';

export default function MarketStatisticsRoute() {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();
  const resolvedSymbol = symbol || 'EURUSD';

  return (
    <DeferredRouteModule
      cacheKey={MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY}
      load={loadMarketStatisticsScreenRoute}
      fallback={(
        <QuoteInfoLaunchShell
          active
          destination="market-statistics"
          symbol={resolvedSymbol}
          backLatencyLabel="quoteInfo.route.marketStatistics.back"
          onBack={() => {
            const coverRevision = beginQuoteInfoBackCover('market-statistics', resolvedSymbol);
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

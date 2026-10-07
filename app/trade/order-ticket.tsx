import { router, useLocalSearchParams } from 'expo-router';
import { OrderTicketLaunchShell } from '../../src/features/trade/OrderTicketLaunchShell';
import {
  getOrderTicketOriginHref,
  hideOrderTicketLaunch,
  resolveOrderTicketOrigin,
} from '../../src/features/trade/orderTicketLaunchController';
import {
  ORDER_TICKET_ROUTE_MODULE_CACHE_KEY,
  loadOrderTicketScreenRoute,
} from '../../src/features/trade/orderTicketScreenPreload';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { safeRouterBack } from '../../src/utils/navigation';

export default function OrderTicketRoute() {
  const { symbol, origin } = useLocalSearchParams<{ symbol?: string; origin?: string }>();
  const originHref = getOrderTicketOriginHref(resolveOrderTicketOrigin(origin));

  return (
    <DeferredRouteModule
      cacheKey={ORDER_TICKET_ROUTE_MODULE_CACHE_KEY}
      load={loadOrderTicketScreenRoute}
      fallback={(
        <OrderTicketLaunchShell
          symbol={symbol || 'EURUSD'}
          backLatencyLabel="orderTicket.route.preview.back"
          onBack={() => {
            hideOrderTicketLaunch();
            safeRouterBack(router, originHref);
          }}
        />
      )}
    />
  );
}

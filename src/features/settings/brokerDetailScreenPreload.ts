import type { ComponentType } from 'react';
import { preloadDeferredRouteModule } from '../../ui/components/DeferredRouteMount';

/** Shared module key used by both idle warm-up and the broker-detail route. */
export const BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY = 'settings/broker-detail';

export const loadBrokerDetailScreenRoute = () =>
  import('./BrokerDetailScreen').then((module) => module.BrokerDetailScreen as ComponentType);

/**
 * Starts loading the real broker login screen without blocking the current tap.
 * Repeated calls reuse DeferredRouteModule's cache, so this remains inexpensive.
 */
export function preloadBrokerDetailScreen() {
  return preloadDeferredRouteModule(
    BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY,
    loadBrokerDetailScreenRoute,
  );
}

import type { ComponentType } from 'react';
import { preloadDeferredRouteModule } from '../../../ui/components/DeferredRouteMount';

/** Shared module cache used by the Brokers route and every warm-up site. */
export const BROKERS_ROUTE_MODULE_CACHE_KEY = 'settings/brokers';

export const loadBrokersScreenRoute = () =>
  import('./BrokersScreen').then((module) => module.BrokersScreen as ComponentType);

export function preloadBrokersScreen(): Promise<ComponentType> {
  return preloadDeferredRouteModule(BROKERS_ROUTE_MODULE_CACHE_KEY, loadBrokersScreenRoute);
}

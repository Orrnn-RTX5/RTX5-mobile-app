import type { ComponentType } from 'react';
import { preloadDeferredRouteModule } from '../../ui/components/DeferredRouteMount';

/**
 * Shared loader for the /settings/accounts route module. The route file and
 * every preload site must use the SAME cache key + loader so the module lands
 * in DeferredRouteModule's cache and the route can mount the real screen
 * synchronously on first render instead of flashing the launch preview.
 */
export const ACCOUNTS_ROUTE_MODULE_CACHE_KEY = 'settings/accounts';

export const loadAccountsScreenRoute = () =>
  import('./AccountsScreen').then((module) => module.AccountsScreen as ComponentType);

export function preloadAccountsScreen(): Promise<ComponentType> {
  return preloadDeferredRouteModule(ACCOUNTS_ROUTE_MODULE_CACHE_KEY, loadAccountsScreenRoute);
}

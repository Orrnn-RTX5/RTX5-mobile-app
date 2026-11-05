/**
 * Deferred-route module loaders for the quotes detail destinations (symbol
 * Properties and Market Statistics).
 *
 * The routes mount a light launch preview first so the symbol action-sheet
 * taps never pay the heavy screen mounts inside the navigation commit; these
 * loaders are also warmed at boot by actionRouteWarmup.
 */
export const SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY = 'quotes/details';

export const loadSymbolDetailsScreenRoute = () =>
  import('./SymbolDetailsScreen').then((module) => module.SymbolDetailsScreen);

export const MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY = 'quotes/market-statistics';

export const loadMarketStatisticsScreenRoute = () =>
  import('./MarketStatisticsScreen').then((module) => module.MarketStatisticsScreen);

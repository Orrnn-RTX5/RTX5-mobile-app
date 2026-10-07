/**
 * Deferred-route module loader for the Order Ticket screen.
 *
 * The route mounts a light launch preview first so the quotes/trade action
 * taps never pay the heavy OrderTicketScreen mount inside the navigation
 * commit; this loader is also warmed at boot by actionRouteWarmup.
 */
export const ORDER_TICKET_ROUTE_MODULE_CACHE_KEY = 'trade/order-ticket';

export const loadOrderTicketScreenRoute = () =>
  import('./OrderTicketScreen').then((module) => module.OrderTicketScreen);

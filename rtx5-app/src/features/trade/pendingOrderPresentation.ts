import type { PendingOrderReadModel } from '../../api/orders/pendingOrders';
import type { LoginOrder } from '../../api/orders/types';

export const pendingOrdersToChartOrders = (orders: readonly PendingOrderReadModel[]): LoginOrder[] => orders.map(order => ({
  ticket: order.ticket, account_login: order.accountLogin, symbol: order.symbol, type: order.type,
  side: order.type.startsWith('sell') ? 'sell' : 'buy', volume: Number(order.volume),
  price_open: Number(order.price), price_sl: Number(order.sl) || 0, price_tp: Number(order.tp) || 0,
  price_limit: order.priceLimit ? Number(order.priceLimit) : null,
  stopLimitPrice: order.priceLimit ? Number(order.priceLimit) : null,
  status: order.status, comment: order.comment ?? '', time_setup: order.timeSetup, time_done: order.timeDone ?? 0,
  time_in_force: order.timeInForce, expiry: order.expiry,
}));

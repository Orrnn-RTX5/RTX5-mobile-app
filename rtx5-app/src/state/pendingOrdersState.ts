import { create } from 'zustand';
import type { PendingOrderReadModel } from '../api/orders/pendingOrders';
import { isActiveBrokerSessionOwnerStampCurrent, type ActiveBrokerSessionOwnerStamp } from './activeBrokerSession';

export const EMPTY_PENDING_ORDERS: PendingOrderReadModel[] = [];
type PendingOrdersState = {
  cacheNamespace: string;
  orders: PendingOrderReadModel[];
  revision: number;
};
export const usePendingOrdersState = create<PendingOrdersState>(() => ({
  cacheNamespace: '', orders: EMPTY_PENDING_ORDERS, revision: 0,
}));

const terminalTickets = new Map<string, Set<number>>();
const removedFor = (namespace: string): Set<number> => {
  let tickets = terminalTickets.get(namespace);
  if (!tickets) {
    tickets = new Set();
    terminalTickets.set(namespace, tickets);
    if (terminalTickets.size > 16) terminalTickets.delete(terminalTickets.keys().next().value!);
  }
  return tickets;
};

export function publishPendingOrdersSnapshot(
  owner: ActiveBrokerSessionOwnerStamp, orders: PendingOrderReadModel[], startedRevision?: number,
): void {
  if (!isActiveBrokerSessionOwnerStampCurrent(owner)) return;
  const state = usePendingOrdersState.getState();
  // A delayed REST response cannot overwrite a newer order event or mutation.
  if (startedRevision !== undefined && state.revision !== startedRevision) return;
  const removed = removedFor(owner.cacheNamespace);
  usePendingOrdersState.setState({
    cacheNamespace: owner.cacheNamespace,
    orders: orders.filter(order => !removed.has(order.ticket) && order.status.toLowerCase() === 'pending'),
    revision: state.revision + 1,
  });
}

export function upsertPendingOrder(owner: ActiveBrokerSessionOwnerStamp, order: PendingOrderReadModel): void {
  if (!isActiveBrokerSessionOwnerStampCurrent(owner) || removedFor(owner.cacheNamespace).has(order.ticket)) return;
  const state = usePendingOrdersState.getState();
  const orders = state.cacheNamespace === owner.cacheNamespace ? state.orders : [];
  const old = orders.find(row => row.ticket === order.ticket);
  if (old?.stateVersion && order.stateVersion && Number(order.stateVersion) < Number(old.stateVersion)) return;
  usePendingOrdersState.setState({
    cacheNamespace: owner.cacheNamespace,
    orders: [...orders.filter(row => row.ticket !== order.ticket), order].sort((a, b) => b.timeSetup - a.timeSetup),
    revision: state.revision + 1,
  });
}

export function removePendingOrder(owner: ActiveBrokerSessionOwnerStamp, ticket: number): void {
  if (!isActiveBrokerSessionOwnerStampCurrent(owner)) return;
  const removed = removedFor(owner.cacheNamespace);
  removed.add(ticket);
  if (removed.size > 2000) removed.delete(removed.values().next().value!);
  const state = usePendingOrdersState.getState();
  usePendingOrdersState.setState({
    cacheNamespace: owner.cacheNamespace,
    orders: state.cacheNamespace === owner.cacheNamespace ? state.orders.filter(row => row.ticket !== ticket) : [],
    revision: state.revision + 1,
  });
}

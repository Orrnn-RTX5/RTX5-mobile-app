import { create } from 'zustand';
import { isActiveBrokerSessionOwnerStampCurrent, type ActiveBrokerSessionOwnerStamp } from './activeBrokerSession';

type Notification = { id: string; message: string; namespace: string; createdAt: number };
export const usePendingOrderNotifications = create<{ notifications: Notification[] }>(() => ({ notifications: [] }));
const seen = new Set<string>();
export function notifyPendingOrder(owner: ActiveBrokerSessionOwnerStamp, id: string, message: string): void {
  if (!isActiveBrokerSessionOwnerStampCurrent(owner)) return;
  const key = `${owner.cacheNamespace}|${id}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 1000) seen.delete(seen.values().next().value!);
  usePendingOrderNotifications.setState(state => ({
    notifications: [...state.notifications.filter(row => row.namespace === owner.cacheNamespace && Date.now() - row.createdAt < 8000),
      { id: key, message, namespace: owner.cacheNamespace, createdAt: Date.now() }].slice(-3),
  }));
  setTimeout(() => dismissPendingOrderNotification(key), 8000);
}
export function dismissPendingOrderNotification(id: string): void {
  usePendingOrderNotifications.setState(state => ({ notifications: state.notifications.filter(row => row.id !== id) }));
}

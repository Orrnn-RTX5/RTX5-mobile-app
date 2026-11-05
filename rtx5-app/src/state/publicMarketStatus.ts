export type PublicMarketStatus = 'loading' | 'live' | 'offline' | 'reconnecting' | 'empty' | 'configuration-error';
let status: PublicMarketStatus = 'loading';
const listeners = new Set<() => void>();
export const getPublicMarketStatus = () => status;
export const subscribePublicMarketStatus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setPublicMarketStatus(next: PublicMarketStatus) { if (next !== status) { status = next; listeners.forEach(listener => listener()); } }

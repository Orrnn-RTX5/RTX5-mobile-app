import { resolveBrokerEndpointSet, normalizeBrokerHttpsUrl, ensureBrokerRestApiBase } from '../api/brokerRouting';
import type { BrokerServiceDiscovery } from '../api/brokerRouting';
import { timedFetch } from '../utils/apiLatency';

export type PublicBrokerContext = Readonly<{
  brokerId: string; name: string; apiBase: string; extendedApiBase: string;
  feedWsBase: string; candleWsBase: string; feedStatusUrl: string;
  feedBrokerId: string; protocolMode: 'gateway-v2' | 'bridge';
  configVersion: string; generation: number; cacheNamespace: string;
  endpoints: Extract<ReturnType<typeof resolveBrokerEndpointSet>, { ok: true }>['endpoints'];
}>;
export type PublicBrokerRecord = BrokerServiceDiscovery & {
  broker_name?: string; extended_api_url?: string; extended_api_origin?: string;
  feed_broker_id?: string; protocol_mode?: string;
};
let generation = 0;
let current: PublicBrokerContext | null = null;
const listeners = new Set<() => void>();
const requests = new Set<AbortController>();

/** Only supported directory records can activate routing. Persisted URLs are never input. */
export function createPublicBrokerContext(record: PublicBrokerRecord): PublicBrokerContext {
  const result = resolveBrokerEndpointSet(record);
  if (!result.ok) throw new Error(result.message);
  const endpoints = result.endpoints;
  const extended = record.extended_api_url ?? record.extended_api_origin;
  const extendedApiBase = extended ? ensureBrokerRestApiBase(normalizeBrokerHttpsUrl(extended)) : endpoints.apiBase;
  if (!extendedApiBase) throw new Error('Invalid directory extended API origin.');
  if (record.protocol_mode && !['gateway-v2', 'bridge'].includes(record.protocol_mode)) throw new Error('Unsupported public market protocol.');
  if (record.protocol_mode === 'bridge') throw new Error('Bridge provider has not been verified for guest market data.');
  const root = new URL(endpoints.apiBase);
  return Object.freeze({ brokerId: endpoints.brokerId, name: record.broker_name || endpoints.brokerId,
    apiBase: endpoints.apiBase, extendedApiBase, feedWsBase: endpoints.feedWsBase,
    candleWsBase: `wss://${root.host}/ws/v2`, feedStatusUrl: endpoints.feedStatusUrl,
    feedBrokerId: record.feed_broker_id?.trim() || endpoints.brokerId, protocolMode: 'gateway-v2',
    configVersion: endpoints.configVersion, generation: generation + 1,
    cacheNamespace: `public-market:${encodeURIComponent(endpoints.brokerId)}:${generation + 1}`, endpoints });
}
export function setPublicBrokerContext(record: PublicBrokerRecord | null): PublicBrokerContext | null {
  const next = record ? createPublicBrokerContext(record) : null;
  requests.forEach(controller => controller.abort()); requests.clear(); generation += 1;
  current = next; listeners.forEach(listener => listener()); return current;
}
export const getPublicBrokerContext = () => current;
export function requirePublicBrokerContext(): PublicBrokerContext {
  if (!current) throw new Error('Select a verified broker before loading market data.'); return current;
}
export const isPublicBrokerContextCurrent = (context: PublicBrokerContext) => current === context;
export function subscribePublicBrokerContext(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
/** Anonymous policy shared by catalog, snapshots, candles and public configuration. */
export async function publicBrokerFetch(path: string, signal?: AbortSignal, extended = false): Promise<Response> {
  const context = requirePublicBrokerContext(); const controller = new AbortController();
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort(); requests.add(controller);
  try {
    const response = await timedFetch(`${extended ? context.extendedApiBase : context.apiBase}${path}`, {
      method: 'GET', credentials: 'omit', headers: { Accept: 'application/json', 'X-Broker-ID': context.brokerId }, signal: controller.signal,
    }, { label: 'guest.public', method: 'GET', endpoint: path.split('?')[0], source: 'candles', timeoutMs: path.startsWith('/candles/') ? 0 : 10000 });
    if (!isPublicBrokerContextCurrent(context)) throw new Error('Broker selection changed.'); return response;
  } finally { requests.delete(controller); signal?.removeEventListener('abort', abort); }
}

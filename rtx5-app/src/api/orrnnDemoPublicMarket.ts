import { normalizeSymbol } from '../domain/symbols';
import { normalizeTimeframeStrict } from '../domain/candles/core/candles';
import { requirePublicBrokerContext, getPublicBrokerContext, publicBrokerFetch, isPublicBrokerContextCurrent, subscribePublicBrokerContext } from '../state/publicBrokerContext';
import { setPublicMarketStatus } from '../state/publicMarketStatus';
export * from '../config/orrnnDemoPublicMarket';
const TF = { M1: '1m', M5: '5m', M15: '15m', M30: '30m', H1: '1h', H4: '4h', D1: '1d' } as const;
export type OrrnnDemoPublicCandleTimeframe = (typeof TF)[keyof typeof TF];
export type OrrnnDemoPublicMarketSelection = { brokerId: string | null | undefined; isLoggedIn: boolean };
export type OrrnnDemoPublicCatalog = { symbols: string[]; timeframes: OrrnnDemoPublicCandleTimeframe[]; instruments: Record<string, unknown>[]; quotes: Record<string, unknown>[] };
export type OrrnnDemoPublicCandlesResponse = { symbol: string; tf: OrrnnDemoPublicCandleTimeframe; count: number; candles: unknown[] };
export type OrrnnDemoPublicFeedStatus = { market_available: boolean; upstream_connected: boolean; feed_auth_required: boolean };
export function publicRows(payload: unknown, key: 'instruments' | 'quotes' | 'candles'): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(row => row && typeof row === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  return publicRows(record[key] ?? record.data ?? [], key);
}
export const getOrrnnDemoPublicQuotePayloads = (payload: unknown): unknown[] => {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  return Array.isArray(record.symbols) && record.type === 'snapshot' ? record.symbols
    : Array.isArray(record.ticks) ? record.ticks : Array.isArray(record.quotes) ? record.quotes : [payload];
};
export const isOrrnnDemoPublicMarketSelection = ({ isLoggedIn, brokerId }: OrrnnDemoPublicMarketSelection) =>
  !isLoggedIn && Boolean(brokerId) && getPublicBrokerContext()?.brokerId === brokerId;
export const resolveOrrnnDemoPublicCandleTimeframe = (timeframe: unknown): OrrnnDemoPublicCandleTimeframe | null => {
  const canonical = normalizeTimeframeStrict(timeframe);
  return canonical ? TF[canonical as keyof typeof TF] ?? null : null;
};
let cached: { namespace: string; at: number; value: OrrnnDemoPublicCatalog } | null = null;
let pending: { namespace: string; promise: Promise<OrrnnDemoPublicCatalog> } | null = null;
type WireSymbolIndex = { exact: Set<string>; normalized: Map<string, string | null> };
// Catalog arrays are replaced on each response. Weak keys release indexes when
// old catalog/query consumers go away instead of accumulating broker catalogs.
let wireSymbolIndexes = new WeakMap<readonly string[], WireSymbolIndex>();
export const resetOrrnnDemoPublicMarketCatalogCache = () => { cached = null; pending = null; wireSymbolIndexes = new WeakMap(); };
subscribePublicBrokerContext(resetOrrnnDemoPublicMarketCatalogCache);
async function json(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new Error(label + ' failed with HTTP ' + response.status + '.');
  return response.json();
}
export async function getOrrnnDemoPublicMarketCatalog(signal?: AbortSignal): Promise<OrrnnDemoPublicCatalog> {
  signal?.throwIfAborted?.();
  const context = requirePublicBrokerContext();
  if (cached?.namespace === context.cacheNamespace && Date.now() - cached.at < 300000) return cached.value;
  if (pending?.namespace === context.cacheNamespace) {
    const sharedResult = await pending.promise;
    signal?.throwIfAborted?.();
    return sharedResult;
  }
  const promise = (async () => {
    const [instrumentPayload, quotePayload] = await Promise.all([
      publicBrokerFetch('/instruments').then(response => json(response, 'Instrument catalog')),
      publicBrokerFetch('/quotes').then(response => json(response, 'Quote snapshots')),
    ]);
    const instruments = publicRows(instrumentPayload, 'instruments').filter(row => typeof row.symbol === 'string' && row.symbol.length > 0 && row.enabled !== false);
    const availableSymbols = new Set(instruments.map(row => String(row.symbol)));
    const symbols = Array.from(availableSymbols);
    if (!symbols.length) { setPublicMarketStatus('empty'); throw new Error('This broker has no available instruments.'); }
    const quotes = publicRows(quotePayload, 'quotes').filter(row => availableSymbols.has(String(row.symbol)));
    const value: OrrnnDemoPublicCatalog = { symbols, timeframes: Object.values(TF), instruments, quotes };
    if (!isPublicBrokerContextCurrent(context)) throw new Error('Broker selection changed.');
    cached = { namespace: context.cacheNamespace, at: Date.now(), value };
    return value;
  })();
  pending = { namespace: context.cacheNamespace, promise };
  try {
    const result = await promise;
    signal?.throwIfAborted?.();
    return result;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
}
/** UI normalization is allowed only as a unique lookup; wire identifiers stay exact. */
export function resolvePublicWireSymbol(symbol: string, catalog: OrrnnDemoPublicCatalog): string | null {
  let index = wireSymbolIndexes.get(catalog.symbols);
  if (!index) {
    index = { exact: new Set(catalog.symbols), normalized: new Map() };
    for (const candidate of catalog.symbols) {
      const key = normalizeSymbol(candidate);
      // More than one wire spelling of a normalized key is ambiguous. Exact
      // matches still win, and no broker suffix/base alias is introduced.
      index.normalized.set(key, index.normalized.has(key) ? null : candidate);
    }
    wireSymbolIndexes.set(catalog.symbols, index);
  }
  if (index.exact.has(symbol)) return symbol;
  return index.normalized.get(normalizeSymbol(symbol)) ?? null;
}
export async function getOrrnnDemoPublicCandles(symbol: string, timeframe: string, limit = 500, signal?: AbortSignal): Promise<OrrnnDemoPublicCandlesResponse> {
  const context = requirePublicBrokerContext();
  const catalog = await getOrrnnDemoPublicMarketCatalog(signal);
  const wire = resolvePublicWireSymbol(symbol, catalog);
  const tf = resolveOrrnnDemoPublicCandleTimeframe(timeframe);
  if (!wire || !tf) throw new Error('This candle selection is unavailable for the selected broker.');
  const canonical = Object.entries(TF).find(([, value]) => value === tf)![0];
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const response = await publicBrokerFetch('/candles/' + encodeURIComponent(wire) + '?timeframe=' + canonical + '&limit=' + safeLimit, signal);
  const payload: any = await json(response, 'Candle history');
  if (!isPublicBrokerContextCurrent(context)) throw new Error('Broker selection changed.');
  if (payload.symbol !== undefined && payload.symbol !== wire || payload.timeframe !== undefined && payload.timeframe !== canonical) throw new Error('Candle history selection mismatch.');
  const byTime = new Map<number, unknown>();
  let rows = publicRows(payload, 'candles');
  if (!rows.length) {
    try {
      const feedPayload: any = await json(await publicBrokerFetch('/api/v1/candles?symbol=' + encodeURIComponent(wire) + '&tf=' + encodeURIComponent(tf) + '&limit=' + safeLimit, signal), 'Candle history');
      if (!isPublicBrokerContextCurrent(context)) throw new Error('Broker selection changed.');
      if ((feedPayload.symbol === undefined || feedPayload.symbol === wire) && (feedPayload.tf === undefined || feedPayload.tf === tf) && (feedPayload.timeframe === undefined || feedPayload.timeframe === canonical)) {
        rows = publicRows(feedPayload, 'candles');
      }
    } catch (error) {
      if (!isPublicBrokerContextCurrent(context) || signal?.aborted) throw error;
    }
  }
  for (const row of rows) {
    const time = Number(row.time ?? row.timestamp);
    if (Number.isFinite(time) && time > 0) byTime.set(time, row);
  }
  const candles = [...byTime].sort(([a], [b]) => a - b).map(([, row]) => row).slice(-safeLimit);
  return { symbol: wire, tf, count: candles.length, candles };
}
export async function getOrrnnDemoPublicFeedStatus(signal?: AbortSignal): Promise<OrrnnDemoPublicFeedStatus> {
  const payload: any = await json(await publicBrokerFetch('/market/status', signal), 'Market status');
  const available = payload.market_available === true || payload.trade_open === true || payload.market_state === 'open';
  return { market_available: available, upstream_connected: payload.upstream_connected === true, feed_auth_required: false };
}


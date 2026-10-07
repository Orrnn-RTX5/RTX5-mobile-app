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
export const resetOrrnnDemoPublicMarketCatalogCache = () => { cached = null; pending = null; };
subscribePublicBrokerContext(resetOrrnnDemoPublicMarketCatalogCache);
async function json(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new Error(label + ' failed with HTTP ' + response.status + '.');
  return response.json();
}
export async function getOrrnnDemoPublicMarketCatalog(signal?: AbortSignal): Promise<OrrnnDemoPublicCatalog> {
  const context = requirePublicBrokerContext();
  if (cached?.namespace === context.cacheNamespace && Date.now() - cached.at < 300000) return cached.value;
  if (pending?.namespace === context.cacheNamespace) return pending.promise;
  const promise = (async () => {
    const [instrumentPayload, quotePayload] = await Promise.all([
      publicBrokerFetch('/instruments', signal).then(response => json(response, 'Instrument catalog')),
      publicBrokerFetch('/quotes', signal).then(response => json(response, 'Quote snapshots')),
    ]);
    const instruments = publicRows(instrumentPayload, 'instruments').filter(row => typeof row.symbol === 'string' && row.symbol.length > 0 && row.enabled !== false);
    const symbols = Array.from(new Set(instruments.map(row => String(row.symbol))));
    if (!symbols.length) { setPublicMarketStatus('empty'); throw new Error('This broker has no available instruments.'); }
    const quotes = publicRows(quotePayload, 'quotes').filter(row => symbols.includes(String(row.symbol)));
    const value: OrrnnDemoPublicCatalog = { symbols, timeframes: Object.values(TF), instruments, quotes };
    if (!isPublicBrokerContextCurrent(context)) throw new Error('Broker selection changed.');
    cached = { namespace: context.cacheNamespace, at: Date.now(), value };
    return value;
  })();
  pending = { namespace: context.cacheNamespace, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
}
/** UI normalization is allowed only as a unique lookup; wire identifiers stay exact. */
export function resolvePublicWireSymbol(symbol: string, catalog: OrrnnDemoPublicCatalog): string | null {
  if (catalog.symbols.includes(symbol)) return symbol;
  const matches = catalog.symbols.filter(candidate => normalizeSymbol(candidate) === normalizeSymbol(symbol));
  return matches.length === 1 ? matches[0] : null;
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
  for (const row of publicRows(payload, 'candles')) {
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


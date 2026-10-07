export type PublicMarketSocketRuntime = {
  initialActive: boolean;
  isGuest: () => boolean;
  subscribeGuest: (listener: () => void) => () => void;
  subscribeVisibility: (listener: (active: boolean) => void) => () => void;
  openSocket: (url: string) => WebSocket;
};
import { getOrrnnDemoPublicMarketCatalog, getOrrnnDemoPublicCandles, getOrrnnDemoPublicQuotePayloads, resolvePublicWireSymbol, resolveOrrnnDemoPublicCandleTimeframe, type OrrnnDemoPublicCatalog } from '../orrnnDemoPublicMarket';
import { normalizeQuoteTickPayload, type QuoteTickEvent } from './quoteTickNormalizer';
import { normalizeSymbol } from '../../domain/symbols';
import { normalizeLiveCandle } from '../../domain/candles/normalization/candleNormalizer';
import type { CandleParams } from '../../domain/candles/stream/liveCandleStream';
import { useTradingState, resetQuoteMarketData, markQuoteMarketDataUnavailable } from '../../state/tradingState';
import { getPublicBrokerContext, isPublicBrokerContextCurrent, subscribePublicBrokerContext, type PublicBrokerContext } from '../../state/publicBrokerContext';
import { quoteLatencyMonotonicNow } from '../../market/quoteLatencyMetrics';
import { candleChannel, acknowledgedChannels, quoteAcknowledgment } from './publicMarketProtocol';
import { setPublicMarketStatus } from '../../state/publicMarketStatus';
import { invalidatePublicQuote } from '../../state/publicQuoteAvailability';
type QuoteListener = (tick: QuoteTickEvent) => void;
export type OrrnnDemoPublicCandleListener = (candle: CandleParams) => void;
type CandleDemand = { symbol: string; tf: string; listeners: Set<OrrnnDemoPublicCandleListener>; ack: boolean; rejected: boolean; valid?: boolean; controller?: AbortController; polling?: boolean };
export class PublicMarketSocketService {
  private quoteListeners = new Map<string, Set<QuoteListener>>();
  private candleListeners = new Map<string, CandleDemand>();
  private feed: WebSocket | null = null;
  private candles: WebSocket | null = null;
  private context: PublicBrokerContext | null = null;
  private catalog: OrrnnDemoPublicCatalog | null = null;
  private wireSymbols = new Map<string, string>();
  private instrumentMetadata = new Map<string, Record<string, unknown>>();
  private acknowledged = new Set<string>();
  private active = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;
  private catalogController: AbortController | null = null;
  private lifecycle = 0;
  private retries = 0;
  private hasReceivedQuote = false;
  private lastFeedMessage = 0;
  private lastCandleMessage = 0;
  private subscribedAt = 0;
  private disposers: (() => void)[] = [];
  constructor(private readonly runtime: PublicMarketSocketRuntime) {
    this.active = runtime.initialActive;
    this.disposers.push(runtime.subscribeVisibility(active => { if (active === this.active) return; this.active = active; if (!active) setPublicMarketStatus('offline'); this.restart(); }));
    this.disposers.push(subscribePublicBrokerContext(() => { this.stop(); this.catalog = null; this.wireSymbols.clear(); this.retries = 0; this.hasReceivedQuote = false; resetQuoteMarketData(); void this.connect(); }));
    this.disposers.push(runtime.subscribeGuest(() => this.reconcileDemand()));
  }
  private hasDemand() { return this.quoteListeners.size > 0 || this.candleListeners.size > 0; }
  private eligible() { return this.active && this.runtime.isGuest() && Boolean(getPublicBrokerContext()) && this.hasDemand(); }
  private restart() { this.stop(); void this.connect(); }
  /** Listener changes update subscriptions in place; they are not transport failures. */
  private reconcileDemand() {
    try { this.updateDemand(); }
    catch { this.stop(); setPublicMarketStatus('offline'); this.scheduleReconnect(); }
  }
  private updateDemand() {
    if (!this.eligible()) { this.stop(); return; }
    if (this.connecting || this.reconnect) return;
    const context = this.context;
    const catalog = this.catalog;
    if (!context || !catalog || !isPublicBrokerContextCurrent(context)) { void this.connect(); return; }
    const previous = new Set(this.wireSymbols.values());
    this.wireSymbols.clear();
    for (const symbol of this.quoteListeners.keys()) {
      const wire = resolvePublicWireSymbol(symbol, catalog);
      if (wire) this.wireSymbols.set(symbol, wire);
    }
    const next = new Set(this.wireSymbols.values());
    const removed = [...previous].filter(symbol => !next.has(symbol));
    const added = [...next].filter(symbol => !previous.has(symbol));
    for (const symbol of removed) { this.acknowledged.delete(symbol); this.markUnavailable(symbol); }
    if (!next.size) { this.closeSocket(this.feed); this.feed = null; }
    else if (!this.feed) {
      const url = new URL(context.feedWsBase); url.searchParams.set('broker_id', context.feedBrokerId);
      this.subscribedAt = this.lastFeedMessage = Date.now();
      this.feed = this.open(url.toString(), context, 'feed');
    } else if (this.feed.readyState === 1) {
      if (removed.length) this.feed.send(JSON.stringify({ type: 'unsubscribe', symbols: removed }));
      if (added.length) { this.subscribedAt = Date.now(); this.feed.send(JSON.stringify({ type: 'subscribe', symbols: added })); }
    }
    const addedCandles: CandleDemand[] = [];
    for (const demand of this.candleListeners.values()) {
      if (demand.valid !== undefined) continue;
      const wire = resolvePublicWireSymbol(demand.symbol, catalog);
      demand.valid = Boolean(wire);
      if (wire) { demand.symbol = wire; addedCandles.push(demand); }
    }
    if (![...this.candleListeners.values()].some(demand => demand.valid)) { this.closeSocket(this.candles); this.candles = null; }
    else if (!this.candles) { this.lastCandleMessage = Date.now(); this.candles = this.open(context.candleWsBase, context, 'candles'); }
    else for (const demand of addedCandles) this.sendCandle('subscribe', demand);
    // The catalog snapshot only seeds missing prices, never replays over live data.
    for (const row of catalog.quotes) this.publish(row, 'rest_snapshot');
    if ((this.feed || this.candles) && !this.timer) this.timer = setInterval(() => this.watch(), 3000);
    else if (!this.feed && !this.candles && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  connect = async (): Promise<void> => {
    if (!this.eligible() || this.connecting || this.feed || this.candles) return;
    const context = getPublicBrokerContext()!; this.context = context; this.connecting = true;
    setPublicMarketStatus(this.hasReceivedQuote || this.retries > 0 ? 'reconnecting' : 'loading');
    const lifecycle = this.lifecycle;
    const controller = new AbortController(); this.catalogController = controller;
    try {
      const catalog = await getOrrnnDemoPublicMarketCatalog(controller.signal);
      if (!this.eligible() || !isPublicBrokerContextCurrent(context) || this.context !== context || lifecycle !== this.lifecycle) return;
      this.catalog = catalog;
      this.instrumentMetadata = new Map(catalog.instruments.map(row => [String(row.symbol), row]));
      this.connecting = false;
      this.reconcileDemand();
    } catch { if (lifecycle === this.lifecycle) { this.stop(); setPublicMarketStatus('offline'); this.scheduleReconnect(); } } finally {
      if (this.catalogController === controller) this.catalogController = null;
      if (lifecycle === this.lifecycle) this.connecting = false;
    }
  };
  private open(url: string, context: PublicBrokerContext, kind: 'feed' | 'candles'): WebSocket {
    const socket = this.runtime.openSocket(url);
    const current = () => isPublicBrokerContextCurrent(context) && this.context === context && this.eligible() && (kind === 'feed' ? this.feed : this.candles) === socket;
    socket.onopen = () => {
      if (!current()) { socket.close(); return; }
      this.retries = 0;
      if (kind === 'feed') socket.send(JSON.stringify({ type: 'subscribe', symbols: [...this.wireSymbols.values()] }));
      else for (const demand of this.candleListeners.values()) this.sendCandle('subscribe', demand);
    };
    socket.onmessage = event => {
      if (!current()) return;
      let payload: any; try { payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (payload?.broker_id !== undefined && payload.broker_id !== (kind === 'feed' ? context.feedBrokerId : context.brokerId)) return;
      if (kind === 'feed') {
        this.lastFeedMessage = Date.now();
        if (payload?.type === 'ping') socket.send(JSON.stringify({ type: 'pong', timestamp: payload.timestamp }));
        const ack = quoteAcknowledgment(payload);
        if (ack) { for (const symbol of ack.accepted) this.acknowledged.add(symbol); for (const symbol of ack.rejected) { this.acknowledged.delete(symbol); this.markUnavailable(symbol); } }
        else if (payload?.type === 'error') {
          for (const wire of this.wireSymbols.values()) this.markUnavailable(wire);
        } else for (const row of getOrrnnDemoPublicQuotePayloads(payload)) this.publish(row, 'websocket');
      } else {
        this.lastCandleMessage = Date.now();
        for (const channel of acknowledgedChannels(payload)) {
          const demand = [...this.candleListeners.values()].find(item => candleChannel(item.symbol, item.tf) === channel);
          if (demand) { demand.ack = true; demand.rejected = false; demand.controller?.abort(); }
        }
        const channel = typeof payload?.channel === 'string' ? payload.channel : '';
        const demand = [...this.candleListeners.values()].find(item => candleChannel(item.symbol, item.tf) === channel);
        if (!demand) return;
        if (payload.type === 'error' || payload.error || payload.action === 'error') { demand.ack = false; demand.rejected = true; void this.poll(demand); return; }
        const data = payload.data ?? payload;
        const rows = Array.isArray(data?.candles) ? data.candles : Array.isArray(payload.candles) ? payload.candles : Array.isArray(data) ? data : [data];
        for (const row of rows) this.publishCandle(demand, row);
      }
    };
    socket.onerror = () => {};
    socket.onclose = () => { if (current()) { this.stop(); this.scheduleReconnect(); } };
    return socket;
  }
  private markUnavailable(symbol: string) {
    markQuoteMarketDataUnavailable(symbol);
    invalidatePublicQuote(symbol);
  }
  private publish(payload: unknown, transport: 'websocket' | 'rest_snapshot') {
    if (!payload || typeof payload !== 'object') return;
    const row = payload as Record<string, unknown>;
    if (row.broker_id !== undefined && row.broker_id !== this.context?.feedBrokerId) return;
    const raw = String(row.symbol ?? '');
    if (![...this.wireSymbols.values()].includes(raw)) return;
    const retained = useTradingState.getState().quotes[normalizeSymbol(raw)];
    if (transport === 'rest_snapshot' && retained) return;
    if (row.has_quote === false) { this.markUnavailable(raw); return; }
    const result = normalizeQuoteTickPayload({ ...this.instrumentMetadata.get(raw), ...row }, Date.now()); if (!result.ok) return;
    if (result.update.timestampSource === 'feed' && retained?.feedTickAt !== undefined &&
        result.update.timestamp !== undefined && result.update.timestamp !== null && result.update.timestamp < retained.feedTickAt) return;
    this.hasReceivedQuote = true;
    if (transport === 'websocket' && this.acknowledged.has(raw)) setPublicMarketStatus('live');
    const update = result.update;
    const tick: QuoteTickEvent = { ...update, symbol: update.symbol, bid: update.bid, ask: update.ask,
      // Sequence identifiers are opaque even when they consist solely of digits.
      sequence: typeof (row.sequence ?? row.seq ?? row.source_seq ?? row.sourceSeq ?? row.sequenceId ?? row.sourceSequence) === 'string' ? String(row.sequence ?? row.seq ?? row.source_seq ?? row.sourceSeq ?? row.sequenceId ?? row.sourceSequence) : update.sequence,
      receivedAt: Date.now(), receiptMonotonicAt: quoteLatencyMonotonicNow(), timestamp: update.timestamp ?? Date.now(),
      feedTickAt: update.timestampSource === 'feed' ? update.timestamp ?? undefined : undefined, transport };
    useTradingState.getState().setQuote(raw, { bid: tick.bid, ask: tick.ask, lastTickAt: tick.timestamp, lastReceivedAt: tick.receivedAt, feedTickAt: tick.feedTickAt,
      digits: tick.digits, digitsSource: tick.digits === undefined ? undefined : 'backend', point: tick.point, tickSize: tick.tickSize, sequence: tick.sequence,
      stale: tick.stale, tradable: tick.tradable, degraded: tick.degraded, marketState: tick.marketState, transport });
    this.quoteListeners.get(normalizeSymbol(raw))?.forEach(listener => listener(tick));
  }
  private publishCandle(demand: CandleDemand, row: any) {
    const candle = normalizeLiveCandle({ ...row, symbol: demand.symbol, timeframe: demand.tf });
    if (!candle) return;
    demand.listeners.forEach(listener => listener({ ...candle, source: 'live_candle' }));
  }
  private sendCandle(action: 'subscribe' | 'unsubscribe', demand: CandleDemand) {
    if (!demand.valid || this.candles?.readyState !== 1) return;
    const channel = candleChannel(demand.symbol, demand.tf);
    this.candles.send(JSON.stringify({ action, channel, channels: [channel] }));
  }
  private watch() {
    if (!this.eligible()) { this.stop(); return; }
    const now = Date.now();
    if (this.feed?.readyState === 1) {
      this.feed.send(JSON.stringify({ type: 'ping', timestamp: now }));
      const missing = [...this.wireSymbols.values()].filter(symbol => !this.acknowledged.has(symbol));
      if (missing.length && now - this.subscribedAt > 3000) this.feed.send(JSON.stringify({ type: 'subscribe', symbols: missing }));
      if (now - this.lastFeedMessage > 30000) { this.restart(); return; }
    }
    if (this.candles && now - this.lastCandleMessage > 60000) { this.restart(); return; }
    for (const demand of this.candleListeners.values()) if (!demand.ack) void this.poll(demand);
  }
  private async poll(demand: CandleDemand) {
    if (!demand.valid || demand.polling || !this.eligible() || !this.context || demand.ack) return;
    const context = this.context; demand.polling = true; demand.controller = new AbortController();
    try {
      const result = await getOrrnnDemoPublicCandles(demand.symbol, demand.tf, 3, demand.controller.signal);
      if (!demand.controller.signal.aborted && this.eligible() && isPublicBrokerContextCurrent(context) && [...this.candleListeners.values()].includes(demand)) {
        for (const row of result.candles) this.publishCandle(demand, row);
      }
    } catch {} finally { demand.polling = false; }
  }
  private scheduleReconnect() {
    if (this.reconnect || !this.eligible()) return;
    setPublicMarketStatus('reconnecting');
    this.reconnect = setTimeout(() => { this.reconnect = null; void this.connect(); }, Math.min(30000, 750 * 2 ** this.retries++));
  }
  subscribeToSymbols(symbols: readonly string[], listener: QuoteListener): () => void {
    const keys = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
    for (const key of keys) { const set = this.quoteListeners.get(key) ?? new Set(); set.add(listener); this.quoteListeners.set(key, set); }
    this.reconcileDemand();
    return () => { for (const key of keys) { const set = this.quoteListeners.get(key); set?.delete(listener); if (!set?.size) this.quoteListeners.delete(key); } this.reconcileDemand(); };
  }
  subscribeToSymbol(symbol: string, listener: QuoteListener) { return this.subscribeToSymbols([symbol], listener); }
  subscribeCandle(symbol: string, timeframe: string, listener: OrrnnDemoPublicCandleListener): () => void {
    const tf = resolveOrrnnDemoPublicCandleTimeframe(timeframe); if (!tf) return () => {};
    const key = normalizeSymbol(symbol) + '|' + tf;
    const demand = this.candleListeners.get(key) ?? { symbol, tf, listeners: new Set(), ack: false, rejected: false };
    demand.listeners.add(listener); this.candleListeners.set(key, demand); this.reconcileDemand();
    return () => { demand.listeners.delete(listener); if (!demand.listeners.size) { this.sendCandle('unsubscribe', demand); demand.controller?.abort(); this.candleListeners.delete(key); } this.reconcileDemand(); };
  }
  dispose() { this.stop(); this.disposers.forEach(dispose => dispose()); this.quoteListeners.clear(); this.candleListeners.clear(); }
  private closeSocket(socket: WebSocket | null) {
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    if (socket.readyState === 1 || socket.readyState === 0) socket.close();
  }
  private stop() {
    this.lifecycle += 1;
    if (this.context && isPublicBrokerContextCurrent(this.context) && this.runtime.isGuest()) {
      for (const wire of this.wireSymbols.values()) this.markUnavailable(wire);
    }
    this.context = null;
    this.connecting = false;
    this.catalogController?.abort(); this.catalogController = null;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    if (this.reconnect) clearTimeout(this.reconnect); this.reconnect = null;
    this.acknowledged.clear();
    for (const demand of this.candleListeners.values()) { demand.ack = false; demand.valid = undefined; demand.controller?.abort(); }
    for (const socket of [this.feed, this.candles]) this.closeSocket(socket);
    this.feed = this.candles = null;
  }
}




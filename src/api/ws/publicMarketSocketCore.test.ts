import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { PublicMarketSocketService } from './publicMarketSocketCore';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import { setPublicBrokerContext } from '../../state/publicBrokerContext';
import { useTradingState } from '../../state/tradingState';
import { subscribePublicQuoteInvalidation } from '../../state/publicQuoteAvailability';
import { getPublicMarketStatus } from '../../state/publicMarketStatus';
class FakeSocket {
  readyState = 0; sent: any[] = []; onopen: (() => void) | null = null; onmessage: ((event: any) => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send(value: string) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: any) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

function quoteHarness(t: TestContext, quotes: unknown[] = [], beforeOpen?: (url: string) => void) {
  const original = fetch;
  setPublicBrokerContext(publicBrokerFixture());
  useTradingState.getState().resetSessionMarketData();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1800000000000 } as any);
  globalThis.fetch = (async url => new Response(JSON.stringify(String(url).endsWith('/instruments')
    ? [{ symbol: 'EURUSD.pro', digits: 5 }, { symbol: 'GBPUSD.pro', digits: 5 }] : quotes))) as typeof fetch;
  const sockets: FakeSocket[] = [];
  const service = new PublicMarketSocketService({
    initialActive: true, isGuest: () => true, subscribeGuest: () => () => {}, subscribeVisibility: () => () => {},
    openSocket: url => { beforeOpen?.(url); const socket = new FakeSocket(url); sockets.push(socket); return socket as unknown as WebSocket; },
  });
  t.after(() => { service.dispose(); t.mock.timers.reset(); globalThis.fetch = original; setPublicBrokerContext(null); });
  return { sockets, service };
}
test('anonymous quotes validate catalog, preserve flags and sequence, heartbeat and resume after reconnect', async t => {
  const original = fetch; setPublicBrokerContext(publicBrokerFixture());
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1800000000000 } as any);
  globalThis.fetch = (async url => new Response(JSON.stringify(String(url).endsWith('/instruments') ? [{ symbol: 'EURUSD.pro', digits: 5 }] : []))) as typeof fetch;
  const sockets: FakeSocket[] = []; let visibility: (active: boolean) => void = () => {};
  const service = new PublicMarketSocketService({ initialActive: true, isGuest: () => true, subscribeGuest: () => () => {}, subscribeVisibility: listener => { visibility = listener; return () => {}; }, openSocket: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket as unknown as WebSocket; } });
  t.after(() => { service.dispose(); t.mock.timers.reset(); globalThis.fetch = original; setPublicBrokerContext(null); });
  const ticks: any[] = []; const unsubscribe = service.subscribeToSymbols(['EURUSD.PRO', 'UNKNOWN'], tick => ticks.push(tick));
  const unavailable: string[] = []; const stopAvailability = subscribePublicQuoteInvalidation(symbol => unavailable.push(symbol)); t.after(stopAvailability);
  await settle(); assert.equal(sockets.length, 1); assert.equal(new URL(sockets[0].url).searchParams.get('broker_id'), 'Nexa');
  sockets[0].open(); assert.deepEqual(sockets[0].sent[0], { type: 'subscribe', symbols: ['EURUSD.pro'] });
  sockets[0].message({ type: 'subscribed', broker_id: 'Nexa', symbols: ['EURUSD.pro'], server_time: 1800000000000 });
  sockets[0].message({ type: 'ticks', broker_id: 'Other', ticks: [{ symbol: 'EURUSD.pro', bid: 1, ask: 2 }] }); assert.equal(ticks.length, 0);
  sockets[0].message({ symbol: 'EURUSD.pro', bid: 1, ask: 1.1, time_ms: 1800000000000, sequence: '00090071992547409930001', tradable: false, stale: true, market_state: 'delayed' });
  assert.equal(ticks[0].sequence, '00090071992547409930001'); assert.equal(ticks[0].marketState, 'delayed'); assert.equal(ticks[0].tradable, false);
  assert.equal(ticks[0].digits, 5);
  sockets[0].message({ type: 'snapshot', symbols: [{ symbol: 'EURUSD.pro', has_quote: false }] });
  const retained = useTradingState.getState().quotes['EURUSD.PRO'];
  assert.equal(retained.bid, 1); assert.equal(retained.ask, 1.1);
  assert.equal(retained.stale, true); assert.equal(retained.tradable, false);
  assert.deepEqual(unavailable, ['EURUSD.pro']);
  t.mock.timers.tick(3000); assert.ok(sockets[0].sent.some(row => row.type === 'ping' && row.timestamp === 1800000003000));
  sockets[0].close(); t.mock.timers.tick(750); await settle(); assert.equal(sockets.length, 2); sockets[1].open(); assert.deepEqual(sockets[1].sent[0].symbols, ['EURUSD.pro']);
  visibility(false); assert.equal(sockets[1].readyState, 3); t.mock.timers.tick(60000); assert.equal(sockets.length, 2);
  visibility(true); await settle(); assert.equal(sockets.length, 3); unsubscribe(); assert.equal(sockets[2].readyState, 3);
});
test('unacknowledged/rejected candle channels poll latest three bars every three seconds and stop on acknowledgment/dismissal', async t => {
  const original = fetch; setPublicBrokerContext(publicBrokerFixture());
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1800000000000 } as any);
  const requests: string[] = [];
  globalThis.fetch = (async url => { const path = String(url); requests.push(path); return new Response(JSON.stringify(path.endsWith('/instruments') ? [{ symbol: 'EURUSD.pro.a' }] : path.includes('/candles/') ? { symbol: 'EURUSD.pro.a', timeframe: 'M1', candles: [{ time: 1799999940, open: 1, high: 2, low: .5, close: 1.5, volume: 10, closed: true }] } : [])); }) as typeof fetch;
  const sockets: FakeSocket[] = [];
  const service = new PublicMarketSocketService({ initialActive: true, isGuest: () => true, subscribeGuest: () => () => {}, subscribeVisibility: () => () => {}, openSocket: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket as unknown as WebSocket; } });
  t.after(() => { service.dispose(); t.mock.timers.reset(); globalThis.fetch = original; setPublicBrokerContext(null); });
  const bars: any[] = []; const unsubscribe = service.subscribeCandle('EURUSD.pro.a', 'M1', bar => bars.push(bar)); await settle();
  assert.equal(sockets[0].url, 'wss://services.example.com/ws/v2'); sockets[0].open();
  assert.deepEqual(sockets[0].sent[0], { action: 'subscribe', channel: 'candles.EURUSD.pro.a.M1', channels: ['candles.EURUSD.pro.a.M1'] });
  t.mock.timers.tick(3000); await settle(); assert.equal(bars.length, 1); assert.equal(bars[0].closed, true); assert.ok(requests.at(-1)?.endsWith('limit=3'));
  t.mock.timers.tick(3000); await settle(); assert.equal(bars.length, 2);
  sockets[0].message({ type: 'subscribed', channel: 'candles.EURUSD.pro.a.M1' }); t.mock.timers.tick(3000); await settle(); assert.equal(bars.length, 2);
  sockets[0].message({ channel: 'candles.EURUSD.pro.a.M1', data: { time: 1800000000, open: 1, high: 2, low: .5, close: 1.7, volume: 12, closed: false } }); assert.equal(bars.length, 3);
  sockets[0].message({ channel: 'candles.EURUSD.M1', data: { time: 1800000000, open: 1, high: 2, low: .5, close: 1.7, volume: 12 } }); assert.equal(bars.length, 3);
  sockets[0].message({ type: 'error', channel: 'candles.EURUSD.pro.a.M1' }); await settle(); assert.equal(bars.length, 4);
  unsubscribe(); const count = requests.length; t.mock.timers.tick(30000); await settle(); assert.equal(requests.length, count);
});

test('duplicate listeners and changing symbol demand reuse one quote connection', async t => {
  const { sockets, service } = quoteHarness(t);
  const first: any[] = []; const second: any[] = [];
  const stopFirst = service.subscribeToSymbol('EURUSD.pro', tick => first.push(tick));
  const stopSecond = service.subscribeToSymbol('EURUSD.PRO', tick => second.push(tick));
  await settle(); assert.equal(sockets.length, 1); const socket = sockets[0]; socket.open();
  socket.message({ symbol: 'EURUSD.pro', bid: 1, ask: 1.1, time_ms: 1800000000000 });
  assert.equal(first.length, 1); assert.equal(second.length, 1);
  const stopThird = service.subscribeToSymbol('EURUSD.pro', () => {});
  stopFirst(); stopThird(); await settle();
  assert.equal(sockets.length, 1); assert.equal(socket.readyState, 1);
  assert.equal(socket.sent.length, 1, 'same-symbol listeners must not resend subscriptions');
  const stopGbp = service.subscribeToSymbol('GBPUSD.pro', () => {});
  assert.deepEqual(socket.sent.at(-1), { type: 'subscribe', symbols: ['GBPUSD.pro'] });
  socket.message({ symbol: 'GBPUSD.pro', bid: 1.3, ask: 1.4, tradable: true, stale: false });
  stopGbp(); assert.deepEqual(socket.sent.at(-1), { type: 'unsubscribe', symbols: ['GBPUSD.pro'] });
  assert.equal(useTradingState.getState().quotes['GBPUSD.PRO'].bid, 1.3);
  assert.equal(useTradingState.getState().quotes['GBPUSD.PRO'].tradable, false);
  assert.equal(sockets.length, 1); assert.equal(socket.readyState, 1);
  socket.message({ symbol: 'EURUSD.pro', bid: 1.2, ask: 1.3, time_ms: 1800000001000 });
  assert.equal(second.length, 2);
  stopSecond(); assert.equal(socket.readyState, 3);
});

test('opening and closing candle listeners leaves the quote transport connected', async t => {
  const { sockets, service } = quoteHarness(t);
  service.subscribeToSymbol('EURUSD.pro', () => {}); await settle(); sockets[0].open();
  const stopCandle = service.subscribeCandle('EURUSD.pro', 'M1', () => {});
  assert.equal(sockets.length, 2); sockets[1].open();
  const stopDuplicate = service.subscribeCandle('EURUSD.pro', 'M1', () => {});
  stopDuplicate(); assert.equal(sockets.length, 2); assert.equal(sockets[1].readyState, 1);
  assert.equal(sockets[1].sent.length, 1);
  stopCandle(); assert.equal(sockets[1].readyState, 3);
  assert.equal(sockets[0].readyState, 1); assert.equal(sockets[0].sent.length, 1);
  t.mock.timers.tick(3000); assert.equal(sockets[0].sent.at(-1).type, 'ping');
});

test('reconnect retains the newest price without replaying the catalog snapshot or advancing freshness', async t => {
  const { sockets, service } = quoteHarness(t, [{ symbol: 'EURUSD.pro', bid: 1, ask: 1.1, time_ms: 1799999999000 }]);
  const ticks: any[] = []; service.subscribeToSymbol('EURUSD.pro', tick => ticks.push(tick)); await settle(); sockets[0].open();
  assert.equal(ticks.length, 1);
  sockets[0].message({ symbol: 'EURUSD.pro', bid: 1.2, ask: 1.3, time_ms: 1800000000000, stale: false, tradable: true });
  const live = useTradingState.getState().quotes['EURUSD.PRO'];
  sockets[0].close(); t.mock.timers.tick(750); await settle(); sockets[1].open();
  assert.equal(getPublicMarketStatus(), 'reconnecting');
  const retained = useTradingState.getState().quotes['EURUSD.PRO'];
  assert.equal(ticks.length, 2); assert.equal(retained.bid, 1.2); assert.equal(retained.ask, 1.3);
  assert.equal(retained.lastReceivedAt, live.lastReceivedAt); assert.equal(retained.feedTickAt, live.feedTickAt);
  assert.equal(retained.stale, true); assert.equal(retained.tradable, false);
  sockets[1].message({ symbol: 'EURUSD.pro', bid: 1.1, ask: 1.2, time_ms: 1799999999999 });
  sockets[1].message({ symbol: 'EURUSD.pro', bid: 2, ask: 1, time_ms: 1800000001000 });
  sockets[1].message({ symbol: 'EURUSD.pro', has_quote: false });
  assert.equal(ticks.length, 2); assert.equal(useTradingState.getState().quotes['EURUSD.PRO'].bid, 1.2);
  sockets[1].message({ symbol: 'EURUSD.pro', bid: 1.4, ask: 1.5, time_ms: 1800000001000, stale: false, tradable: true, degraded: false });
  const fresh = useTradingState.getState().quotes['EURUSD.PRO'];
  assert.equal(ticks.length, 3); assert.equal(fresh.bid, 1.4); assert.equal(fresh.tradable, true); assert.equal(fresh.stale, false);
});

test('a socket construction failure during new demand recovers without leaking partial transports', async t => {
  let failCandleOnce = true;
  const { sockets, service } = quoteHarness(t, [], url => {
    if (url.endsWith('/ws/v2') && failCandleOnce) { failCandleOnce = false; throw new Error('temporary native socket failure'); }
  });
  service.subscribeToSymbol('EURUSD.pro', () => {}); await settle(); sockets[0].open();
  assert.doesNotThrow(() => service.subscribeCandle('EURUSD.pro', 'M1', () => {}));
  assert.equal(sockets[0].readyState, 3);
  t.mock.timers.tick(750); await settle();
  assert.equal(sockets.length, 3); assert.ok(sockets[2].url.endsWith('/ws/v2'));
  sockets[1].open(); sockets[2].open();
  assert.deepEqual(sockets[1].sent[0].symbols, ['EURUSD.pro']);
  assert.equal(sockets[2].sent[0].channel, 'candles.EURUSD.pro.M1');
});

test('broker changes discard retained quotes and reject the old socket callback', async t => {
  const { sockets, service } = quoteHarness(t);
  const ticks: any[] = []; service.subscribeToSymbol('EURUSD.pro', tick => ticks.push(tick)); await settle(); sockets[0].open();
  sockets[0].message({ symbol: 'EURUSD.pro', bid: 1, ask: 1.1, time_ms: 1800000000000 });
  const lateMessage = sockets[0].onmessage;
  setPublicBrokerContext(publicBrokerFixture('Other'));
  assert.equal(sockets[0].readyState, 3); assert.deepEqual(useTradingState.getState().quotes, {});
  lateMessage?.({ data: JSON.stringify({ symbol: 'EURUSD.pro', bid: 9, ask: 10 }) });
  assert.equal(ticks.length, 1); assert.deepEqual(useTradingState.getState().quotes, {});
  await settle(); assert.equal(sockets.length, 2);
  assert.equal(new URL(sockets[1].url).searchParams.get('broker_id'), 'Other');
});

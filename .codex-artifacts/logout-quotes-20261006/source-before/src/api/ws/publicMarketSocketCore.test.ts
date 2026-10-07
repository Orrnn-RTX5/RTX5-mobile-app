import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicMarketSocketService } from './publicMarketSocketCore';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import { setPublicBrokerContext } from '../../state/publicBrokerContext';
import { useTradingState } from '../../state/tradingState';
import { subscribePublicQuoteInvalidation } from '../../state/publicQuoteAvailability';
class FakeSocket {
  readyState = 0; sent: any[] = []; onopen: (() => void) | null = null; onmessage: ((event: any) => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send(value: string) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: any) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
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
  sockets[0].message({ type: 'snapshot', symbols: [{ symbol: 'EURUSD.pro', has_quote: false }] }); assert.equal(Object.keys(useTradingState.getState().quotes).length, 0);
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

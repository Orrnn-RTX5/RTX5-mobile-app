import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrrnnDemoPublicMarketCatalog, getOrrnnDemoPublicCandles, getOrrnnDemoPublicQuotePayloads, isOrrnnDemoPublicMarketSelection, resolveOrrnnDemoPublicCandleTimeframe } from './orrnnDemoPublicMarket';
import { setPublicBrokerContext } from '../state/publicBrokerContext';
import { publicBrokerFixture } from '../testFixtures/publicBroker';
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
test('guest scope requires a selected verified broker and never activates for a different identity', () => {
  setPublicBrokerContext(null); assert.equal(isOrrnnDemoPublicMarketSelection({ brokerId: '', isLoggedIn: false }), false);
  setPublicBrokerContext(publicBrokerFixture());
  assert.equal(isOrrnnDemoPublicMarketSelection({ brokerId: 'Nexa', isLoggedIn: false }), true);
  assert.equal(isOrrnnDemoPublicMarketSelection({ brokerId: 'nexa', isLoggedIn: false }), false);
  assert.equal(isOrrnnDemoPublicMarketSelection({ brokerId: 'Nexa', isLoggedIn: true }), false);
  setPublicBrokerContext(null);
});
test('catalog joins wrappers and exact symbols with snapshots under anonymous request policy', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  setPublicBrokerContext(publicBrokerFixture());
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), init });
    return String(url).endsWith('/instruments') ? json({ data: { instruments: [{ symbol: 'EURUSD.pro', digits: 5, tick_size: .00001 }, { symbol: 'DISABLED', enabled: false }] } })
      : json({ quotes: [{ symbol: 'EURUSD.pro', has_quote: false }, { symbol: 'UNAUTHORIZED', bid: 2, ask: 3 }] });
  }) as typeof fetch;
  const [first, second] = await Promise.all([getOrrnnDemoPublicMarketCatalog(), getOrrnnDemoPublicMarketCatalog()]);
  assert.strictEqual(first, second); assert.equal(requests.length, 2); assert.deepEqual(first.symbols, ['EURUSD.pro']);
  assert.equal(first.instruments[0].digits, 5); assert.equal(first.quotes.length, 1); assert.equal(first.quotes[0].has_quote, false);
  for (const { init } of requests) {
    const headers = new Headers(init?.headers); assert.equal(headers.get('X-Broker-ID'), 'Nexa');
    assert.equal(headers.has('Authorization'), false); assert.equal(headers.has('X-API-Key'), false); assert.equal(init?.credentials, 'omit');
  }
});
test('candle history preserves provider times/finality, sorts buckets, and validates the complete selection', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  setPublicBrokerContext(publicBrokerFixture());
  let mismatch = false; const requests: string[] = [];
  globalThis.fetch = (async url => {
    const path = String(url); requests.push(path);
    if (path.endsWith('/instruments')) return json([{ symbol: 'EURUSD.pro' }]);
    if (path.endsWith('/quotes')) return json({ data: [] });
    return json({ symbol: mismatch ? 'OTHER' : 'EURUSD.pro', timeframe: 'M1', candles: [{ time: 160, closed: true }, { time: 100, closed: false }, { time: 160, closed: true, volume: 12 }] });
  }) as typeof fetch;
  const bars = await getOrrnnDemoPublicCandles('EURUSD.PRO', 'M1', 3);
  assert.equal(bars.symbol, 'EURUSD.pro'); assert.deepEqual(bars.candles, [{ time: 100, closed: false }, { time: 160, closed: true, volume: 12 }]);
  assert.ok(requests.some(url => url.includes('/candles/EURUSD.pro?timeframe=M1&limit=3')));
  await assert.rejects(getOrrnnDemoPublicCandles('UNKNOWN', 'M1'), /unavailable/);
  mismatch = true; await assert.rejects(getOrrnnDemoPublicCandles('EURUSD.pro', 'M1'), /mismatch/);
  assert.equal(resolveOrrnnDemoPublicCandleTimeframe('W1'), null); assert.equal(resolveOrrnnDemoPublicCandleTimeframe('MN'), null);
});
test('snapshot availability rows reach the decoder without manufacturing zero prices', () => {
  const unavailable = { symbol: 'EURUSD', has_quote: false, market_state: 'no_quote' };
  assert.deepEqual(getOrrnnDemoPublicQuotePayloads({ type: 'snapshot', symbols: [unavailable] }), [unavailable]);
  const quote = { symbol: 'EURUSD', bid: 1, ask: 2 };
  assert.deepEqual(getOrrnnDemoPublicQuotePayloads({ type: 'ticks', ticks: [quote] }), [quote]);
  assert.deepEqual(getOrrnnDemoPublicQuotePayloads(quote), [quote]);
});
test('a broker switch rejects stale in-flight catalog responses', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  setPublicBrokerContext(publicBrokerFixture());
  globalThis.fetch = (async url => { await gate; return String(url).endsWith('/instruments') ? json([{ symbol: 'EURUSD' }]) : json([]); }) as typeof fetch;
  const pending = getOrrnnDemoPublicMarketCatalog(); setPublicBrokerContext(publicBrokerFixture('Other')); release();
  await assert.rejects(pending, /changed/);
});


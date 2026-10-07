import { setPublicBrokerContext } from '../../../state/publicBrokerContext';
import { publicBrokerFixture } from '../../../testFixtures/publicBroker';
import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';

import {
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
  resetOrrnnDemoPublicMarketCatalogCache,
} from '../../../api/orrnnDemoPublicMarket';
import {
  ORRNN_DEMO_PUBLIC_CANDLE_GC_MS,
  getOrrnnDemoPublicCandleQueryKey,
  getOrrnnDemoPublicCandleQueryOptions,
  resolveOrrnnDemoPublicCandleSelection,
} from './orrnnDemoPublicCandles';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

test('public candle query keys isolate the anonymous namespace, symbol, and timeframe', () => {
  assert.deepEqual(
    getOrrnnDemoPublicCandleQueryKey('eurusd', '1m'),
    ['candles', ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE, 'history', 'eurusd', 'M1'],
  );
  assert.deepEqual(
    getOrrnnDemoPublicCandleQueryKey('GBPUSD', 'H1'),
    ['candles', ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE, 'history', 'GBPUSD', 'H1'],
  );
  assert.deepEqual(
    resolveOrrnnDemoPublicCandleSelection(' xauusd ', '4h'),
    { symbol: 'xauusd', timeframe: 'H4' },
  );
  assert.equal(resolveOrrnnDemoPublicCandleSelection('EURUSD', 'W1'), null);
});

test('public candle histories remain cached for the app session after their chart unmounts', () => {
  const options = getOrrnnDemoPublicCandleQueryOptions('EURUSD', 'M1');

  assert.equal(ORRNN_DEMO_PUBLIC_CANDLE_GC_MS, Number.POSITIVE_INFINITY);
  assert.equal(options.gcTime, Number.POSITIVE_INFINITY);
});

test('navigation prefetch and the chart query join one public REST request and reuse its cache', async (t) => {
  setPublicBrokerContext(publicBrokerFixture());
  resetOrrnnDemoPublicMarketCatalogCache();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let releaseCandleResponse = () => {};
  const candleResponseGate = new Promise<void>((resolve) => {
    releaseCandleResponse = resolve;
  });

  globalThis.fetch = (async (input, init) => {
    const requestUrl = String(input);
    requests.push({ url: requestUrl, init });
    if (requestUrl.endsWith('/instruments')) {
      return jsonResponse([{ symbol: 'EURUSD', enabled: true }]);
    }

    if (requestUrl.endsWith('/quotes')) return jsonResponse([]);
    await candleResponseGate;
    return jsonResponse({
      symbol: 'EURUSD',
      timeframe: 'M1',
      candles: [{
        time: 1_700_000_000,
        open: 1.1,
        high: 1.2,
        low: 1,
        close: 1.15,
        volume: 10,
        closed: true,
      }],
    });
  }) as typeof fetch;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  t.after(() => {
    setPublicBrokerContext(null);
    queryClient.clear();
    globalThis.fetch = originalFetch;
    resetOrrnnDemoPublicMarketCatalogCache();
  });

  const options = {
    ...getOrrnnDemoPublicCandleQueryOptions('EURUSD', 'M1'),
    retry: false as const,
  };
  const navigationWarmup = queryClient.fetchQuery(options);
  const chartMount = queryClient.fetchQuery(options);

  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(requests.filter((request) => request.url.endsWith('/instruments')).length, 1);
  assert.equal(requests.filter((request) => request.url.includes('/candles/EURUSD?')).length, 1);
  assert.match(
    requests.find((request) => request.url.includes('/candles/EURUSD?'))?.url ?? '',
    /[?&]limit=120(?:&|$)/,
  );

  releaseCandleResponse();
  const [prefetchedCandles, mountedCandles] = await Promise.all([
    navigationWarmup,
    chartMount,
  ]);

  assert.equal(prefetchedCandles.length, 1);
  assert.equal(mountedCandles.length, 1);
  assert.equal(prefetchedCandles[0]?.source, 'rest');
  assert.strictEqual(prefetchedCandles, mountedCandles);
  assert.strictEqual(
    queryClient.getQueryData(getOrrnnDemoPublicCandleQueryKey('EURUSD', 'M1')),
    prefetchedCandles,
  );
  for (const request of requests) {
    assert.equal(new Headers(request.init?.headers).has('authorization'), false);
  }
});


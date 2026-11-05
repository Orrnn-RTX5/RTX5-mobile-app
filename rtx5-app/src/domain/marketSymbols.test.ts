import assert from 'node:assert/strict';
import test from 'node:test';
import { extractMarketSymbols } from './marketSymbols';

test('broker catalog excludes disabled instruments from market selections', () => {
  assert.deepEqual(extractMarketSymbols({ instruments: [
    { symbol: 'XAUAUD', enabled: false },
    { symbol: 'XAUUSD', enabled: true },
    { symbol: 'EURUSD', enabled: 0 },
    { symbol: 'GBPUSD', enabled: 'false' },
    { symbol: 'XAUUSD.pro', enabled: true },
  ] }), ['XAUUSD', 'XAUUSD.pro']);
});

test('catalog formats without enablement metadata preserve their exact symbols', () => {
  assert.deepEqual(extractMarketSymbols({ data: { symbols: ['EURUSD', 'EURUSD.pro', 'EURUSD'] } }),
    ['EURUSD', 'EURUSD.pro']);
  assert.deepEqual(extractMarketSymbols([]), []);
});

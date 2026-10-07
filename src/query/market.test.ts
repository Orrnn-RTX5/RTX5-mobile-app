import assert from 'node:assert/strict';
import test from 'node:test';

import { extractMarketSymbols } from '../domain/marketSymbols';

test('extractMarketSymbols returns only symbols present in the instruments API payload', () => {
  assert.deepEqual(
    extractMarketSymbols({
      instruments: [
        { symbol: 'EURUSD' },
        { symbol: ' XAUUSDm ' },
        'BTCUSD',
        { name: 'missing-symbol-field' },
        { symbol: '' },
        null,
        'BTCUSD',
      ],
    }),
    ['EURUSD', 'XAUUSDm', 'BTCUSD'],
  );
});

test('extractMarketSymbols reads every symbol from nested and paginated instrument payloads', () => {
  assert.deepEqual(
    extractMarketSymbols({
      data: {
        items: [
          { symbol: 'EURUSD' },
          { Symbol: 'GBPUSD.c' },
        ],
      },
      result: {
        records: [
          { instrumentSymbol: 'XAUUSDm' },
          { code: 'BTCUSD' },
        ],
      },
      symbols: ['ETHUSD', { ticker: 'US30' }],
      metadata: { total: 6 },
    }),
    ['ETHUSD', 'US30', 'EURUSD', 'GBPUSD.c', 'XAUUSDm', 'BTCUSD'],
  );
});

test('extractMarketSymbols preserves exact broker symbols with distinct suffixes', () => {
  assert.deepEqual(
    extractMarketSymbols({
      instruments: [
        { symbol: 'GBPUSD' },
        { symbol: 'GBPUSD.c' },
        { symbol: 'GBPUSDm' },
        { symbol: 'GBPUSD' },
      ],
    }),
    ['GBPUSD', 'GBPUSD.c', 'GBPUSDm'],
  );
});

test('extractMarketSymbols does not inject default chart symbols when API payload is empty', () => {
  assert.deepEqual(extractMarketSymbols({ instruments: [] }), []);
  assert.deepEqual(extractMarketSymbols({}), []);
  assert.deepEqual(extractMarketSymbols(null), []);
});

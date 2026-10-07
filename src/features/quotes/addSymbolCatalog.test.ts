import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ADD_SYMBOL_CATALOG, buildAddSymbolCatalog } from './addSymbolCatalog';

test('buildAddSymbolCatalog uses broker symbols when the instrument catalog is available', () => {
  assert.deepEqual(
    buildAddSymbolCatalog(['EURUSD.c', 'XAUUSDm'], ['BTCUSD']),
    ['EURUSD.c', 'XAUUSDm'],
  );
});

test('buildAddSymbolCatalog appends fallback choices when the broker catalog only echoes the watchlist', () => {
  const catalog = buildAddSymbolCatalog(['GBPUSD', 'XAUUSD', 'BTCUSD'], ['GBPUSD', 'XAUUSD', 'BTCUSD']);

  assert.deepEqual(catalog.slice(0, 3), ['GBPUSD', 'XAUUSD', 'BTCUSD']);
  assert.ok(catalog.includes('EURUSD'));
  assert.ok(catalog.includes('USDJPY'));
  assert.ok(catalog.includes('WTIUSD'));
});

test('buildAddSymbolCatalog falls back to existing and curated symbols when broker catalog is empty', () => {
  const catalog = buildAddSymbolCatalog([], ['GBPUSD.c']);

  assert.equal(catalog[0], 'GBPUSD.c');
  assert.ok(catalog.includes('EURUSD'));
  assert.ok(catalog.includes('XAUUSD'));
  assert.ok(catalog.includes('BTCUSD'));
  assert.ok(catalog.includes('US30'));
  assert.ok(catalog.includes('WTIUSD'));
  assert.ok(catalog.length >= DEFAULT_ADD_SYMBOL_CATALOG.length);
});

test('buildAddSymbolCatalog trims symbols and removes duplicate casings', () => {
  assert.deepEqual(
    buildAddSymbolCatalog(null, [' eurusd ', 'EURUSD', '']),
    DEFAULT_ADD_SYMBOL_CATALOG.includes('EURUSD')
      ? ['eurusd', ...DEFAULT_ADD_SYMBOL_CATALOG.filter((symbol) => symbol !== 'EURUSD')]
      : ['eurusd', ...DEFAULT_ADD_SYMBOL_CATALOG],
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultQuoteWatchlist,
  isMarketSymbolCatalogScopedToWatchlist,
  resolveQuoteFeedSymbols,
} from './quoteWatchlistDefaults';

test('resolveQuoteFeedSymbols never guesses suffixed broker instruments from base symbols', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(['BTCUSD', 'GBPUSD', 'XAUUSD'], ['BTCUSDm', 'GBPUSD.c', 'XAUUSDm']),
    ['BTCUSD', 'GBPUSD', 'XAUUSD'],
  );
});

test('isMarketSymbolCatalogScopedToWatchlist detects broker catalogs that only echo selected symbols', () => {
  assert.equal(
    isMarketSymbolCatalogScopedToWatchlist(['GBPUSD', 'XAUUSD', 'BTCUSD'], ['GBPUSD', 'XAUUSD', 'BTCUSD']),
    true,
  );
  assert.equal(
    isMarketSymbolCatalogScopedToWatchlist(['GBPUSD', 'XAUUSD', 'BTCUSD'], ['GBPUSD', 'XAUUSD', 'BTCUSD', 'WTIUSD']),
    true,
  );
  assert.equal(
    isMarketSymbolCatalogScopedToWatchlist(['GBPUSD', 'XAUUSD', 'BTCUSD', 'WTIUSD'], ['GBPUSD', 'XAUUSD', 'BTCUSD']),
    false,
  );
});

test('resolveQuoteFeedSymbols preserves requested broker variants that already exist', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(
      ['EURUSD.X1782', 'EURUSD.Y1783', 'BTCUSD.P'],
      ['EURUSD', 'EURUSD.X1782', 'EURUSD.Y1783', 'BTCUSD.P'],
    ),
    ['EURUSD.X1782', 'EURUSD.Y1783', 'BTCUSD.P'],
  );
});

test('resolveQuoteFeedSymbols matches broker variants by feed key when casing differs', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(
      ['eurusd.x1782', 'btcusd.p'],
      ['EURUSD', 'EURUSD.X1782', 'BTCUSD.P'],
    ),
    ['EURUSD.X1782', 'BTCUSD.P'],
  );
});

test('resolveQuoteFeedSymbols normalizes persisted lowercase symbols before market catalog loads', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(['xauusd', 'btcusd', 'gbpusd'], []),
    ['XAUUSD', 'BTCUSD', 'GBPUSD'],
  );
});

test('buildDefaultQuoteWatchlist keeps only exact curated identities available from the broker', () => {
  assert.deepEqual(
    buildDefaultQuoteWatchlist(['BTCUSDm', 'XAUUSDm', 'GBPUSD.c', 'EURUSD', 'USDJPY']),
    ['EURUSD', 'USDJPY'],
  );
});

test('resolveQuoteFeedSymbols prefers the canonical-cased symbol when a duplicate exists', () => {
  // Repro of the BTCUSD bug: broker_3's catalog exposed both a stale lowercase
  // "btcusd" (0 ticks) and the canonical "BTCUSD" (live ticks). We must
  // subscribe to the canonical one regardless of which row came first.
  assert.deepEqual(
    resolveQuoteFeedSymbols(['BTCUSD'], ['btcusd', 'BTCUSD']),
    ['BTCUSD'],
  );
  assert.deepEqual(
    resolveQuoteFeedSymbols(['BTCUSD'], ['BTCUSD', 'btcusd']),
    ['BTCUSD'],
  );
});

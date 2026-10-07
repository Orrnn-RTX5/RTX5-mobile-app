import test from 'node:test';
import assert from 'node:assert/strict';

import { isCryptoSymbol, normalizeQuoteSymbolKey, normalizeSymbol } from './symbols';

test('normalizeQuoteSymbolKey preserves broker feed suffixes for live quote matching', () => {
  assert.equal(normalizeQuoteSymbolKey('eurusd.x1782'), 'EURUSD.X1782');
  assert.equal(normalizeQuoteSymbolKey(' GBP/USD_pro '), 'GBPUSD_PRO');
  assert.equal(normalizeQuoteSymbolKey('BTCUSD.P'), 'BTCUSD.P');
});

test('normalizeSymbol keeps live backend symbols unchanged', () => {
  assert.equal(normalizeSymbol('GBPUSD'), 'GBPUSD');
  assert.equal(normalizeSymbol('btcusd'), 'BTCUSD');
  assert.equal(normalizeSymbol('XAUUSD'), 'XAUUSD');
  assert.equal(normalizeSymbol('GBP/USD'), 'GBPUSD');
});

test('normalizeSymbol preserves broker suffixes as exact instrument identity', () => {
  assert.equal(normalizeSymbol('BTCUSDm'), 'BTCUSDM');
  assert.equal(normalizeSymbol('xauusdm'), 'XAUUSDM');
  assert.equal(normalizeSymbol('ETHUSDm'), 'ETHUSDM');
  assert.equal(normalizeSymbol(' XAU / USD m '), 'XAUUSDM');
  assert.equal(normalizeSymbol('GBPUSD.c'), 'GBPUSD.C');
  assert.equal(normalizeSymbol('GBP/USD_pro'), 'GBPUSD_PRO');
  assert.equal(normalizeSymbol('EURUSDstd'), 'EURUSDSTD');

  assert.equal(
    new Set([
      normalizeSymbol('EURUSD'),
      normalizeSymbol('EURUSD.pro'),
      normalizeSymbol('EURUSDm'),
    ]).size,
    3,
  );
});

test('isCryptoSymbol recognizes crypto pairs with broker suffixes', () => {
  assert.equal(isCryptoSymbol('BTCUSD'), true);
  assert.equal(isCryptoSymbol('btcusdm'), true);
  assert.equal(isCryptoSymbol('SOLUSDpro'), true);
  assert.equal(isCryptoSymbol('ETHUSDT'), true);
  assert.equal(isCryptoSymbol('XAUUSD'), false);
  assert.equal(isCryptoSymbol('EURUSD'), false);
});

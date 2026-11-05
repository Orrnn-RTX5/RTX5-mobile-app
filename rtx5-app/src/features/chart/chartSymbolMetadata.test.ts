import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CHART_SYMBOLS,
  resolveChartSymbolCategory,
  resolveChartSymbolFullName,
  resolveChartSymbolKey,
} from './chartSymbolMetadata';

test('default chart symbols provide a stable picker fallback', () => {
  assert.ok(DEFAULT_CHART_SYMBOLS.length >= 10);
  assert.equal(new Set(DEFAULT_CHART_SYMBOLS).size, DEFAULT_CHART_SYMBOLS.length);
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('EURUSD'));
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('GBPUSD'));
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('XAUUSD'));
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('BTCUSD'));
});

test('chart symbol metadata resolves pair names and broker suffixes', () => {
  assert.equal(resolveChartSymbolKey('GBPUSD.c'), 'GBPUSD');
  assert.equal(resolveChartSymbolKey('XAUUSDm'), 'XAUUSD');
  assert.equal(resolveChartSymbolKey('BTCUSDpro'), 'BTCUSD');
  assert.equal(resolveChartSymbolFullName('GBPUSD.c'), 'British Pound / US Dollar');
  assert.equal(resolveChartSymbolFullName('EURJPY'), 'Euro / Japanese Yen');
  assert.equal(resolveChartSymbolFullName('XAGUSDm'), 'Silver / US Dollar');
});

test('chart symbol metadata resolves header categories', () => {
  assert.equal(resolveChartSymbolCategory('EURUSD'), 'FOREX');
  assert.equal(resolveChartSymbolCategory('GBPUSD.c'), 'FOREX');
  assert.equal(resolveChartSymbolCategory('XAUUSDm'), 'METAL');
  assert.equal(resolveChartSymbolCategory('BTCUSDpro'), 'CRYPTO');
  assert.equal(resolveChartSymbolCategory('SOLUSDpro'), 'CRYPTO');
  assert.equal(resolveChartSymbolCategory('ABCDEF'), null);
});

test('chart symbol metadata classifies exotic FX, indices, energies, commodities and non-USD metals', () => {
  // Exotic / minor FX pairs (currencies beyond the original eight).
  for (const pair of ['USDZAR', 'USDMXN', 'USDSEK', 'USDNOK', 'USDSGD', 'USDHKD', 'USDPLN', 'USDHUF', 'USDCZK', 'USDCNH', 'USDTRY', 'USDINR', 'USDBRL', 'USDRUB', 'USDILS', 'USDDKK', 'EURZAR', 'EURSEK', 'EURNOK']) {
    assert.equal(resolveChartSymbolCategory(pair), 'FOREX', pair);
  }

  // Indices.
  for (const index of ['SPX500', 'US30', 'NAS100', 'UK100', 'GER40', 'FRA40', 'JPN225', 'AUS200', 'HK50']) {
    assert.equal(resolveChartSymbolCategory(index), 'INDEX', index);
  }

  // Energies.
  for (const energy of ['USOIL', 'UKOIL', 'NATGAS']) {
    assert.equal(resolveChartSymbolCategory(energy), 'ENERGY', energy);
  }

  // Commodities.
  assert.equal(resolveChartSymbolCategory('COPPER'), 'COMMODITY');

  // Metals quoted in a non-USD currency (and long-form aliases).
  assert.equal(resolveChartSymbolCategory('XAUEUR'), 'METAL');
  assert.equal(resolveChartSymbolCategory('GOLD'), 'METAL');

  // Metals must win over the FX heuristic even when broker-suffixed.
  assert.equal(resolveChartSymbolCategory('XAGUSDm'), 'METAL');
});

test('unknown six-letter pairs still get a readable pair subtitle', () => {
  assert.equal(resolveChartSymbolFullName('ABCDEF'), 'ABC / DEF');
});

test('extended instruments resolve readable subtitles', () => {
  assert.equal(resolveChartSymbolFullName('USDZAR'), 'US Dollar / South African Rand');
  assert.equal(resolveChartSymbolFullName('SPX500'), 'S&P 500 Index');
  assert.equal(resolveChartSymbolFullName('USOIL'), 'US Crude Oil (WTI)');
  assert.equal(resolveChartSymbolFullName('XAUEUR'), 'Gold / Euro');
  assert.equal(resolveChartSymbolFullName('COPPER'), 'Copper');
});

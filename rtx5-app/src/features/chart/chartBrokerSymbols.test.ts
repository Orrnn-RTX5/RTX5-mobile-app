import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAvailableChartSymbols, resolveBrokerChartSymbol } from './chartBrokerSymbols';

test('ORRNN catalog excludes an unavailable saved pair and built-in extras', () => {
  const catalog = ['BTCUSD', 'EURUSD', 'XAUUSD'];
  assert.deepEqual(buildAvailableChartSymbols('XAUAUD', catalog), catalog);
  assert.equal(resolveBrokerChartSymbol('XAUAUD', catalog), 'XAUUSD');
});

test('an enabled selection stays first and is preserved across catalog refreshes', () => {
  assert.deepEqual(buildAvailableChartSymbols('EURUSD', ['BTCUSD', 'EURUSD', 'XAUUSD']),
    ['EURUSD', 'BTCUSD', 'XAUUSD']);
  assert.equal(resolveBrokerChartSymbol('EURUSD', ['XAUUSD', 'EURUSD']), null);
});

test('catalog loading and empty catalogs do not switch symbols or invent availability', () => {
  assert.ok(buildAvailableChartSymbols('XAUAUD').includes('XAUAUD'));
  assert.equal(resolveBrokerChartSymbol('XAUAUD'), null);
  assert.deepEqual(buildAvailableChartSymbols('XAUAUD', []), []);
  assert.equal(resolveBrokerChartSymbol('XAUAUD', []), null);
});

test('symbols deduplicate case-insensitively while preserving broker suffixes', () => {
  assert.deepEqual(buildAvailableChartSymbols(' eurusd ', ['eurusd', ' EURUSD ', '', 'EURUSD.pro']),
    ['EURUSD', 'EURUSD.pro']);
  assert.equal(resolveBrokerChartSymbol('eurusd', ['EURUSD']), 'EURUSD');
  assert.equal(resolveBrokerChartSymbol('XAUUSD', ['XAUUSD.pro']), 'XAUUSD.pro');
});

test('recovery chooses an actual catalog symbol for brokers without gold', () => {
  assert.equal(resolveBrokerChartSymbol('XAUAUD', ['BTCUSD', 'EURUSD']), 'EURUSD');
  assert.equal(resolveBrokerChartSymbol('XAUAUD', ['US30']), 'US30');
});

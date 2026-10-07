import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  findInstrumentMetaInCatalogPayload,
  getCachedInstrumentMeta,
  normalizeInstrumentMetaPayload,
  primeInstrumentMetaCacheFromCatalogPayload,
} from './instrumentMeta.ts';
import { derivePointFromDigits } from '../utils/pricePoint';

test('normalizeInstrumentMetaPayload reads backend digit fields', () => {
  assert.deepEqual(
    normalizeInstrumentMetaPayload({ Symbol: 'BTCUSD', Digits: '2' }),
    { Symbol: 'BTCUSD', Digits: '2', symbol: 'BTCUSD', digits: 2, point: 0.01, stopsLevel: '0' },
  );

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'ETHUSD', pricePrecision: 4 }).digits,
    4,
  );

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'GBPUSD', symbol_digits: '5' }).digits,
    5,
  );

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'GBPUSD', quoteDigits: '5' }).digits,
    5,
  );
});

test('normalizeInstrumentMetaPayload derives digits from backend point and tick size metadata', () => {
  assert.deepEqual(
    normalizeInstrumentMetaPayload({ symbol: 'XAUUSD', point: '0.01' }),
    { symbol: 'XAUUSD', point: 0.01, tickSize: 0.01, digits: 2, stopsLevel: '0' },
  );

  assert.deepEqual(
    normalizeInstrumentMetaPayload({ symbol: 'EURUSD', tick_size: '0.00001' }),
    { symbol: 'EURUSD', tick_size: '0.00001', tickSize: 0.00001, digits: 5, stopsLevel: '0' },
  );

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'BTCUSD', digits: 2, tickSize: 0.00000001 }).digits,
    2,
  );
});

test('normalizeInstrumentMetaPayload maps backend tick value and contract size aliases', () => {
  assert.deepEqual(
    normalizeInstrumentMetaPayload({
      symbol: 'BTCUSD',
      tick_value: '1.25',
      contract_size: '100',
      tick_size: '0.01',
    }),
    {
      symbol: 'BTCUSD',
      tick_value: '1.25',
      contract_size: '100',
      tick_size: '0.01',
      tickSize: 0.01,
      tickValue: 1.25,
      contractSize: 100,
      digits: 2,
      stopsLevel: '0',
    },
  );
});

test('normalizeInstrumentMetaPayload maps specification screen broker aliases', () => {
  const meta = normalizeInstrumentMetaPayload({
    symbol: 'BTCUSDm',
    volume_min: '0.01',
    volume_max: '50',
    volume_step: '0.01',
    trade_stops_level: 12,
    swap_long: '-3.5',
    swap_short: '1.25',
    margin_initial: '2',
    margin_maintenance: '1',
    currency_base: 'BTC',
    currency_profit: 'USD',
    spread_mode: 'Floating',
    spread: '1.2',
    commission: '7',
    trade_calc_mode: 'CFD',
    chart_mode: 'By Bid',
  });

  assert.equal(meta.minVolume, 0.01);
  assert.equal(meta.maxVolume, 50);
  assert.equal(meta.stepVolume, 0.01);
  assert.equal(meta.stopsLevel, '12');
  assert.equal(meta.swapLong, -3.5);
  assert.equal(meta.swapShort, 1.25);
  assert.equal(meta.marginInitial, 2);
  assert.equal(meta.marginMaintenance, 1);
  assert.equal(meta.baseCurrency, 'BTC');
  assert.equal(meta.profitCurrency, 'USD');
  assert.equal(meta.spreadMode, 'Floating');
  assert.equal(meta.spread, 1.2);
  assert.equal(meta.commission, 7);
  assert.equal(meta.calculation, 'CFD');
  assert.equal(meta.chartMode, 'By Bid');
});

test('instrument catalog payload primes metadata only for the exact broker instrument', () => {
  primeInstrumentMetaCacheFromCatalogPayload({
    instruments: [
      { symbol: 'BTCUSDm', digits: 2 },
    ],
  });

  assert.equal(getCachedInstrumentMeta('BTCUSDm')?.digits, 2);
  assert.equal(getCachedInstrumentMeta('btcusdm')?.digits, 2);
  assert.equal(getCachedInstrumentMeta('BTCUSD'), undefined);
});

test('instrument catalog lookup resolves exact identity keys without suffix aliasing', () => {
  const payload = {
    data: {
      instruments: [
        { symbol: 'ETHUSDm', digits: 2, volume_min: '0.05' },
        { symbol: 'BTCUSDm', digits: 2, contract_size: '1' },
      ],
    },
  };

  assert.equal(findInstrumentMetaInCatalogPayload(payload, 'BTCUSD'), undefined);
  assert.equal(findInstrumentMetaInCatalogPayload(payload, 'btcusdm')?.symbol, 'BTCUSDm');
  assert.equal(findInstrumentMetaInCatalogPayload(payload, 'ETHUSDm')?.minVolume, 0.05);
  assert.equal(findInstrumentMetaInCatalogPayload(payload, 'XAUUSD'), undefined);
});

// Real /instruments row from Backend Contract v3 (bare array, no point,
// stops_level, base_currency or swap_* keys).
const CONTRACT_V3_INSTRUMENTS = [{
  symbol: 'EURUSD', digits: 5, contract_size: 100000, tick_size: 0.00001, tick_value: 1, min_volume: 0.01,
  max_volume: 500, volume_step: 0.01, spread: 15, enabled: true, calc_mode: 'forex', margin_currency: 'EUR',
  profit_currency: 'USD', currency_profit: 'USD', created_at: 1789659971,
}];

test('contract v3 instrument rows derive point, stops_level and base_currency and keep swaps absent', () => {
  const meta = findInstrumentMetaInCatalogPayload(CONTRACT_V3_INSTRUMENTS, 'EURUSD');
  assert.ok(meta);
  assert.equal(meta.point, 0.00001);
  assert.equal(meta.tickSize, 0.00001);
  assert.equal(meta.digits, 5);
  assert.equal(meta.stopsLevel, '0');
  assert.equal(meta.baseCurrency, 'EUR');
  assert.equal(meta.profitCurrency, 'USD');
  assert.equal(meta.calculation, 'forex');
  assert.equal(meta.swapLong, undefined);
  assert.equal(meta.swapShort, undefined);
});

test('point uses broker digits independently of the trading tick size', () => {
  assert.equal(normalizeInstrumentMetaPayload({ symbol: 'XAUUSD', digits: 2, tick_size: 0 }).point, 0.01);
  assert.equal(normalizeInstrumentMetaPayload({ symbol: 'USDJPY', digits: 3 }).point, 0.001);
  assert.equal(derivePointFromDigits(5), 0.00001);
  const futures = normalizeInstrumentMetaPayload({ symbol: 'FUTURE', digits: 2, tick_size: 0.25 });
  assert.equal(futures.point, 0.01);
  assert.equal(futures.tickSize, 0.25);
  assert.equal(normalizeInstrumentMetaPayload({ symbol: 'FUTURE', tick_size: 0.25 }).point, undefined);
  assert.equal(normalizeInstrumentMetaPayload({ symbol: 'CUSTOM', point: 0.05, digits: 2 }).point, 0.05);
  assert.equal(derivePointFromDigits(undefined), undefined);
});

test('fetchInstrumentMeta never requests /instruments/{symbol}; it looks up the cached catalog', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/api/instruments.ts'), 'utf8');
  assert.doesNotMatch(source, /\/instruments\/\$\{/);
  assert.match(source, /apiJsonClient<unknown>\('\/instruments'\)/);
  assert.match(source, /getCachedInstrumentMeta\(symbol, cacheNamespace\)/);
});

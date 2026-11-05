import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  assertSourceOmits,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';
import { translate } from '../../src/i18n/translations.ts';

const nativeSource = readChartScreenSource();
const liveHeadersSource = (() => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/components/ChartLiveHeaders.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/components/ChartLiveHeaders.tsx'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, 'ChartLiveHeaders.tsx was not found from the test working directory');
  return readFileSync(filePath, 'utf8');
})();
const chartTapRadialMenuSource = (() => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/components/ChartTapRadialMenu.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/components/ChartTapRadialMenu.tsx'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, 'ChartTapRadialMenu.tsx was not found from the test working directory');
  return readFileSync(filePath, 'utf8');
})();
const chartRuntimeLabelSource = `${nativeSource}\n${chartTapRadialMenuSource}`;

test('LivePriceHeader subscribes to i18n and renders translated Price label', () => {
  const start = liveHeadersSource.indexOf('const LivePriceHeader');
  const end = liveHeadersSource.indexOf('const LiveQuotePairHeader');
  assert.notEqual(start, -1, 'LivePriceHeader must exist');
  assert.notEqual(end, -1, 'LiveQuotePairHeader must exist');
  const body = liveHeadersSource.slice(start, end);

  assertSourceContains(body, /const \{ t \} = useTranslation\(\)/, 'LivePriceHeader must subscribe to language changes');
  assertSourceContains(body, /const priceLabel = t\('Price'\)/, 'price label must come from the translation table');
  assertSourceContains(body, /\{priceLabel\}/, 'translated price label must be rendered');
  assertSourceOmits(body, />PRICE</, 'LivePriceHeader must not render a hardcoded PRICE literal');
});

test('ChartScreen listed static runtime labels use translation calls', () => {
  for (const key of [
    'Loading chart data...',
    'Unable to load chart',
    'Waiting for market data connection...',
    'Chart',
    'Options',
    'Drawing Tools',
    'Timeframes',
    'Select Symbol',
    'Expiration',
  ]) {
    assertSourceContains(chartRuntimeLabelSource, new RegExp(`t\\('${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`), `${key} must use t()`);
  }
});

test('Price and chart loading labels update when language changes', () => {
  assert.equal(translate('Price', 'en'), 'Price');
  assert.equal(translate('Price', 'es'), 'Precio');
  assert.equal(translate('Price', 'de'), 'Preis');
  assert.equal(translate('Loading chart data...', 'en'), 'Loading chart data...');
  assert.equal(translate('Loading chart data...', 'es'), 'Cargando datos del gráfico...');
  assert.equal(translate('Loading chart data...', 'en'), 'Loading chart data...');
});

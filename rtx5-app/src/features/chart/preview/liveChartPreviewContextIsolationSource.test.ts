import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/preview/LiveChartPreview.native.tsx'),
  'utf8',
);

test('retained preview WebView keys every data transaction by broker, symbol, and timeframe generation', () => {
  assert.match(source, /const previewDataContextKey = useMemo/);
  assert.match(source, /brokerCredentialScopeKey/);
  assert.match(source, /normalizeSymbol\(symbol\)/);
  assert.match(source, /normalizeTimeframeStrict\(timeframe\)/);
  assert.match(source, /function acceptPreviewDataContext\(dataContextKey, dataGeneration\)/);
  assert.match(source, /generation < window\._previewDataGeneration/);
  assert.match(source, /initChart\([^;]+previewDataContextKey[^;]+previewDataGeneration/);
  assert.match(source, /updateChartData\([^;]+previewDataContextKey[^;]+previewDataGeneration/);
  assert.match(source, /setPriceLines\([^;]+previewDataContextKey[^;]+previewDataGeneration/);
});

test('preview replacement compares the complete candle series and keeps the WebView mounted', () => {
  assert.match(
    source,
    /const previewDataSignature = useMemo\([\s\S]*JSON\.stringify\(\{[\s\S]*candles: previewCandles,[\s\S]*renkoBrickSize:/,
  );
  assert.match(source, /lastRenderedDataSignatureRef\.current !== previewDataSignature/);
  assert.match(source, /key=\{PREVIEW_DEV_SOURCE_KEY\}/);
  assert.doesNotMatch(source, /key=\{previewDataContextKey\}/);
});

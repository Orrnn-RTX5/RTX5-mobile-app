import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { resolvePreviewLivePriceColor } from './liveChartPreviewPriceColor';

const colors = {
  candlesUptrend: '#00A060',
  candlesDowntrend: '#E02020',
};

test('divided live-price color follows the forming candle instead of tick fallback direction', () => {
  assert.equal(resolvePreviewLivePriceColor({
    fullChartParity: true,
    latestCandle: { open: 100, close: 101 },
    fallbackDirection: 'down',
    colors,
  }), colors.candlesUptrend);
  assert.equal(resolvePreviewLivePriceColor({
    fullChartParity: true,
    latestCandle: { open: 101, close: 100 },
    fallbackDirection: 'up',
    colors,
  }), colors.candlesDowntrend);
  assert.equal(resolvePreviewLivePriceColor({
    fullChartParity: true,
    latestCandle: { open: 100, close: 100 },
    fallbackDirection: 'down',
    colors,
  }), colors.candlesUptrend);
});

test('standalone preview retains last-tick direction behavior', () => {
  assert.equal(resolvePreviewLivePriceColor({
    fullChartParity: false,
    latestCandle: { open: 100, close: 101 },
    fallbackDirection: 'down',
    colors,
  }), colors.candlesDowntrend);
});

test('trade overlays cannot override the divided live-price badge color', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/preview/LiveChartPreview.native.tsx'),
    'utf8',
  );

  assert.match(source, /const liveColor = resolvePreviewLivePriceColor\(\{/);
  assert.match(source, /lines\.push\(\{[\s\S]*color: liveColor,[\s\S]*role: 'live'/);
  assert.match(
    source,
    /setPreviewCandleCountdown\([\s\S]*\$\{JSON\.stringify\(liveColor\)\}/,
  );
  assert.doesNotMatch(source, /lines\[0\]\?\.color/);
});

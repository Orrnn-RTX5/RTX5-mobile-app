import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { shouldRetainNativeChartSurface, type PaintedChartSurfaceScope } from './nativeChartSurfaceRetention';

const painted: PaintedChartSurfaceScope = {
  symbol: 'EURUSD', timeframe: 'M1', cacheNamespace: 'account-A', generation: 1, visualShellSig: 'candles-dark',
};

test('Android keeps confirmed candles visible through each minute timeframe handoff', () => {
  for (const timeframe of ['M5', 'M15', 'M30']) {
    const selected = { ...painted, timeframe };
    assert.equal(shouldRetainNativeChartSurface('android', true, false, painted, selected), true);
    assert.equal(shouldRetainNativeChartSurface('android', true, true, painted, selected), false);
  }
});

test('initial load and changed broker, symbol, appearance, or document cannot uncover an old chart', () => {
  const selected = { ...painted, timeframe: 'M5' };
  assert.equal(shouldRetainNativeChartSurface('android', true, false, null, selected), false);
  assert.equal(shouldRetainNativeChartSurface('android', false, false, painted, selected), false);
  assert.equal(shouldRetainNativeChartSurface('ios', true, false, painted, selected), false);
  for (const patch of [
    { symbol: 'BTCUSD' }, { cacheNamespace: 'account-B' }, { generation: 2 }, { visualShellSig: 'line-light' },
  ]) {
    assert.equal(shouldRetainNativeChartSurface('android', true, false, painted, { ...selected, ...patch }), false);
  }
});

test('Android loader and empty target cannot cover or erase a confirmed timeframe surface', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'), 'utf8');
  assert.match(source, /const shouldShowChartLoadingOverlay =\s*Platform\.OS !== 'android' &&/);
  assert.match(source, /opacity: hasUsableRetainedChart \|\| retainPreviousChartSurface \? 1 : 0/);
  assert.match(source, /if \(retainPreviousChartSurface && !chartHasHistoryCandles\) \{[\s\S]*?return;[\s\S]*?if \(renderableCandles\.length === 0\)/);
  assert.match(source, /const visibleChartTimeframe = retainPreviousChartSurface[\s\S]*?\.timeframe[\s\S]*?\{visibleChartTimeframe\}/);
  assert.match(source, /pointerEvents=\{retainPreviousChartSurface \? 'none' : 'auto'\}/);
  assert.match(source, /const resetChartBridgeState = useCallback\(\(\) => \{\s*lastConfirmedChartSurfaceRef\.current = null/);
  assert.match(source, /lastConfirmedChartSurfaceRef\.current = \{\s*symbol: pending\.symbol,\s*timeframe: pending\.timeframe/);
  assert.match(source, /if \(!retainPreviousChartSurface\) lastConfirmedChartSurfaceRef\.current = null/);
});

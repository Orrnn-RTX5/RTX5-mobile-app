import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildChartMarkerCandleTimeSignature,
  buildChartPositionStructuralSignature,
} from './chartRenderIsolation';

test('position structural signature ignores price and P/L-only ticks', () => {
  const before = [{
    id: '42',
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.01,
    openPrice: 1.08,
    currentPrice: 1.081,
    pnl: 1,
    swap: 0,
    openTime: '2026-07-22 10:00:00',
    sl: 1.07,
    tp: 1.09,
  }];
  const afterTick = [{ ...before[0], currentPrice: 1.082, pnl: 2 }];

  assert.equal(
    buildChartPositionStructuralSignature(afterTick),
    buildChartPositionStructuralSignature(before),
  );
  assert.notEqual(
    buildChartPositionStructuralSignature([{ ...afterTick[0], tp: 1.095 }]),
    buildChartPositionStructuralSignature(before),
  );
  assert.notEqual(
    buildChartPositionStructuralSignature([{ ...afterTick[0], volume: 0.02 }]),
    buildChartPositionStructuralSignature(before),
  );
  assert.notEqual(
    buildChartPositionStructuralSignature([{ ...afterTick[0], swap: -0.25 }]),
    buildChartPositionStructuralSignature(before),
  );
  assert.notEqual(
    buildChartPositionStructuralSignature([{ ...afterTick[0], commission: -0.1 }]),
    buildChartPositionStructuralSignature(before),
  );
});

test('marker candle signature ignores forming OHLC changes but tracks candle-time structure', () => {
  const before = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 160, open: 1.5, high: 2, low: 1, close: 1.8 },
  ];
  const formingTick = [before[0], { ...before[1], high: 2.2, close: 2.1 }];

  assert.equal(
    buildChartMarkerCandleTimeSignature(formingTick),
    buildChartMarkerCandleTimeSignature(before),
  );
  assert.notEqual(
    buildChartMarkerCandleTimeSignature([...formingTick, { ...formingTick[1], time: 220 }]),
    buildChartMarkerCandleTimeSignature(before),
  );
});

test('native Chart isolates static markers and slow React commits without delaying direct live paints', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
    'utf8',
  );
  const tradeOverlayBridgeSource = readFileSync(
    resolve(
      process.cwd(),
      'src/features/chart/components/ChartTradeOverlayLiveBridge.tsx',
    ),
    'utf8',
  );

  assert.match(source, /const CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS = 400/);
  assert.match(source, /const CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS = 400/);
  assert.match(tradeOverlayBridgeSource, /useLiveSymbolQuote\(symbol, active, 0\)/);
  assert.match(tradeOverlayBridgeSource, /hasLiveQuoteFeedData\(liveQuote\)/);
  assert.match(tradeOverlayBridgeSource, /return null/);
  assert.match(source, /key=\{chartTradeDisplayQuoteScopeKey\}/);
  assert.match(source, /useLiveCandles\(\s*chartSymbol,\s*chartTimeframe,\s*chartDataActive,\s*CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS/);
  assert.match(
    source,
    /const readRenderableCanonicalCandles = useCallback\(\(\) => \{[\s\S]*liveCandlesEngine\.getCandles\(chartSymbol, chartTimeframe\)/,
    'the direct paint path must read the canonical engine rather than a delayed React snapshot',
  );
  assert.match(
    source,
    /const paintCanonicalLiveTick = \(allowUnchangedSnapshot = false\) => \{[\s\S]*const exactQuote = readExactChartQuoteForScope\([\s\S]*updateLiveTick\(/,
    'each direct paint must atomically project the exact quote into the WebView candle and price line',
  );
  assert.match(
    source,
    /livePaintPending = true;\s*pendingAllowUnchangedSnapshot = true;\s*flushCanonicalLivePaint\(\);[\s\S]*liveCandlesEngine\.subscribe\(\s*chartSymbol,\s*chartTimeframe,\s*scheduleCanonicalLivePaint/,
    'resume must flush immediately while engine updates use the frame-coalesced canonical paint scheduler',
  );
  assert.doesNotMatch(source, /requestMarketPriceLineFlush|pendingMarketPriceLinesRef/);
  assert.match(source, /const overlayMarkers = useMemo\([\s\S]*buildChartOverlayMarkers/);
  assert.match(source, /const overlayPriceLines = useMemo\([\s\S]*candles: EMPTY_DISPLAY_CANDLES/);
  assert.doesNotMatch(source, /data:\s*\w+\s*=\s*\[\]/);

  const priceLinesMemo = source.slice(
    source.indexOf('const overlayPriceLines = useMemo'),
    source.indexOf('const overlayPayload = useMemo'),
  );
  assert.doesNotMatch(priceLinesMemo, /closedPositions|overlayCandles/);
});

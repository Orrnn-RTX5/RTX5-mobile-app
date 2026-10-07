import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
  'utf8',
);

test('native chart builds execution history from deals with closed-position fallback', () => {
  assert.match(source, /useChartDealsQuery\(accountLogin,/);
  assert.match(
    source,
    /buildChartTradeHistoryOverlay\(\{[\s\S]*chartSymbol,[\s\S]*chartTimeframe,[\s\S]*candles: overlayMarkerCandles,[\s\S]*openPositions: retainedChartTradeOpenings,[\s\S]*deals: chartDeals,[\s\S]*closedPositions,/,
  );
  assert.match(source, /retainChartTradeOpenings\([\s\S]*chartMarketDataCacheNamespace,[\s\S]*positions/);
  assert.match(source, /refetchClosedPositions\(\)[\s\S]*refetchChartDeals\(\)/);
});

test('trade history follows only its own persisted toggle and stays off Renko', () => {
  assert.match(
    source,
    /chartType === 'renko'[\s\S]*chartDisplay\.showTradeHistory !== true[\s\S]*tradeHistorySegments: EMPTY_CHART_TRADE_HISTORY_SEGMENTS/,
  );
  assert.match(
    source,
    /key: 'showTradeHistory', label: 'Show trade history'/,
  );
});

test('native overlay signature and bridge payload include exact connector geometry', () => {
  assert.match(
    source,
    /const overlayPayload = useMemo\(\(\) => \(\{[\s\S]*tradeHistorySegments: tradeHistoryOverlay\.tradeHistorySegments/,
  );
  assert.match(
    source,
    /overlayTradeHistoryGeometrySignature[\s\S]*fromTime: segment\.fromTime[\s\S]*fromPrice: segment\.fromPrice[\s\S]*toTime: segment\.toTime[\s\S]*toPrice: segment\.toPrice/,
  );
  assert.match(
    source,
    /setChartOverlays\([\s\S]*JSON\.stringify\(latestPayload\)[\s\S]*JSON\.stringify\(chartDataContextSig\)/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import type { PositionItem } from '../../dev/mock/tradingData';
import { DEFAULT_CHART_SHOW_ON_CHART } from './chartShowOnChart';
import { buildAuxiliaryChartTradeOverlayPriceLines } from './auxiliaryChartTradeOverlays';

const TEST_CHART_COLORS = {
  background: '#FFFFFF',
  foreground: '#0F172A',
  grid: '#E2E8F0',
  candlesUptrend: '#089981',
  candlesDowntrend: '#F23645',
  hollowBody: '#FFFFFF',
  barsUptrend: '#089981',
  barsDowntrend: '#F23645',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#F23645',
} as const;

const positions: PositionItem[] = [
  {
    id: 'btc-buy',
    symbol: 'BTCUSDm',
    side: 'buy',
    volume: 0.03,
    openPrice: 62_710.94,
    currentPrice: 62_700.48,
    pnl: -0.31,
    swap: 0,
    openTime: '2026.08.14 09:35:00',
    sl: 62_600,
    tp: 62_900,
  },
  {
    id: 'eur-sell',
    symbol: 'EURUSD',
    side: 'sell',
    volume: 0.1,
    openPrice: 1.18,
    currentPrice: 1.181,
    pnl: -10,
    swap: 0,
    openTime: '2026.08.14 09:36:00',
  },
];

const buildFor = (
  symbol: string,
  showOnChart = DEFAULT_CHART_SHOW_ON_CHART,
  extraPriceLines: Parameters<typeof buildAuxiliaryChartTradeOverlayPriceLines>[0]['extraPriceLines'] = [],
) => buildAuxiliaryChartTradeOverlayPriceLines({
  symbol,
  positions,
  colors: TEST_CHART_COLORS,
  sellColor: '#DC2626',
  liveBid: 62_700.48,
  liveAsk: 62_715.48,
  showOnChart,
  extraPriceLines,
});

test('every same-symbol pane receives the persisted trade regardless of timeframe ownership', () => {
  const m1PaneLines = buildFor('BTCUSD');
  const m5PaneLines = buildFor('BTC/USD');

  for (const paneLines of [m1PaneLines, m5PaneLines]) {
    const openLine = paneLines.find((line) => line.id === 'open-btc-buy');
    assert.ok(openLine);
    assert.equal(openLine.labelSideText, 'BUY 0.03');
    assert.match(openLine.labelValueText ?? '', /USD$/);
    assert.equal(openLine.labelPlacement, 'line');
    assert.equal(openLine.dragKey, undefined);
  }
});

test('a different-symbol pane receives only its matching account positions', () => {
  const eurLines = buildFor('EURUSD');

  assert.ok(eurLines.some((line) => line.id === 'open-eur-sell'));
  assert.equal(eurLines.some((line) => line.id === 'open-btc-buy'), false);
});

test('pane-local trade visibility controls buy/sell and persisted SL/TP lines', () => {
  const hiddenBuyLines = buildFor('BTCUSD', {
    ...DEFAULT_CHART_SHOW_ON_CHART,
    buyTrade: false,
  });
  const hiddenStopsLines = buildFor('BTCUSD', {
    ...DEFAULT_CHART_SHOW_ON_CHART,
    slTpLevels: false,
  });

  assert.equal(hiddenBuyLines.length, 0);
  assert.deepEqual(hiddenStopsLines.map((line) => line.id), ['open-btc-buy']);
});

test('pane-owned draft guides merge without making persisted protection draggable', () => {
  const draft = {
    id: 'chart-trade-sl-preview',
    price: 62_650,
    color: '#F23645',
    lineWidth: 1,
    lineStyle: 2,
    axisLabelVisible: false,
    title: 'SL',
    labelSideText: 'SL',
    labelValueText: '-1.52 USD',
    labelPlacement: 'line' as const,
    dragKey: 'draft-only',
  };
  const lines = buildFor('BTCUSD', DEFAULT_CHART_SHOW_ON_CHART, [draft]);

  assert.ok(lines.some((line) => line.id === draft.id && line.dragKey === 'draft-only'));
  assert.equal(
    lines.filter((line) => line.id !== draft.id).some((line) => line.dragKey !== undefined),
    false,
  );
});

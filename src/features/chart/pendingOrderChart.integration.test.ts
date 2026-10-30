import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildChartOverlayPayload, CHART_LINE_STYLE } from './chartOverlays';
import { parseChartBridgeMessage } from './chartWebViewBoundary';
import { pendingOrdersToChartOrders } from '../trade/pendingOrderPresentation';
import { makePendingGatewayHarness } from '../../../tests/helpers/pendingGateway';

const colors = { background: '#000', foreground: '#fff', grid: '#333', candlesUptrend: '#0f0', candlesDowntrend: '#f00',
  hollowBody: '#000', barsUptrend: '#0f0', barsDowntrend: '#f00', lineBody: '#fff', tradeOpen: '#0f0', tradeTpSl: '#0f0', tradeStopOut: '#f00' };
const scope = { sessionScope: 'test-account-200019', dataContextSig: 'BTCUSD:M1', chartGeneration: 3, symbol: 'BTCUSD' };

test('placed orders render dashed ticket labels with a scoped edit action and disappear after cancellation', async () => {
  const h = makePendingGatewayHarness();
  const result = await h.placePendingOrder({ account_login: 200019, symbol: 'BTCUSD', side: 'buy', type: 'buy_stop_limit',
    volume: 0.01, price: 110, price_limit: 100, sl: 99, tp: 101 });
  await h.listPendingOrders();
  const build = (symbol: string) => buildChartOverlayPayload({ chartSymbol: symbol, candles: [], positions: [],
    orders: pendingOrdersToChartOrders(h.usePendingOrdersState.getState().orders), colors, sellColor: '#f00',
    positionControlScope: scope, showOnChart: { buyTrade: false, sellTrade: false, slTpLevels: false } });
  const lines = build('BTCUSD').priceLines;
  const entry = lines.find(line => line.id === `order-entry-${result.ticket}`)!;
  assert.equal(entry.lineStyle, CHART_LINE_STYLE.Dashed);
  assert.match(entry.title, new RegExp(`#${result.ticket} BUY STOP LIMIT 0.01 @ 110`));
  assert.deepEqual({ ...entry.pendingOrderControl }, { ...scope, ticket: Number(result.ticket) });
  assert.deepEqual(lines.map(line => line.price).sort((a, b) => a - b), [99, 100, 101, 110]);
  assert.equal(build('EURUSD').priceLines.length, 0);
  await h.cancelPendingOrder(Number(result.ticket));
  assert.equal(build('BTCUSD').priceLines.length, 0);
});

test('pending chart taps preserve ticket and context; malformed tickets are rejected at the bridge', () => {
  const action = { type: 'CHART_PENDING_ORDER_ACTION', ...scope, ticket: 1001 };
  assert.deepEqual(parseChartBridgeMessage(JSON.stringify(action)), action);
  assert.equal(parseChartBridgeMessage(JSON.stringify({ ...action, ticket: '1001' })), null);
  assert.equal(parseChartBridgeMessage(JSON.stringify({ ...action, chartGeneration: '3' })), null);
  const source = readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8');
  const start = source.indexOf("msg.type === 'CHART_PENDING_ORDER_ACTION'");
  assert.ok(start >= 0);
  const handler = source.slice(start, source.indexOf("msg.type === 'CHART_POSITION_ACTION'", start));
  assert.match(handler, /sessionScope/);
  assert.match(handler, /dataContextSig/);
  assert.match(handler, /chartGeneration/);
  assert.match(handler, /pending-order/);
});

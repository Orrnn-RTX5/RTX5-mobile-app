import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { makePendingGatewayHarness } from '../../../tests/helpers/pendingGateway';
import { pendingEventNotification, pendingOrderEventKind } from './pendingOrderEvents';
import { parseTradeSocketFrame } from './tradeSocketProtocol';
import { payloadMatchesSocketIdentity } from './socketPayloadIdentity';
import { buildChartOverlayPayload, CHART_LINE_STYLE } from '../../features/chart/chartOverlays';
import { pendingOrdersToChartOrders } from '../../features/trade/pendingOrderPresentation';
import type { PositionItem } from '../../domain/tradingModels';

const file = ts.createSourceFile('BrokerRealtimeService.ts', readFileSync('src/api/ws/BrokerRealtimeService.ts','utf8'), ts.ScriptTarget.Latest, true);
const service = file.statements.find(statement => ts.isClassDeclaration(statement) && statement.name?.text === 'BrokerRealtimeService') as ts.ClassDeclaration;
const method = service.members.find(member => ts.isMethodDeclaration(member) && member.name.getText(file) === 'handleMessage') as ts.MethodDeclaration;
const code = ts.transpileModule('exports.handle = function(payload, identity) ' + method.body!.getText(file), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function realtime(h: ReturnType<typeof makePendingGatewayHarness>) {
  const refreshes: string[] = [];
  const invalidations: string[][] = [];
  const exports: { handle?: (payload: unknown, identity: unknown) => boolean } = {};
  runInNewContext(code, {
    exports, pendingOrderEventKind, pendingEventNotification, parseTradeSocketFrame, payloadMatchesSocketIdentity,
    normalizeChannel: (value: unknown) => String(value ?? '').trim(),
    sameIdentity: (left: unknown, right: unknown) => left === right,
    isActiveBrokerSessionCurrent: h.isCurrent, isActiveBrokerSessionOwnerStampCurrent: h.isCurrent,
    asRecord: (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value : null,
    normalizePendingOrderDto: h.normalizePendingOrderDto,
    upsertPendingOrder: h.upsertPendingOrder, removePendingOrder: h.removePendingOrder,
    usePendingOrdersState: h.usePendingOrdersState, notifyPendingOrder: h.notifyPendingOrder,
    usePositionsState: { getState: () => ({ refreshPositions: (login: string) => { refreshes.push(login); return Promise.resolve(); } }) },
    appQueryClient: {}, invalidateSessionQueryRoots: (_client: unknown, _namespace: string, roots: string[]) => { invalidations.push([...roots]); return Promise.resolve(); },
  });
  const owner = h.owner;
  const instance = { activeIdentity: owner, activeOwnerStamp: owner };
  return { handle: (payload: unknown) => exports.handle!.call(instance, payload, owner), refreshes, invalidations };
}
const row = { ticket: 13358, symbol: 'BTCUSD', type: 'buy_limit', side: 'BUY', volume: 0.01, price: 90,
  price_limit: 0, sl: 0, tp: 0, time_in_force: 'GTC', status: 'PENDING', created_at: '2026-10-24T06:51:10Z' };

for (const [placed, modified, cancelled] of [
  ['ORDER_PLACED','ORDER_MODIFIED','ORDER_CANCELLED'],
  ['pending_order_placed','pending_order_modified','pending_order_cancelled'],
]) test(`${placed} / ${modified} / ${cancelled} update the shared list and refresh history`, () => {
  const h = makePendingGatewayHarness();
  const ws = realtime(h);
  assert.equal(ws.handle({ type: placed, data: row }), true);
  assert.equal(h.usePendingOrdersState.getState().orders[0].ticket, 13358);
  assert.equal(ws.handle({ type: modified, data: { ticket: 13358, price: 91, sl: null, tp: 95, time_in_force: 'GTD', expiry: 1800000000 } }), true);
  const order = h.usePendingOrdersState.getState().orders[0];
  assert.equal(order.price, '91'); assert.equal(order.sl, null); assert.equal(order.tp, '95');
  assert.equal(order.timeInForce, 'GTD'); assert.equal(order.expiry, 1800000000);
  assert.equal(ws.handle({ type: cancelled, data: { ticket: 13358 } }), true);
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
  assert.ok(ws.invalidations.at(-1)!.includes('ordersByLogin'));
});

for (const event of ['ORDER_FILLED','order_filled','ORDER_EXPIRED','pending_order_expired']) test(`${event} removes active order and notifies once`, () => {
  const h = makePendingGatewayHarness();
  const ws = realtime(h);
  ws.handle({ type: 'ORDER_PLACED', data: row });
  const frame = { channel: `orders.${h.owner.accountLogin}`, data: { type: event, data: { ...row, fill_price: 89.75 } } };
  ws.handle(frame); ws.handle(frame);
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
  const notices = h.usePendingOrderNotifications.getState().notifications;
  assert.equal(notices.length, 1);
  if (event.toLowerCase().includes('filled')) {
    assert.match(notices[0].message, /Order #13358 filled: BUY 0.01 BTCUSD @ 89.75/);
    assert.ok(ws.refreshes.includes(h.owner.accountLogin));
  } else assert.equal(notices[0].message, 'Pending order #13358 expired');
});

test('events from another account and retained old socket callbacks cannot affect the active account', () => {
  const h = makePendingGatewayHarness();
  const ws = realtime(h);
  assert.equal(ws.handle({ type: 'ORDER_PLACED', data: { ...row, account_login: 200020 } }), false);
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
  h.switchAccount(200020);
  assert.equal(ws.handle({ type: 'ORDER_PLACED', data: row }), false);
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
  assert.equal(h.usePendingOrderNotifications.getState().notifications.length, 0);
});

for (const type of ['buy_limit','sell_limit','buy_stop','sell_stop','buy_stop_limit','sell_stop_limit'] as const) {
  test(`${type} stays orange while pending and becomes a normal market position only after a confirmed fill`, () => {
    const h = makePendingGatewayHarness();
    const ws = realtime(h);
    const side = type.startsWith('sell') ? 'sell' : 'buy';
    const pending = { ...row, type, side: side.toUpperCase(), price: side === 'buy' ? 90 : 110,
      price_limit: type.endsWith('stop_limit') ? 100 : 0 };
    const peer = { ...pending, ticket: pending.ticket + 1 };
    const scope = { sessionScope: h.owner.cacheNamespace, dataContextSig: 'BTCUSD:M1', chartGeneration: 3, symbol: 'BTCUSD' };
    const colors = { background: '#000', foreground: '#fff', grid: '#333', candlesUptrend: '#0f0', candlesDowntrend: '#f00',
      hollowBody: '#000', barsUptrend: '#0f0', barsDowntrend: '#f00', lineBody: '#fff',
      tradeOpen: '#2962FF', tradeTpSl: '#22c55e', tradeStopOut: '#ef4444' };
    const fillPrice = side === 'buy' ? 89.75 : 110.25;
    const base = { chartSymbol: 'BTCUSD', candles: [], colors, sellColor: '#F23645', accountCurrency: 'USD',
      positionControlScope: scope, showOnChart: { buyTrade: true, sellTrade: true, slTpLevels: true },
      liveBid: fillPrice, liveAsk: fillPrice + 0.01 };
    const build = (positions: PositionItem[] = []) => buildChartOverlayPayload({ ...base, positions,
      orders: pendingOrdersToChartOrders(h.usePendingOrdersState.getState().orders) });

    ws.handle({ type: 'ORDER_PLACED', data: pending });
    ws.handle({ type: 'ORDER_PLACED', data: peer });
    const before = build().priceLines.find(line => line.id === `order-entry-${pending.ticket}`)!;
    assert.equal(before.color, '#F59E0B');
    assert.equal(before.lineStyle, CHART_LINE_STYLE.Dashed);
    assert.equal(before.price, pending.price, 'a crossed market quote cannot pretend the order has executed');

    ws.handle({ type: 'ORDER_MODIFIED', data: { ticket: pending.ticket, trigger_phase: 'triggered' } });
    assert.equal(h.usePendingOrdersState.getState().orders.find(order => order.ticket === pending.ticket)?.triggerPhase, 'triggered');
    assert.equal(build().priceLines.find(line => line.id === `order-entry-${pending.ticket}`)?.color, '#F59E0B');
    assert.equal(ws.refreshes.length, 0, 'a trigger phase alone is not a confirmed execution');

    const staleSnapshot = [...h.usePendingOrdersState.getState().orders];
    ws.handle({ channel: `orders.${h.owner.accountLogin}`, data: { type: 'ORDER_FILLED',
      data: { ...pending, status: 'FILLED', fill_price: fillPrice, position_ticket: 90123 } } });
    assert.ok(ws.refreshes.includes(h.owner.accountLogin), 'the fill must refresh broker-confirmed positions');
    assert.equal(build().priceLines.some(line => line.id.startsWith(`order-entry-${pending.ticket}`)), false);
    // A late list or placed callback must not repaint the filled order orange.
    h.publishPendingOrdersSnapshot(h.owner, staleSnapshot);
    ws.handle({ type: 'ORDER_PLACED', data: pending });
    assert.equal(build().priceLines.some(line => line.id === `order-entry-${pending.ticket}`), false);

    const position: PositionItem = { id: '90123', symbol: 'BTCUSD', side, volume: 0.01,
      openPrice: fillPrice, currentPrice: fillPrice + 0.1, pnl: 0.1, swap: 0,
      openTime: '2026-10-28T06:51:10Z', sl: 0, tp: 0 };
    const after = build([position]);
    const executed = after.priceLines.find(line => line.id === 'open-90123')!;
    const normalMarket = buildChartOverlayPayload({ ...base, positions: [position], orders: [] })
      .priceLines.find(line => line.id === 'open-90123')!;
    assert.deepEqual(executed, normalMarket, 'filled orders use exactly the regular market-position style and controls');
    assert.equal(executed.price, fillPrice, 'use the broker fill price and position ID, not the pending price or ticket');
    assert.equal(executed.lineStyle, CHART_LINE_STYLE.Dashed);
    assert.equal(executed.labelSideColor, side === 'buy' ? '#2962FF' : '#F23645');
    assert.equal(executed.pendingOrderControl, undefined);
    assert.equal(after.priceLines.find(line => line.id === `order-entry-${peer.ticket}`)?.color, '#F59E0B',
      'other pending orders must stay orange');
  });
}

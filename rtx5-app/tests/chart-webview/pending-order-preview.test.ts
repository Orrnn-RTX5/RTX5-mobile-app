import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildPendingOrderLines } from '../../src/features/chart/chartOverlays/lineBuilders';

import { extractFunctionBody } from '../../src/features/chart/testing/chartStabilityTestUtils';

const source = readFileSync(resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'), 'utf8');

class Element {
  style: Record<string, string> = {};
  childNodes: any[] = [];
  parentNode: Element | null = null;
  className = '';
  clientWidth = 380;
  nodeType = 1;
  nodeName = 'DIV';
  private text = '';
  get firstChild() { return this.childNodes[0] ?? null; }
  get textContent() { return this.text; }
  set textContent(value: string) {
    this.text = value;
    this.childNodes = [{ nodeType: 3, textContent: value }];
  }
  setAttribute() {}
  removeAttribute() {}
  onclick?: (event: any) => void;
  appendChild(child: Element) { child.parentNode = this; this.childNodes.push(child); return child; }
  removeChild(child: Element) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; }
}

const createRuntime = () => {
  const layer = new Element();
  let priceOffset = 0;
  const context: Record<string, any> = {
    document: { createElement: () => new Element() },
    series: { priceToCoordinate: (price: number) => 200 - price + priceOffset },
    _overlayLabelLayer: layer,
    _overlayDomNodesByKey: {},
    _overlayPriceLinesByDragKey: {},
    _overlayPayload: { priceLines: [] },
    _appliedOverlayPayload: { priceLines: [] },
    activeTradeLineDrag: null,
    lastDisplayDecimals: 5,
    lastChartBackgroundColor: '#10141C',
    OVERLAY_LABEL_LINE_HEIGHT: 12,
    OVERLAY_LABEL_LINE_GAP: 0,
    OVERLAY_LABEL_HEIGHT: 18,
    OVERLAY_LABEL_GAP: 4,
    OVERLAY_POSITION_BOX_HEIGHT: 18,
    OVERLAY_ANCHORED_LABEL_LEFT: 8,
    OVERLAY_ANCHORED_LABEL_LANE_WIDTH: 164,
    OVERLAY_ANCHORED_LABEL_RIGHT_PADDING: 16,
    OVERLAY_OPEN_POSITION_LABEL_MAX_LEFT: 56,
    OVERLAY_OPEN_POSITION_LABEL_LEFT_RATIO: 0.12,
    resolvePrimaryPaneMetrics: () => ({ leftAxisWidth: 20, paneWidth: 300, paneHeight: 240 }),
    resolveMarketPriceScaleAxisMetrics: () => ({ axisLeft: 320, axisWidth: 60 }),
    resolvePositionBoxGap: () => 4,
    ensureOverlayLabelLayer: () => layer,
    renderFallbackRightPriceScaleLabels() {},
    renderTradeHistorySegmentDom() {},
    refreshMarketPriceScaleDom() {},
    renderMoveDirectionOverlayBadge() {},
    hasTradeHistoryArrowMarkers: () => false,
    isOpenPositionOverlayLine: (line: { id?: string }) => !!line.id?.startsWith('open-'),
    formatChartBrokerPrice: (price: number) => price.toFixed(5),
    postError: (_label: string, error: Error) => { throw error; },
    scheduleTradeLineDragDomRefresh: () => context.refreshOverlayDomLabels(context._overlayPayload),
  };
  const functions = [
    'isTradeStopDragKey', 'withDraggedOverlayLinePrice', 'configureTradeStopDragHandle',
    'isPendingOrderDraftLine', 'shouldRenderRightAxisTradePriceBox',
    'isActiveSltpDragLine', 'resolveActiveTradeLineMagnifierLine', 'renderTradeLineMagnifier',
    'upsertOverlayDomNode', 'pruneOverlayDomNodes',
    'resolveTradeOverlayPaneBounds', 'isTradeOverlayYInsidePane',
    'resolveAnchoredOverlayLabelLane', 'applyAnchoredOverlayLabelLane',
    'applyPendingOrderDraftLabelLayout', 'renderPendingOrderDraftAdornment',
    'resolveAnchoredOverlayLabelTops', 'resolveAnchoredOverlayRowY',
    'resolveOverlayDomLineBorderStyle', 'renderAnchoredTradeLine',
    'refreshOverlayDomLabels', 'repositionTradeOverlayDomNodes',
    'syncOverlayPayloadDragLinePrice', 'updateDraggedOverlayLinePreview',
  ];
  vm.createContext(context);
  for (const name of functions) {
    const body = extractFunctionBody(source, name);
    const start = source.indexOf(`function ${name}(`);
    const open = source.indexOf('{', start);
    vm.runInContext(source.slice(start, open + 1) + body + '}', context);
  }
  return {
    context,
    nodes: context._overlayDomNodesByKey as Record<string, Element>,
    render: (priceLines: any[]) => {
      context._overlayPayload = { priceLines };
      context._appliedOverlayPayload = context._overlayPayload;
      context.refreshOverlayDomLabels(context._overlayPayload);
    },
    pan: (offset: number) => { priceOffset = offset; context.repositionTradeOverlayDomNodes(); },
  };
};

test('persisted pending labels send a scoped edit action and bypass chart gestures', () => {
  const runtime = createRuntime();
  const messages: unknown[] = [];
  runtime.context.window = { ReactNativeWebView: { postMessage: (raw: string) => messages.push(JSON.parse(raw)) } };
  const control = { ticket: 42, symbol: 'BTCUSD', sessionScope: 'account-1', dataContextSig: 'BTCUSD:M1', chartGeneration: 2 };
  runtime.render([{ id: 'order-entry-42', price: 100, title: '#42 BUY LIMIT 0.01 @ 100',
    color: '#2962FF', lineWidth: 2, lineStyle: 2, labelPlacement: 'line', pendingOrderControl: control }]);
  const label = runtime.nodes['label:anchored:order-entry-42'];
  assert.ok(label);
  assert.equal(label.style.pointerEvents, 'auto');
  label.onclick?.({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(messages, [{ ...control, type: 'CHART_PENDING_ORDER_ACTION' }]);
  for (const name of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onClick']) {
    const start = source.indexOf(`var ${name} = function(event)`);
    assert.ok(start > 0);
    const guard = source.slice(start, source.indexOf('\n', source.indexOf('\n', start) + 1));
    assert.match(guard, /data-pending-order/);
  }
});

test('pending Buy Limit and Sell Limit stay orange, with exact guide prices after pan', () => {
  const runtime = createRuntime();
  const messages: unknown[] = [];
  runtime.context.window = { ReactNativeWebView: { postMessage: (raw: string) => messages.push(JSON.parse(raw)) } };
  const colors = { background: '#10141C', foreground: '#E2E8F0', grid: '#333', candlesUptrend: '#0f0', candlesDowntrend: '#f00',
    hollowBody: '#000', barsUptrend: '#0f0', barsDowntrend: '#f00', lineBody: '#fff', tradeOpen: '#2962FF', tradeTpSl: '#0f0', tradeStopOut: '#f00' };
  const scope = { sessionScope: 'account-1', dataContextSig: 'XAUUSD:M1', chartGeneration: 2, symbol: 'XAUUSD' };
  const lines = buildPendingOrderLines(['buy_limit', 'sell_limit'].map((type, index) => ({
    ticket: 42 + index, account_login: 200019, symbol: 'XAUUSD', type,
    side: index ? 'sell' as const : 'buy' as const, volume: 0.003,
    price_open: 100 + index, price_sl: 0, price_tp: 0, status: 'PENDING', comment: '', time_setup: 0, time_done: 0,
  })), colors, '#F23645', scope);
  runtime.render(lines);
  for (const [index, line] of lines.entries()) {
    const pendingColor = '#F59E0B';
    const label = runtime.nodes[`label:anchored:${line.id}`];
    const stroke = runtime.nodes[`line:${line.id}`];
    const badge = runtime.nodes[`box:${line.id}`];
    const y = 200 - line.price;
    assert.equal(label.childNodes.map(node => node.textContent).join(''), `${index ? 'SELL' : 'BUY'} LIMIT 0.003`);
    assert.equal(label.style.backgroundColor, '#10141C');
    assert.equal(label.style.border, `1px solid ${pendingColor}`);
    assert.equal(label.childNodes[0].style.color, pendingColor);
    assert.equal(label.style.left, '24px');
    assert.equal(label.style.top, `${y - 12}px`);
    assert.equal(stroke.style.top, `${y}px`);
    assert.equal(stroke.style.borderTop, `1px dashed ${pendingColor}`);
    assert.equal(badge.style.border, `1px solid ${pendingColor}`);
    assert.equal(badge.style.color, pendingColor);
    assert.equal(badge.style.top, `${y - 9}px`, 'nearby pending entries cannot displace the price badge');
    assert.equal(badge.textContent, line.price.toFixed(5));
    label.onclick?.({ preventDefault() {}, stopPropagation() {} });
  }
  assert.deepEqual(messages, lines.map(line => ({ ...line.pendingOrderControl, type: 'CHART_PENDING_ORDER_ACTION' })));
  runtime.pan(30);
  for (const line of lines) {
    const y = 230 - line.price;
    assert.equal(runtime.nodes[`label:anchored:${line.id}`].style.left, '24px');
    assert.equal(runtime.nodes[`label:anchored:${line.id}`].style.top, `${y - 12}px`);
    assert.equal(runtime.nodes[`line:${line.id}`].style.top, `${y}px`);
    assert.equal(runtime.nodes[`box:${line.id}`].style.top, `${y - 9}px`);
  }
  runtime.pan(300);
  assert.equal(runtime.nodes['label:anchored:order-entry-42'].style.visibility, 'hidden');
  runtime.pan(0);
  assert.equal(runtime.nodes['label:anchored:order-entry-42'].style.visibility, 'visible');
  runtime.render([]);
  assert.equal(Object.keys(runtime.nodes).length, 0, 'cancelled or filled orders leave no chart decoration');
});

const draft = (type: string, price = 100) => ({
  id: 'chart-trade-entry-preview', price,
  color: type.startsWith('Sell') ? '#F23645' : '#2962FF',
  title: `${type.toUpperCase()} 0.01`,
  dragKey: 'entry', lineStyle: 0, lineWidth: 1, labelPlacement: 'line',
});

test('all six pending drafts render a side-colored solid line, centered ring and exact axis value', () => {
  for (const type of ['Buy Limit', 'Sell Limit', 'Buy Stop', 'Sell Stop', 'Buy Stop Limit', 'Sell Stop Limit']) {
    const runtime = createRuntime();
    const line = draft(type);
    runtime.render([line]);
    const stroke = runtime.nodes[`line:${line.id}`];
    const label = runtime.nodes[`label:anchored:${line.id}`];
    const ring = runtime.nodes[`line:pending-handle:${line.id}`];
    const box = runtime.nodes[`box:${line.id}`];
    assert.equal(stroke.style.top, '100px');
    assert.equal(stroke.style.borderTop, `1px solid ${line.color}`);
    assert.equal(label.textContent, line.title);
    assert.equal(label.style.left, '24px');
    assert.equal(label.style.top, '86px');
    assert.equal(label.style.textAlign, 'left');
    assert.equal(ring.style.left, '165px');
    assert.equal(ring.style.top, '95px');
    assert.equal(ring.style.border, `2px solid ${line.color}`);
    assert.equal(ring.style.background, '#FFFFFF');
    assert.equal(box.textContent, '100.00000');
    assert.equal(box.style.left, '320px');
    assert.equal(box.style.top, '93px');
    assert.equal(box.style.border, `1px solid ${line.color}`);
  }
});

test('dragging and panning keep the ring, label and price box on the draft price', () => {
  const runtime = createRuntime();
  const line = draft('Buy Limit');
  runtime.render([line]);
  const ring = runtime.nodes[`line:pending-handle:${line.id}`];
  const box = runtime.nodes[`box:${line.id}`];
  runtime.context.updateDraggedOverlayLinePreview('entry', 80);
  assert.equal(ring.style.top, '115px');
  assert.equal(box.style.top, '113px');
  assert.equal(box.textContent, '80.00000');
  runtime.pan(30);
  assert.equal(ring.style.top, '145px');
  assert.equal(box.style.top, '143px');
  assert.equal(runtime.nodes[`label:anchored:${line.id}`].style.left, '24px');
  assert.equal(runtime.nodes[`label:anchored:${line.id}`].style.top, '136px');
  assert.equal(runtime.nodes[`line:pending-handle:${line.id}`], ring);
  runtime.render([]);
  assert.equal(Object.keys(runtime.nodes).length, 0, 'hiding the draft removes every draft decoration');
});

test('stop-limit secondary shows a black handle in view and a direction label beyond the plot', () => {
  const runtime = createRuntime();
  const line = { ...draft('Buy Stop Limit', 220), id: 'chart-trade-stop-limit-preview', color: '#000000', title: 'STOP LIMIT PRICE', dragKey: 'stopLimit' };
  runtime.render([draft('Buy Stop Limit'), line]);
  const edge = runtime.nodes[`label:pending-edge:${line.id}`];
  const ring = runtime.nodes[`line:pending-handle:${line.id}`];
  const box = runtime.nodes[`box:${line.id}`];
  assert.equal(edge.textContent, 'STOP LIMIT PRICE ▲');
  assert.equal(edge.style.top, '2px');
  assert.equal(edge.style.textAlign, 'right');
  assert.equal(edge.style.visibility, 'visible');
  assert.equal(ring.style.visibility, 'hidden');
  assert.equal(box.style.visibility, 'hidden');
  runtime.context.updateDraggedOverlayLinePreview('stopLimit', 150);
  assert.equal(edge.style.visibility, 'hidden');
  assert.equal(ring.style.visibility, 'visible');
  assert.equal(ring.style.border, '2px solid #000000');
  assert.equal(box.textContent, '150.00000');
  runtime.pan(300);
  assert.equal(edge.textContent, 'STOP LIMIT PRICE ▼');
  assert.equal(edge.style.top, '224px');
  assert.equal(edge.style.visibility, 'visible');
  assert.equal(ring.style.visibility, 'hidden');
  runtime.render([]);
  assert.equal(Object.keys(runtime.nodes).length, 0);
});

test('draft axis eligibility excludes unrelated chart overlay IDs', () => {
  const runtime = createRuntime();
  for (const id of ['chart-trade-entry-preview', 'chart-trade-stop-limit-preview', 'chart-trade-sl-preview', 'chart-trade-tp-preview', 'order-entry-42']) {
    assert.equal(runtime.context.shouldRenderRightAxisTradePriceBox({ id }), true, id);
  }
  for (const line of [null, {}, { id: 'chart-trade-unknown' }, { id: 'indicator-42' }]) {
    assert.equal(runtime.context.shouldRenderRightAxisTradePriceBox(line), false);
  }
});

test('persisted pending and protection levels cannot suppress same-price draft badges in either payload order', () => {
  for (const persistedId of ['order-entry-42', 'order-sl-42', 'sl-42', 'tp-42']) {
    const runtime = createRuntime();
    const entry = draft('Sell Stop Limit');
    const stopLimit = { ...entry, id: 'chart-trade-stop-limit-preview', color: '#000000', title: 'STOP LIMIT PRICE', dragKey: 'stopLimit' };
    const persisted = { ...draft('Buy Limit'), id: persistedId, dragKey: undefined };
    const duplicatePersisted = { ...persisted, id: persistedId + '-duplicate' };
    for (const lines of [[persisted, entry, stopLimit, duplicatePersisted], [entry, stopLimit, persisted, duplicatePersisted]]) {
      runtime.render(lines);
      const persistedBox = runtime.nodes[`box:${persisted.id}`];
      assert.ok(persistedBox, 'persisted level keeps its badge when a draft is listed first');
      assert.equal(runtime.nodes[`box:${duplicatePersisted.id}`], undefined, 'ordinary persisted price deduplication is retained');
      for (const line of [entry, stopLimit]) {
        const box = runtime.nodes[`box:${line.id}`];
        assert.ok(box, `${line.id} owns a badge even when a persisted level has the same price`);
        assert.equal(box.textContent, '100.00000');
        assert.equal(box.style.top, '93px');
        assert.equal(box.style.border, `1px solid ${line.color}`);
        assert.equal(box.style.visibility, 'visible');
        assert.ok(Number(box.style.zIndex) > Number(persistedBox.style.zIndex), 'persisted badge cannot paint over the active draft color');
      }
    }
  }
});

test('pending drag magnifier follows the active entry or stop-limit while keeping their labels and values visible', () => {
  const runtime = createRuntime();
  const entry = draft('Sell Stop Limit');
  const stopLimit = { ...entry, id: 'chart-trade-stop-limit-preview', color: '#000000', title: 'STOP LIMIT PRICE', dragKey: 'stopLimit', price: 150 };
  const positionStop = { ...entry, id: 'sl-42', dragKey: 'position-stop:sl:42' };
  const magnifier = new Element();
  Object.assign(runtime.context, {
    _tradeLineMagnifierSourceCanvases: [{}], _tradeLineMagnifierChartRect: {}, _tradeLineMagnifierCanvas: {},
    ensureTradeLineMagnifier: () => magnifier,
    resolveTradeLineMagnifierGeometry: () => ({ size: 76, left: 8, top: 8 }),
    drawTradeLineMagnifierChartContent: () => true,
    hideTradeLineMagnifier: () => { magnifier.style.display = 'none'; },
    lastChartBackgroundColor: '#FFFFFF',
  });
  for (const line of [entry, stopLimit]) {
    runtime.context.activeTradeLineDrag = { dragKey: line.dragKey, lastPrice: line.price };
    runtime.render([entry, stopLimit]);
    assert.equal(runtime.context.resolveActiveTradeLineMagnifierLine(), line);
    assert.equal(runtime.context.isActiveSltpDragLine(line), false, 'pending drag does not use protection-label suppression');
    runtime.context.renderTradeLineMagnifier();
    assert.equal(magnifier.style.display, 'block');
    assert.equal(magnifier.style.borderColor, line.color);
    assert.equal(runtime.nodes[`label:anchored:${line.id}`].style.visibility, 'visible');
    assert.equal(runtime.nodes[`box:${line.id}`].style.visibility, 'visible');
  }
  runtime.context.activeTradeLineDrag = { dragKey: positionStop.dragKey, lastPrice: positionStop.price };
  runtime.context._overlayPayload = { priceLines: [entry, stopLimit, positionStop] };
  assert.equal(runtime.context.resolveActiveTradeLineMagnifierLine(), positionStop);
  assert.equal(runtime.context.isActiveSltpDragLine(positionStop), true, 'position protection keeps existing suppression behavior');
  runtime.context.activeTradeLineDrag = null;
  runtime.context.renderTradeLineMagnifier();
  assert.equal(magnifier.style.display, 'none');
});

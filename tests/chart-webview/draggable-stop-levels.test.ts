import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { CH_HTML } from '../../src/features/chart/rendering/ChartWebViewHtml';
import { roundOrderTicketPrice } from '../../src/features/trade/orderTicketPreviewUtils';
import { extractFunctionBody } from '../support/chartSourceTestUtils';

const assigned = (name: string) => extractFunctionBody(
  CH_HTML.replace(`var ${name} = function`, `function ${name}`), name);
const declaration = (name: string, parameters: string) => `function ${name}(${parameters}) {${extractFunctionBody(CH_HTML, name)}}`;
const priceFunctions = [declaration('isTradeStopDragKey', 'dragKey'), declaration('withDraggedOverlayLinePrice', 'line,price')].join('\n');
const formatPrice = (price: number) => price.toFixed(2);

function node() {
  const attributes: Record<string, string> = {};
  return { attributes, style: {} as Record<string, string>,
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    getAttribute: (name: string) => attributes[name],
    removeAttribute: (name: string) => { delete attributes[name]; } };
}

test('SL/TP label and axis handles identify the exact ticket even when another level shares its row', () => {
  const first = { dragKey: 'position-stop:sl:81', price: 100 };
  const second = { dragKey: 'position-stop:tp:82', price: 100 };
  const handle = node(); handle.setAttribute('data-trade-stop-drag-key', second.dragKey);
  const resolve = runInNewContext(`(function(event){${assigned('resolveTradeLineDragHitFromEvent')}})`, {
    getClientPoint: () => ({ x: 330, y: 100 }), getClampedRelativePoint: () => ({ x: 330, y: 100 }),
    resolveDraggableOverlayPriceLines: () => [first, second],
    series: { priceToCoordinate: (price: number) => price }, pickDraggableOverlayLineAtY: () => first,
  });
  assert.equal(resolve({ target: { closest: () => handle } }).hit.dragKey, second.dragKey);
  assert.equal(resolve({ target: { closest: () => null } }).hit.dragKey, first.dragKey);
});

test('explicit handles drag immediately while a bare executed SL/TP line retains its deliberate hold', () => {
  let starts = 0;
  let hold: (() => void) | undefined;
  const context: any = {
    pendingPositionStopHold: null, cancelPositionStopHold() {}, getClientPoint: () => ({ x: 30, y: 40 }),
    setTimeout: (callback: () => void) => { hold = callback; return 1; },
    beginTradeLineDrag: () => { starts++; return true; },
  };
  const begin = runInNewContext(`(function(event,resolvedHit){${assigned('beginTradeLineDragFromHit')}})`, context);
  for (const dragKey of ['sl', 'tp', 'position-stop:sl:81', 'position-stop:tp:81']) {
    assert.equal(begin({}, { hit: { dragKey }, handle: true }), true);
  }
  assert.equal(starts, 4);
  assert.equal(hold, undefined);
  assert.equal(begin({}, { hit: { dragKey: 'position-stop:sl:81' }, handle: false }), false);
  assert.equal(starts, 4); hold!(); assert.equal(starts, 5);
});

test('price-axis touches choose scaling except when the trader explicitly grabs a stop handle', () => {
  const actions: string[] = [];
  let handle = false;
  const context: any = {
    rememberPointerDown() {}, cancelFreshSeriesVerticalCenter() {}, stopVerticalPanGlide() {}, postChartTouchState() {},
    horizontalScrollMotionActive: false, activeHorizontalScrollGesture: false, activeHorizontalScrollGestureUntil: 0,
    rightPriceScaleGestureActive: false, isCrosshairInteractionActive: () => false, isScaleGestureEvent: () => false,
    getClientPoint: () => ({ x: 350, y: 200 }),
    resolveTradeLineDragHitFromEvent: () => ({ handle, hit: { dragKey: 'sl' } }),
    beginTradeLineDragFromHit: () => actions.push('stop-drag'), clearCompletedChartTap() {}, stopChartEvent() {},
    isRightPriceScaleGesturePoint: () => true, isVerticalChartMovementBlocked: () => false,
    beginRightPriceScaleGesture: () => { actions.push('axis-scale'); return true; },
  };
  const down = runInNewContext(`(function(event){${assigned('onPointerDown')}})`, context);
  down({}); handle = true; down({});
  assert.deepEqual(actions, ['axis-scale', 'stop-drag']);
});

test('grabbing above or below the line preserves its price offset through movement and release', () => {
  const context: any = {
    activeTradeLineDrag: { pointerOffsetY: 12, priceScaleRangeLock: { from: 100, to: 200 } },
    series: { coordinateToPrice: (y: number) => 200 - y },
    sanitizeOverlayDragPrice: (price: number) => Number.isFinite(price) && price > 0 ? price : null,
    isValidPriceRange: (range: any) => range && range.to > range.from,
    resolvePrimaryPaneMetrics: () => ({ plotTop: 0, plotHeight: 100 }),
  };
  const resolve = runInNewContext(`(function(point,dragState){${assigned('resolveTradeLineDragPrice')}})`, context);
  assert.equal(resolve({ y: 62 }), 150, 'touching 12px below the line must not move it');
  assert.equal(resolve({ y: 72 }), 140);
  const drag = context.activeTradeLineDrag; context.activeTradeLineDrag = null;
  assert.equal(resolve({ y: 72 }, drag), 140, 'release keeps the same offset after active ownership is cleared');
  context.series.coordinateToPrice = () => null;
  assert.ok(Math.abs(resolve({ y: 122 }, drag) - 90) < 1e-10, 'off-pane dragging uses the same offset and locked price projection');
});

test('SL and TP prices update locally and survive older native payloads without changing peer levels', () => {
  for (const dragKey of ['sl', 'tp', 'position-stop:sl:81', 'position-stop:tp:81']) {
    const peer = { dragKey: 'position-stop:tp:82', price: 120 };
    const context: any = {
      _overlayPayload: { priceLines: [{ dragKey, price: 100, labelSideText: 'SL', labelValueText: 'old' }, peer] },
      _appliedOverlayPayload: null, _overlayPriceLinesByDragKey: {}, formatChartBrokerPrice: formatPrice,
      activeTradeLineDrag: { dragKey, lastPrice: 102.25 },
    };
    const runtime = runInNewContext(`${priceFunctions}
      ${declaration('syncOverlayPayloadDragLinePrice', 'dragKey,price')}
      ${declaration('preserveActiveTradeLineDragPayload', 'payload')}
      ({syncOverlayPayloadDragLinePrice,preserveActiveTradeLineDragPayload})`, context);
    runtime.syncOverlayPayloadDragLinePrice(dragKey, 102.25);
    const line = context._overlayPayload.priceLines[0];
    assert.equal(line.price, 102.25); assert.equal(line.labelValueText, '102.25');
    assert.equal(line.labelSideText, /(?:^sl$|:sl:)/.test(dragKey) ? 'SL' : 'TP');
    assert.equal(context._overlayPayload.priceLines[1], peer);
    const retained = runtime.preserveActiveTradeLineDragPayload({ priceLines: [{ dragKey, price: 99 }, peer] });
    assert.equal(retained.priceLines[0].price, 102.25); assert.equal(retained.priceLines[0].labelValueText, '102.25');
    assert.equal(retained.priceLines[1], peer);
  }
});

test('stop handles refresh their labels and remove drag ownership when permissions disappear', () => {
  const runtime = runInNewContext(`${priceFunctions}
    ${declaration('configureTradeStopDragHandle', 'node,line')}
    ({configureTradeStopDragHandle})`, { formatChartBrokerPrice: formatPrice });
  for (const dragKey of ['sl', 'tp', 'position-stop:sl:81', 'position-stop:tp:81']) {
    const handle = node();
    runtime.configureTradeStopDragHandle(handle, { dragKey, price: 102.25 });
    assert.equal(handle.attributes['data-trade-stop-drag-key'], dragKey);
    assert.match(handle.attributes['aria-label'], /102\.25.*Drag vertically/);
    assert.equal(handle.style.pointerEvents, 'auto');
    runtime.configureTradeStopDragHandle(handle, { price: 102.25 });
    assert.equal(handle.attributes['data-trade-stop-drag-key'], undefined);
    assert.equal(handle.style.touchAction, '');
  }
});

test('cancelling either a draft or executed stop restores its starting price and never sends an end intent', () => {
  for (const dragKey of ['sl', 'tp', 'position-stop:sl:81', 'position-stop:tp:81']) {
    const messages: any[] = []; const prices: number[] = []; let resumed = 0;
    const context: any = {
      activeTradeLineDrag: { dragKey, startPrice: 100, lastPrice: 102.25, prevTouchAction: 'pan-x' },
      keepTradeLineDragTimeScaleLocked() {}, hideTradeLineMagnifier() {}, discardTradeLineMagnifierSources() {},
      el: { style: {} }, restoreChartTouchInteractions: () => { resumed++; },
      updateDraggedOverlayLinePreview: (_key: string, price: number) => prices.push(price),
      cancelChartTradeLineDragMove() {}, keepTradeLineDragPriceScaleLocked() {}, isValidPriceRange: () => false,
      enableRightPriceAutoScale() {}, roundOverlayDragPrice: (price: number) => price,
      postChartTradeLineDrag: (phase: string, key: string, price: number) => messages.push({ phase, key, price }),
      scheduleTradeLineDragDomRefresh() {}, stopChartEvent() {}, Date,
    };
    const finish = runInNewContext(`(function(event,cancelled){${assigned('finishTradeLineDrag')}})`, context);
    assert.equal(finish({}, true), true);
    assert.deepEqual(prices, [100]);
    assert.deepEqual(messages, [{ phase: 'cancel', key: dragKey, price: 100 }]);
    assert.equal(context.activeTradeLineDrag, null); assert.equal(resumed, 1);
    assert.equal(context.el.style.touchAction, 'pan-x');
    assert.equal(finish({}, false), false); assert.equal(messages.length, 1);
  }
});

test('draft and position drag messages carry the current chart context and exact position identity', () => {
  const messages: any[] = [];
  const control = { sessionScope: 'account-A', dataContextSig: 'EURUSD:M1', positionId: '81', positionKey: 'exact', chartGeneration: 2 };
  const context: any = {
    _overlayPayload: { priceLines: [{ dragKey: 'position-stop:sl:81', positionControl: control }] },
    positionStopDragRequestId: 0, positionControlRequestId: 0, lastInitDataContextSig: 'EURUSD:M1',
    window: { ReactNativeWebView: { postMessage: (value: string) => messages.push(JSON.parse(value)) } },
  };
  const post = runInNewContext(`(function(phase,dragKey,price){${extractFunctionBody(CH_HTML, 'postChartTradeLineDrag')}})`, context);
  post('start', 'position-stop:sl:81', 100); post('end', 'position-stop:sl:81', 102.25); post('cancel', 'tp', 120);
  assert.equal(messages[0].positionId, '81'); assert.equal(messages[0].requestId, messages[1].requestId);
  assert.equal(messages[1].levelRole, 'sl'); assert.equal(messages[1].price, 102.25);
  assert.equal(messages[2].dataContextSig, 'EURUSD:M1'); assert.equal(messages[2].phase, 'cancel');
});

test('native draft state follows move and cancel events using broker tick rounding', () => {
  const source = ts.createSourceFile('chart.tsx', readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks: Record<string, string> = {};
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ['handleChartTradePreviewDragMessage', 'applyChartTradePreviewDragPrice'].includes(node.name.getText(source))
      && node.initializer && ts.isCallExpression(node.initializer)) callbacks[node.name.getText(source)] = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.equal(Object.keys(callbacks).length, 2);
  const prices: any[] = []; const exports: any = {};
  runInNewContext(ts.transpileModule(`const applyChartTradePreviewDragPrice = ${callbacks.applyChartTradePreviewDragPrice};
    exports.handle = ${callbacks.handleChartTradePreviewDragMessage};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, chartProtectionBackendLocked: false, closeChartTapMenu() {},
    showChartTradeSheet: true, chartDirectProtectionActive: true, chartTradeSlEnabled: true, chartTradeTpEnabled: true,
    roundTradePrice: (price: number) => roundOrderTicketPrice(price, 0.25, 2),
    setChartTradeSlPrice: (update: (price: number) => number) => prices.push(['sl', update(100)]),
    setChartTradeTpPrice: (update: (price: number) => number) => prices.push(['tp', update(120)]),
  });
  exports.handle({ dragKey: 'sl', phase: 'move', price: 102.37 });
  exports.handle({ dragKey: 'sl', phase: 'cancel', price: 100 });
  exports.handle({ dragKey: 'tp', phase: 'end', price: 120.38 });
  exports.handle({ dragKey: 'tp', phase: 'end', price: NaN });
  assert.deepEqual(prices, [['sl', 102.25], ['sl', 100], ['tp', 120.5]]);
});

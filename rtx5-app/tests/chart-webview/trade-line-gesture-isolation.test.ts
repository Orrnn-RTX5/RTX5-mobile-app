import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { CH_HTML } from '../../src/features/chart/rendering/ChartWebViewHtml';
import { extractFunctionBody } from '../support/chartSourceTestUtils';

function assignedBody(name: string) {
  const start = CH_HTML.indexOf(`var ${name} = function`);
  assert.ok(start >= 0, name);
  const open = CH_HTML.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < CH_HTML.length; i++) {
    if (CH_HTML[i] === '{') depth++;
    if (CH_HTML[i] === '}' && --depth === 0) return CH_HTML.slice(open + 1, i);
  }
  throw new Error(`Unclosed ${name}`);
}

function harness() {
  const writes: Array<{ from: number; to: number }> = [];
  const prices: number[] = [];
  const context: any = {
    range: { from: 50, to: 100 },
    activeTradeLineDrag: {
      dragKey: 'sl', lastPrice: 1.1,
      logicalRangeLock: { from: 50, to: 100 },
      priceScaleRangeLock: { from: 1, to: 2 },
    },
    tradeLineTimeScaleLockActive: false,
    isHorizontalScrollMotionActive: () => false,
    activeHorizontalScrollGestureUntil: 0,
    getBoundedLiveRightEdge: () => 106.5,
    getVisibleLogicalRangeSnapshot: () => context.range,
    getClientPoint: (event: any) => ({ x: event.clientX, y: event.clientY }),
    getTradeLineDragPoint: (x: number, y: number) => ({ x, y }),
    keepTradeLineDragPriceScaleLocked() {}, scheduleTradeLineDragDomRefresh() {},
    resolveTradeLineDragPrice: (point: any) => point.y / 100,
    updateDraggedOverlayLinePreview: (_key: string, price: number) => prices.push(price),
    roundOverlayDragPrice: (price: number) => price,
    scheduleChartTradeLineDragMove() {}, stopChartEvent() {},
  };
  let runtime: any;
  context.chart = { timeScale: () => ({ setVisibleLogicalRange: (range: any) => {
    writes.push({ ...range });
    context.range = { ...range };
    // Lightweight Charts may synchronously notify range subscribers.
    runtime.keepTradeLineDragTimeScaleLocked(false);
  } }) };
  const functions = ['keepTradeLineDragTimeScaleLocked', 'shouldFollowLiveRightEdge', 'followLiveRightEdge']
    .map((name) => `function ${name}(${name === 'keepTradeLineDragTimeScaleLocked' ? 'force' : name === 'shouldFollowLiveRightEdge' ? 'range, lengthOverride' : 'previousRange, lengthOverride'}) {${extractFunctionBody(CH_HTML, name)}}`).join('\n');
  runtime = runInNewContext(`${functions}
    function continueTradeLineDrag(event) {${assignedBody('continueTradeLineDrag')}}
    ({keepTradeLineDragTimeScaleLocked, shouldFollowLiveRightEdge, followLiveRightEdge, continueTradeLineDrag})`, context);
  return { context, runtime, writes, prices };
}

test('starting a handle drag stops momentum and retains its viewport through new-bar shifts', () => {
  const h = harness();
  assert.equal(h.runtime.keepTradeLineDragTimeScaleLocked(true), true);
  assert.equal(h.writes.length, 1, 'initial range reapplication cancels kinetic scrolling');
  assert.equal(h.runtime.keepTradeLineDragTimeScaleLocked(false), false);
  for (let i = 0; i < 10; i++) {
    h.context.range = { from: 51 + i, to: 101 + i };
    h.runtime.keepTradeLineDragTimeScaleLocked(false);
    assert.deepEqual(h.context.range, { from: 50, to: 100 });
  }
  assert.equal(h.writes.length, 11, 'synchronous notifications must not recurse');
  assert.match(assignedBody('beginTradeLineDrag'), /logicalRangeLock: getVisibleLogicalRangeSnapshot\(\)/);
  assert.match(assignedBody('beginTradeLineDrag'), /keepTradeLineDragTimeScaleLocked\(true\)/);
  assert.match(extractFunctionBody(CH_HTML, 'applyTickUpdate'), /series\.update\(bar\);[\s\S]*?keepTradeLineDragTimeScaleLocked\(false\)/);
});

test('dragging SL/TP updates only its price while the chart viewport stays still', () => {
  const h = harness();
  for (const y of [120, 125, 135, 140]) {
    h.context.range = { from: 55, to: 105 };
    assert.equal(h.runtime.continueTradeLineDrag({ clientX: 50, clientY: y }), true);
    assert.deepEqual(h.context.range, { from: 50, to: 100 });
    assert.equal(h.context.activeTradeLineDrag.lastPrice, y / 100);
  }
  assert.deepEqual(h.prices, [1.2, 1.25, 1.35, 1.4]);
});

test('live-edge following pauses only while a handle is owned; normal chart movement resumes on release', () => {
  const h = harness();
  assert.equal(h.runtime.shouldFollowLiveRightEdge({ from: 60, to: 106.5 }), false);
  assert.equal(h.runtime.followLiveRightEdge({ from: 60, to: 106.5 }), false);
  assert.equal(h.writes.length, 0);
  h.context.activeTradeLineDrag = null;
  h.context.range = { from: 5, to: 55 };
  assert.equal(h.runtime.keepTradeLineDragTimeScaleLocked(true), false);
  assert.deepEqual(h.context.range, { from: 5, to: 55 });
  assert.equal(h.runtime.shouldFollowLiveRightEdge({ from: 60, to: 106.5 }), true);
});

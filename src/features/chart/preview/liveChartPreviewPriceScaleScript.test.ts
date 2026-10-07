import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH } from '../ChartScreen.constants';
import {
  MT5_PRICE_SCALE_BOUND_OCTAVES,
  MT5_PRICE_SCALE_MAX_DRAG_OCTAVES,
  MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
  MT5_PRICE_SCALE_OCTAVES_PER_PLOT,
} from '../mt5PriceScaleGesture';
import { LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT } from './liveChartPreviewPriceScaleScript';

type Listener = (event: Record<string, any>) => void;

class FakeEventTarget {
  readonly listeners = new Map<string, Listener[]>();
  readonly capturedPointers: number[] = [];
  readonly releasedPointers: number[] = [];
  clientHeight = 300;
  clientWidth = 400;

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  dispatch(type: string, event: Record<string, any>) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }

  setPointerCapture(pointerId: number) {
    this.capturedPointers.push(pointerId);
  }

  releasePointerCapture(pointerId: number) {
    this.releasedPointers.push(pointerId);
  }
}

const makePointerEvent = (x: number, y: number, pointerId = 1) => ({
  cancelable: true,
  clientX: x,
  clientY: y,
  pointerId,
  preventDefault() {},
  stopPropagation() {},
});

const evaluatePriceScaleRuntime = () => {
  const chartHost = new FakeEventTarget();
  const chartOptions: Array<Record<string, any>> = [];
  const priceScaleOptions: Array<Record<string, any>> = [];
  const autoScaleCalls: boolean[] = [];
  const visibleRangeCalls: Array<{ from: number; to: number }> = [];
  let visibleRange = { from: 100, to: 200 };
  let badgeRefreshes = 0;
  const priceScale = {
    applyOptions: (options: Record<string, any>) => priceScaleOptions.push(options),
    getVisibleRange: () => ({ ...visibleRange }),
    setAutoScale: (enabled: boolean) => autoScaleCalls.push(enabled),
    setVisibleRange: (range: { from: number; to: number }) => {
      visibleRange = { ...range };
      visibleRangeCalls.push({ ...range });
    },
    width: () => 64,
  };
  const chart = {
    applyOptions: (options: Record<string, any>) => chartOptions.push(options),
    priceScale: (id: string) => {
      assert.equal(id, 'right');
      return priceScale;
    },
  };
  const series = {
    coordinateToPrice: (coordinate: number) => 200 - coordinate / 3,
  };
  const windowTarget = new FakeEventTarget() as FakeEventTarget & {
    PointerEvent: Function;
    _previewDisplayDecimals: number;
    [key: string]: any;
  };
  windowTarget.PointerEvent = function PointerEvent() {};
  windowTarget._previewDisplayDecimals = 2;
  const sandbox: Record<string, any> = {
    Date,
    Math,
    Number,
    Object,
    String,
    cancelAnimationFrame: () => {},
    chart,
    chartHost,
    console,
    isFinite,
    renderPreviewLivePriceBadge: () => {
      badgeRefreshes += 1;
    },
    requestAnimationFrame: () => 1,
    series,
    window: windowTarget,
  };
  vm.runInNewContext(LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT, sandbox);
  return {
    autoScaleCalls,
    badgeRefreshes: () => badgeRefreshes,
    chartHost,
    chartOptions,
    overwriteVisibleRange: (range: { from: number; to: number }) => {
      visibleRange = { ...range };
    },
    priceScaleOptions,
    runtime: sandbox,
    visibleRange: () => ({ ...visibleRange }),
    visibleRangeCalls,
    window: windowTarget,
  };
};

test('preview runtime embeds the canonical MT5 price-scale constants and resolver', () => {
  assert.match(
    LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT,
    new RegExp(`PREVIEW_PRICE_SCALE_MINIMUM_WIDTH = ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH}`),
  );
  assert.match(
    LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT,
    new RegExp(`PREVIEW_PRICE_SCALE_OCTAVES_PER_PLOT = ${MT5_PRICE_SCALE_OCTAVES_PER_PLOT}`),
  );
  assert.match(
    LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT,
    new RegExp(`PREVIEW_PRICE_SCALE_BOUND_OCTAVES = ${MT5_PRICE_SCALE_BOUND_OCTAVES}`),
  );
  assert.match(
    LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT,
    new RegExp(`PREVIEW_PRICE_SCALE_MAX_DRAG_OCTAVES = ${MT5_PRICE_SCALE_MAX_DRAG_OCTAVES}`),
  );
  assert.match(
    LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT,
    new RegExp(
      `PREVIEW_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS = ${MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS}`,
    ),
  );
  assert.match(LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT, /function resolveMt5PriceScaleDragRange/);
  assert.doesNotMatch(LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT, /Function#toString|\.toString\(\)/);
});

test('install disables competing native vertical transforms but keeps horizontal and pinch gestures', () => {
  const harness = evaluatePriceScaleRuntime();

  assert.equal(harness.window.installPreviewPriceScaleInteractions(), true);
  assert.equal(harness.chartOptions.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.chartOptions[0].handleScroll)),
    {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.chartOptions[0].handleScale)),
    {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: false },
    },
  );
  assert.equal(
    harness.chartOptions[0].rightPriceScale.minimumWidth,
    CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
  );
});

test('right-axis drag scales around the exact price under the finger', () => {
  const harness = evaluatePriceScaleRuntime();
  harness.window.installPreviewPriceScaleInteractions();

  assert.equal(harness.window.isPreviewRightPriceScaleGesturePoint(380, 150), true);
  assert.equal(harness.window.isPreviewRightPriceScaleGesturePoint(300, 150), false);

  harness.chartHost.dispatch('pointerdown', makePointerEvent(380, 150));
  harness.chartHost.dispatch('pointermove', makePointerEvent(380, 100));
  harness.chartHost.dispatch('pointerup', makePointerEvent(380, 100));

  const range = harness.visibleRange();
  const span = range.to - range.from;
  assert.ok(span < 100, 'upward axis drag must zoom in');
  assert.ok(Math.abs(range.to - span / 2 - 150) < 1e-9, 'finger price must stay anchored');
  assert.deepEqual(harness.chartHost.capturedPointers, [1]);
  assert.deepEqual(harness.chartHost.releasedPointers, [1]);
  assert.equal(harness.window.shouldSuppressPreviewPaneTap(380, 100), true);
});

test('body vertical drag shifts price without changing its span and retains the final range', () => {
  const harness = evaluatePriceScaleRuntime();
  harness.window.installPreviewPriceScaleInteractions();

  harness.chartHost.dispatch('pointerdown', makePointerEvent(100, 100));
  harness.chartHost.dispatch('pointermove', makePointerEvent(102, 130));
  harness.chartHost.dispatch('pointerup', makePointerEvent(102, 130));

  const range = harness.visibleRange();
  assert.equal(range.to - range.from, 100);
  assert.equal(range.from, 110);
  assert.equal(range.to, 210);
  const snapshot = harness.window.getPreviewManualPriceScaleSnapshot();
  assert.equal(snapshot.from, 110);
  assert.equal(snapshot.to, 210);
  assert.equal(snapshot.referenceSpan, 100);
  assert.equal(harness.window.shouldSuppressPreviewPaneTap(102, 130), true);
});

test('manual price range reapplies after data replacement and auto-scale clears ownership', () => {
  const harness = evaluatePriceScaleRuntime();
  harness.window.installPreviewPriceScaleInteractions();

  assert.equal(
    harness.window.restorePreviewManualPriceScale({ from: 75, to: 125, referenceSpan: 80 }),
    true,
  );
  harness.visibleRangeCalls.length = 0;
  assert.equal(harness.window.reapplyPreviewManualPriceScale(), true);
  assert.deepEqual(harness.visibleRangeCalls, [{ from: 75, to: 125 }]);

  assert.equal(harness.window.setPreviewChartAutoScaleEnabled(true), true);
  assert.equal(harness.window.getPreviewManualPriceScaleSnapshot(), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.priceScaleOptions.at(-1))),
    { autoScale: true },
  );
  assert.equal(harness.autoScaleCalls.at(-1), true);
});

test('auto-scale setter applies both price-scale APIs for enabled and disabled states', () => {
  const harness = evaluatePriceScaleRuntime();

  assert.equal(harness.window.setPreviewChartAutoScaleEnabled(false), false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.priceScaleOptions.at(-1))),
    { autoScale: false },
  );
  assert.equal(harness.autoScaleCalls.at(-1), false);

  assert.equal(harness.window.setPreviewChartAutoScaleEnabled(true), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.priceScaleOptions.at(-1))),
    { autoScale: true },
  );
  assert.equal(harness.autoScaleCalls.at(-1), true);
});

test('second pointer hands control to pinch and restores the retained manual range only after pinch ends', () => {
  const harness = evaluatePriceScaleRuntime();
  harness.window.installPreviewPriceScaleInteractions();

  harness.chartHost.dispatch('pointerdown', makePointerEvent(380, 150, 1));
  harness.chartHost.dispatch('pointermove', makePointerEvent(380, 100, 1));
  const retainedRange = harness.visibleRange();

  harness.chartHost.dispatch('pointerdown', makePointerEvent(100, 100, 2));
  assert.deepEqual(harness.chartHost.releasedPointers, [1]);

  harness.overwriteVisibleRange({ from: 0, to: 500 });
  harness.chartHost.dispatch('pointerup', makePointerEvent(100, 100, 2));
  assert.deepEqual(harness.visibleRange(), { from: 0, to: 500 });

  harness.chartHost.dispatch('pointerup', makePointerEvent(380, 100, 1));
  assert.deepEqual(harness.visibleRange(), retainedRange);
  assert.equal(harness.window.shouldSuppressPreviewPaneTap(100, 100), true);
});

test('double tap resets only the right axis while body taps remain available to radial routing', () => {
  const harness = evaluatePriceScaleRuntime();
  harness.window.installPreviewPriceScaleInteractions();
  harness.window.restorePreviewManualPriceScale({ from: 90, to: 190, referenceSpan: 100 });

  const axisTap = makePointerEvent(380, 120);
  harness.chartHost.dispatch('pointerdown', axisTap);
  harness.chartHost.dispatch('pointerup', axisTap);
  harness.chartHost.dispatch('pointerdown', axisTap);
  harness.chartHost.dispatch('pointerup', axisTap);

  assert.equal(harness.window.getPreviewManualPriceScaleSnapshot(), null);
  assert.equal(harness.autoScaleCalls.at(-1), true);
  assert.equal(harness.window.shouldSuppressPreviewPaneTap(380, 120), true);
  assert.equal(harness.window.isPreviewRightPriceScaleGesturePoint(100, 120), false);
  assert.doesNotMatch(
    LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT,
    /postMessage|['"]PANE_(?:DOUBLE_)?TAP['"]|emitPaneTap/,
    'price-scale runtime must not take ownership of chart-body radial routing',
  );
});

test('vertical lock blocks both body pan and right-axis scaling', () => {
  const harness = evaluatePriceScaleRuntime();
  harness.window.installPreviewPriceScaleInteractions();
  harness.window.setPreviewVerticalScrollingLocked(true);
  harness.visibleRangeCalls.length = 0;

  harness.chartHost.dispatch('pointerdown', makePointerEvent(380, 150));
  harness.chartHost.dispatch('pointermove', makePointerEvent(380, 80));
  harness.chartHost.dispatch('pointerup', makePointerEvent(380, 80));
  harness.chartHost.dispatch('pointerdown', makePointerEvent(100, 100, 2));
  harness.chartHost.dispatch('pointermove', makePointerEvent(100, 140, 2));
  harness.chartHost.dispatch('pointerup', makePointerEvent(100, 140, 2));

  assert.equal(harness.visibleRangeCalls.length, 0);
});

test('integration APIs are explicitly published on the preview window', () => {
  const harness = evaluatePriceScaleRuntime();
  const apiNames = [
    'applyPreviewPriceScaleInteractionOptions',
    'detachPreviewPriceScaleInteractions',
    'getPreviewManualPriceScaleSnapshot',
    'installPreviewPriceScaleInteractions',
    'isPreviewRightPriceScaleGesturePoint',
    'notifyPreviewPriceScaleResized',
    'reapplyPreviewManualPriceScale',
    'resetPreviewPriceScale',
    'restorePreviewManualPriceScale',
    'setPreviewChartAutoScaleEnabled',
    'setPreviewVerticalScrollingLocked',
    'shouldSuppressPreviewPaneTap',
  ];

  for (const apiName of apiNames) {
    assert.equal(typeof harness.window[apiName], 'function', apiName);
  }
});

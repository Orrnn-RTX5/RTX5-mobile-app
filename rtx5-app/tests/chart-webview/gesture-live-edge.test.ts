import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { CH_HTML } from '../../src/features/chart/rendering/ChartWebViewHtml';
import { extractFunctionBody } from '../support/chartSourceTestUtils';

function harness() {
  const writes: Array<{ from: number; to: number }> = [];
  const recoveryWrites: string[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const context: any = {
    range: { from: 60, to: 106.5 }, currentSeriesLength: 100, liveRightEdgeClampActive: false,
    lastPostedChartTouchActive: false, activeHorizontalScrollGesture: false, horizontalScrollMotionActive: false,
    verticalPricePanGestureActive: false, chartScaleGestureActive: false, activeTradeLineDrag: null,
    visibleRangeIdleTimer: null, visibleRangeIdlePendingAfterGesture: false, pendingHorizontalOverlayApply: false,
    lastOverlayGestureDeferralActivityAt: 0, activeHorizontalScrollGestureUntil: 0,
    ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS: 180,
    priceScaleHealthRaf: 0,
    requestAnimationFrame: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    cancelAnimationFrame: (id: number) => timers.delete(id),
    isRightPriceScaleLayoutHealthy: () => false,
    recoverRightPriceScaleLayout: () => recoveryWrites.push('layout'),
    isManualVerticalPanRangePreserved: () => false, isManualVerticalPanRangeLocked: () => false,
    manualPriceScaleRangeActive: false, getRightPriceScaleApi: () => ({ getVisibleRange: () => null }),
    isValidPriceRange: () => false, enableRightPriceAutoScale: () => recoveryWrites.push('autoscale'),
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    getVisibleLogicalRangeSnapshot: () => context.range,
    applyDeferredHorizontalOverlayPayload() {}, scheduleMovingVerticalGridUpdate() {}, schedulePeriodSeparatorsUpdate() {},
    scheduleActiveScrollPriceScaleRecovery() {}, scheduleOverlayPriceScaleLock() {},
    scheduleOverlayDomRefresh() {}, requestHistoryPaginationForVisibleRange() {}, deferVerticalGestureDomWork() {},
  };
  context.chart = { timeScale: () => ({ setVisibleLogicalRange: (range: {from:number;to:number}) => {
    writes.push({ ...range }); context.range = { ...range };
  } }) };
  const functions = [
    ['getBoundedLiveRightEdge', 'lengthOverride'], ['clampVisibleLogicalRangeToLiveEdge', 'range'],
    ['isHorizontalScrollMotionActive', ''], ['scheduleVisibleRangeIdleWork', ''], ['finishHorizontalScrollGesture', ''],
    ['schedulePriceScaleHealthCheck', 'reason, allowManualReset, attempts'], ['healCollapsedPriceScaleRange', 'reason, allowManualReset'],
  ].map(([name, args]) => `function ${name}(${args}) {${extractFunctionBody(CH_HTML, name)}}`).join('\n');
  const runtime = runInNewContext(`${functions}; ({clampVisibleLogicalRangeToLiveEdge, scheduleVisibleRangeIdleWork, finishHorizontalScrollGesture, schedulePriceScaleHealthCheck})`, context);
  const flush = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); };
  return { context, runtime, writes, recoveryWrites, flush };
}

test('leftward overscroll never rewrites the viewport during a drag or its kinetic continuation; it settles once at idle', () => {
  const h = harness();
  h.context.lastPostedChartTouchActive = true;
  h.context.activeHorizontalScrollGesture = true;
  h.context.horizontalScrollMotionActive = true;
  for (let frame = 1; frame <= 60; frame++) {
    h.context.range = { from: 60 + frame, to: 106.5 + frame };
    h.runtime.clampVisibleLogicalRangeToLiveEdge(h.context.range);
    h.runtime.scheduleVisibleRangeIdleWork();
    h.flush();
    assert.equal(h.writes.length, 0, `drag frame ${frame} must remain owned by the chart library`);
  }
  h.context.lastPostedChartTouchActive = false;
  h.runtime.finishHorizontalScrollGesture();
  for (let frame = 1; frame <= 10; frame++) {
    h.context.range = { from: 120 + frame, to: 166.5 + frame };
    h.runtime.clampVisibleLogicalRangeToLiveEdge(h.context.range);
    h.runtime.scheduleVisibleRangeIdleWork();
    assert.equal(h.writes.length, 0, 'momentum must not fight a range correction');
  }
  h.flush();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0], { from: 60, to: 106.5 });
  h.flush();
  h.runtime.clampVisibleLogicalRangeToLiveEdge(h.context.range);
  assert.equal(h.writes.length, 1, 'the settled edge must not oscillate');
});

test('unclassified touches, vertical gestures and pinch cannot trigger a queued boundary correction', () => {
  for (const flag of ['lastPostedChartTouchActive', 'verticalPricePanGestureActive', 'chartScaleGestureActive']) {
    const h = harness();
    h.context.range = { from: 100, to: 146.5 };
    h.runtime.scheduleVisibleRangeIdleWork();
    h.context[flag] = true;
    h.runtime.clampVisibleLogicalRangeToLiveEdge(h.context.range);
    h.flush();
    assert.equal(h.writes.length, 0, flag);
    h.context[flag] = false;
    h.runtime.scheduleVisibleRangeIdleWork();
    h.flush();
    assert.equal(h.writes.length, 1, `${flag}: deferred work must still settle after release`);
  }
});

test('rightward history scrolling remains unconstrained and idle live-edge padding is retained', () => {
  const h = harness();
  for (let offset = 0; offset < 200; offset += 5) {
    h.context.range = { from: 60 - offset, to: 106.5 - offset };
    h.runtime.clampVisibleLogicalRangeToLiveEdge(h.context.range);
  }
  assert.equal(h.writes.length, 0);
  h.context.range = { from: 100, to: 146.5 };
  h.runtime.clampVisibleLogicalRangeToLiveEdge(h.context.range);
  assert.deepEqual(h.writes[0], { from: 60, to: 106.5 });
});

test('price-scale recovery queued before a gesture cannot resize or reset the chart after that gesture begins', () => {
  for (const flag of ['lastPostedChartTouchActive', 'horizontalScrollMotionActive', 'chartScaleGestureActive', 'verticalPricePanGestureActive']) {
    const h = harness();
    h.runtime.schedulePriceScaleHealthCheck('overlay_update', false, 1);
    h.context[flag] = true;
    h.flush();
    assert.deepEqual(h.recoveryWrites, [], flag);
    h.context[flag] = false;
    h.runtime.schedulePriceScaleHealthCheck('visible_range_idle', false, 1);
    h.flush();
    assert.deepEqual(h.recoveryWrites, ['layout', 'autoscale'], 'idle recovery must remain available');
  }
});

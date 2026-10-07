import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  CHART_PRICE_SCALE_LABEL_FONT_SIZE,
  CHART_PRICE_SCALE_LABEL_FONT_WEIGHT,
  CHART_PRICE_SCALE_LABEL_HEIGHT,
} from '../chartPriceScaleTypography';
import { LIVE_CHART_PREVIEW_RIGHT_PRICE_AXIS_SCRIPT } from './liveChartPreviewRightPriceAxisScript';

type Listener = (...args: any[]) => void;

class FakeElement {
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Listener[]>();
  readonly attributes = new Map<string, string>();
  parentNode: FakeElement | null = null;
  className = '';
  textContent = '';
  clientWidth = 400;
  clientHeight = 300;

  appendChild(child: FakeElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child: FakeElement, before: FakeElement | undefined) {
    child.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

const evaluateAxisRuntime = () => {
  const chartHost = new FakeElement();
  const callbacks: Array<() => void> = [];
  const logicalRangeListeners: Listener[] = [];
  let nextRaf = 1;
  let priceOffset = 0;
  const priceScale = {
    getVisibleRange: () => ({ from: 50 + priceOffset, to: 200 + priceOffset }),
    options: () => ({ invertScale: false }),
    width: () => 62,
  };
  const timeScale = {
    height: () => 20,
    subscribeVisibleLogicalRangeChange: (listener: Listener) => logicalRangeListeners.push(listener),
    unsubscribeVisibleLogicalRangeChange: (listener: Listener) => {
      const index = logicalRangeListeners.indexOf(listener);
      if (index >= 0) logicalRangeListeners.splice(index, 1);
    },
  };
  const chart = {
    options: () => ({
      layout: {
        background: { color: '#FFFFFF' },
        textColor: '#0F172A',
      },
    }),
    priceScale: () => priceScale,
    timeScale: () => timeScale,
  };
  const series = {
    coordinateToPrice: (coordinate: number) => 200 + priceOffset - coordinate / 2,
  };
  const windowObject: Record<string, any> = {
    _fullChartParity: true,
    _lastChartData: [{ time: 1, open: 1, high: 2, low: 1, close: 2 }],
    _previewDisplayDecimals: 2,
  };
  const sandbox: Record<string, any> = {
    Math,
    Number,
    Object,
    String,
    cancelAnimationFrame: () => {},
    chart,
    chartHost,
    document: { createElement: () => new FakeElement() },
    getPreviewRightPriceScaleApi: () => priceScale,
    isFinite,
    normalizePreviewPriceScaleRange: (range: { from: number; to: number } | null) => {
      if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return null;
      return range.from < range.to ? range : { from: range.to, to: range.from };
    },
    requestAnimationFrame: (callback: () => void) => {
      callbacks.push(callback);
      return nextRaf++;
    },
    resolvePreviewPriceScaleHostMetrics: () => ({
      axisLeft: 338,
      axisRight: 400,
      axisWidth: 62,
      height: 300,
      left: 0,
      top: 0,
      width: 400,
    }),
    series,
    window: windowObject,
  };
  vm.runInNewContext(LIVE_CHART_PREVIEW_RIGHT_PRICE_AXIS_SCRIPT, sandbox);
  return {
    chartHost,
    flush: () => {
      while (callbacks.length > 0) callbacks.shift()?.();
    },
    logicalRangeListeners,
    setPriceOffset: (value: number) => { priceOffset = value; },
    window: windowObject,
  };
};

test('split price-axis runtime paints the shared 12px medium typography', () => {
  const harness = evaluateAxisRuntime();

  harness.window.installPreviewRightPriceAxis();
  harness.flush();

  const layer = harness.chartHost.children.find(
    (child) => child.className === 'rtx5-preview-right-price-axis',
  );
  assert.ok(layer);
  const labels = layer.children.filter(
    (child) => child.className === 'rtx5-preview-right-price-axis-label',
  );
  assert.ok(labels.length >= 7);
  assert.equal(labels[0].style.fontSize, `${CHART_PRICE_SCALE_LABEL_FONT_SIZE}px`);
  assert.equal(labels[0].style.fontWeight, CHART_PRICE_SCALE_LABEL_FONT_WEIGHT);
  assert.equal(labels[0].style.lineHeight, `${CHART_PRICE_SCALE_LABEL_HEIGHT}px`);
  assert.equal(labels[0].style.fontVariantNumeric, 'tabular-nums');
  assert.equal(labels[0].style.textShadow, 'none');
  assert.equal(labels[0].style.color, '#0F172A');
});

test('split price-axis runtime refreshes values and detaches without owning gestures', () => {
  const harness = evaluateAxisRuntime();

  harness.window.installPreviewRightPriceAxis();
  harness.flush();
  const layer = harness.chartHost.children[0];
  const firstLabel = layer.children.find(
    (child) => child.className === 'rtx5-preview-right-price-axis-label',
  );
  assert.ok(firstLabel);
  const firstValue = firstLabel.textContent;

  harness.setPriceOffset(25);
  harness.window.schedulePreviewRightPriceAxisRefresh();
  harness.flush();
  assert.notEqual(firstLabel.textContent, firstValue);
  assert.equal(layer.style.pointerEvents, 'none');
  assert.equal(harness.logicalRangeListeners.length, 1);

  harness.window.clearPreviewRightPriceAxis();
  assert.equal(harness.chartHost.children.length, 0);
  assert.equal(harness.logicalRangeListeners.length, 0);
});


import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { LIVE_CHART_PREVIEW_AXIS_DIVIDER_SCRIPT } from './liveChartPreviewAxisDividerScript';

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

  get firstChild() {
    return this.children[0];
  }

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

type PlotMetrics = {
  axisLeft: number;
  axisWidth: number;
  chartWidth: number;
  plotTop: number;
  plotHeight: number;
};

const LIGHT_AXIS_DIVIDER = '#CBD5E1';
const DARK_AXIS_DIVIDER = 'rgba(148,163,184,0.38)';

const evaluateDividerRuntime = () => {
  const chartHost = new FakeElement();
  const callbacks: Array<() => void> = [];
  let nextRaf = 1;
  let timeAxisHeight = 20;
  let metrics: PlotMetrics = {
    axisLeft: 338,
    axisWidth: 62,
    chartWidth: 400,
    plotTop: 0,
    plotHeight: 280,
  };
  const timeScale = {
    height: () => timeAxisHeight,
  };
  const chart = {
    timeScale: () => timeScale,
  };
  const windowObject: Record<string, any> = {
    _fullChartParity: true,
    _customColors: { axisDivider: LIGHT_AXIS_DIVIDER },
  };
  const sandbox: Record<string, any> = {
    Math,
    Number,
    Object,
    String,
    cancelAnimationFrame: () => {},
    chart,
    chartHost,
    document: {
      createElement: () => new FakeElement(),
      createElementNS: () => new FakeElement(),
    },
    isFinite,
    requestAnimationFrame: (callback: () => void) => {
      callbacks.push(callback);
      return nextRaf++;
    },
    resolvePreviewPriceScaleHostMetrics: () => ({
      axisLeft: metrics.axisLeft,
      axisRight: metrics.chartWidth,
      axisWidth: metrics.axisWidth,
      height: metrics.plotTop + metrics.plotHeight + timeAxisHeight,
      left: 0,
      top: 0,
      width: metrics.chartWidth,
    }),
    resolvePreviewRightPriceAxisPlotMetrics: () => ({ ...metrics }),
    window: windowObject,
  };

  vm.runInNewContext(LIVE_CHART_PREVIEW_AXIS_DIVIDER_SCRIPT, sandbox);

  return {
    chartHost,
    flush: () => {
      while (callbacks.length > 0) callbacks.shift()?.();
    },
    setMetrics: (nextMetrics: PlotMetrics, nextTimeAxisHeight = 20) => {
      metrics = nextMetrics;
      timeAxisHeight = nextTimeAxisHeight;
      chartHost.clientWidth = nextMetrics.chartWidth;
      chartHost.clientHeight = nextMetrics.plotTop + nextMetrics.plotHeight + nextTimeAxisHeight;
    },
    window: windowObject,
  };
};

const findDividerLayer = (chartHost: FakeElement) =>
  chartHost.children.find((child) => child.className === 'rtx5-preview-axis-dividers');

const findDivider = (layer: FakeElement, edge: 'top' | 'right' | 'bottom') =>
  layer.children.find(
    (child) => child.className === `rtx5-preview-axis-divider-${edge}`,
  );

const readDividerColor = (element: FakeElement) =>
  element.style.backgroundColor ?? element.style.background;

test('split divider runtime paints only the top, right, and bottom chart boundaries', () => {
  const harness = evaluateDividerRuntime();

  harness.window.installPreviewAxisDividers();
  harness.flush();

  const layer = findDividerLayer(harness.chartHost);
  assert.ok(layer);
  assert.equal(layer.style.pointerEvents, 'none');
  assert.equal(layer.children.length, 3);

  const top = findDivider(layer, 'top');
  const right = findDivider(layer, 'right');
  const bottom = findDivider(layer, 'bottom');
  assert.ok(top);
  assert.ok(right);
  assert.ok(bottom);
  assert.equal(
    layer.children.some((child) => child.className === 'rtx5-preview-axis-divider-left'),
    false,
  );

  assert.deepEqual(
    { left: top.style.left, top: top.style.top, width: top.style.width, height: top.style.height },
    { left: '0px', top: '1px', width: '338px', height: '1px' },
  );
  assert.deepEqual(
    {
      left: right.style.left,
      top: right.style.top,
      width: right.style.width,
      height: right.style.height,
    },
    { left: '338px', top: '1px', width: '1px', height: '278px' },
  );
  assert.deepEqual(
    {
      left: bottom.style.left,
      top: bottom.style.top,
      width: bottom.style.width,
      height: bottom.style.height,
    },
    { left: '0px', top: '279px', width: '338px', height: '1px' },
  );
  assert.equal(readDividerColor(top), LIGHT_AXIS_DIVIDER);
  assert.equal(readDividerColor(right), LIGHT_AXIS_DIVIDER);
  assert.equal(readDividerColor(bottom), LIGHT_AXIS_DIVIDER);
});

test('split dividers refresh theme color and recompute resized plot geometry', () => {
  const harness = evaluateDividerRuntime();

  harness.window.installPreviewAxisDividers();
  harness.flush();
  const layer = findDividerLayer(harness.chartHost);
  assert.ok(layer);

  harness.window._customColors.axisDivider = DARK_AXIS_DIVIDER;
  harness.setMetrics({
    axisLeft: 310,
    axisWidth: 50,
    chartWidth: 360,
    plotTop: 0,
    plotHeight: 240,
  });
  harness.window.schedulePreviewAxisDividersRefresh();
  harness.flush();

  const top = findDivider(layer, 'top');
  const right = findDivider(layer, 'right');
  const bottom = findDivider(layer, 'bottom');
  assert.ok(top);
  assert.ok(right);
  assert.ok(bottom);
  assert.deepEqual(
    { left: top.style.left, top: top.style.top, width: top.style.width, height: top.style.height },
    { left: '0px', top: '1px', width: '310px', height: '1px' },
  );
  assert.deepEqual(
    {
      left: right.style.left,
      top: right.style.top,
      width: right.style.width,
      height: right.style.height,
    },
    { left: '310px', top: '1px', width: '1px', height: '238px' },
  );
  assert.deepEqual(
    {
      left: bottom.style.left,
      top: bottom.style.top,
      width: bottom.style.width,
      height: bottom.style.height,
    },
    { left: '0px', top: '239px', width: '310px', height: '1px' },
  );
  assert.equal(readDividerColor(top), DARK_AXIS_DIVIDER);
  assert.equal(readDividerColor(right), DARK_AXIS_DIVIDER);
  assert.equal(readDividerColor(bottom), DARK_AXIS_DIVIDER);
});

test('split divider runtime clears its owned layer and never installs outside full parity', () => {
  const harness = evaluateDividerRuntime();

  harness.window.installPreviewAxisDividers();
  harness.flush();
  assert.ok(findDividerLayer(harness.chartHost));

  harness.window.clearPreviewAxisDividers();
  assert.equal(findDividerLayer(harness.chartHost), undefined);

  harness.window._fullChartParity = false;
  harness.window.installPreviewAxisDividers();
  harness.flush();
  assert.equal(findDividerLayer(harness.chartHost), undefined);
  assert.equal(harness.chartHost.children.length, 0);
});

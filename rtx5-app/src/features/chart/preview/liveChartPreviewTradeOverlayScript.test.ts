import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { LIVE_CHART_PREVIEW_TRADE_OVERLAY_SCRIPT } from './liveChartPreviewTradeOverlayScript';
import { LIVE_CHART_PNL_COLORS, resolveLiveChartPnlColor } from '../chartOverlays/livePnlColors';

type Listener = () => void;

class FakeElement {
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Listener[]>();
  readonly attributes = new Map<string, string>();
  parentNode: FakeElement | null = null;
  className = '';
  nodeName: string;
  private ownTextContent = '';
  clientWidth = 400;
  clientHeight = 300;

  constructor(nodeName = 'DIV') {
    this.nodeName = nodeName;
  }

  get childNodes() {
    return this.children;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  get textContent() {
    return this.ownTextContent;
  }

  set textContent(value: string) {
    this.ownTextContent = String(value);
    if (this.children.length > 0) {
      this.children.splice(0).forEach((child) => { child.parentNode = null; });
    }
  }

  appendChild(child: FakeElement) {
    child.parentNode = this;
    this.children.push(child);
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

type PreviewTradeOverlayMetrics = {
  axisLeft: number;
  axisWidth: number;
  chartWidth: number;
  plotTop: number;
  plotHeight: number;
};

const DEFAULT_PREVIEW_TRADE_OVERLAY_METRICS: PreviewTradeOverlayMetrics = {
  axisLeft: 338,
  axisWidth: 62,
  chartWidth: 400,
  plotTop: 0,
  plotHeight: 280,
};

const evaluateTradeOverlayRuntime = (
  metrics: PreviewTradeOverlayMetrics = DEFAULT_PREVIEW_TRADE_OVERLAY_METRICS,
  background = '#FFFFFF',
) => {
  const chartHost = new FakeElement();
  const callbacks: Array<() => void> = [];
  const logicalRangeListeners: Listener[] = [];
  let nextRaf = 1;
  const timeScale = {
    subscribeVisibleLogicalRangeChange: (listener: Listener) => logicalRangeListeners.push(listener),
    unsubscribeVisibleLogicalRangeChange: (listener: Listener) => {
      const index = logicalRangeListeners.indexOf(listener);
      if (index >= 0) logicalRangeListeners.splice(index, 1);
    },
  };
  const chart = { timeScale: () => timeScale };
  const series = {
    priceToCoordinate: (price: number) => 250 - (price - 100) * 2,
  };
  const windowObject: Record<string, any> = { _previewDisplayDecimals: 2 };
  const sandbox: Record<string, any> = {
    Math,
    Number,
    Object,
    String,
    cancelAnimationFrame: () => {},
    chart,
    chartHost,
    document: {
      createElement: (name: string) => new FakeElement(name.toUpperCase()),
    },
    isFinite,
    requestAnimationFrame: (callback: () => void) => {
      callbacks.push(callback);
      return nextRaf++;
    },
    resolvePreviewRightPriceAxisColors: () => ({
      background,
      text: '#0F172A',
    }),
    resolvePreviewRightPriceAxisPlotMetrics: () => metrics,
    series,
    window: windowObject,
  };
  vm.runInNewContext(LIVE_CHART_PREVIEW_TRADE_OVERLAY_SCRIPT, sandbox);
  return {
    chartHost,
    flush: () => {
      while (callbacks.length > 0) callbacks.shift()?.();
    },
    logicalRangeListeners,
    window: windowObject,
  };
};

const openPositionLine = (valueText: string) => ({
  id: 'open-42',
  price: 150,
  color: '#2962FF',
  lineWidth: 1,
  lineStyle: 1,
  axisLabelVisible: false,
  title: `BUY 0.03, ${valueText}`,
  labelSideText: 'BUY 0.03',
  labelValueText: valueText,
  labelSideColor: '#2962FF',
  labelValueColor: resolveLiveChartPnlColor(Number.parseFloat(valueText), '#FFFFFF', '#2962FF'),
  labelPlacement: 'line',
});

test('preview runtime renders a keyed split trade label, DOM line, and price box', () => {
  const harness = evaluateTradeOverlayRuntime();
  harness.window.installPreviewTradeOverlayRenderer();
  harness.window.setPreviewTradeOverlayLines([
    openPositionLine('-0.31 USD'),
    { price: 151, color: '#089981', role: 'live' },
  ]);
  harness.flush();

  const layer = harness.chartHost.children.find(
    (child) => child.className === 'rtx5-preview-trade-overlay-layer',
  );
  assert.ok(layer);
  assert.equal(layer.style.pointerEvents, 'none');
  const tradeLine = layer.children.find((child) => child.className === 'rtx5-preview-trade-line');
  assert.ok(tradeLine);
  assert.equal(tradeLine.style.borderTopWidth, '1px');
  assert.equal(tradeLine.style.borderTopStyle, 'dotted');
  assert.equal(tradeLine.style.transform, 'scaleY(0.5)');
  assert.equal(tradeLine.style.transformOrigin, 'top left');
  const label = layer.children.find(
    (child) => child.className === 'rtx5-preview-trade-label',
  );
  assert.ok(label);
  assert.equal(label.children[0].textContent, 'BUY 0.03');
  assert.equal(label.children[0].style.color, LIVE_CHART_PNL_COLORS.lightCanvas.loss);
  assert.equal(label.children[0].style.backgroundColor, '#FFFFFF');
  assert.equal(label.children[2].textContent, '-0.31 USD');
  assert.equal(label.children[2].style.color, LIVE_CHART_PNL_COLORS.lightCanvas.loss);
  assert.equal(label.children[2].style.backgroundColor, '#FFFFFF');
  assert.equal(label.children[2].style.padding, '0 2px');
  assert.equal(label.style.left, '41px');
  assert.equal(label.style.width, '164px');
  assert.equal(label.style.textAlign, 'center');
  assert.equal(label.style.display, 'flex');
  assert.equal(label.children[0].style.textAlign, 'left');
  assert.equal(label.children[0].style.height, '100%');
  assert.equal(label.children[2].style.textAlign, 'left');
  assert.equal(label.children[2].style.flex, '0 1 auto');
  assert.equal(label.style.justifyContent, 'flex-start');
  const box = layer.children.find(
    (child) => child.className === 'rtx5-preview-position-price-box',
  );
  assert.ok(box);
  assert.equal(box.textContent, '150.00');
  assert.equal(box.style.left, '338px');
  assert.equal(harness.logicalRangeListeners.length, 1);
});

test('preview open-position label lane stays inside an ultra-narrow divided pane', () => {
  const harness = evaluateTradeOverlayRuntime({
    axisLeft: 72,
    axisWidth: 48,
    chartWidth: 120,
    plotTop: 0,
    plotHeight: 280,
  });
  harness.window.setPreviewTradeOverlayLines([openPositionLine('+0.25 USD')]);
  harness.flush();

  const layer = harness.chartHost.children[0];
  const label = layer.children.find(
    (child) => child.className === 'rtx5-preview-trade-label',
  );
  const box = layer.children.find(
    (child) => child.className === 'rtx5-preview-position-price-box',
  );

  assert.equal(label?.style.left, '0px');
  assert.equal(label?.style.width, '72px');
  assert.equal(box?.style.left, '72px');
});

test('preview keeps non-position order labels in their existing lane', () => {
  const harness = evaluateTradeOverlayRuntime();
  harness.window.setPreviewTradeOverlayLines([{
    ...openPositionLine('pending'),
    id: 'order-entry-7',
  }]);
  harness.flush();

  const label = harness.chartHost.children[0].children.find(
    (child) => child.className === 'rtx5-preview-trade-label',
  );

  assert.equal(label?.style.left, '98px');
  assert.equal(label?.style.textAlign, 'initial');
  assert.equal(label?.children[2].style.backgroundColor, 'transparent');
  assert.equal(label?.children[0].style.color, '#2962FF');
  assert.equal(label?.children[0].style.backgroundColor, 'transparent');
  assert.equal(label?.style.display, 'block');
});

test('preview runtime patches the same keyed label and prunes a closed trade', () => {
  const harness = evaluateTradeOverlayRuntime();
  harness.window.setPreviewTradeOverlayLines([openPositionLine('-0.31 USD')]);
  harness.flush();
  const layer = harness.chartHost.children[0];
  const firstLabel = layer.children.find(
    (child) => child.className === 'rtx5-preview-trade-label',
  );
  assert.ok(firstLabel);
  assert.equal(firstLabel.children[2].style.color, LIVE_CHART_PNL_COLORS.lightCanvas.loss);
  assert.equal(firstLabel.children[0].style.color, LIVE_CHART_PNL_COLORS.lightCanvas.loss);

  harness.window.setPreviewTradeOverlayLines([openPositionLine('+0.25 USD')]);
  harness.flush();
  const updatedLabel = layer.children.find(
    (child) => child.className === 'rtx5-preview-trade-label',
  );
  assert.equal(updatedLabel, firstLabel);
  assert.equal(updatedLabel?.children[2].textContent, '+0.25 USD');
  assert.equal(updatedLabel?.children[2].style.color, LIVE_CHART_PNL_COLORS.lightCanvas.profit);
  assert.equal(updatedLabel?.children[2].style.backgroundColor, '#FFFFFF');
  assert.equal(updatedLabel?.children[0].style.color, LIVE_CHART_PNL_COLORS.lightCanvas.profit);
  assert.equal(updatedLabel?.children[0].textContent, 'BUY 0.03');

  harness.window.setPreviewTradeOverlayLines([]);
  harness.flush();
  assert.equal(layer.children.length, 0);
});

test('50-60 overlapping trades keep stable, opaque Buy/Sell, lot and P/L rows in both themes', () => {
  for (const [background, tradeCount] of [['#121212', 50], ['#FFFFFF', 60]] as const) {
    const harness = evaluateTradeOverlayRuntime(DEFAULT_PREVIEW_TRADE_OVERLAY_METRICS, background);
    const lines = Array.from({ length: tradeCount }, (_, index) => {
      const pnl = index % 2 === 0 ? 0.25 : -0.31;
      return {
        ...openPositionLine(`${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USD`),
        id: `open-cluster-${index}`,
        labelSideText: `${index % 3 === 0 ? 'SELL' : 'BUY'} ${(0.01 + index / 100).toFixed(2)}`,
        labelValueColor: resolveLiveChartPnlColor(pnl, background, '#2962FF'),
      };
    });
    harness.window.setPreviewTradeOverlayLines(lines);
    harness.flush();
    const labels = harness.chartHost.children[0].children.filter(
      (child) => child.className === 'rtx5-preview-trade-label',
    );
    assert.equal(labels.length, tradeCount);
    labels.forEach((label, index) => {
      assert.equal(label.children[2].textContent, lines[index].labelValueText);
      assert.equal(label.children[2].style.color, lines[index].labelValueColor);
      assert.equal(label.children[2].style.backgroundColor, background);
      assert.equal(label.children[0].textContent, lines[index].labelSideText);
      assert.equal(label.children[0].style.color, lines[index].labelValueColor);
      assert.equal(label.children[0].style.backgroundColor, background);
      assert.equal(label.children[1].style.color, lines[index].labelValueColor);
      assert.equal(label.children[1].style.backgroundColor, background);
      assert.equal(label.style.display, 'flex');
      assert.equal(label.children[0].style.flex, '0 0 auto');
      assert.equal(label.children[0].style.textAlign, 'left');
      assert.equal(label.children[2].style.flex, '0 1 auto');
      assert.equal(label.children[2].style.textAlign, 'left');
      assert.equal(label.style.justifyContent, 'flex-start');
      label.children.forEach((span) => assert.equal(span.style.height, '100%'));
    });
    const originalPrefix = labels[labels.length - 1].children[0];
    harness.window.setPreviewTradeOverlayLines(lines.map((line) => ({
      ...line,
      labelValueText: '+12345.678 USD',
      labelValueColor: resolveLiveChartPnlColor(12345.678, background, '#2962FF'),
    })));
    harness.flush();
    assert.equal(labels[labels.length - 1].children[0], originalPrefix);
    assert.equal(originalPrefix.textContent, lines[lines.length - 1].labelSideText);
    assert.equal(originalPrefix.style.textAlign, 'left');
  }
});

test('native preview keeps trade overlays out of autoscaling price-line creation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/preview/LiveChartPreview.native.tsx'),
    'utf8',
  );
  const priceScaleSource = readFileSync(
    resolve(process.cwd(), 'src/features/chart/preview/liveChartPreviewPriceScaleScript.ts'),
    'utf8',
  );

  assert.match(source, /setPreviewTradeOverlayLines\(lines \|\| \[\]\)/);
  assert.match(
    source,
    /isPreviewTradeOverlayLine\(line\)[\s\S]*return;[\s\S]*series\.createPriceLine/,
  );
  assert.match(source, /LIVE_CHART_PREVIEW_TRADE_OVERLAY_SCRIPT/);
  assert.match(priceScaleSource, /schedulePreviewTradeOverlayRefresh\(\)/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
  resolveLiveChartPreviewRecentViewport,
} from './liveChartPreviewViewportScript';

test('full-width auxiliary panes open on the same recent-candle density as ChartScreen', () => {
  const viewport = resolveLiveChartPreviewRecentViewport({
    dataLength: 320,
    viewportWidth: 390,
  });

  assert.ok(viewport);
  assert.equal(viewport.visibleBars, 45);
  assert.equal(viewport.rightEdge, 326.5);
  assert.equal(viewport.from, 281.5);
  assert.equal(viewport.to, 326.5);
  assert.ok(viewport.barSpacing >= 5 && viewport.barSpacing <= 11);
});

test('Area panes compress the full bounded real-close target at subpixel logical spacing', () => {
  const viewport = resolveLiveChartPreviewRecentViewport({
    areaVisibleBarTarget: 500,
    chartType: 'area',
    dataLength: 500,
    viewportWidth: 390,
  });

  assert.ok(viewport);
  assert.equal(viewport.visibleBars, 500);
  assert.equal(viewport.rightEdge, 506.5);
  assert.equal(viewport.from, 6.5);
  assert.equal(viewport.to, 506.5);
  assert.ok(viewport.barSpacing >= 0.5 && viewport.barSpacing < 1);
});

test('Area viewport obeys its timeframe target and never exceeds the 500-bar cap', () => {
  const timeframeTarget = resolveLiveChartPreviewRecentViewport({
    areaVisibleBarTarget: 280,
    chartType: 'area',
    dataLength: 500,
    viewportWidth: 390,
  });
  const bounded = resolveLiveChartPreviewRecentViewport({
    areaVisibleBarTarget: 900,
    chartType: 'area',
    dataLength: 1_000,
    viewportWidth: 390,
  });

  assert.equal(timeframeTarget?.visibleBars, 280);
  assert.equal(bounded?.visibleBars, 500);
});

test('narrow divided panes keep readable candles and the shared seven-bar live gap', () => {
  const viewport = resolveLiveChartPreviewRecentViewport({
    dataLength: 180,
    viewportWidth: 195,
  });

  assert.ok(viewport);
  assert.equal(viewport.visibleBars, 42);
  assert.equal(viewport.barSpacing, 5);
  assert.equal(viewport.rightEdge, 186.5);
  assert.equal(viewport.from, 144.5);
});

test('short histories remain fully visible without exceeding the normal spacing cap', () => {
  const viewport = resolveLiveChartPreviewRecentViewport({
    dataLength: 10,
    viewportWidth: 390,
  });

  assert.ok(viewport);
  assert.equal(viewport.visibleBars, 10);
  assert.equal(viewport.barSpacing, 11);
  assert.equal(viewport.from, 6.5);
  assert.equal(viewport.to, 16.5);
});

test('preview viewport bridge owns recent range and live-edge clamping', () => {
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /function applyPreviewRecentViewport\(lengthOverride\)/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /window\._chartType === 'area'[\s\S]*var visibleBarMax = isAreaSeries[\s\S]*Math\.round\(window\._areaVisibleBarTarget[\s\S]*var visibleBarTargetPx = isAreaSeries[\s\S]*\? 0\.65/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /minBarSpacing: window\._chartType === 'area'[\s\S]*\? 0\.5[\s\S]*: 3/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /setVisibleLogicalRange\(\{[\s\S]*from: Math\.max\(-0\.5, rightEdge - visibleBars\),[\s\S]*to: rightEdge/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /subscribeVisibleLogicalRangeChange[\s\S]*clampPreviewVisibleLogicalRangeToLiveEdge/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /shouldExpandPreviewAreaAfterPrepend[\s\S]*previousRange\.to < previousRightEdge - 1\.25[\s\S]*Math\.abs\(previousSpan - previousDefaultVisibleBars\)/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /restorePreviewPrependedHistoryViewport[\s\S]*previousRange\.from \+ shiftedBy[\s\S]*previousRange\.to \+ shiftedBy/,
  );
});

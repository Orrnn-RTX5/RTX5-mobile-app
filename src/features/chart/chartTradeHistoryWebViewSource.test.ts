import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { CH_HTML } from './rendering/ChartWebViewHtml';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'),
  'utf8',
);

const extractEmbeddedFunction = (functionName: string): string => {
  const start = CH_HTML.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} must exist in the generated WebView HTML`);
  const openBrace = CH_HTML.indexOf('{', start);
  assert.notEqual(openBrace, -1, `${functionName} must have a body`);
  let depth = 0;
  for (let index = openBrace; index < CH_HTML.length; index += 1) {
    if (CH_HTML[index] === '{') depth += 1;
    if (CH_HTML[index] === '}') {
      depth -= 1;
      if (depth === 0) return CH_HTML.slice(start, index + 1);
    }
  }
  throw new Error(`${functionName} body is unterminated`);
};

test('trade history connectors use exact chart time and price coordinates', () => {
  assert.match(
    source,
    /function renderTradeHistorySegmentDom\([\s\S]*timeScale\.timeToCoordinate\(segment\.fromTime\)[\s\S]*timeScale\.timeToCoordinate\(segment\.toTime\)[\s\S]*series\.priceToCoordinate\(segment\.fromPrice\)[\s\S]*series\.priceToCoordinate\(segment\.toPrice\)/,
  );
  assert.match(source, /var length = Math\.hypot\(deltaX, deltaY\)/);
  assert.match(source, /var angle = Math\.atan2\(deltaY, deltaX\)/);
  assert.match(source, /line\.style\.position = 'absolute'/);
  assert.match(source, /line\.style\.width = length \+ 'px'/);
  assert.match(source, /line\.style\.borderTopStyle = 'dotted'/);
  assert.match(source, /line\.style\.transformOrigin = '0 0'/);
  assert.match(source, /line\.style\.transform = 'rotate\(' \+ angle \+ 'rad\)'/);
  assert.match(source, /line\.style\.pointerEvents = 'none'/);
});

test('trade history connector nodes are keyed, clipped, repositioned, and pruned', () => {
  assert.match(source, /var key = 'history-segment:' \+ segment\.id/);
  assert.match(
    source,
    /upsertOverlayDomNode\(layer, key, 'rtx5-trade-history-segment'\)/,
  );
  assert.match(
    source,
    /renderTradeHistorySegmentDom\(layer, payload, liveOverlayKeys, false\)[\s\S]*pruneOverlayDomNodes\(liveOverlayKeys\)/,
  );
  assert.match(
    source,
    /function repositionTradeOverlayDomNodes\(\)[\s\S]*renderTradeHistorySegmentDom\(historyLayer, payload, null, true\)/,
  );
  assert.match(
    source,
    /function renderTradeHistorySegmentDom\([\s\S]*syncOverlayLabelLayerPaneClip\(layer\)/,
  );
  assert.match(
    source,
    /function pruneTradeHistorySegmentDomNodes\([\s\S]*key\.indexOf\('history-segment:'\) !== 0/,
  );
});

test('overlay geometry signature tracks exact history and marker geometry', () => {
  assert.match(
    source,
    /function buildOverlayNativeLineSignature\([\s\S]*String\(mk\.id \|\| ''\)[\s\S]*String\(mk\.price \|\| ''\)[\s\S]*String\(mk\.size \|\| ''\)/,
  );
  assert.match(
    source,
    /String\(segment\.id \|\| ''\)[\s\S]*String\(segment\.fromTime \|\| ''\)[\s\S]*String\(segment\.fromPrice \|\| ''\)[\s\S]*String\(segment\.toTime \|\| ''\)[\s\S]*String\(segment\.toPrice \|\| ''\)[\s\S]*String\(segment\.color \|\| ''\)[\s\S]*String\(segment\.lineWidth \|\| 1\)/,
  );
  assert.match(
    source,
    /parts\.join\('\|'\) \+ '##' \+ markerParts\.join\('\|'\) \+ '##' \+ historyParts\.join\('\|'\)/,
  );
});

test('trade history arrows scale with candle width without changing other markers', () => {
  assert.match(
    source,
    /function resolveTradeHistoryMarkerScale\(\)[\s\S]*options\.barSpacing[\s\S]*Math\.max\(12, Math\.min\(30, barSpacing\)\)[\s\S]*oddBaseHeight % 2 === 0[\s\S]*baseHeight % 2 !== 0[\s\S]*Math\.round\(barSpacing \+ 10\)[\s\S]*size: desiredHeight \/ baseHeight/,
  );
  assert.match(
    source,
    /function scaleTradeHistoryMarkers\(markers, scale\)[\s\S]*marker\.id\.indexOf\('trade-history-'\) !== 0[\s\S]*return marker[\s\S]*Object\.assign\(\{\}, marker, \{ size: scale\.size \}\)/,
  );
  assert.match(
    source,
    /_overlayMarkerSource = nativeMarkers\.slice\(\)[\s\S]*scaleTradeHistoryMarkers\(_overlayMarkerSource, markerScale\)/,
    'the original payload must stay immutable so zoom can rescale from source geometry',
  );
});

test('trade history deals render as thin DOM arrows whose tip sits on the exact deal price', () => {
  // Only non-trade markers go to the library's series markers.
  assert.match(source, /var expectedMarkers = selectNativeOverlayMarkers\(payload\.markers\)/);
  assert.match(source, /var nativeMarkers = selectNativeOverlayMarkers\(markers\);/);
  // Arrows live in the connector pass, so they share its clipping,
  // repositioning on pan/zoom, and pruning.
  assert.match(
    source,
    /function renderTradeHistorySegmentDom\([\s\S]*isTradeHistoryArrowMarker\(arrowMarker\)[\s\S]*timeScale\.timeToCoordinate\(arrowMarker\.time\)[\s\S]*series\.priceToCoordinate\(arrowMarker\.price\)[\s\S]*var arrowKey = 'history-arrow:' \+ arrowMarker\.id/,
  );
  assert.match(
    source,
    /arrowNode\.style\.top = \(arrowUp\s*\? arrowY - arrowInset\s*: arrowY - arrowSize\.height \+ arrowInset\) \+ 'px'/,
    'buy tips point up at the price from below; sell tips point down at it from above',
  );
  assert.match(source, /arrowNode\.style\.left = \(arrowX - arrowSize\.width \/ 2\) \+ 'px'/);
  assert.match(source, /arrowNode\.style\.pointerEvents = 'none'/);
  assert.match(
    source,
    /function pruneTradeHistorySegmentDomNodes\([\s\S]*key\.indexOf\('history-arrow:'\) !== 0/,
  );
  assert.match(
    source,
    /function pruneOverlayDomNodes\([\s\S]*key\.indexOf\('history-arrow:'\) !== 0/,
  );
  assert.match(
    source,
    /function repositionTradeOverlayDomNodes\(\)[\s\S]*hasTradeHistoryArrowMarkers\(_appliedOverlayPayload\)/,
  );
  // A thin single arrow: an unfilled stroked stem plus an open head.
  assert.match(source, /path\.setAttribute\('fill', 'none'\)/);
  assert.match(source, /if \(!up\) svg\.style\.transform = 'scaleY\(-1\)'/);
});

test('trade history arrows and connectors are clipped to the plot, never over the price scale', () => {
  // A dedicated child layer, clipped to the plot area, holds history geometry;
  // the parent overlay layer spans the price axis for the right-axis boxes.
  assert.match(
    source,
    /function ensureTradeHistoryPlotLayer\(parentLayer\)[\s\S]*plotLayer\.style\.overflow = 'hidden'[\s\S]*parentLayer\.insertBefore\(plotLayer, parentLayer\.firstChild\)/,
  );
  // The right clip edge is where the visible price scale begins.
  assert.match(
    source,
    /function ensureTradeHistoryPlotLayer\(parentLayer\)[\s\S]*var axisMetrics = resolveMarketPriceScaleAxisMetrics\(parentLayer\);[\s\S]*Math\.round\(axisMetrics\.axisLeft\)[\s\S]*plotLayer\.style\.width = plotWidth \+ 'px'/,
  );
  // Nodes attached elsewhere are dropped when the layer is (re)created.
  assert.match(
    source,
    /if \(!plotLayer \|\| plotLayer\.parentNode !== parentLayer\) \{[\s\S]*pruneTradeHistorySegmentDomNodes\(\[\]\);/,
  );
  // Both connectors and arrows render into it, on every render/reposition.
  assert.match(
    source,
    /function renderTradeHistorySegmentDom\([\s\S]*syncOverlayLabelLayerPaneClip\(layer\);\s*\/\/[^\n]*\n\s*layer = ensureTradeHistoryPlotLayer\(layer\) \|\| layer;[\s\S]*upsertOverlayDomNode\(layer, key, 'rtx5-trade-history-segment'\)[\s\S]*upsertOverlayDomNode\(layer, arrowKey, 'rtx5-trade-history-arrow'\)/,
  );
});

test('only trade history arrow markers are drawn as DOM arrows', () => {
  const evaluate = new Function(
    'markers',
    `${extractEmbeddedFunction('isTradeHistoryArrowMarker')};
     ${extractEmbeddedFunction('selectNativeOverlayMarkers')};
     return selectNativeOverlayMarkers(markers);`,
  ) as (markers: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
  const openArrow = { id: 'trade-history-open-1', shape: 'arrowUp' };
  const closeArrow = { id: 'trade-history-close-1', shape: 'arrowDown' };
  const signal = { id: 'pattern-signal-1', shape: 'arrowUp' };
  const alert = { id: 'alert-1', shape: 'circle' };

  assert.deepEqual(evaluate([openArrow, signal, closeArrow, alert]), [signal, alert]);
  assert.deepEqual(evaluate([]), []);
});

test('trade history arrow size follows candle width inside a thin-pointer band', () => {
  const evaluate = new Function(
    'spacing',
    `${extractEmbeddedFunction('resolveTradeHistoryArrowSize')};
     return resolveTradeHistoryArrowSize(spacing === null ? null : { options: () => ({ barSpacing: spacing }) });`,
  ) as (spacing: number | null) => { width: number; height: number; stroke: number };

  assert.deepEqual(evaluate(2), { width: 9, height: 14, stroke: 1.6 });
  assert.deepEqual(evaluate(9), { width: 11, height: 17, stroke: 1.6 });
  assert.deepEqual(evaluate(40), { width: 15, height: 24, stroke: 2 });
  const fallback = evaluate(null);
  assert.ok(fallback.height >= 14 && fallback.height <= 24);
});

test('trade history arrow scale matches Lightweight Charts 5.1 placement math', () => {
  const functionSource = extractEmbeddedFunction('resolveTradeHistoryMarkerScale');
  const evaluate = new Function(
    'chart',
    `${functionSource}; return resolveTradeHistoryMarkerScale();`,
  ) as (chart: unknown) => { key: string; size: number };

  const table = [
    { spacing: 3, desired: 13, base: 10 },
    { spacing: 5, desired: 15, base: 10 },
    { spacing: 9, desired: 19, base: 10 },
    { spacing: 11, desired: 21, base: 10 },
    { spacing: 12, desired: 22, base: 10 },
    { spacing: 12.1, desired: 22, base: 12 },
    { spacing: 14, desired: 24, base: 12 },
    { spacing: 15, desired: 25, base: 14 },
    { spacing: 20, desired: 30, base: 18 },
    { spacing: 30, desired: 30, base: 28 },
  ];

  let previousDrawnHeight = 0;
  table.forEach(({ spacing, desired, base }) => {
    const scale = evaluate({
      timeScale: () => ({ options: () => ({ barSpacing: spacing }) }),
    });
    assert.equal(scale.key, `${desired}:${base}`, `bar spacing ${spacing}`);
    assert.equal(scale.size, desired / base, `bar spacing ${spacing}`);

    const internalPlacementHeight = base * scale.size;
    const clampedDrawInput = Math.max(12, Math.min(30, internalPlacementHeight));
    const ceiledDrawInput = Math.ceil(clampedDrawInput);
    const drawnHeight = ceiledDrawInput % 2 === 0
      ? ceiledDrawInput - 1
      : ceiledDrawInput;
    const tipGap = (internalPlacementHeight - drawnHeight + 1) / 2;
    assert.ok(drawnHeight >= previousDrawnHeight, `bar spacing ${spacing} must not shrink`);
    assert.ok(tipGap >= 0 && tipGap <= 1, `bar spacing ${spacing} tip gap ${tipGap}`);
    previousDrawnHeight = drawnHeight;
  });

  assert.deepEqual(evaluate(null), { key: '19:10', size: 1.9 });
});

test('zoom scaling clones history markers and leaves signal markers untouched', () => {
  const functionSource = extractEmbeddedFunction('scaleTradeHistoryMarkers');
  const evaluate = new Function(
    'markers',
    'scale',
    `${functionSource}; return scaleTradeHistoryMarkers(markers, scale);`,
  ) as (
    markers: Array<Record<string, unknown>>,
    scale: { size: number },
  ) => Array<Record<string, unknown>>;
  const historyMarker = { id: 'trade-history-open-1', size: 2, color: '#2563EB' };
  const signalMarker = { id: 'pattern-signal-1', size: 3, color: '#F59E0B' };

  const scaled = evaluate([historyMarker, signalMarker], { size: 1.9 });

  assert.notEqual(scaled[0], historyMarker);
  assert.deepEqual(scaled[0], { ...historyMarker, size: 1.9 });
  assert.equal(scaled[1], signalMarker);
  assert.deepEqual(historyMarker, { id: 'trade-history-open-1', size: 2, color: '#2563EB' });
});

test('all generated WebView scripts remain valid JavaScript', () => {
  const scripts = [...CH_HTML.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]);
  assert.equal(scripts.length, 4);
  scripts.forEach((script, index) => {
    assert.doesNotThrow(
      () => new Function(script),
      `generated WebView script ${index + 1} must parse`,
    );
  });
});

test('trade history arrow scale refresh reuses the current marker primitive on zoom', () => {
  assert.match(
    source,
    /function refreshTradeHistoryMarkerScale\(force\)[\s\S]*_overlayMarkers\.getSeries\(\) !== series[\s\S]*scale\.key === _lastTradeHistoryMarkerScaleKey[\s\S]*_overlayMarkers\.setMarkers\(scaleTradeHistoryMarkers\(_overlayMarkerSource, scale\)\)/,
  );
  assert.match(
    source,
    /function scheduleTradeOverlayReposition\(\)[\s\S]*requestAnimationFrame\(function\(\)[\s\S]*refreshTradeHistoryMarkerScale\(false\)[\s\S]*repositionTradeOverlayDomNodes\(\)/,
    'visible-range updates must resize arrows in the same animation frame as their connector',
  );
  assert.match(
    source,
    /key: desiredHeight \+ ':' \+ baseHeight/,
    'the cache key must include the library base height after desired size reaches its cap',
  );
});

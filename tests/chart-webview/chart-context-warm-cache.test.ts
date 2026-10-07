import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extractFunctionBody } from '../support/chartSourceTestUtils';

const sourceCandidates = [
  resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'),
  resolve(process.cwd(), 'rtx5-app/src/features/chart/rendering/ChartWebViewHtml.ts'),
];
const sourcePath = sourceCandidates.find((candidate) => existsSync(candidate));
assert.ok(sourcePath, 'ChartWebViewHtml.ts was not found from the test working directory');
const source = readFileSync(sourcePath, 'utf8');

const readCacheCapacity = (): number => {
  const match = /var CHART_CONTEXT_SNAPSHOT_CACHE_CAPACITY = (\d+);/.exec(source);
  assert.ok(match, 'warm chart context cache capacity declaration was not found');
  return Number(match[1]);
};

const buildCacheHarness = () => {
  const capacity = readCacheCapacity();
  const cloneBody = extractFunctionBody(source, 'cloneCachedChartContextSeriesData');
  const touchBody = extractFunctionBody(source, 'touchCachedChartContext');
  const rememberBody = extractFunctionBody(source, 'rememberCachedChartContextSnapshot');
  const readBody = extractFunctionBody(source, 'readCachedChartContextSnapshot');
  const updateDatumBody = extractFunctionBody(
    source,
    'updateCachedChartContextSnapshotWithDatum',
  );
  return new Function(`
    var CHART_CONTEXT_SNAPSHOT_CACHE_CAPACITY = ${capacity};
    var cachedChartContextSnapshots = Object.create(null);
    var cachedChartContextLru = [];
    function cloneCachedChartContextSeriesData(data) {${cloneBody}}
    function touchCachedChartContext(dataContextSig) {${touchBody}}
    function rememberCachedChartContextSnapshot(
      dataContextSig,
      cachedSeriesType,
      rawSeriesData,
      displayDecimals
    ) {${rememberBody}}
    function readCachedChartContextSnapshot(dataContextSig, requestedSeriesType) {${readBody}}
    function updateCachedChartContextSnapshotWithDatum(
      dataContextSig,
      cachedSeriesType,
      datum,
      displayDecimals
    ) {${updateDatumBody}}
    return {
      remember: rememberCachedChartContextSnapshot,
      read: readCachedChartContextSnapshot,
      updateDatum: updateCachedChartContextSnapshotWithDatum,
    };
  `)() as {
    remember: (
      context: string,
      seriesType: string,
      data: Array<Record<string, number>>,
      displayDecimals: number,
    ) => boolean;
    read: (
      context: string,
      seriesType: string,
    ) => null | {
      dataContextSig: string;
      seriesType: string;
      data: Array<Record<string, number>>;
      displayDecimals: number | null;
    };
    updateDatum: (
      context: string,
      seriesType: string,
      datum: Record<string, number>,
      displayDecimals: number,
    ) => boolean;
  };
};

test('document-local context cache keeps at least twelve symbols with LRU promotion', () => {
  const capacity = readCacheCapacity();
  assert.ok(capacity >= 12, `expected at least 12 cached chart contexts, received ${capacity}`);
  const cache = buildCacheHarness();

  for (let index = 0; index < capacity; index += 1) {
    assert.equal(
      cache.remember(
        `context-${index}`,
        'candles',
        [{ time: index + 1, open: index + 1, high: index + 2, low: index, close: index + 1 }],
        index % 6,
      ),
      true,
    );
  }

  assert.ok(cache.read('context-0', 'candles'), 'reading a warm context must promote it');
  assert.equal(
    cache.remember(
      `context-${capacity}`,
      'candles',
      [{ time: capacity + 1, open: 1, high: 2, low: 0, close: 1 }],
      3,
    ),
    true,
  );
  assert.equal(cache.read('context-1', 'candles'), null, 'least-recent context must be evicted');
  assert.ok(cache.read('context-0', 'candles'), 'promoted context must survive eviction');
  assert.equal(
    cache.read('context-0', 'area'),
    null,
    'a snapshot from another series type must never count as a warm hit',
  );
});

test('cached snapshots isolate data mutations and retain target-symbol precision', () => {
  const cache = buildCacheHarness();
  const sourceCandle = { time: 10, open: 1.2, high: 1.3, low: 1.1, close: 1.25 };
  assert.equal(cache.remember('MXNJPY:M1', 'candles', [sourceCandle], 3), true);

  sourceCandle.close = 99;
  const firstRead = cache.read('MXNJPY:M1', 'candles');
  assert.ok(firstRead);
  assert.equal(firstRead.displayDecimals, 3);
  assert.equal(firstRead.data[0].close, 1.25);

  firstRead.data[0].close = 77;
  const secondRead = cache.read('MXNJPY:M1', 'candles');
  assert.ok(secondRead);
  assert.equal(secondRead.data[0].close, 1.25, 'a consumer cannot mutate the retained snapshot');
});

test('accepted active-context ticks refresh the cached tail without copying the full series', () => {
  const cache = buildCacheHarness();
  assert.equal(
    cache.remember(
      'EURUSD:M1',
      'candles',
      [{ time: 10, open: 1.1, high: 1.2, low: 1, close: 1.15 }],
      5,
    ),
    true,
  );
  assert.equal(
    cache.updateDatum(
      'EURUSD:M1',
      'candles',
      { time: 10, open: 1.1, high: 1.22, low: 1, close: 1.2 },
      5,
    ),
    true,
  );
  assert.equal(
    cache.updateDatum(
      'EURUSD:M1',
      'candles',
      { time: 11, open: 1.2, high: 1.3, low: 1.18, close: 1.28 },
      5,
    ),
    true,
  );

  const refreshed = cache.read('EURUSD:M1', 'candles');
  assert.ok(refreshed);
  assert.equal(refreshed.data.length, 2);
  assert.equal(refreshed.data[0].close, 1.2);
  assert.equal(refreshed.data[1].close, 1.28);
  assert.equal(
    cache.updateDatum(
      'EURUSD:M1',
      'area',
      { time: 12, open: 1.28, high: 1.3, low: 1.2, close: 1.25 },
      5,
    ),
    false,
    'a live update from another chart series type must not mutate the cached context',
  );

  const upsertBody = extractFunctionBody(source, 'upsertRawSeriesDatum');
  assert.match(
    upsertBody,
    /lastRawSeriesData\[lastIndex\] = normalized;[\s\S]*updateCachedChartContextSnapshotWithDatum\([\s\S]*lastInitDataContextSig,[\s\S]*seriesType,[\s\S]*normalized,[\s\S]*lastDisplayDecimals[\s\S]*lastRawSeriesData\.push\(normalized\);[\s\S]*updateCachedChartContextSnapshotWithDatum/,
    'both same-bar replacement and appended bars must refresh the active warm snapshot',
  );
});

test('init and replacement paints cache only after non-empty setData succeeds', () => {
  const initBody = extractFunctionBody(source, '_doInitChart');
  const updateBody = extractFunctionBody(source, 'updateChartData');
  const initSetData = initBody.indexOf('series.setData(mapped)');
  const initRemember = initBody.indexOf('rememberCachedChartContextSnapshot(', initSetData);
  const updateSetData = updateBody.indexOf('series.setData(mapped)');
  const updateRemember = updateBody.indexOf('rememberCachedChartContextSnapshot(', updateSetData);
  const updateAcknowledgement = updateBody.indexOf(
    'postChartDataPainted(paintedDataContextSig, paintToken)',
    updateSetData,
  );

  assert.ok(initSetData >= 0 && initRemember > initSetData);
  assert.match(
    initBody.slice(initSetData, initRemember + 240),
    /series\.setData\(mapped\);[\s\S]*mapped\.length > 0[\s\S]*rememberCachedChartContextSnapshot\([\s\S]*resolvedDataContextSig,[\s\S]*seriesType,[\s\S]*lastRawSeriesData,[\s\S]*lastDisplayDecimals/,
  );
  assert.ok(updateSetData >= 0 && updateRemember > updateSetData);
  assert.ok(
    updateAcknowledgement > updateRemember,
    'cache bookkeeping must follow setData but cannot delay the tokenized paint acknowledgement',
  );
  assert.match(
    updateBody.slice(updateSetData, updateAcknowledgement),
    /mapped\.length > 0 && paintedDataContextSig[\s\S]*rememberCachedChartContextSnapshot\([\s\S]*lastDisplayDecimals[\s\S]*catch \(_contextCacheUpdateError\) \{\}/,
    'cache allocation failure must be contained before the paint acknowledgement',
  );
});

test('warm activation uses cached precision and clears old-context presentation before ACK', () => {
  const activationBody = extractFunctionBody(source, 'activateCachedChartContext');
  const clearBody = extractFunctionBody(source, 'clearChartContextPresentationForActivation');
  const updateBody = extractFunctionBody(source, 'updateChartData');

  assert.match(
    activationBody,
    /readCachedChartContextSnapshot\([\s\S]*requestedDataContextSig,[\s\S]*seriesType[\s\S]*cachedDisplayDecimals = cachedSnapshot\.displayDecimals[\s\S]*targetDisplayDecimals =[\s\S]*cachedDisplayDecimals[\s\S]*requestedDisplayDecimals/,
    'cached target precision must win over the caller fallback',
  );
  assert.match(
    activationBody,
    /clearChartContextPresentationForActivation\(\);[\s\S]*setDisplayDecimals\(targetDisplayDecimals\);[\s\S]*updateChartData\(cachedSnapshot\.data, \{[\s\S]*resetVisibleRange: true,[\s\S]*suppressContextOverlayRebuild: true,[\s\S]*dataContextSig: requestedDataContextSig,[\s\S]*paintToken: requestedPaintToken/,
    'warm activation must reset context presentation and use the normal full replacement path',
  );
  assert.match(
    clearBody,
    /lastLivePrice = null;[\s\S]*lastBidPrice = null;[\s\S]*lastAskPrice = null;[\s\S]*clearMarketPriceLineRefs\(\)[\s\S]*_overlayPayload = emptyOverlayPayload[\s\S]*clearOverlayPriceLines\(\)[\s\S]*clearOverlayMarkers\(\)[\s\S]*setSerializedDrawings\(\[\]\)/,
    'outgoing symbol prices, trade overlays, markers, and drawings must be removed before activation',
  );
  assert.doesNotMatch(clearBody, /clearDrawings\(|removeAllDrawings/);
  assert.match(
    updateBody,
    /suppressContextOverlayRebuild =[\s\S]*updateOptions\.suppressContextOverlayRebuild === true[\s\S]*if \(!suppressContextOverlayRebuild && _overlayPayload\)/,
    'cached activation must not reconstruct the outgoing overlay payload after setData',
  );
});

test('activation reports an explicit hit only after synchronous replacement success', () => {
  const activationBody = extractFunctionBody(source, 'activateCachedChartContext');
  const postBody = extractFunctionBody(source, 'postChartContextActivated');
  const updateBody = extractFunctionBody(source, 'updateChartData');
  const applyIndex = activationBody.indexOf('var didApplyCachedSnapshot = updateChartData');
  const successIndex = activationBody.lastIndexOf('postChartContextActivated(');

  assert.ok(applyIndex >= 0 && successIndex > applyIndex);
  assert.match(
    activationBody.slice(applyIndex),
    /didApplyCachedSnapshot !== true[\s\S]*postChartContextActivated\([\s\S]*false[\s\S]*return false;[\s\S]*postChartContextActivated\([\s\S]*true[\s\S]*return true;/,
  );
  assert.match(
    activationBody,
    /catch \(_cachedContextActivationError\) \{[\s\S]*postChartContextActivated\([\s\S]*false[\s\S]*return false;/,
    'an unexpected activation rejection must still resolve the native request as a miss',
  );
  assert.match(
    postBody,
    /type: 'CHART_CONTEXT_ACTIVATED'[\s\S]*requestId:[\s\S]*dataContextSig: dataContextSig \|\| ''[\s\S]*paintToken: paintToken \|\| ''[\s\S]*hit: hit === true/,
  );
  assert.match(
    updateBody,
    /Queued is not the same as synchronously applied[\s\S]*return false;[\s\S]*series\.setData\(mapped\)[\s\S]*scheduleMarketPriceScaleDomOnly\(\);[\s\S]*return true;[\s\S]*catch \(e\)[\s\S]*return false;/,
    'updateChartData must distinguish queued, failed, and synchronously applied work',
  );
  assert.match(
    source,
    /window\.activateCachedChartContext = activateCachedChartContext;/,
    'native must be able to invoke the warm-context activation bridge',
  );
});

test('delayed native overlay writes are rejected outside the activated context', () => {
  const guardBody = extractFunctionBody(source, 'isChartOverlayWriteContextCurrent');
  const isCurrent = new Function(
    'lastInitDataContextSig',
    `
      function isChartOverlayWriteContextCurrent(dataContextSig) {${guardBody}}
      return isChartOverlayWriteContextCurrent;
    `,
  )('session:A:M1') as (context?: string) => boolean;

  assert.equal(isCurrent(), true, 'internal same-document overlay work may omit context');
  assert.equal(isCurrent('session:A:M1'), true);
  assert.equal(
    isCurrent('session:B:M1'),
    false,
    'a delayed outgoing-symbol overlay must not decorate the activated series',
  );

  for (const functionName of [
    'setChartOverlays',
    'updateOverlayTradeLabelValues',
    'updateOverlayTradeLabels',
  ]) {
    assert.match(
      extractFunctionBody(source, functionName),
      /isChartOverlayWriteContextCurrent\(arguments\[1\]\)/,
      `${functionName} must reject a stale native context before mutating overlay state`,
    );
  }
});

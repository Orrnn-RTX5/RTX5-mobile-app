import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getQuoteLatencyMetricsSnapshot,
  QUOTE_LATENCY_SAMPLE_CAPACITY,
  recordQuoteCacheCommit,
  recordQuoteListCommit,
  recordQuoteRowVisible,
  resetQuoteLatencyMetrics,
} from './quoteLatencyMetrics';

const recordCompleteSample = (
  updateSeq: number,
  sourceToReceiptMs: number,
  receiptToCacheMs: number,
  cacheToVisibleMs: number,
  sessionKey = 'opaque-session-a',
): void => {
  const sourceTimestampMs = 1_000;
  const receivedTimestampMs = sourceTimestampMs + sourceToReceiptMs;
  const receiptMonotonicTimestampMs = 20_000;
  const cacheMonotonicTimestampMs = receiptMonotonicTimestampMs + receiptToCacheMs;
  recordQuoteCacheCommit({
    sessionKey,
    updateSeq,
    sourceTimestampMs,
    receivedTimestampMs,
    receiptMonotonicTimestampMs,
    cacheTimestampMs: receivedTimestampMs + receiptToCacheMs,
    cacheMonotonicTimestampMs,
  });
  recordQuoteRowVisible({
    sessionKey,
    updateSeq,
    visibleMonotonicTimestampMs: cacheMonotonicTimestampMs + cacheToVisibleMs,
  });
};

test('records deterministic p50/p95/p99 for each quote latency stage', () => {
  resetQuoteLatencyMetrics();
  recordCompleteSample(1, 100, 5, 10);
  recordCompleteSample(2, 200, 10, 20);
  recordCompleteSample(3, 300, 15, 30);

  const snapshot = getQuoteLatencyMetricsSnapshot();
  assert.deepEqual(snapshot.stages.sourceToReceipt, {
    count: 3,
    p50Ms: 200,
    p95Ms: 300,
    p99Ms: 300,
  });
  assert.deepEqual(snapshot.stages.receiptToCache, {
    count: 3,
    p50Ms: 10,
    p95Ms: 15,
    p99Ms: 15,
  });
  assert.deepEqual(snapshot.stages.cacheToVisibleRow, {
    count: 3,
    p50Ms: 20,
    p95Ms: 30,
    p99Ms: 30,
  });
  assert.deepEqual(snapshot.stages.receiptToVisibleRow, {
    count: 3,
    p50Ms: 30,
    p95Ms: 45,
    p99Ms: 45,
  });
  assert.deepEqual(snapshot.stages.sourceToVisibleRow, {
    count: 3,
    p50Ms: 230,
    p95Ms: 345,
    p99Ms: 345,
  });
  assert.equal(snapshot.pendingVisibilitySamples, 0);
});

test('resets all aggregates when the opaque session epoch changes', () => {
  resetQuoteLatencyMetrics();
  recordCompleteSample(1, 10, 2, 3, 'broker-a-account-a-epoch-1');
  recordCompleteSample(2, 20, 4, 6, 'broker-b-account-b-epoch-2');

  const snapshot = getQuoteLatencyMetricsSnapshot();
  assert.equal(snapshot.stages.sourceToReceipt.count, 1);
  assert.equal(snapshot.stages.sourceToReceipt.p50Ms, 20);
  assert.equal(snapshot.stages.sourceToVisibleRow.p50Ms, 30);

  const exported = JSON.stringify(snapshot);
  assert.doesNotMatch(exported, /broker-a|account-a|broker-b|account-b|epoch-/);
});

test('rejects negative and incompatible-clock deltas instead of poisoning percentiles', () => {
  resetQuoteLatencyMetrics();
  recordQuoteCacheCommit({
    sessionKey: 'opaque-session-a',
    updateSeq: 1,
    sourceTimestampMs: 2_000,
    receivedTimestampMs: 1_000,
    receiptMonotonicTimestampMs: 500,
    cacheTimestampMs: 900,
    cacheMonotonicTimestampMs: 400,
  });
  recordQuoteRowVisible({
    sessionKey: 'opaque-session-a',
    updateSeq: 1,
    visibleMonotonicTimestampMs: 300,
  });

  const snapshot = getQuoteLatencyMetricsSnapshot();
  assert.equal(snapshot.stages.sourceToReceipt.count, 0);
  assert.equal(snapshot.stages.receiptToCache.count, 0);
  assert.equal(snapshot.stages.cacheToVisibleRow.count, 0);
  assert.equal(snapshot.stages.receiptToVisibleRow.count, 0);
  assert.equal(snapshot.stages.sourceToVisibleRow.count, 0);
  assert.equal(snapshot.rejectedSampleCount, 3);
});

test('bounds samples and pending row timings without retaining per-symbol data', () => {
  resetQuoteLatencyMetrics();
  const extraSamples = 9;
  for (let index = 1; index <= QUOTE_LATENCY_SAMPLE_CAPACITY + extraSamples; index += 1) {
    recordQuoteCacheCommit({
      sessionKey: 'opaque-session-a',
      updateSeq: index,
      receivedTimestampMs: 1_000,
      receiptMonotonicTimestampMs: 10_000,
      cacheTimestampMs: 1_001,
      cacheMonotonicTimestampMs: 10_001,
    });
  }

  const snapshot = getQuoteLatencyMetricsSnapshot();
  assert.equal(snapshot.stages.receiptToCache.count, QUOTE_LATENCY_SAMPLE_CAPACITY);
  assert.equal(snapshot.pendingVisibilitySamples, QUOTE_LATENCY_SAMPLE_CAPACITY);
  assert.equal(snapshot.sampleCapacityPerStage, QUOTE_LATENCY_SAMPLE_CAPACITY);
  assert.deepEqual(Object.keys(snapshot), [
    'schemaVersion',
    'sessionActive',
    'sampleCapacityPerStage',
    'pendingVisibilitySamples',
    'rejectedSampleCount',
    'liveCacheCommitCount',
    'quoteListCommitCount',
    'stages',
  ]);
});

test('counts parent list commits without exposing a metrics subscription', () => {
  resetQuoteLatencyMetrics();
  recordCompleteSample(1, 10, 2, 3, 'opaque-session-a');
  recordQuoteListCommit('stale-session');
  recordQuoteListCommit('opaque-session-a');
  recordQuoteListCommit('opaque-session-a');

  const snapshot = getQuoteLatencyMetricsSnapshot();
  assert.equal(snapshot.liveCacheCommitCount, 1);
  assert.equal(snapshot.quoteListCommitCount, 2);
});

test('ignores duplicate row visibility reports after the first frame', () => {
  resetQuoteLatencyMetrics();
  recordCompleteSample(1, 10, 2, 3);
  recordQuoteRowVisible({
    sessionKey: 'opaque-session-a',
    updateSeq: 1,
    visibleMonotonicTimestampMs: 99_999,
  });

  assert.equal(getQuoteLatencyMetricsSnapshot().stages.cacheToVisibleRow.count, 1);
});

test('ignores a stale row frame from an earlier session epoch', () => {
  resetQuoteLatencyMetrics();
  recordQuoteCacheCommit({
    sessionKey: 'opaque-session-old',
    updateSeq: 1,
    receivedTimestampMs: 1_000,
    receiptMonotonicTimestampMs: 10_000,
    cacheTimestampMs: 1_001,
    cacheMonotonicTimestampMs: 10_001,
  });
  recordQuoteCacheCommit({
    sessionKey: 'opaque-session-new',
    updateSeq: 1,
    receivedTimestampMs: 2_000,
    receiptMonotonicTimestampMs: 20_000,
    cacheTimestampMs: 2_001,
    cacheMonotonicTimestampMs: 20_001,
  });

  recordQuoteRowVisible({
    sessionKey: 'opaque-session-old',
    updateSeq: 1,
    visibleMonotonicTimestampMs: 20_010,
  });
  assert.equal(getQuoteLatencyMetricsSnapshot().pendingVisibilitySamples, 1);

  recordQuoteRowVisible({
    sessionKey: 'opaque-session-new',
    updateSeq: 1,
    visibleMonotonicTimestampMs: 20_011,
  });
  const snapshot = getQuoteLatencyMetricsSnapshot();
  assert.equal(snapshot.pendingVisibilitySamples, 0);
  assert.equal(snapshot.stages.cacheToVisibleRow.count, 1);
  assert.equal(snapshot.stages.cacheToVisibleRow.p50Ms, 10);
});

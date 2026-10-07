import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildUiPerformanceTraceMetrics,
  buildUiFeedGapSample,
  buildUiThreadStallSample,
  formatUiPerformanceSampleKind,
  formatUiPerformanceSampleMetrics,
  resolveUiPerformanceSeverity,
  trimUiPerformanceSamples,
  type UiPerformanceSample,
} from './uiPerformanceDiagnostics.helpers.ts';

test('resolveUiPerformanceSeverity marks slow interactions from long next-frame latency', () => {
  assert.equal(
    resolveUiPerformanceSeverity({
      kind: 'interaction',
      handlerMs: 4,
      nextFrameMs: 140,
      settledMs: 180,
    }),
    'slow',
  );
});

test('resolveUiPerformanceSeverity treats over-20ms first-frame latency as slow', () => {
  assert.equal(
    resolveUiPerformanceSeverity({
      kind: 'navigation',
      handlerMs: 4,
      nextFrameMs: 21,
      settledMs: 40,
    }),
    'slow',
  );
});

test('resolveUiPerformanceSeverity allows a clean 20ms first frame when handler work is tiny', () => {
  assert.equal(
    resolveUiPerformanceSeverity({
      kind: 'interaction',
      handlerMs: 4,
      nextFrameMs: 20,
      settledMs: 40,
    }),
    'ok',
  );
});

test('buildUiThreadStallSample marks long JS thread blocks as slow', () => {
  const sample = buildUiThreadStallSample({
    id: 'stall-1',
    startedAtMs: 500,
    blockedMs: 860,
    recordedAtIso: '2026-04-21T11:00:00.000Z',
    context: 'watchdog drift',
  });

  assert.equal(sample.kind, 'stall');
  assert.equal(sample.blockedMs, 860);
  assert.equal(sample.severity, 'slow');
});

test('buildUiFeedGapSample marks websocket gaps over 1.2s as warnings', () => {
  const sample = buildUiFeedGapSample({
    id: 'feed-1',
    label: 'quotes.ws.gap',
    startedAtMs: 100,
    gapMs: 1_500,
    recordedAtIso: '2026-04-21T11:00:00.000Z',
    context: 'BTCUSD',
  });

  assert.equal(sample.kind, 'feed');
  assert.equal(sample.gapMs, 1_500);
  assert.equal(sample.severity, 'warning');
});

test('trimUiPerformanceSamples keeps only the requested most-recent sample count', () => {
  const samples = [
    { id: '1' },
    { id: '2' },
    { id: '3' },
  ] as UiPerformanceSample[];

  assert.deepEqual(
    trimUiPerformanceSamples(samples, 2).map((sample) => sample.id),
    ['1', '2'],
  );
});

test('formatUiPerformanceSampleMetrics and trace details expose the full stall timing trace', () => {
  const sample = buildUiThreadStallSample({
    id: 'stall-2',
    startedAtMs: 900,
    blockedMs: 420,
    recordedAtIso: '2026-04-21T12:00:00.000Z',
    context: 'watchdog drift over 500ms cadence',
  });

  assert.equal(formatUiPerformanceSampleKind(sample), 'STALL');
  assert.equal(formatUiPerformanceSampleMetrics(sample), 'Blocked 420ms');
  assert.deepEqual(buildUiPerformanceTraceMetrics(sample), [
    { label: 'Blocked', value: '420ms' },
    { label: 'Next frame', value: '420ms' },
    { label: 'Settled', value: '420ms' },
    { label: 'Severity', value: 'WARNING' },
    { label: 'Recorded', value: '2026-04-21T12:00:00.000Z' },
    { label: 'Context', value: 'watchdog drift over 500ms cadence' },
  ]);
});

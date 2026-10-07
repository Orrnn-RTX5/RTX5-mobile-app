export type UiPerformanceSeverity = 'ok' | 'warning' | 'slow';

export type UiPerformanceSampleKind = 'interaction' | 'navigation' | 'stall' | 'feed';

export type UiPerformanceSample = {
  id: string;
  kind: UiPerformanceSampleKind;
  label: string;
  startedAtMs: number;
  handlerMs: number;
  nextFrameMs: number;
  settledMs: number;
  blockedMs?: number;
  gapMs?: number;
  context?: string;
  recordedAtIso: string;
  severity: UiPerformanceSeverity;
};

export type UiPerformanceTraceMetric = {
  label: string;
  value: string;
};

type UiPerformanceSeverityInput = Pick<
  UiPerformanceSample,
  'kind' | 'handlerMs' | 'nextFrameMs' | 'settledMs' | 'blockedMs' | 'gapMs'
>;

const UI_INTERACTION_FIRST_FRAME_BUDGET_MS = 20;
const UI_INTERACTION_HANDLER_WARNING_MS = 12;
const UI_INTERACTION_HANDLER_SLOW_MS = 20;
const UI_INTERACTION_SETTLED_WARNING_MS = 80;
const UI_INTERACTION_SETTLED_SLOW_MS = 140;

export function resolveUiPerformanceSeverity(input: UiPerformanceSeverityInput): UiPerformanceSeverity {
  if (input.kind === 'stall') {
    const blockedMs = input.blockedMs ?? input.settledMs;
    if (blockedMs >= 700) return 'slow';
    if (blockedMs >= 180) return 'warning';
    return 'ok';
  }

  if (input.kind === 'feed') {
    const gapMs = input.gapMs ?? input.settledMs;
    if (gapMs >= 3_000) return 'slow';
    if (gapMs >= 1_200) return 'warning';
    return 'ok';
  }

  if (
    input.nextFrameMs > UI_INTERACTION_FIRST_FRAME_BUDGET_MS ||
    input.settledMs >= UI_INTERACTION_SETTLED_SLOW_MS ||
    input.handlerMs >= UI_INTERACTION_HANDLER_SLOW_MS
  ) {
    return 'slow';
  }

  if (
    input.settledMs >= UI_INTERACTION_SETTLED_WARNING_MS ||
    input.handlerMs >= UI_INTERACTION_HANDLER_WARNING_MS
  ) {
    return 'warning';
  }

  return 'ok';
}

export function trimUiPerformanceSamples(
  samples: UiPerformanceSample[],
  limit: number,
): UiPerformanceSample[] {
  if (limit <= 0) {
    return [];
  }

  return samples.slice(0, limit);
}

type BuildUiThreadSampleInput = {
  blockedMs: number;
  context?: string;
  id: string;
  recordedAtIso: string;
  startedAtMs: number;
};

export function buildUiThreadStallSample(input: BuildUiThreadSampleInput): UiPerformanceSample {
  const sample: UiPerformanceSample = {
    id: input.id,
    kind: 'stall',
    label: 'js.thread.blocked',
    startedAtMs: input.startedAtMs,
    handlerMs: input.blockedMs,
    nextFrameMs: input.blockedMs,
    settledMs: input.blockedMs,
    blockedMs: input.blockedMs,
    context: input.context,
    recordedAtIso: input.recordedAtIso,
    severity: 'ok',
  };

  sample.severity = resolveUiPerformanceSeverity(sample);
  return sample;
}

type BuildUiFeedGapSampleInput = {
  context?: string;
  gapMs: number;
  id: string;
  label: string;
  recordedAtIso: string;
  startedAtMs: number;
};

export function buildUiFeedGapSample(input: BuildUiFeedGapSampleInput): UiPerformanceSample {
  const sample: UiPerformanceSample = {
    id: input.id,
    kind: 'feed',
    label: input.label,
    startedAtMs: input.startedAtMs,
    handlerMs: 0,
    nextFrameMs: input.gapMs,
    settledMs: input.gapMs,
    gapMs: input.gapMs,
    context: input.context,
    recordedAtIso: input.recordedAtIso,
    severity: 'ok',
  };

  sample.severity = resolveUiPerformanceSeverity(sample);
  return sample;
}

const formatMetricValue = (value: number | undefined) => `${Math.round(value ?? 0)}ms`;

export function formatUiPerformanceSampleKind(sample: UiPerformanceSample): string {
  if (sample.kind === 'navigation') return 'NAV';
  if (sample.kind === 'stall') return 'STALL';
  if (sample.kind === 'feed') return 'FEED';
  return 'ACT';
}

export function formatUiPerformanceSampleMetrics(sample: UiPerformanceSample): string {
  if (sample.kind === 'stall') {
    return `Blocked ${formatMetricValue(sample.blockedMs ?? sample.settledMs)}`;
  }

  if (sample.kind === 'feed') {
    return `Gap ${formatMetricValue(sample.gapMs ?? sample.settledMs)}`;
  }

  return `H ${formatMetricValue(sample.handlerMs)}  F ${formatMetricValue(sample.nextFrameMs)}  I ${formatMetricValue(sample.settledMs)}`;
}

export function buildUiPerformanceTraceMetrics(sample: UiPerformanceSample): UiPerformanceTraceMetric[] {
  if (sample.kind === 'stall') {
    return [
      { label: 'Blocked', value: formatMetricValue(sample.blockedMs ?? sample.settledMs) },
      { label: 'Next frame', value: formatMetricValue(sample.nextFrameMs) },
      { label: 'Settled', value: formatMetricValue(sample.settledMs) },
      { label: 'Severity', value: sample.severity.toUpperCase() },
      { label: 'Recorded', value: sample.recordedAtIso },
      ...(sample.context ? [{ label: 'Context', value: sample.context }] : []),
    ];
  }

  if (sample.kind === 'feed') {
    return [
      { label: 'Gap', value: formatMetricValue(sample.gapMs ?? sample.settledMs) },
      { label: 'Next frame', value: formatMetricValue(sample.nextFrameMs) },
      { label: 'Settled', value: formatMetricValue(sample.settledMs) },
      { label: 'Severity', value: sample.severity.toUpperCase() },
      { label: 'Recorded', value: sample.recordedAtIso },
      ...(sample.context ? [{ label: 'Context', value: sample.context }] : []),
    ];
  }

  return [
    { label: 'Handler', value: formatMetricValue(sample.handlerMs) },
    { label: 'Next frame', value: formatMetricValue(sample.nextFrameMs) },
    { label: 'Settled', value: formatMetricValue(sample.settledMs) },
    { label: 'Severity', value: sample.severity.toUpperCase() },
    { label: 'Recorded', value: sample.recordedAtIso },
    ...(sample.context ? [{ label: 'Context', value: sample.context }] : []),
  ];
}

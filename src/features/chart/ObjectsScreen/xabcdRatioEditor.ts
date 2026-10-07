import type {
  ChartDrawingKind,
  PersistedChartDrawing,
  PersistedXabcdRatio,
} from '../drawingPersistence';

export type XabcdRatioPatch = Partial<{
  target: number | null;
  visible: boolean;
}>;

export type XabcdPresetId = 'gartley' | 'bat' | 'butterfly' | 'crab';

export type XabcdPreset = {
  id: XabcdPresetId;
  label: string;
  description: string;
  targets: number[];
};

export type XabcdRatioLeg = {
  id: string;
  title: string;
  description: string;
};

export const XABCD_RATIO_COUNT = 3;

const XABCD_TARGET_MIN = 0.01;
const XABCD_TARGET_MAX = 10;
const XABCD_PRESET_EPSILON = 0.0005;

export const XABCD_RATIO_LEGS: XabcdRatioLeg[] = [
  { id: 'ratio_ab', title: 'AB / XA', description: 'Retracement at B' },
  { id: 'ratio_bc', title: 'BC / AB', description: 'Retracement at C' },
  { id: 'ratio_cd', title: 'CD / BC', description: 'Projection at D' },
];

export const XABCD_PRESETS: XabcdPreset[] = [
  {
    id: 'gartley',
    label: 'Gartley',
    description: 'B 0.618 | C 0.618 | D 1.272',
    targets: [0.618, 0.618, 1.272],
  },
  {
    id: 'bat',
    label: 'Bat',
    description: 'B 0.5 | C 0.618 | D 1.618',
    targets: [0.5, 0.618, 1.618],
  },
  {
    id: 'butterfly',
    label: 'Butterfly',
    description: 'B 0.786 | C 0.618 | D 1.618',
    targets: [0.786, 0.618, 1.618],
  },
  {
    id: 'crab',
    label: 'Crab',
    description: 'B 0.618 | C 0.618 | D 2.618',
    targets: [0.618, 0.618, 2.618],
  },
];

export const drawingSupportsXabcdRatioEditor = (kind: ChartDrawingKind) =>
  kind === 'xabcd';

const clampTarget = (value: number) =>
  Number(Math.max(XABCD_TARGET_MIN, Math.min(XABCD_TARGET_MAX, value)).toFixed(3));

function normalizeXabcdRatio(
  ratio: Partial<PersistedXabcdRatio> | undefined,
  index: number,
): PersistedXabcdRatio {
  return {
    // Leg order is the identity, so ids are always positional.
    id: XABCD_RATIO_LEGS[index]?.id ?? `ratio_${index + 1}`,
    target: typeof ratio?.target === 'number' && Number.isFinite(ratio.target) && ratio.target > 0
      ? clampTarget(ratio.target)
      : null,
    visible: ratio?.visible !== false,
  };
}

function getNormalizedRatios(drawing: PersistedChartDrawing): PersistedXabcdRatio[] {
  if (!drawingSupportsXabcdRatioEditor(drawing.kind)) {
    return [];
  }

  const source = drawing.ratios ?? [];
  return Array.from({ length: XABCD_RATIO_COUNT }, (_, index) =>
    normalizeXabcdRatio(source[index], index));
}

export function getXabcdRatioEditorRatios(drawing: PersistedChartDrawing | null | undefined) {
  return drawing ? getNormalizedRatios(drawing) : [];
}

export function getActiveXabcdPresetId(
  ratios: PersistedXabcdRatio[],
): XabcdPresetId | null {
  const preset = XABCD_PRESETS.find((candidate) =>
    candidate.targets.length === ratios.length &&
    ratios.every((ratio, index) =>
      ratio.visible &&
      ratio.target !== null &&
      Math.abs(ratio.target - candidate.targets[index]) <= XABCD_PRESET_EPSILON));
  return preset?.id ?? null;
}

export function applyXabcdRatioPatch(
  drawing: PersistedChartDrawing,
  ratioId: string,
  patch: XabcdRatioPatch,
  now = Date.now(),
): PersistedChartDrawing {
  if (!drawingSupportsXabcdRatioEditor(drawing.kind)) {
    return drawing;
  }

  const ratios = getNormalizedRatios(drawing).map((ratio) => {
    if (ratio.id !== ratioId) {
      return ratio;
    }

    return {
      ...ratio,
      target: patch.target !== undefined
        ? (patch.target === null ? null : clampTarget(patch.target))
        : ratio.target,
      visible: patch.visible ?? ratio.visible,
    };
  });

  return {
    ...drawing,
    ratios,
    updatedAt: now,
  };
}

export function applyXabcdRatioPreset(
  drawing: PersistedChartDrawing,
  presetId: XabcdPresetId,
  now = Date.now(),
): PersistedChartDrawing {
  if (!drawingSupportsXabcdRatioEditor(drawing.kind)) {
    return drawing;
  }

  const preset = XABCD_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    return drawing;
  }

  return {
    ...drawing,
    ratios: Array.from({ length: XABCD_RATIO_COUNT }, (_, index) => ({
      id: XABCD_RATIO_LEGS[index]?.id ?? `ratio_${index + 1}`,
      target: clampTarget(preset.targets[index] ?? 1),
      visible: true,
    })),
    updatedAt: now,
  };
}

export function resetXabcdRatios(drawing: PersistedChartDrawing, now = Date.now()) {
  if (!drawingSupportsXabcdRatioEditor(drawing.kind)) {
    return drawing;
  }

  return {
    ...drawing,
    ratios: undefined,
    updatedAt: now,
  };
}

export function parseXabcdTargetValue(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? clampTarget(parsed) : null;
}

export function formatXabcdTargetValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '';
  }

  return Number(value.toFixed(3))
    .toString()
    .replace(/\.0+$/g, '')
    .replace(/(\.\d*?)0+$/g, '$1');
}

import type {
  ChartDrawingKind,
  PersistedChartDrawing,
  PersistedFibLevel,
} from '../drawingPersistence';
import type { DrawingStyleLineStyle } from './drawingStyleEditor';

type FibDrawingKind = Extract<ChartDrawingKind, 'fib' | 'fibExtension'>;

export type FibLevelPatch = Partial<{
  color: string;
  label: string;
  lineStyle: DrawingStyleLineStyle;
  lineWidth: number;
  showPercent: boolean;
  showPrice: boolean;
  value: number;
  visible: boolean;
}>;

const FIB_RETRACEMENT_DEFAULT_VALUES: Array<[number, string, string]> = [
  [0, '0', '#2962FF'],
  [0.236, '0.236', '#64748B'],
  [0.382, '0.382', '#64748B'],
  [0.5, '0.5', '#64748B'],
  [0.618, '0.618', '#64748B'],
  [0.786, '0.786', '#64748B'],
  [1, '1', '#2962FF'],
];

const FIB_EXTENSION_DEFAULT_VALUES: Array<[number, string, string]> = [
  [0, '0', '#F59E0B'],
  [0.618, '0.618', '#64748B'],
  [1, '1', '#64748B'],
  [1.272, '1.272', '#64748B'],
  [1.414, '1.414', '#64748B'],
  [1.618, '1.618', '#F59E0B'],
  [2, '2', '#64748B'],
  [2.618, '2.618', '#F59E0B'],
];

const FIB_RETRACEMENT_SUGGESTED_VALUES = [0.65, 0.886, 1.272, 1.414, 1.618, 2, 2.618];
const FIB_EXTENSION_SUGGESTED_VALUES = [0.236, 0.382, 0.5, 0.786, 3.618, 4.236];

const isFibDrawingKind = (kind: ChartDrawingKind): kind is FibDrawingKind =>
  kind === 'fib' || kind === 'fibExtension';

export const drawingSupportsFibLevelEditor = (kind: ChartDrawingKind) =>
  isFibDrawingKind(kind);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeLineStyle = (value: unknown): DrawingStyleLineStyle =>
  value === 'dashed' || value === 'dotted' ? value : 'solid';

const normalizeLineWidth = (value: unknown, fallback = 1) =>
  typeof value === 'number' && Number.isFinite(value)
    ? clamp(Number(value.toFixed(2)), 1, 5)
    : fallback;

const normalizeLevelValue = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, -10, 10)
    : fallback;

const formatLevelIdValue = (value: number) =>
  formatFibLevelValue(value).replace('-', 'neg_').replace(/\./g, '_');

const buildLevelId = (kind: FibDrawingKind, value: number) =>
  `${kind === 'fibExtension' ? 'fib_ext' : 'fib'}_${formatLevelIdValue(value)}`;

const colorWithAlpha = (color: string, alpha: number) => {
  const match = color.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) {
    return color;
  }

  const raw = match[1].length === 3
    ? match[1].split('').map((part) => part + part).join('')
    : match[1];
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1).toFixed(2)})`;
};

const makeDefaultLevel = (
  kind: FibDrawingKind,
  value: number,
  label = formatFibLevelValue(value),
  color = kind === 'fibExtension' ? '#F59E0B' : '#64748B',
): PersistedFibLevel => {
  const major = value === 0 || value === 1 || value === 1.618 || value === 2.618;
  return {
    id: buildLevelId(kind, value),
    value,
    visible: true,
    label,
    color,
    lineColor: color,
    lineWidth: major ? 1.4 : 1,
    lineStyle: 'solid',
    fillColor: colorWithAlpha(color, 0.08),
    fillOpacity: 0.1,
    showPrice: true,
    showPercent: true,
  };
};

const getDefaultFibLevels = (kind: FibDrawingKind): PersistedFibLevel[] => {
  const source = kind === 'fibExtension'
    ? FIB_EXTENSION_DEFAULT_VALUES
    : FIB_RETRACEMENT_DEFAULT_VALUES;
  return source.map(([value, label, color]) => makeDefaultLevel(kind, value, label, color));
};

const getSuggestedValues = (kind: FibDrawingKind) =>
  kind === 'fibExtension' ? FIB_EXTENSION_SUGGESTED_VALUES : FIB_RETRACEMENT_SUGGESTED_VALUES;

function normalizeFibLevel(kind: FibDrawingKind, level: Partial<PersistedFibLevel> | undefined, index: number) {
  const fallback = getDefaultFibLevels(kind)[index] ?? makeDefaultLevel(kind, 0);
  const value = normalizeLevelValue(level?.value, fallback.value);
  const color = typeof level?.lineColor === 'string'
    ? level.lineColor
    : (typeof level?.color === 'string' ? level.color : fallback.lineColor ?? fallback.color ?? '#64748B');

  return {
    ...fallback,
    id: typeof level?.id === 'string' && level.id.trim().length > 0 ? level.id.trim() : buildLevelId(kind, value),
    value,
    visible: level?.visible !== false,
    label: typeof level?.label === 'string' && level.label.trim().length > 0
      ? level.label.trim()
      : formatFibLevelValue(value),
    color,
    lineColor: color,
    lineWidth: normalizeLineWidth(level?.lineWidth, fallback.lineWidth),
    lineStyle: normalizeLineStyle(level?.lineStyle ?? fallback.lineStyle),
    fillColor: typeof level?.fillColor === 'string' ? level.fillColor : colorWithAlpha(color, 0.08),
    fillOpacity: typeof level?.fillOpacity === 'number' && Number.isFinite(level.fillOpacity)
      ? clamp(level.fillOpacity, 0, 0.6)
      : fallback.fillOpacity,
    showPrice: level?.showPrice !== false,
    showPercent: level?.showPercent !== false,
  };
}

const sortedLevels = (levels: PersistedFibLevel[]) =>
  [...levels].sort((first, second) => first.value - second.value);

function getNormalizedLevels(drawing: PersistedChartDrawing) {
  if (!isFibDrawingKind(drawing.kind)) {
    return [];
  }

  const source = drawing.levels && drawing.levels.length > 0
    ? drawing.levels
    : getDefaultFibLevels(drawing.kind);

  return sortedLevels(source.map((level, index) => normalizeFibLevel(drawing.kind as FibDrawingKind, level, index)));
}

export function getFibLevelEditorLevels(drawing: PersistedChartDrawing | null | undefined) {
  return drawing ? getNormalizedLevels(drawing) : [];
}

export function applyFibLevelPatch(
  drawing: PersistedChartDrawing,
  levelId: string,
  patch: FibLevelPatch,
  now = Date.now(),
): PersistedChartDrawing {
  if (!isFibDrawingKind(drawing.kind)) {
    return drawing;
  }

  const levels = getNormalizedLevels(drawing).map((level) => {
    if (level.id !== levelId) {
      return level;
    }

    const nextColor = typeof patch.color === 'string' && patch.color.trim().length > 0
      ? patch.color.trim()
      : undefined;
    const nextValue = patch.value !== undefined ? normalizeLevelValue(patch.value, level.value) : level.value;
    const color = nextColor ?? level.lineColor ?? level.color ?? '#64748B';

    return {
      ...level,
      value: nextValue,
      label: typeof patch.label === 'string' && patch.label.trim().length > 0
        ? patch.label.trim().slice(0, 24)
        : (patch.value !== undefined ? formatFibLevelValue(nextValue) : level.label),
      visible: patch.visible ?? level.visible,
      color,
      lineColor: color,
      lineWidth: patch.lineWidth !== undefined ? normalizeLineWidth(patch.lineWidth, level.lineWidth) : level.lineWidth,
      lineStyle: patch.lineStyle ? normalizeLineStyle(patch.lineStyle) : level.lineStyle,
      fillColor: nextColor ? colorWithAlpha(nextColor, 0.08) : level.fillColor,
      showPrice: patch.showPrice ?? level.showPrice,
      showPercent: patch.showPercent ?? level.showPercent,
    };
  });

  return {
    ...drawing,
    levels: sortedLevels(levels),
    updatedAt: now,
  };
}

export function addFibLevel(drawing: PersistedChartDrawing, now = Date.now()) {
  if (!isFibDrawingKind(drawing.kind)) {
    return drawing;
  }

  const levels = getNormalizedLevels(drawing);
  const existingValues = new Set(levels.map((level) => Number(level.value.toFixed(6))));
  const suggested = getSuggestedValues(drawing.kind).find((value) => !existingValues.has(Number(value.toFixed(6))));
  const value = suggested ?? Math.min(10, Math.max(0, levels[levels.length - 1]?.value ?? 0) + 0.1);
  const nextLevel = makeDefaultLevel(drawing.kind, value);
  const existingIds = new Set(levels.map((level) => level.id));
  let candidateId = nextLevel.id;
  let suffix = 2;
  while (existingIds.has(candidateId)) {
    candidateId = `${nextLevel.id}_${suffix}`;
    suffix += 1;
  }

  return {
    ...drawing,
    levels: sortedLevels([...levels, { ...nextLevel, id: candidateId }]),
    updatedAt: now,
  };
}

export function removeFibLevel(
  drawing: PersistedChartDrawing,
  levelId: string,
  now = Date.now(),
) {
  if (!isFibDrawingKind(drawing.kind)) {
    return drawing;
  }

  const levels = getNormalizedLevels(drawing);
  if (levels.length <= 1) {
    return drawing;
  }

  return {
    ...drawing,
    levels: levels.filter((level) => level.id !== levelId),
    updatedAt: now,
  };
}

export function resetFibLevels(drawing: PersistedChartDrawing, now = Date.now()) {
  if (!isFibDrawingKind(drawing.kind)) {
    return drawing;
  }

  return {
    ...drawing,
    levels: getDefaultFibLevels(drawing.kind),
    updatedAt: now,
  };
}

export function parseFibLevelValue(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? clamp(parsed, -10, 10) : null;
}

export function formatFibLevelValue(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return Number(value.toFixed(6))
    .toString()
    .replace(/\.0+$/g, '')
    .replace(/(\.\d*?)0+$/g, '$1');
}

export function formatFibLevelPercent(value: number) {
  if (!Number.isFinite(value)) {
    return '0%';
  }

  return `${Number((value * 100).toFixed(3)).toString()}%`;
}

import type {
  ChartDrawingKind,
  PersistedChartDrawing,
  PersistedDrawingStyle,
  PersistedTextLevelLineStyle,
} from '../drawingPersistence';

export type DrawingStyleLineStyle = 'solid' | 'dashed' | 'dotted';
export type DrawingStyleExtendMode = 'none' | 'left' | 'right' | 'both';

export type DrawingStyleEditorValues = {
  color: string;
  width: number;
  lineStyle: DrawingStyleLineStyle;
  opacity: number;
  extendMode: DrawingStyleExtendMode;
  supportsExtendMode: boolean;
};

export type DrawingStylePatch = Partial<{
  color: string;
  width: number;
  lineStyle: DrawingStyleLineStyle;
  opacity: number;
  extendMode: DrawingStyleExtendMode;
}>;

export const DRAWING_STYLE_COLOR_SWATCHES = [
  '#2962FF',
  '#14B8A6',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
  '#FFFFFF',
  '#111827',
] as const;

export const DRAWING_STYLE_LINE_STYLE_OPTIONS: Array<{ label: string; value: DrawingStyleLineStyle }> = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
];

export const DRAWING_STYLE_EXTEND_MODE_OPTIONS: Array<{ label: string; value: DrawingStyleExtendMode }> = [
  { label: 'None', value: 'none' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Both', value: 'both' },
];

const DEFAULT_COLOR_BY_KIND: Record<ChartDrawingKind, string> = {
  trendline: '#2962FF',
  arrow: '#F97316',
  horizontalLine: '#14B8A6',
  horizontalRay: '#0EA5E9',
  verticalLine: '#6366F1',
  ray: '#0891B2',
  extendedLine: '#7C3AED',
  fib: '#D97706',
  fibExtension: '#F59E0B',
  rectangle: '#64748B',
  ellipse: '#8B5CF6',
  freehand: '#EC4899',
  brush: '#3B82F6',
  text: '#1D4ED8',
  textLevel: '#2962FF',
  patterns: '#A855F7',
  parallelChannel: '#14B8A6',
  prediction: '#10B981',
  shortPosition: '#F43F5E',
  pitchfork: '#8B5CF6',
  gannFan: '#EAB308',
  regressionChannel: '#0EA5E9',
  elliottWave: '#6366F1',
  xabcd: '#DB2777',
  smiley: '#D97706',
  measure: '#94A3B8',
};

const STYLE_EDITOR_KINDS = new Set<ChartDrawingKind>([
  'trendline',
  'arrow',
  'horizontalLine',
  'horizontalRay',
  'verticalLine',
  'ray',
  'extendedLine',
  'fib',
  'fibExtension',
  'rectangle',
  'ellipse',
  'freehand',
  'brush',
  'text',
  'textLevel',
  'patterns',
  'parallelChannel',
  'prediction',
  'shortPosition',
  'pitchfork',
  'gannFan',
  'regressionChannel',
  'elliottWave',
  'xabcd',
  'smiley',
  'measure',
]);

const EXTEND_MODE_KINDS = new Set<ChartDrawingKind>([
  'trendline',
  'extendedLine',
  'fib',
  'fibExtension',
  'brush',
  'parallelChannel',
  'textLevel',
]);

export const drawingSupportsStyleEditor = (kind: ChartDrawingKind) =>
  STYLE_EDITOR_KINDS.has(kind);

export const drawingSupportsExtendMode = (kind: ChartDrawingKind) =>
  EXTEND_MODE_KINDS.has(kind);

const getDefaultExtendMode = (kind: ChartDrawingKind): DrawingStyleExtendMode => {
  if (kind === 'extendedLine') {
    return 'both';
  }
  if (kind === 'parallelChannel') {
    return 'right';
  }
  return 'none';
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeWidth = (value: unknown, fallback = 2) =>
  typeof value === 'number' && Number.isFinite(value)
    ? clamp(Math.round(value), 1, 8)
    : fallback;

const normalizeOpacity = (value: unknown, fallback = 1) =>
  typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, 0.1, 1)
    : fallback;

const normalizeLineStyle = (value: unknown): DrawingStyleLineStyle =>
  value === 'dashed' || value === 'dotted' ? value : 'solid';

const normalizeExtendMode = (value: unknown, fallback: DrawingStyleExtendMode): DrawingStyleExtendMode =>
  value === 'none' || value === 'left' || value === 'right' || value === 'both'
    ? value
    : fallback;

const getStyleColor = (
  drawing: PersistedChartDrawing,
  style: PersistedDrawingStyle,
  levelLine?: PersistedTextLevelLineStyle,
) =>
  levelLine?.lineColor ||
  style.color ||
  style.lineColor ||
  style.borderColor ||
  style.anchorLineColor ||
  style.midlineColor ||
  style.textColor ||
  DEFAULT_COLOR_BY_KIND[drawing.kind];

const getStyleWidth = (
  style: PersistedDrawingStyle,
  levelLine?: PersistedTextLevelLineStyle,
) =>
  normalizeWidth(
    levelLine?.lineWidth ??
    style.width ??
    style.lineWidth ??
    style.borderWidth ??
    style.anchorLineWidth,
    2,
  );

const getStyleOpacity = (
  style: PersistedDrawingStyle,
  levelLine?: PersistedTextLevelLineStyle,
) =>
  normalizeOpacity(levelLine?.opacity ?? style.opacity, 1);

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

export function getDrawingStyleEditorValues(
  drawing: PersistedChartDrawing,
): DrawingStyleEditorValues {
  const style = drawing.style ?? {};
  const levelLine = drawing.kind === 'textLevel' ? drawing.levelLine : undefined;
  const supportsExtendMode = drawingSupportsExtendMode(drawing.kind);
  const extendMode = drawing.kind === 'textLevel'
    ? normalizeExtendMode(levelLine?.extendMode, 'right')
    : normalizeExtendMode(drawing.extendMode, getDefaultExtendMode(drawing.kind));

  return {
    color: getStyleColor(drawing, style, levelLine),
    width: getStyleWidth(style, levelLine),
    lineStyle: normalizeLineStyle(levelLine?.lineStyle ?? style.lineStyle ?? style.borderStyle ?? style.anchorLineStyle),
    opacity: getStyleOpacity(style, levelLine),
    extendMode,
    supportsExtendMode,
  };
}

function applyColorToStyle(
  drawing: PersistedChartDrawing,
  style: PersistedDrawingStyle,
  color: string,
  opacity: number,
) {
  style.color = color;
  style.lineColor = color;
  style.borderColor = color;
  style.anchorLineColor = color;
  style.midlineColor = color;

  if (drawing.kind === 'text') {
    style.textColor = color;
  }

  if (drawing.kind === 'brush' || drawing.kind === 'rectangle' || drawing.kind === 'ellipse' || drawing.kind === 'parallelChannel' || drawing.kind === 'fib' || drawing.kind === 'fibExtension' || drawing.kind === 'regressionChannel' || drawing.kind === 'xabcd' || drawing.kind === 'prediction' || drawing.kind === 'shortPosition' || drawing.kind === 'measure') {
    style.fillColor = colorWithAlpha(color, Math.min(opacity, 0.32));
  }
}

function applyWidthToStyle(style: PersistedDrawingStyle, width: number) {
  style.width = width;
  style.lineWidth = width;
  style.borderWidth = width;
  style.anchorLineWidth = width;
}

function applyLineStyleToStyle(style: PersistedDrawingStyle, lineStyle: DrawingStyleLineStyle) {
  style.lineStyle = lineStyle;
  style.borderStyle = lineStyle;
  style.anchorLineStyle = lineStyle;
  style.midlineStyle = lineStyle;
}

function getNextLevelLine(
  drawing: PersistedChartDrawing,
  values: DrawingStyleEditorValues,
  patch: DrawingStylePatch,
): PersistedTextLevelLineStyle | undefined {
  if (drawing.kind !== 'textLevel' && !drawing.levelLine) {
    return undefined;
  }

  const current = drawing.levelLine;
  return {
    enabled: current?.enabled ?? true,
    extendMode: patch.extendMode ?? current?.extendMode ?? values.extendMode,
    lineColor: patch.color ?? current?.lineColor ?? values.color,
    lineWidth: patch.width !== undefined ? normalizeWidth(patch.width, values.width) : (current?.lineWidth ?? values.width),
    lineStyle: patch.lineStyle ?? current?.lineStyle ?? values.lineStyle,
    opacity: patch.opacity !== undefined ? normalizeOpacity(patch.opacity, values.opacity) : (current?.opacity ?? values.opacity),
  };
}

export function applyDrawingStylePatch(
  drawing: PersistedChartDrawing,
  patch: DrawingStylePatch,
  now = Date.now(),
): PersistedChartDrawing {
  const values = getDrawingStyleEditorValues(drawing);
  const style: PersistedDrawingStyle = { ...(drawing.style ?? {}) };
  const nextColor = typeof patch.color === 'string' && patch.color.trim().length > 0
    ? patch.color.trim()
    : undefined;
  const nextWidth = patch.width !== undefined ? normalizeWidth(patch.width, values.width) : undefined;
  const nextOpacity = patch.opacity !== undefined ? normalizeOpacity(patch.opacity, values.opacity) : undefined;
  const nextLineStyle = patch.lineStyle ? normalizeLineStyle(patch.lineStyle) : undefined;

  if (nextColor) {
    applyColorToStyle(drawing, style, nextColor, nextOpacity ?? values.opacity);
  }
  if (nextWidth !== undefined) {
    applyWidthToStyle(style, nextWidth);
  }
  if (nextLineStyle) {
    applyLineStyleToStyle(style, nextLineStyle);
  }
  if (nextOpacity !== undefined) {
    style.opacity = nextOpacity;
    if (drawing.kind === 'brush' || drawing.kind === 'rectangle' || drawing.kind === 'ellipse' || drawing.kind === 'parallelChannel' || drawing.kind === 'fib' || drawing.kind === 'fibExtension' || drawing.kind === 'regressionChannel' || drawing.kind === 'xabcd' || drawing.kind === 'prediction' || drawing.kind === 'shortPosition' || drawing.kind === 'measure') {
      style.fillOpacity = Math.min(nextOpacity, 0.45);
    }
  }

  const next: PersistedChartDrawing = {
    ...drawing,
    style,
    updatedAt: now,
  };

  const nextLevelLine = getNextLevelLine(drawing, values, patch);
  if (nextLevelLine) {
    next.levelLine = nextLevelLine;
  }

  if (patch.extendMode && drawingSupportsExtendMode(drawing.kind)) {
    next.extendMode = patch.extendMode;
  }

  if (drawing.levels && (nextColor || nextWidth !== undefined || nextLineStyle || nextOpacity !== undefined)) {
    next.levels = drawing.levels.map((level) => ({
      ...level,
      lineColor: nextColor ?? level.lineColor,
      lineWidth: nextWidth ?? level.lineWidth,
      lineStyle: nextLineStyle ?? level.lineStyle,
      fillOpacity: nextOpacity !== undefined ? Math.min(nextOpacity, 0.45) : level.fillOpacity,
    }));
  }

  return next;
}

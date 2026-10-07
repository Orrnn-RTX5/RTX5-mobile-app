/**
 * Static metadata for chart drawing tools — labels, descriptions, icon
 * components, and accent colors. Drives both the Add Object sheet and the
 * Current Objects list.
 */
import {
  TvArrowMarker,
  TvBrush,
  TvEllipse,
  TvElliottWave,
  TvExtendedLine,
  TvFib,
  TvFibExtension,
  TvFreehandBrush,
  TvGannFan,
  TvHorizontalLine,
  TvHorizontalRay,
  TvMeasure,
  TvParallelChannel,
  TvPatterns,
  TvPitchfork,
  TvPrediction,
  TvRay,
  TvRectangle,
  TvRegressionChannel,
  TvShortPosition,
  TvSmiley,
  TvText,
  TvTrendLine,
  TvVerticalLine,
  TvXabcd,
} from '../components/ChartToolbarIcons';
import type { ChartDrawingKind } from '../drawingPersistence';

export type DrawingIconComponent = typeof TvTrendLine;

export type DrawingToolMeta = {
  key: ChartDrawingKind;
  label: string;
  description: string;
  Icon: DrawingIconComponent;
  accent: string;
};

export type DisplayDrawing = {
  id: string;
  label: string;
  description: string;
  hidden: boolean;
  locked: boolean;
  kind: ChartDrawingKind | null;
  text?: string;
  supportsVisibility: boolean;
};

export const DRAWING_TOOL_META: Record<ChartDrawingKind, DrawingToolMeta> = {
  trendline: { key: 'trendline', label: 'Trend line', description: 'Two-point line', Icon: TvTrendLine, accent: '#2563EB' },
  arrow: { key: 'arrow', label: 'Arrow / Marker', description: 'Directional marker', Icon: TvArrowMarker, accent: '#F97316' },
  horizontalLine: { key: 'horizontalLine', label: 'Horizontal line', description: 'Full-width price line', Icon: TvHorizontalLine, accent: '#14B8A6' },
  horizontalRay: { key: 'horizontalRay', label: 'Horizontal ray', description: 'Right-extended price line', Icon: TvHorizontalRay, accent: '#0EA5E9' },
  verticalLine: { key: 'verticalLine', label: 'Vertical line', description: 'Full-height time marker', Icon: TvVerticalLine, accent: '#6366F1' },
  ray: { key: 'ray', label: 'Ray', description: 'Right-extended trend line', Icon: TvRay, accent: '#0891B2' },
  extendedLine: { key: 'extendedLine', label: 'Extended line', description: 'Both-way extended trend line', Icon: TvExtendedLine, accent: '#7C3AED' },
  fib: { key: 'fib', label: 'Fibonacci retracement', description: '0-1 retracement levels', Icon: TvFib, accent: '#D97706' },
  fibExtension: { key: 'fibExtension', label: 'Fibonacci extension', description: 'Extension levels beyond 100%', Icon: TvFibExtension, accent: '#F59E0B' },
  rectangle: { key: 'rectangle', label: 'Rectangle', description: 'Two-point shape', Icon: TvRectangle, accent: '#64748B' },
  ellipse: { key: 'ellipse', label: 'Circle / Ellipse', description: 'Two-point oval shape', Icon: TvEllipse, accent: '#8B5CF6' },
  freehand: { key: 'freehand', label: 'Freehand Brush', description: 'Hand-drawn path', Icon: TvFreehandBrush, accent: '#EC4899' },
  brush: { key: 'brush', label: 'Highlight', description: 'Marked area', Icon: TvBrush, accent: '#2563EB' },
  text: { key: 'text', label: 'Text', description: 'Chart label', Icon: TvText, accent: '#1D4ED8' },
  textLevel: { key: 'textLevel', label: 'Text level', description: 'Text price level', Icon: TvText, accent: '#2962FF' },
  patterns: { key: 'patterns', label: 'Pattern', description: 'Polyline pattern', Icon: TvPatterns, accent: '#9333EA' },
  parallelChannel: { key: 'parallelChannel', label: 'Parallel channel', description: 'Three-point channel', Icon: TvParallelChannel, accent: '#14B8A6' },
  prediction: { key: 'prediction', label: 'Long position', description: 'Risk / reward box', Icon: TvPrediction, accent: '#059669' },
  shortPosition: { key: 'shortPosition', label: 'Short position', description: 'Short risk / reward box', Icon: TvShortPosition, accent: '#E11D48' },
  pitchfork: { key: 'pitchfork', label: 'Pitchfork', description: 'Three-point fork', Icon: TvPitchfork, accent: '#7C3AED' },
  gannFan: { key: 'gannFan', label: 'Gann fan', description: 'Gann angle rays', Icon: TvGannFan, accent: '#EAB308' },
  regressionChannel: { key: 'regressionChannel', label: 'Regression channel', description: 'Linear regression bands', Icon: TvRegressionChannel, accent: '#0EA5E9' },
  elliottWave: { key: 'elliottWave', label: 'Elliott wave', description: 'Five-wave impulse', Icon: TvElliottWave, accent: '#6366F1' },
  xabcd: { key: 'xabcd', label: 'XABCD harmonic', description: 'Harmonic pattern', Icon: TvXabcd, accent: '#DB2777' },
  smiley: { key: 'smiley', label: 'Sticker', description: 'Chart sticker', Icon: TvSmiley, accent: '#D97706' },
  measure: { key: 'measure', label: 'Scale', description: 'Price / time range', Icon: TvMeasure, accent: '#475569' },
};

export const ADD_OBJECT_TOOLS: ChartDrawingKind[] = [
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
  'patterns',
  'parallelChannel',
  'pitchfork',
  'gannFan',
  'regressionChannel',
  'elliottWave',
  'xabcd',
  'smiley',
  'textLevel',
  'prediction',
  'shortPosition',
  'measure',
];

export function buildLegacyDrawingDescription(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return 'Chart object';
  }

  const knownMeta = Object.values(DRAWING_TOOL_META).find((item) =>
    normalized.toLowerCase().startsWith(item.label.toLowerCase()),
  );

  return knownMeta?.description ?? 'Chart object';
}

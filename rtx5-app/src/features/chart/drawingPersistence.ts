export type ChartDrawingKind =
  | 'trendline'
  | 'arrow'
  | 'horizontalLine'
  | 'horizontalRay'
  | 'verticalLine'
  | 'ray'
  | 'extendedLine'
  | 'fib'
  | 'fibExtension'
  | 'rectangle'
  | 'ellipse'
  | 'freehand'
  | 'brush'
  | 'text'
  | 'textLevel'
  | 'patterns'
  | 'parallelChannel'
  | 'prediction'
  | 'shortPosition'
  | 'pitchfork'
  | 'gannFan'
  | 'regressionChannel'
  | 'elliottWave'
  | 'xabcd'
  | 'smiley'
  | 'measure';

export type SerializedChartTime =
  | number
  | string
  | {
      year: number;
      month: number;
      day: number;
    };

export type PersistedChartDrawingPoint = {
  time: SerializedChartTime;
  price: number;
  timestamp?: number;
  dataIndex?: number;
  paneId?: string;
};

export type PersistedDrawingStyle = {
  color?: string;
  selectedColor?: string;
  hoverColor?: string;
  width?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  opacity?: number;
  arrowHeadLength?: number;
  arrowHeadWidth?: number;
  fillColor?: string;
  previewFillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  selectedBorderColor?: string;
  hoverBorderColor?: string;
  handleFillColor?: string;
  labelBackgroundColor?: string;
  labelTextColor?: string;
  labelColor?: string;
  backgroundColor?: string;
  showBorder?: boolean;
  showBackground?: boolean;
  showFill?: boolean;
  showLabel?: boolean;
  lineColor?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  lineWidth?: number;
  anchorLineColor?: string;
  anchorLineWidth?: number;
  anchorLineStyle?: 'solid' | 'dashed' | 'dotted';
  fillOpacity?: number;
  labelBackground?: string;
  midlineColor?: string;
  midlineStyle?: 'solid' | 'dashed' | 'dotted';
  showLevelLabels?: boolean;
  showPriceLabels?: boolean;
  showPercentLabels?: boolean;
  showPriceRange?: boolean;
  showPercentRange?: boolean;
  showTimeRange?: boolean;
  showBarCount?: boolean;
  showMidline?: boolean;
  showZoneFills?: boolean;
  showAnchorLine?: boolean;
  showLabels?: boolean;
  showHandles?: boolean;
  handleSize?: number;
  handleRadius?: number;
  selectedHandleRadius?: number;
  selectedHandleSize?: number;
  handleBorderWidth?: number;
  handleColor?: string;
  borderRadius?: number;
  paddingX?: number;
  paddingY?: number;
  showAnchor?: boolean;
  align?: 'left' | 'center' | 'right';
  labelPosition?:
    | 'left'
    | 'right'
    | 'inside'
    | 'outside'
    | 'inside-top-left'
    | 'inside-top-right'
    | 'center'
    | 'outside-top'
    | 'outside-right';
  avoidLabelOverlap?: boolean;
};

export type PersistedTextLevelLineStyle = {
  enabled: boolean;
  extendMode: 'none' | 'left' | 'right' | 'both';
  lineColor: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  opacity: number;
};

export type PersistedTextLevelLabelPosition = 'left' | 'right' | 'center' | 'anchor' | 'price-axis';

export type PersistedTextLevelType =
  | 'neutral'
  | 'entry'
  | 'stopLoss'
  | 'takeProfit'
  | 'support'
  | 'resistance'
  | 'liquidity'
  | 'orderBlock'
  | 'fairValueGap'
  | 'dailyOpen'
  | 'weeklyOpen'
  | 'sessionHigh'
  | 'sessionLow';

export type PersistedTextLevelLabelOffset = {
  x: number;
  y: number;
};

export type PersistedHighlightBoxZoneType =
  | 'neutral'
  | 'supply'
  | 'demand'
  | 'support'
  | 'resistance'
  | 'orderBlock'
  | 'fairValueGap'
  | 'liquidity';

export type PersistedHighlightBoxExtendUntil =
  | 'none'
  | 'right'
  | 'price-touch'
  | 'candle-close-through';

export type PersistedDrawingAlertMetadata =
  | null
  | boolean
  | number
  | string
  | PersistedDrawingAlertMetadata[]
  | { [key: string]: PersistedDrawingAlertMetadata };

export type PersistedFibLevel = {
  id: string;
  value: number;
  visible: boolean;
  label: string;
  color?: string;
  lineColor?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
  showPrice?: boolean;
  showPercent?: boolean;
};

export type PersistedElliottWave = {
  id: string;
  label: string;
  visible: boolean;
};

export type PersistedXabcdRatio = {
  id: string;
  target: number | null;
  visible: boolean;
};

export type PersistedPositionPlan = {
  stopPrice: number | null;
  accountSize: number | null;
  riskPercent: number | null;
};

export type PersistedFibZoneRange = {
  enabled: boolean;
  from: number;
  to: number;
  color?: string;
  label?: string;
  showLabel?: boolean;
};

export type PersistedChartDrawing = {
  id: string;
  kind: ChartDrawingKind;
  type?: string;
  symbol?: string;
  timeframe?: string;
  paneId?: string;
  /** Split-chart window owner. `paneId` above remains the chart-series pane. */
  chartWindowPaneId?: string;
  label: string;
  hidden: boolean;
  points: PersistedChartDrawingPoint[];
  text?: string;
  style?: PersistedDrawingStyle;
  levelLine?: PersistedTextLevelLineStyle;
  labelPosition?: PersistedTextLevelLabelPosition;
  labelOffset?: PersistedTextLevelLabelOffset;
  showPrice?: boolean;
  showPriceAxisLabel?: boolean;
  levelType?: PersistedTextLevelType;
  followLastPrice?: boolean;
  levels?: PersistedFibLevel[];
  waves?: PersistedElliottWave[];
  ratios?: PersistedXabcdRatio[];
  position?: PersistedPositionPlan;
  extendMode?: 'none' | 'left' | 'right' | 'both';
  zoneType?: PersistedHighlightBoxZoneType;
  extendUntil?: PersistedHighlightBoxExtendUntil;
  alertMetadata?: PersistedDrawingAlertMetadata;
  reverse?: boolean;
  goldenPocket?: PersistedFibZoneRange;
  oteZone?: PersistedFibZoneRange;
  locked?: boolean;
  selected?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type PersistedChartDrawingsBySymbol = Record<string, PersistedChartDrawing[]>;

export const CHART_DRAWING_KINDS: ChartDrawingKind[] = [
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
];

const REQUIRED_POINT_COUNT: Record<ChartDrawingKind, number> = {
  trendline: 2,
  arrow: 2,
  horizontalLine: 2,
  horizontalRay: 2,
  verticalLine: 2,
  ray: 2,
  extendedLine: 2,
  fib: 2,
  fibExtension: 2,
  rectangle: 2,
  ellipse: 2,
  freehand: 2,
  brush: 2,
  text: 1,
  textLevel: 1,
  patterns: 3,
  parallelChannel: 3,
  prediction: 2,
  shortPosition: 2,
  pitchfork: 3,
  gannFan: 2,
  regressionChannel: 2,
  elliottWave: 6,
  xabcd: 5,
  smiley: 1,
  measure: 2,
};

const DEFAULT_DRAWING_LABELS: Record<ChartDrawingKind, string> = {
  trendline: 'Trend Line',
  arrow: 'Arrow / Marker',
  horizontalLine: 'Horizontal Line',
  horizontalRay: 'Horizontal Ray',
  verticalLine: 'Vertical Line',
  ray: 'Ray',
  extendedLine: 'Extended Line',
  fib: 'Fibonacci Retracement',
  fibExtension: 'Fibonacci Extension',
  rectangle: 'Rectangle',
  ellipse: 'Circle / Ellipse',
  freehand: 'Freehand Brush',
  brush: 'Highlight',
  text: 'Text',
  textLevel: 'Text Level',
  patterns: 'Pattern',
  parallelChannel: 'Parallel Channel',
  prediction: 'Long Position',
  shortPosition: 'Short Position',
  pitchfork: 'Pitchfork',
  gannFan: 'Gann Fan',
  regressionChannel: 'Regression Channel',
  elliottWave: 'Elliott Wave',
  xabcd: 'XABCD Harmonic',
  smiley: 'Sticker',
  measure: 'Scale',
};

const MAX_POINT_COUNT: Partial<Record<ChartDrawingKind, number>> = {
  freehand: 512,
};

function isChartDrawingKind(value: unknown): value is ChartDrawingKind {
  return typeof value === 'string' && CHART_DRAWING_KINDS.includes(value as ChartDrawingKind);
}

function isSerializedChartTime(value: unknown): value is SerializedChartTime {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<'year' | 'month' | 'day', unknown>>;
  return (
    Number.isInteger(candidate.year) &&
    Number.isInteger(candidate.month) &&
    Number.isInteger(candidate.day)
  );
}

function sanitizeDrawingPoint(value: unknown): PersistedChartDrawingPoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PersistedChartDrawingPoint>;
  if (!isSerializedChartTime(candidate.time) || typeof candidate.price !== 'number' || !Number.isFinite(candidate.price)) {
    return null;
  }

  return {
    time: candidate.time,
    price: candidate.price,
    timestamp: typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp) ? candidate.timestamp : undefined,
    dataIndex: typeof candidate.dataIndex === 'number' && Number.isFinite(candidate.dataIndex) ? candidate.dataIndex : undefined,
    paneId: typeof candidate.paneId === 'string' && candidate.paneId.trim().length > 0 ? candidate.paneId.trim() : undefined,
  };
}

function sanitizeDrawingText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return text.length > 0 ? text : undefined;
}

function sanitizeDrawingStyle(value: unknown): PersistedDrawingStyle | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<PersistedDrawingStyle>;
  const style: PersistedDrawingStyle = {};
  if (typeof candidate.color === 'string') style.color = candidate.color;
  if (typeof candidate.selectedColor === 'string') style.selectedColor = candidate.selectedColor;
  if (typeof candidate.hoverColor === 'string') style.hoverColor = candidate.hoverColor;
  if (typeof candidate.width === 'number' && Number.isFinite(candidate.width)) style.width = candidate.width;
  if (candidate.lineStyle === 'solid' || candidate.lineStyle === 'dashed' || candidate.lineStyle === 'dotted') {
    style.lineStyle = candidate.lineStyle;
  }
  if (typeof candidate.opacity === 'number' && Number.isFinite(candidate.opacity)) style.opacity = candidate.opacity;
  if (typeof candidate.arrowHeadLength === 'number' && Number.isFinite(candidate.arrowHeadLength)) style.arrowHeadLength = candidate.arrowHeadLength;
  if (typeof candidate.arrowHeadWidth === 'number' && Number.isFinite(candidate.arrowHeadWidth)) style.arrowHeadWidth = candidate.arrowHeadWidth;
  if (typeof candidate.fillColor === 'string') style.fillColor = candidate.fillColor;
  if (typeof candidate.previewFillColor === 'string') style.previewFillColor = candidate.previewFillColor;
  if (typeof candidate.borderColor === 'string') style.borderColor = candidate.borderColor;
  if (typeof candidate.borderWidth === 'number' && Number.isFinite(candidate.borderWidth)) style.borderWidth = candidate.borderWidth;
  if (candidate.borderStyle === 'solid' || candidate.borderStyle === 'dashed' || candidate.borderStyle === 'dotted') {
    style.borderStyle = candidate.borderStyle;
  }
  if (typeof candidate.selectedBorderColor === 'string') style.selectedBorderColor = candidate.selectedBorderColor;
  if (typeof candidate.hoverBorderColor === 'string') style.hoverBorderColor = candidate.hoverBorderColor;
  if (typeof candidate.handleFillColor === 'string') style.handleFillColor = candidate.handleFillColor;
  if (typeof candidate.labelBackgroundColor === 'string') style.labelBackgroundColor = candidate.labelBackgroundColor;
  if (typeof candidate.labelTextColor === 'string') style.labelTextColor = candidate.labelTextColor;
  if (typeof candidate.labelColor === 'string') style.labelColor = candidate.labelColor;
  if (typeof candidate.backgroundColor === 'string') style.backgroundColor = candidate.backgroundColor;
  if (typeof candidate.showBorder === 'boolean') style.showBorder = candidate.showBorder;
  if (typeof candidate.showBackground === 'boolean') style.showBackground = candidate.showBackground;
  if (typeof candidate.showFill === 'boolean') style.showFill = candidate.showFill;
  if (typeof candidate.showLabel === 'boolean') style.showLabel = candidate.showLabel;
  if (typeof candidate.lineColor === 'string') style.lineColor = candidate.lineColor;
  if (typeof candidate.textColor === 'string') style.textColor = candidate.textColor;
  if (typeof candidate.fontSize === 'number' && Number.isFinite(candidate.fontSize)) style.fontSize = candidate.fontSize;
  if (typeof candidate.fontFamily === 'string') style.fontFamily = candidate.fontFamily;
  if (
    (typeof candidate.fontWeight === 'number' && Number.isFinite(candidate.fontWeight)) ||
    typeof candidate.fontWeight === 'string'
  ) {
    style.fontWeight = candidate.fontWeight;
  }
  if (typeof candidate.lineWidth === 'number' && Number.isFinite(candidate.lineWidth)) style.lineWidth = candidate.lineWidth;
  if (typeof candidate.anchorLineColor === 'string') style.anchorLineColor = candidate.anchorLineColor;
  if (typeof candidate.anchorLineWidth === 'number' && Number.isFinite(candidate.anchorLineWidth)) style.anchorLineWidth = candidate.anchorLineWidth;
  if (candidate.anchorLineStyle === 'solid' || candidate.anchorLineStyle === 'dashed' || candidate.anchorLineStyle === 'dotted') {
    style.anchorLineStyle = candidate.anchorLineStyle;
  }
  if (typeof candidate.fillOpacity === 'number' && Number.isFinite(candidate.fillOpacity)) style.fillOpacity = candidate.fillOpacity;
  if (typeof candidate.labelBackground === 'string') style.labelBackground = candidate.labelBackground;
  if (typeof candidate.midlineColor === 'string') style.midlineColor = candidate.midlineColor;
  if (candidate.midlineStyle === 'solid' || candidate.midlineStyle === 'dashed' || candidate.midlineStyle === 'dotted') {
    style.midlineStyle = candidate.midlineStyle;
  }
  if (typeof candidate.showLevelLabels === 'boolean') style.showLevelLabels = candidate.showLevelLabels;
  if (typeof candidate.showPriceLabels === 'boolean') style.showPriceLabels = candidate.showPriceLabels;
  if (typeof candidate.showPercentLabels === 'boolean') style.showPercentLabels = candidate.showPercentLabels;
  if (typeof candidate.showPriceRange === 'boolean') style.showPriceRange = candidate.showPriceRange;
  if (typeof candidate.showPercentRange === 'boolean') style.showPercentRange = candidate.showPercentRange;
  if (typeof candidate.showTimeRange === 'boolean') style.showTimeRange = candidate.showTimeRange;
  if (typeof candidate.showBarCount === 'boolean') style.showBarCount = candidate.showBarCount;
  if (typeof candidate.showMidline === 'boolean') style.showMidline = candidate.showMidline;
  if (typeof candidate.showZoneFills === 'boolean') style.showZoneFills = candidate.showZoneFills;
  if (typeof candidate.showAnchorLine === 'boolean') style.showAnchorLine = candidate.showAnchorLine;
  if (typeof candidate.showLabels === 'boolean') style.showLabels = candidate.showLabels;
  if (typeof candidate.showHandles === 'boolean') style.showHandles = candidate.showHandles;
  if (typeof candidate.handleSize === 'number' && Number.isFinite(candidate.handleSize)) style.handleSize = candidate.handleSize;
  if (typeof candidate.handleRadius === 'number' && Number.isFinite(candidate.handleRadius)) style.handleRadius = candidate.handleRadius;
  if (typeof candidate.selectedHandleRadius === 'number' && Number.isFinite(candidate.selectedHandleRadius)) style.selectedHandleRadius = candidate.selectedHandleRadius;
  if (typeof candidate.selectedHandleSize === 'number' && Number.isFinite(candidate.selectedHandleSize)) style.selectedHandleSize = candidate.selectedHandleSize;
  if (typeof candidate.handleBorderWidth === 'number' && Number.isFinite(candidate.handleBorderWidth)) style.handleBorderWidth = candidate.handleBorderWidth;
  if (typeof candidate.handleColor === 'string') style.handleColor = candidate.handleColor;
  if (typeof candidate.borderRadius === 'number' && Number.isFinite(candidate.borderRadius)) style.borderRadius = candidate.borderRadius;
  if (typeof candidate.paddingX === 'number' && Number.isFinite(candidate.paddingX)) style.paddingX = candidate.paddingX;
  if (typeof candidate.paddingY === 'number' && Number.isFinite(candidate.paddingY)) style.paddingY = candidate.paddingY;
  if (typeof candidate.showAnchor === 'boolean') style.showAnchor = candidate.showAnchor;
  if (candidate.align === 'left' || candidate.align === 'center' || candidate.align === 'right') {
    style.align = candidate.align;
  }
  if (
    candidate.labelPosition === 'left' ||
    candidate.labelPosition === 'right' ||
    candidate.labelPosition === 'inside' ||
    candidate.labelPosition === 'outside' ||
    candidate.labelPosition === 'inside-top-left' ||
    candidate.labelPosition === 'inside-top-right' ||
    candidate.labelPosition === 'center' ||
    candidate.labelPosition === 'outside-top' ||
    candidate.labelPosition === 'outside-right'
  ) {
    style.labelPosition = candidate.labelPosition;
  }
  if (typeof candidate.avoidLabelOverlap === 'boolean') style.avoidLabelOverlap = candidate.avoidLabelOverlap;

  return Object.keys(style).length > 0 ? style : undefined;
}

function sanitizeFibLevel(value: unknown, index: number): PersistedFibLevel | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PersistedFibLevel>;
  if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : `fib_${index + 1}`,
    value: candidate.value,
    visible: candidate.visible !== false,
    label: typeof candidate.label === 'string' ? candidate.label : String(candidate.value),
    color: typeof candidate.color === 'string' ? candidate.color : undefined,
    lineColor: typeof candidate.lineColor === 'string' ? candidate.lineColor : undefined,
    lineWidth: typeof candidate.lineWidth === 'number' && Number.isFinite(candidate.lineWidth) ? candidate.lineWidth : undefined,
    lineStyle: candidate.lineStyle === 'solid' || candidate.lineStyle === 'dashed' || candidate.lineStyle === 'dotted' ? candidate.lineStyle : undefined,
    fillColor: typeof candidate.fillColor === 'string' ? candidate.fillColor : undefined,
    fillOpacity: typeof candidate.fillOpacity === 'number' && Number.isFinite(candidate.fillOpacity) ? candidate.fillOpacity : undefined,
    showPrice: typeof candidate.showPrice === 'boolean' ? candidate.showPrice : undefined,
    showPercent: typeof candidate.showPercent === 'boolean' ? candidate.showPercent : undefined,
  };
}

function sanitizeFibLevels(value: unknown): PersistedFibLevel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const levels = value
    .map((level, index) => sanitizeFibLevel(level, index))
    .filter((level): level is PersistedFibLevel => level !== null);
  return levels.length > 0 ? levels : undefined;
}

function sanitizeElliottWave(value: unknown, index: number): PersistedElliottWave | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PersistedElliottWave>;
  if (typeof candidate.label !== 'string') {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : `wave_${index + 1}`,
    label: candidate.label,
    visible: candidate.visible !== false,
  };
}

function sanitizeElliottWaves(value: unknown): PersistedElliottWave[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const waves = value
    .map((wave, index) => sanitizeElliottWave(wave, index))
    .filter((wave): wave is PersistedElliottWave => wave !== null);
  return waves.length > 0 ? waves : undefined;
}

function sanitizeXabcdRatio(value: unknown, index: number): PersistedXabcdRatio | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PersistedXabcdRatio>;
  return {
    id: typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : `ratio_${index + 1}`,
    target: typeof candidate.target === 'number' && Number.isFinite(candidate.target) && candidate.target > 0
      ? candidate.target
      : null,
    visible: candidate.visible !== false,
  };
}

function sanitizeXabcdRatios(value: unknown): PersistedXabcdRatio[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const ratios = value
    .map((ratio, index) => sanitizeXabcdRatio(ratio, index))
    .filter((ratio): ratio is PersistedXabcdRatio => ratio !== null);
  return ratios.length > 0 ? ratios : undefined;
}

function sanitizePositionPlanNumber(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, max)
    : null;
}

function sanitizePositionPlan(value: unknown): PersistedPositionPlan | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<PersistedPositionPlan>;
  return {
    stopPrice: sanitizePositionPlanNumber(candidate.stopPrice, Number.MAX_SAFE_INTEGER),
    accountSize: sanitizePositionPlanNumber(candidate.accountSize, Number.MAX_SAFE_INTEGER),
    riskPercent: sanitizePositionPlanNumber(candidate.riskPercent, 100),
  };
}

function sanitizeFibZoneRange(value: unknown): PersistedFibZoneRange | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<PersistedFibZoneRange>;
  if (
    typeof candidate.from !== 'number' ||
    !Number.isFinite(candidate.from) ||
    typeof candidate.to !== 'number' ||
    !Number.isFinite(candidate.to)
  ) {
    return undefined;
  }

  return {
    enabled: candidate.enabled !== false,
    from: candidate.from,
    to: candidate.to,
    color: typeof candidate.color === 'string' ? candidate.color : undefined,
    label: typeof candidate.label === 'string' ? candidate.label : undefined,
    showLabel: typeof candidate.showLabel === 'boolean' ? candidate.showLabel : undefined,
  };
}

function sanitizeExtendMode(value: unknown): PersistedChartDrawing['extendMode'] | undefined {
  return value === 'none' || value === 'left' || value === 'right' || value === 'both' ? value : undefined;
}

function sanitizeTextLevelLabelPosition(value: unknown): PersistedTextLevelLabelPosition | undefined {
  return value === 'left' ||
    value === 'right' ||
    value === 'center' ||
    value === 'anchor' ||
    value === 'price-axis'
    ? value
    : undefined;
}

function sanitizeTextLevelType(value: unknown): PersistedTextLevelType | undefined {
  return value === 'neutral' ||
    value === 'entry' ||
    value === 'stopLoss' ||
    value === 'takeProfit' ||
    value === 'support' ||
    value === 'resistance' ||
    value === 'liquidity' ||
    value === 'orderBlock' ||
    value === 'fairValueGap' ||
    value === 'dailyOpen' ||
    value === 'weeklyOpen' ||
    value === 'sessionHigh' ||
    value === 'sessionLow'
    ? value
    : undefined;
}

function sanitizeTextLevelLabelOffset(value: unknown): PersistedTextLevelLabelOffset | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<PersistedTextLevelLabelOffset>;
  const x = typeof candidate.x === 'number' && Number.isFinite(candidate.x) ? candidate.x : 0;
  const y = typeof candidate.y === 'number' && Number.isFinite(candidate.y) ? candidate.y : 0;
  return { x, y };
}

function sanitizeTextLevelLineStyle(value: unknown): PersistedTextLevelLineStyle | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<PersistedTextLevelLineStyle>;
  return {
    enabled: candidate.enabled !== false,
    extendMode: sanitizeExtendMode(candidate.extendMode) ?? 'right',
    lineColor: typeof candidate.lineColor === 'string' ? candidate.lineColor : '#2962FF',
    lineWidth: typeof candidate.lineWidth === 'number' && Number.isFinite(candidate.lineWidth)
      ? Math.max(1, Math.min(6, candidate.lineWidth))
      : 1,
    lineStyle: candidate.lineStyle === 'dashed' || candidate.lineStyle === 'dotted' ? candidate.lineStyle : 'solid',
    opacity: typeof candidate.opacity === 'number' && Number.isFinite(candidate.opacity)
      ? Math.max(0, Math.min(1, candidate.opacity))
      : 0.9,
  };
}

function sanitizeHighlightBoxZoneType(value: unknown): PersistedChartDrawing['zoneType'] | undefined {
  return (
    value === 'neutral' ||
    value === 'supply' ||
    value === 'demand' ||
    value === 'support' ||
    value === 'resistance' ||
    value === 'orderBlock' ||
    value === 'fairValueGap' ||
    value === 'liquidity'
  ) ? value : undefined;
}

function sanitizeHighlightBoxExtendUntil(value: unknown): PersistedChartDrawing['extendUntil'] | undefined {
  return (
    value === 'none' ||
    value === 'right' ||
    value === 'price-touch' ||
    value === 'candle-close-through'
  ) ? value : undefined;
}

function sanitizeAlertMetadata(value: unknown): PersistedDrawingAlertMetadata | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => sanitizeAlertMetadata(item))
      .filter((item): item is PersistedDrawingAlertMetadata => item !== undefined);
    return items;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const sanitized: { [key: string]: PersistedDrawingAlertMetadata } = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    const trimmedKey = key.trim();
    const sanitizedItem = sanitizeAlertMetadata(item);
    if (trimmedKey.length > 0 && sanitizedItem !== undefined) {
      sanitized[trimmedKey] = sanitizedItem;
    }
  });

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function getChartDrawingBucketKey(symbol: string): string {
  const trimmed = normalizeSymbol(symbol);
  return trimmed.length > 0 ? trimmed : 'DEFAULT';
}

export function getDefaultChartDrawingLabel(kind: ChartDrawingKind, index: number): string {
  const baseLabel = DEFAULT_DRAWING_LABELS[kind];
  const safeIndex = Number.isInteger(index) && index > 0 ? index : 1;
  return `${baseLabel} ${safeIndex}`;
}

export function getChartDrawingLabels(drawings: PersistedChartDrawing[]): string[] {
  return drawings.map((drawing) => drawing.label);
}

function sanitizePersistedChartDrawing(
  value: unknown,
  index: number,
): PersistedChartDrawing | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PersistedChartDrawing>;
  if (!isChartDrawingKind(candidate.kind)) {
    return null;
  }

  const requiredPointCount = REQUIRED_POINT_COUNT[candidate.kind];
  const maxPointCount = Math.max(requiredPointCount, MAX_POINT_COUNT[candidate.kind] ?? requiredPointCount);
  const points = Array.isArray(candidate.points)
    ? candidate.points
        .map((point) => sanitizeDrawingPoint(point))
        .filter((point): point is PersistedChartDrawingPoint => point !== null)
        .slice(0, maxPointCount)
    : [];

  if (points.length < requiredPointCount) {
    return null;
  }

  const label = typeof candidate.label === 'string' && candidate.label.trim().length > 0
    ? candidate.label.trim()
    : getDefaultChartDrawingLabel(candidate.kind, index + 1);

  const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0
    ? candidate.id.trim()
    : `${candidate.kind}_${index + 1}`;

  return {
    id,
    kind: candidate.kind,
    type: typeof candidate.type === 'string' && candidate.type.trim().length > 0 ? candidate.type.trim() : undefined,
    symbol: typeof candidate.symbol === 'string' && candidate.symbol.trim().length > 0 ? candidate.symbol.trim() : undefined,
    timeframe: typeof candidate.timeframe === 'string' && candidate.timeframe.trim().length > 0 ? candidate.timeframe.trim() : undefined,
    paneId: typeof candidate.paneId === 'string' && candidate.paneId.trim().length > 0 ? candidate.paneId.trim() : undefined,
    chartWindowPaneId: typeof candidate.chartWindowPaneId === 'string' && candidate.chartWindowPaneId.trim().length > 0
      ? candidate.chartWindowPaneId.trim()
      : undefined,
    label,
    hidden: Boolean(candidate.hidden),
    points,
    text: sanitizeDrawingText(candidate.text),
    style: sanitizeDrawingStyle(candidate.style),
    levelLine: sanitizeTextLevelLineStyle(candidate.levelLine),
    labelPosition: sanitizeTextLevelLabelPosition(candidate.labelPosition),
    labelOffset: sanitizeTextLevelLabelOffset(candidate.labelOffset),
    showPrice: typeof candidate.showPrice === 'boolean' ? candidate.showPrice : undefined,
    showPriceAxisLabel: typeof candidate.showPriceAxisLabel === 'boolean' ? candidate.showPriceAxisLabel : undefined,
    levelType: sanitizeTextLevelType(candidate.levelType),
    followLastPrice: typeof candidate.followLastPrice === 'boolean' ? candidate.followLastPrice : undefined,
    levels: sanitizeFibLevels(candidate.levels),
    waves: sanitizeElliottWaves(candidate.waves),
    ratios: sanitizeXabcdRatios(candidate.ratios),
    position: sanitizePositionPlan(candidate.position),
    extendMode: sanitizeExtendMode(candidate.extendMode),
    zoneType: sanitizeHighlightBoxZoneType(candidate.zoneType),
    extendUntil: sanitizeHighlightBoxExtendUntil(candidate.extendUntil),
    alertMetadata: sanitizeAlertMetadata(candidate.alertMetadata),
    reverse: Boolean(candidate.reverse),
    goldenPocket: sanitizeFibZoneRange(candidate.goldenPocket),
    oteZone: sanitizeFibZoneRange(candidate.oteZone),
    locked: Boolean(candidate.locked),
    selected: Boolean(candidate.selected),
    createdAt: typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) ? candidate.createdAt : undefined,
    updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : undefined,
  };
}

export function sanitizePersistedChartDrawings(value: unknown): PersistedChartDrawing[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => sanitizePersistedChartDrawing(item, index))
    .filter((item): item is PersistedChartDrawing => item !== null);
}
import { normalizeSymbol } from '../../domain/symbols';

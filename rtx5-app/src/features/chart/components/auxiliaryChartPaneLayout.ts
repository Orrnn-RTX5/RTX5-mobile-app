import type { ChartWindowLayout } from '../chartWindowState';

export type AuxiliaryChartPaneBounds = Readonly<{
  width: number;
  height: number;
}>;

export type AuxiliaryChartPaneDensity = Readonly<{
  compact: boolean;
  short: boolean;
  headerHeight: number;
  tradeRowHeight: number;
  lotSlotWidth: number;
  maxCandles: number;
  candleCommitIntervalMs: number;
}>;

const toSafeDimension = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

/**
 * Resolve a stable pane density from its real bounds. Layout is included so a
 * caller may provide only the total split area before child measurements land.
 */
export function resolveAuxiliaryChartPaneDensity(
  bounds: Partial<AuxiliaryChartPaneBounds> | null | undefined,
  layout: ChartWindowLayout = 'horizontal',
): AuxiliaryChartPaneDensity {
  const width = toSafeDimension(bounds?.width);
  const height = toSafeDimension(bounds?.height);
  const compact = width > 0 ? width < 320 : layout === 'vertical';
  const short = height > 0 && height < 220;

  return Object.freeze({
    compact,
    short,
    // Compact side-by-side panes mirror the main chart's intentionally terse
    // ticker row. Full-width panes reserve all three metadata rows.
    headerHeight: compact ? (short ? 22 : 26) : 58,
    tradeRowHeight: short ? 36 : 40,
    // Full-width panes reuse the existing Chart trade strip proportions.
    lotSlotWidth: compact ? 82 : 172,
    maxCandles: compact || short ? 180 : 320,
    // Two visible panes share the JS thread. A 32 ms candle commit still looks
    // live while preventing both WebViews from repainting every burst tick.
    candleCommitIntervalMs: 32,
  });
}

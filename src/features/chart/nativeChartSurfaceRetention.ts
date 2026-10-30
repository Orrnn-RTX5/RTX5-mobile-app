export type PaintedChartSurfaceScope = Readonly<{
  symbol: string;
  timeframe: string;
  cacheNamespace: string;
  generation: number;
  visualShellSig: string;
}>;

/** Android can keep its confirmed canvas during a timeframe-only replacement. */
export function shouldRetainNativeChartSurface(
  platform: string,
  ready: boolean,
  currentPaintConfirmed: boolean,
  painted: PaintedChartSurfaceScope | null,
  selected: PaintedChartSurfaceScope,
): boolean {
  return platform === 'android'
    && ready
    && !currentPaintConfirmed
    && painted !== null
    && painted.symbol === selected.symbol
    && painted.cacheNamespace === selected.cacheNamespace
    && painted.generation === selected.generation
    && painted.visualShellSig === selected.visualShellSig
    && painted.timeframe !== selected.timeframe;
}

import { isStructurallyValidCandle } from '../../../domain/candles/core/candles';
import { ChartColorsConfig, type ChartVisualType } from '../../../state/userPreferences';
import { mapCandlesToRTX5CustomCandlestickData } from '../../../domain/candles/rendering/customCandlestickSeries';
import { buildRenkoBricks } from '../../../domain/candles/renko';

// Preview consumes the production union directly, so a new type such as Area
// cannot silently disappear from settings or an auxiliary split-chart pane.
export type PreviewChartType = ChartVisualType;

// Keep the forming candle clear of the right price scale in the compact
// Schema & Colors preview. With the preview's 13px bar spacing this reserves
// about 52px while the horizontal live-price line still reaches its axis label.
export const LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET = 4;

export type PreviewSourceCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export const withAlpha = (color: string | undefined, alpha: number): string => {
  if (!color) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  const trimmed = color.trim();

  if (trimmed.startsWith('rgba(')) {
    const parts = trimmed.slice(5, -1).split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  }

  if (trimmed.startsWith('rgb(')) {
    const parts = trimmed.slice(4, -1).split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  }

  let hex = trimmed.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((char) => char + char).join('');
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return trimmed;
};

export const buildVolumeDatum = (
  candle: Pick<PreviewSourceCandle, 'time' | 'open' | 'close' | 'volume'>,
  colors: Pick<ChartColorsConfig, 'candlesUptrend' | 'candlesDowntrend'>,
  isActive: boolean = false,
  minValue?: number,
) => {
  const rawValue = Math.max(Number(candle.volume ?? 0), 0);
  const value = typeof minValue === 'number' ? Math.max(minValue, rawValue) : rawValue;
  const baseColor =
    candle.close >= candle.open ? colors.candlesUptrend : colors.candlesDowntrend;

  return {
    time: candle.time,
    value,
    color: withAlpha(baseColor, isActive ? 0.78 : 0.32),
  };
};

export const sanitizePreviewCandles = (candles: PreviewSourceCandle[]) => {
  const sanitized = candles.filter((candle) => isStructurallyValidCandle(candle));
  const uniqueData = Array.from(new Map(sanitized.map((item) => [item.time, item])).values());
  uniqueData.sort((a, b) => a.time - b.time);
  return uniqueData;
};

export const mapPreviewCandles = (
  candles: PreviewSourceCandle[],
  chartType: PreviewChartType,
  colors: Pick<ChartColorsConfig, 'candlesUptrend' | 'candlesDowntrend'>
    & Partial<Pick<ChartColorsConfig, 'hollowBody'>>,
  renkoBrickSize?: number,
) => {
  // Preview data follows the same transformation as the main chart. This
  // prevents a settings or divided-pane preview from showing raw candles when
  // the selected mode is Renko.
  const renderedCandles = chartType === 'renko'
    ? buildRenkoBricks(candles, { brickSize: renkoBrickSize })
    : candles;

  // Line and Area consume the same close-only points; each renderer decides
  // whether to draw only the stroke or add the translucent area fill.
  if (chartType === 'line' || chartType === 'area') {
    return renderedCandles.map((item) => ({
      time: item.time,
      value: item.close,
      open: item.open,
      close: item.close,
      volume: item.volume,
    }));
  }

  // Candles, Hollow and Renko all reach the shared OHLC body renderer. Renko's
  // caller disables wicks, while Hollow replaces only the body fill color.
  if (chartType === 'candles' || chartType === 'hollow' || chartType === 'renko') {
    // Per-item colors override series options in lightweight-charts, so hollow
    // charts must bake the hollow body fill here too — otherwise the baked
    // bull/bear colors defeat the hollow style in the native preview.
    const useHollowFill = chartType === 'hollow' && typeof colors.hollowBody === 'string';
    return mapCandlesToRTX5CustomCandlestickData({
      candles: renderedCandles,
      bullishColor: useHollowFill ? (colors.hollowBody as string) : colors.candlesUptrend,
      bearishColor: useHollowFill ? (colors.hollowBody as string) : colors.candlesDowntrend,
    });
  }

  return renderedCandles;
};

export const getLastPreviewCandleSignature = (candles: PreviewSourceCandle[]) => {
  const last = candles[candles.length - 1];
  if (!last) return 'empty';
  return [
    last.time,
    last.open,
    last.high,
    last.low,
    last.close,
    last.volume ?? 0,
  ].join('|');
};

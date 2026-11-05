import type { ChartColorsConfig } from '../../../state/userPreferences';
import type { PreviewSourceCandle } from './chartPreviewShared';

export type PreviewLivePriceDirection = 'up' | 'down';

/**
 * Full divided panes tint the live-price line and badge from the forming
 * candle, exactly like the retained chart. Standalone previews keep their
 * historical last-tick direction fallback.
 */
export const resolvePreviewLivePriceColor = ({
  fullChartParity,
  latestCandle,
  fallbackDirection,
  colors,
}: Readonly<{
  fullChartParity: boolean;
  latestCandle: Pick<PreviewSourceCandle, 'open' | 'close'> | null;
  fallbackDirection: PreviewLivePriceDirection;
  colors: Pick<ChartColorsConfig, 'candlesUptrend' | 'candlesDowntrend'>;
}>): string => {
  const direction = fullChartParity && latestCandle
    ? (latestCandle.close >= latestCandle.open ? 'up' : 'down')
    : fallbackDirection;
  return direction === 'up'
    ? (colors.candlesUptrend || '#2962FF')
    : (colors.candlesDowntrend || '#EF5350');
};

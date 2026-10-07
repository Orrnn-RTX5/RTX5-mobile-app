import type { PositionItem } from '../../dev/mock/tradingData';
import type { ChartColorsConfig } from '../../state/userPreferences';
import type { ChartShowOnChartSettings } from './chartShowOnChart';
import { buildChartOverlayPayload } from './chartOverlays';
import type { PreviewOverlayPriceLine } from './preview/LiveChartPreview.native';

export type BuildAuxiliaryChartTradeOverlayPriceLinesInput = Readonly<{
  symbol: string;
  positions: readonly PositionItem[];
  colors: ChartColorsConfig;
  sellColor: string;
  liveBid: number | null;
  liveAsk: number | null;
  showOnChart: ChartShowOnChartSettings;
  extraPriceLines?: readonly PreviewOverlayPriceLine[];
}>;

/**
 * Account positions are symbol-owned, not pane-owned. Build them against the
 * auxiliary pane's own symbol and quote, then append only the pane-owned draft
 * lines that the split-window controller explicitly routed to this pane.
 */
export const buildAuxiliaryChartTradeOverlayPriceLines = ({
  symbol,
  positions,
  colors,
  sellColor,
  liveBid,
  liveAsk,
  showOnChart,
  extraPriceLines = [],
}: BuildAuxiliaryChartTradeOverlayPriceLinesInput): readonly PreviewOverlayPriceLine[] => {
  const positionLines = buildChartOverlayPayload({
    chartSymbol: symbol,
    candles: [],
    positions: [...positions],
    colors,
    sellColor,
    liveBid,
    liveAsk,
    showOnChart,
    activeTool: 'none',
    allowPositionStopDragging: false,
  }).priceLines;

  if (positionLines.length === 0) return extraPriceLines;
  if (extraPriceLines.length === 0) return positionLines;

  return [...positionLines, ...extraPriceLines]
    .sort((left, right) => left.price - right.price);
};

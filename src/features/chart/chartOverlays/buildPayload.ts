/**
 * Top-level overlay-payload builder. Composes per-feature builders into a
 * single deduplicated, sorted `ChartOverlayPayload` for the chart's WebView
 * to render.
 *
 * The chart only draws the trader's own open positions, gated by side: the
 * "Show buy trade" / "Show sell trade" preferences. A shown position is drawn
 * with its open line, while the MT5-style "SL/TP levels" preference controls
 * its protective Stop Loss / Take Profit lines. Completed trade history is a
 * separate preference: exact entry/exit arrows and their finite dotted path
 * stay independent from open-position visibility. Pattern markers from the
 * drawing tools are independent too and still render when active.
 */
import type { PriceAlert } from '../../../api/alerts';
import type { Deal } from '../../../api/deals';
import type { LoginOrder } from '../../../api/orders';
import type { ClosedPosition } from '../../../api/positions';
import type { PositionItem, QuoteItem } from '../../../dev/mock/tradingData';
import type { ChartColorsConfig } from '../../../state/userPreferences';
import {
  formatLivePositionPnl,
  resolveLivePositionPnl,
} from '../../trade/livePositionMetrics';
import type { ChartShowOnChartSettings } from '../chartShowOnChart';
import {
  addUniqueMarker,
  addUniquePriceLine,
  buildPatternMarkers,
  sanitizeCandles,
} from './markerCollections';
import { buildChartTradeHistoryOverlay } from './tradeHistory';
import {
  formatPositionVolumeLabel,
  formatTpSlOverlayLabel,
  formatTpSlOverlayValueLabel,
} from './orderHelpers';
import { buildChartPositionStopDragKey } from './positionStopDragKeys';
import { resolveLiveChartPnlColor } from './livePnlColors';
import { normalizeChartOverlaySymbol } from './symbolUtils';
import {
  CHART_LINE_STYLE,
  EMPTY_CHART_OVERLAY_PAYLOAD,
  EMPTY_OVERLAY_MARKERS,
  type ChartOverlayCandle,
  type ChartOverlayLiveAccount,
  type ChartOverlayMarker,
  type ChartOverlayPayload,
  type ChartOverlayPriceLine,
} from './types';

type BuildChartOverlayPayloadInput = {
  chartSymbol: string;
  candles: ChartOverlayCandle[];
  positions: PositionItem[];
  orders?: LoginOrder[];
  closedPositions?: ClosedPosition[];
  deals?: Deal[];
  alerts?: PriceAlert[];
  colors: ChartColorsConfig;
  sellColor: string;
  liveBid?: number | null;
  liveAsk?: number | null;
  liveQuote?: Partial<QuoteItem>;
  liveAccount?: ChartOverlayLiveAccount | null;
  showOnChart: ChartShowOnChartSettings;
  /** Independent from open-position Buy/Sell visibility. */
  showTradeHistory?: boolean;
  chartTimeframe?: string;
  activeTool?: string;
  /**
   * Existing-position protection remains visible while backend modification is
   * locked, but it must not expose a drag entry point. Callers must opt in
   * only after the active broker's existing-position capability is enabled.
   */
  allowPositionStopDragging?: boolean;
};

const hasEnabledTradeSides = (showOnChart: ChartShowOnChartSettings): boolean =>
  showOnChart.buyTrade || showOnChart.sellTrade;

const isTradeSideEnabled = (
  side: 'buy' | 'sell',
  showOnChart: ChartShowOnChartSettings,
): boolean => (side === 'buy' ? showOnChart.buyTrade : showOnChart.sellTrade);

type BuildChartOverlayMarkersInput = Pick<
  BuildChartOverlayPayloadInput,
  'chartSymbol' | 'candles' | 'closedPositions' | 'deals' | 'showOnChart' | 'activeTool'
> & {
  positions?: PositionItem[];
  chartTimeframe?: string;
  showTradeHistory?: boolean;
  buyColor?: string;
  sellColor?: string;
};

/**
 * Build candle-anchored markers independently from quote-driven price lines.
 *
 * The native Chart host memoizes this result from candle-time/history inputs,
 * so a bid/ask or open-position P/L tick cannot repeatedly scan closed history
 * or normalize every historical symbol.
 */
export const buildChartOverlayMarkers = ({
  chartSymbol,
  candles,
  positions = [],
  closedPositions = [],
  deals = [],
  activeTool,
  chartTimeframe = 'M1',
  showTradeHistory = true,
  buyColor = '#2962FF',
  sellColor = '#F23645',
}: BuildChartOverlayMarkersInput): ChartOverlayMarker[] => {
  const needsPatternMarkers = activeTool === 'patterns';
  // Execution arrows have their own toggle. Open-position Buy/Sell filters
  // must never hide either a still-open entry or completed trade history.
  const needsClosedTradeMarkers =
    showTradeHistory && (positions.length > 0 || closedPositions.length > 0 || deals.length > 0);
  if (!needsPatternMarkers && !needsClosedTradeMarkers) {
    return EMPTY_OVERLAY_MARKERS;
  }

  const sanitizedCandles = sanitizeCandles(candles);
  if (sanitizedCandles.length === 0) {
    return EMPTY_OVERLAY_MARKERS;
  }

  const markers = new Map<string, ChartOverlayMarker>();
  if (needsPatternMarkers) {
    buildPatternMarkers(sanitizedCandles, activeTool).forEach((marker) => addUniqueMarker(markers, marker));
  }
  if (needsClosedTradeMarkers) {
    buildChartTradeHistoryOverlay({
      chartSymbol,
      chartTimeframe,
      candles: sanitizedCandles,
      openPositions: positions,
      deals,
      closedPositions,
      buyColor,
      sellColor,
    }).markers.forEach((marker) =>
      addUniqueMarker(markers, marker),
    );
  }

  if (markers.size === 0) {
    return EMPTY_OVERLAY_MARKERS;
  }
  return Array.from(markers.values()).sort((left, right) => left.time - right.time);
};

// MT5-parity: open-position lines stay as individual dotted lines so the
// trader can see each entry, even when entries are clustered.
// Overlay axis labels stay disabled here because the WebView draws custom
// outlined price boxes for position/order levels.
//
// Multiple positions at the same price level (within 100 ppm — covers
// float-noise from tick-by-tick drift between trades opened in quick
// succession) remain visible, producing the dense clustered look MT5 shows.
// The WebView still handles right-axis boxes separately.
const applyRightAxisLabelVisibility = (lines: ChartOverlayPriceLine[]): ChartOverlayPriceLine[] => {
  return lines.map((line) => ({ ...line, axisLabelVisible: false }));
};

const resolveOpenPositionSideColor = (
  side: 'buy' | 'sell',
  colors: ChartColorsConfig,
  sellColor: string,
): string => (side === 'buy' ? colors.tradeOpen || '#2962FF' : sellColor || '#DC2626');

export type ChartOpenPositionLabelPatch = Pick<
  ChartOverlayPriceLine,
  'id' | 'title' | 'labelValueText' | 'labelValueColor'
>;

type BuildChartOpenPositionLabelPatchesInput = Pick<
  BuildChartOverlayPayloadInput,
  'chartSymbol' | 'positions' | 'colors' | 'sellColor' | 'liveBid' | 'liveAsk' | 'showOnChart'
> & {
  liveQuote?: Partial<QuoteItem>;
};

const buildOpenPositionLabelPatch = (
  position: PositionItem,
  colors: ChartColorsConfig,
  sellColor: string,
  liveQuote?: Partial<QuoteItem>,
): ChartOpenPositionLabelPatch | null => {
  const parsedPrice = Number(position.openPrice);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return null;
  }

  const livePnl = resolveLivePositionPnl(position, liveQuote);
  const labelValueText = `${formatLivePositionPnl(livePnl)} USD`;
  const sideColor = resolveOpenPositionSideColor(position.side, colors, sellColor);

  return {
    id: `open-${position.id}`,
    title: `${position.side === 'sell' ? 'SELL' : 'BUY'} ${formatPositionVolumeLabel(Number(position.volume))}, ${labelValueText}`,
    labelValueText,
    labelValueColor: resolveLiveChartPnlColor(livePnl, colors.background, sideColor),
  };
};

/**
 * Builds only the quote-driven fields of open-position labels. This is the
 * per-tick path used by the native Chart bridge; line geometry stays untouched.
 */
export const buildChartOpenPositionLabelPatches = ({
  chartSymbol,
  positions,
  colors,
  sellColor,
  liveBid,
  liveAsk,
  liveQuote,
  showOnChart,
}: BuildChartOpenPositionLabelPatchesInput): ChartOpenPositionLabelPatch[] => {
  if (!hasEnabledTradeSides(showOnChart)) {
    return [];
  }

  const resolvedLiveQuote = liveQuote ?? (
    (typeof liveBid === 'number' && Number.isFinite(liveBid) && liveBid > 0) ||
      (typeof liveAsk === 'number' && Number.isFinite(liveAsk) && liveAsk > 0)
      ? {
        bid: typeof liveBid === 'number' ? liveBid : undefined,
        ask: typeof liveAsk === 'number' ? liveAsk : undefined,
      }
      : undefined
  );
  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  return positions.flatMap((position) => {
    if (
      normalizeChartOverlaySymbol(position.symbol) !== normalizedChartSymbol ||
      !isTradeSideEnabled(position.side, showOnChart)
    ) {
      return [];
    }
    const patch = buildOpenPositionLabelPatch(
      position,
      colors,
      sellColor,
      resolvedLiveQuote,
    );
    return patch ? [patch] : [];
  });
};

/** Applies live text/color patches without changing any overlay line geometry. */
export const applyChartOpenPositionLabelPatches = (
  payload: ChartOverlayPayload,
  patches: readonly ChartOpenPositionLabelPatch[],
): ChartOverlayPayload => {
  if (patches.length === 0 || payload.priceLines.length === 0) {
    return payload;
  }

  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  let changed = false;
  const priceLines = payload.priceLines.map((line) => {
    const patch = patchById.get(line.id);
    if (
      !patch ||
      (
        line.title === patch.title &&
        line.labelValueText === patch.labelValueText &&
        line.labelValueColor === patch.labelValueColor
      )
    ) {
      return line;
    }

    changed = true;
    return {
      ...line,
      title: patch.title,
      labelValueText: patch.labelValueText,
      labelValueColor: patch.labelValueColor,
    };
  });

  return changed ? { ...payload, priceLines } : payload;
};

export const buildChartOverlayPayload = ({
  chartSymbol,
  candles,
  positions,
  closedPositions = [],
  deals = [],
  colors,
  sellColor,
  liveBid,
  liveAsk,
  liveQuote,
  showOnChart,
  showTradeHistory = true,
  chartTimeframe = 'M1',
  activeTool,
  allowPositionStopDragging = false,
}: BuildChartOverlayPayloadInput): ChartOverlayPayload => {
  const needsPatternMarkers = activeTool === 'patterns';
  const showTradeSides = hasEnabledTradeSides(showOnChart);
  const needsTradeHistory =
    showTradeHistory && (positions.length > 0 || closedPositions.length > 0 || deals.length > 0);
  if (!showTradeSides && !needsPatternMarkers && !needsTradeHistory) {
    return EMPTY_CHART_OVERLAY_PAYLOAD;
  }

  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  const resolvedLiveQuote = liveQuote ?? (
    (typeof liveBid === 'number' && Number.isFinite(liveBid) && liveBid > 0) ||
      (typeof liveAsk === 'number' && Number.isFinite(liveAsk) && liveAsk > 0)
      ? {
        bid: typeof liveBid === 'number' ? liveBid : undefined,
        ask: typeof liveAsk === 'number' ? liveAsk : undefined,
      }
      : undefined
  );
  // Show the trader's open positions for this symbol, filtered to the sides the
  // "Show buy trade" / "Show sell trade" preferences enable.
  const symbolPositions = showTradeSides
    ? positions.filter(
      (position) =>
        normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol &&
        isTradeSideEnabled(position.side, showOnChart),
    )
    : [];

  const priceLines = new Map<string, ChartOverlayPriceLine>();

  symbolPositions.forEach((position) => {
    const parsedPrice = Number(position.openPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;

    const labelPatch = buildOpenPositionLabelPatch(
      position,
      colors,
      sellColor,
      resolvedLiveQuote,
    );
    if (!labelPatch) return;
    const sideColor = resolveOpenPositionSideColor(position.side, colors, sellColor);
    const sideLabel = `${position.side === 'sell' ? 'SELL' : 'BUY'} ${formatPositionVolumeLabel(
      Number(position.volume),
    )}`;

    addUniquePriceLine(priceLines, {
      id: `open-${position.id}`,
      price: parsedPrice,
      color: sideColor,
      lineWidth: 1,
      lineStyle: CHART_LINE_STYLE.Dotted,
      axisLabelVisible: true,
      title: labelPatch.title,
      labelSideText: sideLabel,
      labelValueText: labelPatch.labelValueText,
      labelSideColor: sideColor,
      labelValueColor: labelPatch.labelValueColor,
      labelPlacement: 'line',
    });

    if (showOnChart.slTpLevels) {
      const tpValue = Number(position.tp);
      if (Number.isFinite(tpValue) && tpValue > 0) {
        const tpColor = colors.tradeTpSl || resolveLiveChartPnlColor(1, colors.background, '#4597FF');
        addUniquePriceLine(priceLines, {
          id: `tp-${position.id}`,
          price: tpValue,
          color: tpColor,
          lineWidth: 2,
          lineStyle: CHART_LINE_STYLE.Dashed,
          axisLabelVisible: false,
          title: formatTpSlOverlayLabel(
            'tp',
            position.symbol,
            position.side,
            parsedPrice,
            tpValue,
            Number(position.volume),
          ),
          labelSideText: 'TP',
          labelValueText: formatTpSlOverlayValueLabel(
            position.symbol,
            position.side,
            parsedPrice,
            tpValue,
            Number(position.volume),
          ),
          labelSideColor: tpColor,
          labelValueColor: tpColor,
          labelPlacement: 'line',
          ...(allowPositionStopDragging
            ? { dragKey: buildChartPositionStopDragKey(position.id, 'tp') }
            : {}),
        });
      }

      const slValue = Number(position.sl);
      if (Number.isFinite(slValue) && slValue > 0) {
        const slColor = colors.tradeStopOut || '#F23645';
        addUniquePriceLine(priceLines, {
          id: `sl-${position.id}`,
          price: slValue,
          color: slColor,
          lineWidth: 2,
          lineStyle: CHART_LINE_STYLE.Dashed,
          axisLabelVisible: false,
          title: formatTpSlOverlayLabel(
            'sl',
            position.symbol,
            position.side,
            parsedPrice,
            slValue,
            Number(position.volume),
          ),
          labelSideText: 'SL',
          labelValueText: formatTpSlOverlayValueLabel(
            position.symbol,
            position.side,
            parsedPrice,
            slValue,
            Number(position.volume),
          ),
          labelSideColor: slColor,
          labelValueColor: slColor,
          labelPlacement: 'line',
          ...(allowPositionStopDragging
            ? { dragKey: buildChartPositionStopDragKey(position.id, 'sl') }
            : {}),
        });
      }
    }
  });

  const historyOverlay = needsTradeHistory
    ? buildChartTradeHistoryOverlay({
      chartSymbol,
      chartTimeframe,
      candles,
      openPositions: positions,
      deals,
      closedPositions,
      buyColor: colors.tradeOpen || '#2962FF',
      sellColor: sellColor || '#F23645',
    })
    : { markers: [], tradeHistorySegments: [] };
  const patternMarkers = buildChartOverlayMarkers({
    chartSymbol,
    candles,
    closedPositions: [],
    showOnChart,
    activeTool,
    showTradeHistory: false,
  });
  const markers = patternMarkers.length === 0
    ? historyOverlay.markers
    : [...patternMarkers, ...historyOverlay.markers]
      .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));

  const result = {
    priceLines: applyRightAxisLabelVisibility(
      Array.from(priceLines.values()).sort((left, right) => left.price - right.price),
    ),
    markers,
    tradeHistorySegments: historyOverlay.tradeHistorySegments,
  };

  if (
    result.priceLines.length === 0
    && result.markers.length === 0
    && result.tradeHistorySegments.length === 0
  ) {
    return EMPTY_CHART_OVERLAY_PAYLOAD;
  }

  return result;
};

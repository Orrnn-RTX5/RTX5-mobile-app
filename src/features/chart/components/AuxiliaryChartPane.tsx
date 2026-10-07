import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useShallow } from 'zustand/shallow';

import type { PositionItem } from '../../../dev/mock/tradingData';
import { useInstrumentMeta } from '../../../query/instruments';
import { useMarketStatus } from '../../../query/marketStatus';
import { useActiveBrokerQuerySession } from '../../../query/authenticatedQueryScope';
import { resolveChartMarketSessionPolicy } from '../../../market/chartMarketSessionPolicy';
import {
  resolveChartColorsForTheme,
  useUserPreferences,
} from '../../../state/userPreferences';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { GDark, GLight } from '../../../ui/theme/glass';
import {
  formatTradeVolume,
  resolveTradeVolumeBounds,
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';
import { useExecutableQuote } from '../../quotes/useExecutableQuote';
import { resolveChartDisplayDecimals } from '../chartPricePrecision';
import type { ChartWindowLayout } from '../chartWindowState';
import type { ChartWindowVisualPreferences } from '../chartWindowVisualPreferences';
import type { PersistedChartDrawing } from '../drawingPersistence';
import type { ChartWindowPaneGesture } from '../chartWindowRadialMenu';
import { buildAuxiliaryChartTradeOverlayPriceLines } from '../auxiliaryChartTradeOverlays';
import LiveChartPreviewNative, {
  type PreviewOverlayPriceLine,
} from '../preview/LiveChartPreview.native';
import type { PreviewSourceCandle } from '../preview/chartPreviewShared';
import {
  resolveAuxiliaryChartPaneDensity,
  type AuxiliaryChartPaneBounds,
} from './auxiliaryChartPaneLayout';
import { ChartSymbolHeaderOverlay } from './ChartSymbolHeaderOverlay';
import { COMPACT_TRADE_FOOTER_ROW_HEIGHT } from './ChartTradeButtonsFeature/styles';
import { CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH } from '../ChartScreen.constants';

const QUOTE_RENDER_INTERVAL_MS = 32;

export type AuxiliaryChartTradeActionContext = Readonly<{
  paneId?: string;
  symbol: string;
  timeframe: string;
  lotSize: number;
  bid: number | null;
  ask: number | null;
}>;

/**
 * Structural context for a production trade row. Live quote and lot values are
 * intentionally excluded: ChartTradeButtons owns its executable quote stream,
 * while lot state is supplied directly by the layout host. Volume bounds are
 * pane-symbol metadata and must not be inherited from the active chart.
 */
export type AuxiliaryChartTradeRowRenderContext = Readonly<{
  paneId?: string;
  symbol: string;
  timeframe: string;
  displayDecimals: number;
  volumeBounds: TradeVolumeBounds;
  compactPane: boolean;
}>;

export type AuxiliaryChartSurfaceFrame = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type AuxiliaryChartPaneProps = Readonly<{
  paneId?: string;
  symbol: string;
  timeframe: string;
  /** The only runtime gate: both visible panes stay live; hidden routes stop. */
  isScreenFocused: boolean;
  isDark: boolean;
  layout?: ChartWindowLayout;
  bounds?: Partial<AuxiliaryChartPaneBounds>;
  lotSize: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  tradeDisabled?: boolean;
  showTradeRow?: boolean;
  visualPreferences?: ChartWindowVisualPreferences;
  drawings?: readonly PersistedChartDrawing[];
  viewportCommand?: Readonly<{
    revision: number;
    type: 'scrollToLastBar' | 'resetVerticalScale' | 'resetViewport';
  }>;
  overlayPriceLines?: readonly PreviewOverlayPriceLine[];
  /** Structurally memoized active-account positions supplied by ChartScreen. */
  positions: readonly PositionItem[];
  /** Window-space bounds of the chart surface, excluding the pane trade row. */
  onChartSurfaceFrameChange?: (frame: AuxiliaryChartSurfaceFrame) => void;
  /** Pointer-down ownership for the whole window, including header and trade row. */
  onPaneTouchStart?: () => void;
  /** Immediate plot-tap intent, emitted before single-vs-double confirmation. */
  onTapIntent?: (gesture: ChartWindowPaneGesture) => void;
  onPress?: (gesture: ChartWindowPaneGesture) => void;
  /** Alias for onPress used by chart-surface integrations. */
  onTap?: (gesture: ChartWindowPaneGesture) => void;
  onDoublePress?: (gesture: ChartWindowPaneGesture) => void;
  /** Alias for onDoublePress used by WebView tap messages. */
  onDoubleTap?: (gesture: ChartWindowPaneGesture) => void;
  onSymbolPress?: () => void;
  onSell?: (context: AuxiliaryChartTradeActionContext) => void;
  onBuy?: (context: AuxiliaryChartTradeActionContext) => void;
  onDecreaseLot?: (context: AuxiliaryChartTradeActionContext) => void;
  onIncreaseLot?: (context: AuxiliaryChartTradeActionContext) => void;
  renderTradeRow?: (context: AuxiliaryChartTradeRowRenderContext) => React.ReactNode;
}>;

const toPositivePrice = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveBoundStyle = (
  bounds: Partial<AuxiliaryChartPaneBounds> | undefined,
): ViewStyle | null => {
  const width = typeof bounds?.width === 'number' && bounds.width > 0
    ? Math.floor(bounds.width)
    : undefined;
  const height = typeof bounds?.height === 'number' && bounds.height > 0
    ? Math.floor(bounds.height)
    : undefined;

  return width || height ? { width, height } : null;
};

/**
 * A session-keyed wrapper prevents a retained quote from one broker account
 * appearing in the same symbol pane after an account switch.
 */
export const AuxiliaryChartPane = memo(function AuxiliaryChartPane(
  props: AuxiliaryChartPaneProps,
) {
  const session = useActiveBrokerQuerySession();
  // Key only by broker-session ownership. Symbol/timeframe changes must flow
  // through the existing preview bridge so the initialized WebView survives.
  const scopeKey = session?.cacheNamespace ?? 'no-session';

  return (
    <AuxiliaryChartPaneSessionScoped
      key={scopeKey}
      {...props}
    />
  );
});

const AuxiliaryChartPaneSessionScoped = memo(function AuxiliaryChartPaneSessionScoped({
  paneId,
  symbol,
  timeframe,
  isScreenFocused,
  isDark,
  layout = 'horizontal',
  bounds,
  lotSize,
  style,
  testID = 'auxiliary-chart-pane',
  tradeDisabled,
  showTradeRow = true,
  visualPreferences,
  drawings = [],
  viewportCommand,
  overlayPriceLines = [],
  positions,
  onChartSurfaceFrameChange,
  onPaneTouchStart,
  onTapIntent,
  onPress,
  onTap,
  onDoublePress,
  onDoubleTap,
  onSymbolPress,
  onSell,
  onBuy,
  onDecreaseLot,
  onIncreaseLot,
  renderTradeRow,
}: AuxiliaryChartPaneProps) {
  const theme = isDark ? GDark : GLight;
  const globalVisualPreferences = useUserPreferences(
    useShallow((state) => ({
      chartColors: state.chartColors,
      chartColorScheme: state.chartColorScheme,
      chartDisplay: state.chartDisplay,
      chartVisualType: state.chartVisualType,
      chartAutoScaleEnabled: state.chartAutoScaleEnabled,
      chartHideAll: state.chartHideAll,
      chartVerticalScrollingLocked: state.chartVerticalScrollingLocked,
      chartViewportShowVolumePane: state.chartViewportShowVolumePane,
      chartShowOnChart: state.chartShowOnChart,
      priceSource: state.priceSource,
    })),
  );
  const {
    chartColors,
    chartColorScheme,
    chartDisplay,
    chartVisualType,
    chartAutoScaleEnabled,
    chartHideAll,
    chartVerticalScrollingLocked,
    chartViewportShowVolumePane,
    chartShowOnChart,
    priceSource,
  } = visualPreferences ?? globalVisualPreferences;
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColorScheme, chartColors, isDark],
  );
  const [measuredBounds, setMeasuredBounds] = useState<AuxiliaryChartPaneBounds>({
    width: 0,
    height: 0,
  });
  const chartSurfaceRef = useRef<View>(null);
  const headerContextKey = `${symbol}\u0000${timeframe}`;
  const [latestHeaderCandleState, setLatestHeaderCandleState] = useState<Readonly<{
    contextKey: string;
    candle: PreviewSourceCandle | null;
  }>>({ contextKey: '', candle: null });
  const latestHeaderCandle = latestHeaderCandleState.contextKey === headerContextKey
    ? latestHeaderCandleState.candle
    : null;
  const effectiveBounds = bounds?.width || bounds?.height ? bounds : measuredBounds;
  const density = useMemo(
    () => resolveAuxiliaryChartPaneDensity(effectiveBounds, layout),
    [effectiveBounds, layout],
  );
  const boundStyle = useMemo(() => resolveBoundStyle(bounds), [bounds]);
  const singleTapAction = onTap ?? onPress;
  const doubleTapAction = onDoubleTap ?? onDoublePress;
  const handleLatestHeaderCandleChange = useCallback((payload: Readonly<{
    symbol: string;
    timeframe: string;
    candle: PreviewSourceCandle | null;
  }>) => {
    const payloadContextKey = `${payload.symbol}\u0000${payload.timeframe}`;
    if (payloadContextKey !== headerContextKey) return;
    setLatestHeaderCandleState((current) => (
      current.contextKey === payloadContextKey && current.candle === payload.candle
        ? current
        : { contextKey: payloadContextKey, candle: payload.candle }
    ));
  }, [headerContextKey]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    if (bounds?.width && bounds?.height) return;
    const width = Math.max(0, Math.floor(event.nativeEvent.layout.width));
    const height = Math.max(0, Math.floor(event.nativeEvent.layout.height));
    setMeasuredBounds((current) => (
      current.width === width && current.height === height
        ? current
        : { width, height }
    ));
  }, [bounds?.height, bounds?.width]);
  const handleChartSurfaceLayout = useCallback(() => {
    chartSurfaceRef.current?.measureInWindow((x, y, width, height) => {
      if (
        ![x, y, width, height].every(Number.isFinite)
        || width <= 0
        || height <= 0
      ) {
        return;
      }
      onChartSurfaceFrameChange?.({ x, y, width, height });
    });
  }, [onChartSurfaceFrameChange]);
  useEffect(() => {
    const frame = requestAnimationFrame(handleChartSurfaceLayout);
    return () => cancelAnimationFrame(frame);
  }, [
    handleChartSurfaceLayout,
    isScreenFocused,
    layout,
    paneId,
    showTradeRow,
  ]);

  const { quote, availability } = useExecutableQuote(
    symbol,
    isScreenFocused,
    QUOTE_RENDER_INTERVAL_MS,
  );
  const { data: instrumentMeta } = useInstrumentMeta(symbol, isScreenFocused);
  const { data: marketStatus } = useMarketStatus(
    symbol,
    isScreenFocused,
    isScreenFocused,
  );
  const marketSessionPolicy = useMemo(
    () => resolveChartMarketSessionPolicy(marketStatus),
    [marketStatus],
  );
  // Renko closes on price movement rather than a clock boundary, so divided
  // panes keep the live price but do not show a misleading candle countdown.
  const candleCountdownActive =
    isScreenFocused
    && chartVisualType !== 'renko'
    && chartDisplay.showLivePriceLine
    && marketSessionPolicy.quotePhase !== 'closed';
  const bid = toPositivePrice(quote?.bid);
  const ask = toPositivePrice(quote?.ask);
  const displayDecimals = useMemo(() => resolveChartDisplayDecimals({
    instrumentDigits: instrumentMeta?.digits,
    instrumentPoint: instrumentMeta?.point,
    instrumentTickSize: instrumentMeta?.tickSize,
    liveQuoteDigits: quote?.digits,
    liveQuoteDigitsFromBackend: quote?.digitsSource === 'backend',
    liveQuotePoint: quote?.point,
    liveQuoteTickSize: quote?.tickSize,
    liveQuoteBid: bid ?? undefined,
    liveQuoteAsk: ask ?? undefined,
    liveQuoteLast: quote?.close,
    candlePrices: [],
  }), [
    ask,
    bid,
    instrumentMeta?.digits,
    instrumentMeta?.point,
    instrumentMeta?.tickSize,
    quote?.close,
    quote?.digits,
    quote?.digitsSource,
    quote?.point,
    quote?.tickSize,
  ]);
  const safeDisplayDecimals = Math.max(0, Math.min(10, displayDecimals));
  const paneVolumeBounds = useMemo<TradeVolumeBounds>(() => ({
    minVolume: instrumentMeta?.minVolume,
    maxVolume: instrumentMeta?.maxVolume,
    stepVolume: instrumentMeta?.stepVolume,
  }), [
    instrumentMeta?.maxVolume,
    instrumentMeta?.minVolume,
    instrumentMeta?.stepVolume,
  ]);
  const formattedBid = bid === null ? '---' : bid.toFixed(safeDisplayDecimals);
  const formattedAsk = ask === null ? '---' : ask.toFixed(safeDisplayDecimals);
  const formattedLot = formatTradeVolume(lotSize, paneVolumeBounds);
  const normalizedVolumeBounds = resolveTradeVolumeBounds(paneVolumeBounds);
  const canDecreaseLot = lotSize > normalizedVolumeBounds.minVolume + 1e-9;
  const canIncreaseLot = lotSize < normalizedVolumeBounds.maxVolume - 1e-9;
  const actionsDisabled = tradeDisabled ?? !availability.allowed;
  const combinedOverlayPriceLines = useMemo(
    () => buildAuxiliaryChartTradeOverlayPriceLines({
      symbol,
      positions,
      colors: resolvedChartColors,
      sellColor: theme.trading.sell.primary,
      liveBid: bid,
      liveAsk: ask,
      showOnChart: chartShowOnChart,
      extraPriceLines: overlayPriceLines,
    }),
    [
      ask,
      bid,
      chartShowOnChart,
      overlayPriceLines,
      positions,
      resolvedChartColors,
      symbol,
      theme.trading.sell.primary,
    ],
  );

  const actionContext = useMemo<AuxiliaryChartTradeActionContext>(() => Object.freeze({
    paneId,
    symbol,
    timeframe,
    lotSize,
    bid,
    ask,
  }), [ask, bid, lotSize, paneId, symbol, timeframe]);
  const tradeRowRenderContext = useMemo<AuxiliaryChartTradeRowRenderContext>(() => Object.freeze({
    paneId,
    symbol,
    timeframe,
    displayDecimals: safeDisplayDecimals,
    volumeBounds: paneVolumeBounds,
    compactPane: density.compact,
  }), [density.compact, paneId, paneVolumeBounds, safeDisplayDecimals, symbol, timeframe]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: resolvedChartColors.background,
          borderColor: 'transparent',
        },
        boundStyle,
        style,
      ]}
      onLayout={handleLayout}
      onTouchStart={onPaneTouchStart}
      testID={testID}
      accessibilityLabel={`${symbol} ${timeframe} chart window`}
    >
      <View
        ref={chartSurfaceRef}
        style={styles.chartSurface}
        onLayout={handleChartSurfaceLayout}
        testID={`${testID}-surface`}
      >
        {/* Keep the pane-local type unchanged. The shared preview owns the
            Area gradient and the Renko history transformation. */}
        {isScreenFocused ? (
          <LiveChartPreviewNative
            symbol={symbol}
            timeframe={timeframe}
            colors={resolvedChartColors}
            display={chartDisplay}
            priceSource={priceSource}
            isDark={isDark}
            chartType={chartVisualType}
            active
            commitIntervalMs={density.candleCommitIntervalMs}
            maxCandles={density.maxCandles}
            liveQuoteOverride={quote ?? undefined}
            manageQuoteSubscription={false}
            candleCountdownActive={candleCountdownActive}
            fullChartParity
            autoScaleEnabled={chartAutoScaleEnabled}
            verticalScrollingLocked={chartVerticalScrollingLocked}
            showVolumePane={chartViewportShowVolumePane}
            drawings={drawings}
            drawingsHidden={chartHideAll}
            showObjectDescriptions={chartDisplay.showObjectDescriptions === true}
            viewportCommand={viewportCommand}
            overlayPriceLines={combinedOverlayPriceLines}
            onTapIntent={onTapIntent}
            onTap={singleTapAction}
            onDoubleTap={doubleTapAction}
            onLatestCandleChange={handleLatestHeaderCandleChange}
          />
        ) : (
          <View
            style={[styles.hiddenSurface, { backgroundColor: resolvedChartColors.background }]}
            testID={`${testID}-hidden-surface`}
          />
        )}
        {/* The symbol can still identify a Renko pane, but OHLC belongs to one
            timed source candle and is therefore hidden for price bricks. */}
        {(chartDisplay.showTicker || (chartDisplay.showOHLC && chartVisualType !== 'renko')) ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.header,
              {
                minHeight: density.headerHeight,
                backgroundColor: 'transparent',
              },
            ]}
            testID={`${testID}-header`}
          >
            <View style={styles.headerContent}>
              <ChartSymbolHeaderOverlay
                symbol={symbol}
                candle={latestHeaderCandle}
                displayDecimals={safeDisplayDecimals}
                isDark={isDark}
                showTicker={chartDisplay.showTicker}
                showOHLC={chartDisplay.showOHLC && chartVisualType !== 'renko'}
                compact={density.compact}
                onSymbolPress={onSymbolPress}
                testID={`${testID}-symbol-header`}
              />
            </View>
          </View>
        ) : null}
      </View>

      {showTradeRow ? (renderTradeRow ? (
        <View
          style={[
            styles.renderedTradeRow,
            { minHeight: Math.max(COMPACT_TRADE_FOOTER_ROW_HEIGHT, density.tradeRowHeight) },
          ]}
          testID={`${testID}-trade-row`}
        >
          {renderTradeRow(tradeRowRenderContext)}
        </View>
      ) : <View
        style={[
          styles.tradeRow,
          {
            height: density.tradeRowHeight,
            borderColor: isDark ? '#334155' : '#9E9E9E',
          },
        ]}
        testID={`${testID}-trade-row`}
      >
        <Pressable
          style={[
            styles.tradeButton,
            { backgroundColor: theme.trading.sell.primary },
            (actionsDisabled || !onSell || bid === null) && styles.disabledControl,
          ]}
          onPress={() => onSell?.(actionContext)}
          disabled={actionsDisabled || !onSell || bid === null}
          activateOnPressIn
          accessibilityRole="button"
          accessibilityLabel={`Sell ${symbol}`}
          testID={`${testID}-sell`}
        >
          <Text style={styles.tradeLabel}>SELL</Text>
          <Text
            style={[styles.priceText, density.compact && styles.compactPriceText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {formattedBid}
          </Text>
        </Pressable>

        <View
          style={[
            styles.lotSlot,
            {
              width: density.lotSlotWidth,
              backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#CBD5E1',
            },
          ]}
        >
          <Pressable
            style={styles.lotAdjustButton}
            onPress={() => onDecreaseLot?.(actionContext)}
            disabled={!onDecreaseLot || !canDecreaseLot}
            activateOnPressIn
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${symbol} lot`}
            testID={`${testID}-lot-decrease`}
          >
            <Ionicons
              name="chevron-down"
              size={density.compact ? 11 : 12}
              color={!onDecreaseLot || !canDecreaseLot ? theme.textFaint : theme.textMuted}
            />
          </Pressable>
          <Text
            style={[
              styles.lotText,
              density.compact && styles.compactLotText,
              { color: theme.text },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            testID={`${testID}-lot-value`}
          >
            {formattedLot}
          </Text>
          <Pressable
            style={styles.lotAdjustButton}
            onPress={() => onIncreaseLot?.(actionContext)}
            disabled={!onIncreaseLot || !canIncreaseLot}
            activateOnPressIn
            accessibilityRole="button"
            accessibilityLabel={`Increase ${symbol} lot`}
            testID={`${testID}-lot-increase`}
          >
            <Ionicons
              name="chevron-up"
              size={density.compact ? 11 : 12}
              color={!onIncreaseLot || !canIncreaseLot ? theme.textFaint : theme.textMuted}
            />
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.tradeButton,
            { backgroundColor: theme.trading.buy.primary },
            (actionsDisabled || !onBuy || ask === null) && styles.disabledControl,
          ]}
          onPress={() => onBuy?.(actionContext)}
          disabled={actionsDisabled || !onBuy || ask === null}
          activateOnPressIn
          accessibilityRole="button"
          accessibilityLabel={`Buy ${symbol}`}
          testID={`${testID}-buy`}
        >
          <Text style={styles.tradeLabel}>BUY</Text>
          <Text
            style={[styles.priceText, density.compact && styles.compactPriceText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {formattedAsk}
          </Text>
        </Pressable>
      </View>) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  header: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    zIndex: 30,
    elevation: 24,
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
  },
  chartSurface: {
    flex: 1,
    minWidth: 0,
    minHeight: 1,
    position: 'relative',
  },
  hiddenSurface: {
    flex: 1,
  },
  renderedTradeRow: {
    minWidth: 0,
    minHeight: COMPACT_TRADE_FOOTER_ROW_HEIGHT,
    flexShrink: 0,
    overflow: 'visible',
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  tradeButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tradeLabel: {
    position: 'absolute',
    top: 2,
    left: 5,
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  priceText: {
    width: '100%',
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
  },
  compactPriceText: {
    fontSize: 12,
    lineHeight: 17,
  },
  disabledControl: {
    opacity: 0.5,
  },
  lotSlot: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  lotAdjustButton: {
    width: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotText: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'center',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
  },
  compactLotText: {
    fontSize: 11,
    lineHeight: 15,
  },
});

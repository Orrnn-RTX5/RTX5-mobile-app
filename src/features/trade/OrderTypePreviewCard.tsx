import { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import type { CandleParams } from '../../domain/candles/hooks/useLiveCandles';
import type { ThemeColors } from '../../ui/theme/useTheme';
import {
  getChartOrderSide,
  isPendingChartOrderType,
  type ChartOrderType,
} from '../chart/chartTradeOrderUtils';
import {
  buildOrderTicketPreviewSeries,
  resolveOrderTicketPriceDecimals,
  roundOrderTicketPrice,
} from './orderTicketPreviewUtils';

const CHART_HEIGHT = 166;
const RIGHT_AXIS_WIDTH = 88;
const HORIZONTAL_PADDING = 6;
const VERTICAL_PADDING = 14;
const TRIGGER_PILL_WIDTH = 96;
const TRIGGER_PILL_HEIGHT = 28;

type OrderTypePreviewCardProps = {
  symbol: string;
  candles: CandleParams[];
  bid: number;
  ask: number;
  tickSize?: number;
  orderType: ChartOrderType;
  pendingEntryPrice: number;
  onPendingEntryPriceChange?: (next: number) => void;
  T: ThemeColors;
  isDark: boolean;
};

export function OrderTypePreviewCard({
  symbol,
  candles,
  bid,
  ask,
  tickSize,
  orderType,
  pendingEntryPrice,
  onPendingEntryPriceChange,
  T,
  isDark,
}: OrderTypePreviewCardProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);

  const previewPoints = useMemo(
    () => buildOrderTicketPreviewSeries({ candles, bid, ask }),
    [ask, bid, candles],
  );

  const decimals = useMemo(
    () => resolveOrderTicketPriceDecimals(tickSize, bid, ask),
    [ask, bid, tickSize],
  );

  const isPendingOrder = isPendingChartOrderType(orderType);
  const orderSide = getChartOrderSide(orderType);
  const triggerColor = orderSide === 'buy' ? T.trading.buy.primary : T.trading.sell.primary;
  const fallbackTriggerPrice = orderSide === 'buy'
    ? (Number.isFinite(ask) && ask > 0 ? ask : bid)
    : (Number.isFinite(bid) && bid > 0 ? bid : ask);
  const resolvedTriggerPrice = Number.isFinite(pendingEntryPrice) && pendingEntryPrice > 0
    ? pendingEntryPrice
    : roundOrderTicketPrice(fallbackTriggerPrice, tickSize, decimals);

  const visibleLevels = useMemo(() => {
    const values = [
      bid,
      ask,
      ...previewPoints.flatMap((point) => [point.bid, point.ask]),
    ];

    if (isPendingOrder) {
      values.push(resolvedTriggerPrice);
    }

    return values.filter((value) => Number.isFinite(value) && value > 0);
  }, [ask, bid, isPendingOrder, previewPoints, resolvedTriggerPrice]);

  const range = useMemo(() => {
    const minPrice = visibleLevels.length > 0 ? Math.min(...visibleLevels) : Math.min(bid, ask, 0);
    const maxPrice = visibleLevels.length > 0 ? Math.max(...visibleLevels) : Math.max(bid, ask, 0);
    const baseTick = typeof tickSize === 'number' && Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.0001;
    const dynamicPadding = Math.max((maxPrice - minPrice) * 0.18, Math.abs(ask - bid) * 8, baseTick * 18, 0.0001);

    return {
      min: Math.max(0, minPrice - dynamicPadding),
      max: maxPrice + dynamicPadding,
    };
  }, [ask, bid, tickSize, visibleLevels]);

  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const drawableWidth = Math.max(layoutWidth - RIGHT_AXIS_WIDTH - HORIZONTAL_PADDING * 2, 0);
  const chartRightX = HORIZONTAL_PADDING + drawableWidth;
  const chartBottomY = CHART_HEIGHT - VERTICAL_PADDING;
  const chartTopY = VERTICAL_PADDING;
  const rangeSpan = Math.max(range.max - range.min, 0.0001);

  const yPos = (value: number) => {
    const progress = (value - range.min) / rangeSpan;
    return chartBottomY - progress * (chartBottomY - chartTopY);
  };

  const xPos = (index: number, total: number) => {
    if (total <= 1) {
      return HORIZONTAL_PADDING;
    }
    return HORIZONTAL_PADDING + (index / (total - 1)) * drawableWidth;
  };

  const buildPath = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xPos(index, values.length)} ${yPos(value)}`).join(' ');

  const buildAreaPath = (linePath: string, total: number) => {
    if (!linePath) {
      return '';
    }
    return `${linePath} L ${xPos(total - 1, total)} ${chartBottomY} L ${xPos(0, total)} ${chartBottomY} Z`;
  };

  const midpointSeries = previewPoints.map((point) => (point.bid + point.ask) / 2);
  const bidPath = layoutWidth > 0 ? buildPath(previewPoints.map((point) => point.bid)) : '';
  const askPath = layoutWidth > 0 ? buildPath(previewPoints.map((point) => point.ask)) : '';
  const midPath = layoutWidth > 0 ? buildPath(midpointSeries) : '';
  const areaPath = layoutWidth > 0 ? buildAreaPath(midPath, midpointSeries.length) : '';
  const triggerY = yPos(resolvedTriggerPrice);
  const triggerPillY = Math.min(
    chartBottomY - TRIGGER_PILL_HEIGHT - 4,
    Math.max(chartTopY + 4, triggerY - TRIGGER_PILL_HEIGHT - 6),
  );
  const spreadText =
    Number.isFinite(ask) && Number.isFinite(bid) && ask > bid
      ? `Spread ${(ask - bid).toFixed(decimals)}`
      : 'Spread --';
  const footerText = isPendingOrder
    ? 'Drag the dotted trigger line up or down to set the pending price on the live graph.'
    : 'Live bid and ask data update this same graph on every order-type tab.';

  const handleLayout = (event: LayoutChangeEvent) => {
    setLayoutWidth(event.nativeEvent.layout.width);
  };

  const applyPendingEntryFromTouchY = useCallback(
    (touchY: number) => {
      if (!isPendingOrder || !onPendingEntryPriceChange || layoutWidth <= 0) {
        return;
      }

      const clampedY = Math.min(chartBottomY, Math.max(chartTopY, touchY));
      const progress = (chartBottomY - clampedY) / Math.max(chartBottomY - chartTopY, 1);
      const rawPrice = range.min + progress * rangeSpan;
      const roundedPrice = roundOrderTicketPrice(rawPrice, tickSize, decimals);

      if (roundedPrice > 0) {
        onPendingEntryPriceChange(roundedPrice);
      }
    },
    [
      chartBottomY,
      chartTopY,
      decimals,
      isPendingOrder,
      layoutWidth,
      onPendingEntryPriceChange,
      range.min,
      rangeSpan,
      tickSize,
    ],
  );

  const pendingLinePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isPendingOrder && layoutWidth > 0,
        onStartShouldSetPanResponderCapture: () => isPendingOrder && layoutWidth > 0,
        onMoveShouldSetPanResponder: () => isPendingOrder && layoutWidth > 0,
        onMoveShouldSetPanResponderCapture: () => isPendingOrder && layoutWidth > 0,
        onPanResponderGrant: (event) => applyPendingEntryFromTouchY(event.nativeEvent.locationY),
        onPanResponderMove: (event) => applyPendingEntryFromTouchY(event.nativeEvent.locationY),
        onPanResponderRelease: (event) => applyPendingEntryFromTouchY(event.nativeEvent.locationY),
        onPanResponderTerminationRequest: () => false,
      }),
    [applyPendingEntryFromTouchY, isPendingOrder, layoutWidth],
  );

  return (
    <View style={styles.card} onLayout={handleLayout}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LIVE MARKET GRAPH</Text>
          <Text style={styles.title}>{symbol.replace(/\//g, '')} - {spreadText}</Text>
        </View>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{isPendingOrder ? 'DRAG PRICE' : 'LIVE'}</Text>
        </View>
      </View>

      <View style={styles.legendRow}>
        <Legend swatch={T.trading.sell.primary} label='Bid' styles={styles} />
        <Legend swatch={T.trading.buy.primary} label='Ask' styles={styles} />
        <Legend swatch={T.accent} label='Mid' styles={styles} />
        {isPendingOrder ? <Legend swatch={triggerColor} label='Trigger' styles={styles} /> : null}
      </View>

      <View style={styles.canvasWrap}>
        {layoutWidth > 0 ? (
          <Svg width={layoutWidth} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id='ticketPreviewFill' x1='0' y1='0' x2='0' y2='1'>
                <Stop offset='0%' stopColor={T.accent} stopOpacity='0.28' />
                <Stop offset='100%' stopColor={T.accent} stopOpacity='0.02' />
              </LinearGradient>
            </Defs>

            {[0.2, 0.5, 0.8].map((ratio) => {
              const y = chartTopY + (chartBottomY - chartTopY) * ratio;
              return (
                <Line
                  key={ratio}
                  x1={HORIZONTAL_PADDING}
                  y1={y}
                  x2={chartRightX}
                  y2={y}
                  stroke={T.border}
                  strokeDasharray='4 4'
                  strokeWidth='1'
                />
              );
            })}

            {areaPath ? <Path d={areaPath} fill='url(#ticketPreviewFill)' /> : null}
            {midPath ? <Path d={midPath} stroke={T.accent} strokeWidth='1.2' fill='none' opacity={0.9} /> : null}
            {bidPath ? <Path d={bidPath} stroke={T.trading.sell.primary} strokeWidth='1.4' fill='none' /> : null}
            {askPath ? <Path d={askPath} stroke={T.trading.buy.primary} strokeWidth='1.4' fill='none' /> : null}

            {isPendingOrder ? (
              <>
                <Line
                  x1={HORIZONTAL_PADDING}
                  y1={triggerY}
                  x2={chartRightX}
                  y2={triggerY}
                  stroke={triggerColor}
                  strokeWidth='1.5'
                  strokeDasharray='7 5'
                  strokeLinecap='round'
                />
                <Rect
                  x={HORIZONTAL_PADDING + 8}
                  y={triggerPillY}
                  width={TRIGGER_PILL_WIDTH}
                  height={TRIGGER_PILL_HEIGHT}
                  rx={8}
                  fill={isDark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.94)'}
                  stroke={triggerColor}
                  strokeWidth='1'
                />
                <SvgText
                  x={HORIZONTAL_PADDING + 8 + TRIGGER_PILL_WIDTH / 2}
                  y={triggerPillY + 10}
                  fill={triggerColor}
                  fontSize='8'
                  fontWeight='700'
                  letterSpacing='0.6'
                  textAnchor='middle'
                >
                  TRIGGER
                </SvgText>
                <SvgText
                  x={HORIZONTAL_PADDING + 8 + TRIGGER_PILL_WIDTH / 2}
                  y={triggerPillY + 21}
                  fill={T.text}
                  fontSize='9'
                  fontWeight='800'
                  textAnchor='middle'
                >
                  {resolvedTriggerPrice.toFixed(decimals)}
                </SvgText>
                <Circle cx={chartRightX - 8} cy={triggerY} r={5.5} fill={triggerColor} />
                <Circle
                  cx={chartRightX - 8}
                  cy={triggerY}
                  r={10}
                  fill='transparent'
                  stroke={triggerColor}
                  strokeOpacity={0.24}
                  strokeWidth='1'
                />
              </>
            ) : null}

            <G x={chartRightX + 8} y={yPos(ask) - 13}>
              <Rect width={RIGHT_AXIS_WIDTH - 16} height={26} rx={7} fill={T.trading.buy.primary} />
              <SvgText x={(RIGHT_AXIS_WIDTH - 16) / 2} y={11} fill='#FFFFFF' fontSize='8' fontWeight='700' letterSpacing='0.6' textAnchor='middle'>
                ASK
              </SvgText>
              <SvgText x={(RIGHT_AXIS_WIDTH - 16) / 2} y={21} fill='#FFFFFF' fontSize='9' fontWeight='800' textAnchor='middle'>
                {ask.toFixed(decimals)}
              </SvgText>
            </G>

            <G x={chartRightX + 8} y={yPos(bid) - 13}>
              <Rect width={RIGHT_AXIS_WIDTH - 16} height={26} rx={7} fill={T.trading.sell.primary} />
              <SvgText x={(RIGHT_AXIS_WIDTH - 16) / 2} y={11} fill='#FFFFFF' fontSize='8' fontWeight='700' letterSpacing='0.6' textAnchor='middle'>
                BID
              </SvgText>
              <SvgText x={(RIGHT_AXIS_WIDTH - 16) / 2} y={21} fill='#FFFFFF' fontSize='9' fontWeight='800' textAnchor='middle'>
                {bid.toFixed(decimals)}
              </SvgText>
            </G>
          </Svg>
        ) : null}

        {isPendingOrder ? <View style={styles.dragLayer} {...pendingLinePanResponder.panHandlers} /> : null}
      </View>

      <Text style={styles.footerText}>
        {footerText}
      </Text>
    </View>
  );
}

function Legend({
  swatch,
  label,
  styles,
}: {
  swatch: string;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: swatch }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    card: {
      marginTop: 12,
      marginBottom: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass2,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 12,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.22 : 0.08,
      shadowRadius: 18,
      elevation: 4,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    headerCopy: {
      flex: 1,
    },
    eyebrow: {
      color: T.textSub,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
    },
    title: {
      color: T.text,
      fontSize: 14,
      fontWeight: '700',
      marginTop: 4,
    },
    typePill: {
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : T.glass3,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: '52%',
    },
    typePillText: {
      color: T.accent,
      fontSize: 11,
      fontWeight: '600',
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 12,
      marginBottom: 8,
      flexWrap: 'wrap',
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendSwatch: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendText: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '600',
    },
    canvasWrap: {
      position: 'relative',
      height: CHART_HEIGHT,
      overflow: 'hidden',
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(15,23,42,0.3)' : 'rgba(255,255,255,0.55)',
    },
    dragLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    footerText: {
      marginTop: 10,
      color: T.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
  });
}

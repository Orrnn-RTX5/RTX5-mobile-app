/**
 * Order tick execution graph — renders a live bid/ask trace with badged
 * latest-tick price labels on the right axis. Pure presentation; the
 * `LiveOrderTickExecutionGraph` wrapper subscribes to live data.
 */
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { clampValue, isValidTickPoint, resolveFallbackTickSize } from './tickHelpers';
import { useOrderExecutionTicks } from './useOrderExecutionTicks';
import {
  DEFAULT_GRAPH_HEIGHT,
  GRAPH_AXIS_LABEL_OFFSET,
  GRAPH_AXIS_LABEL_RIGHT_PADDING,
  GRAPH_BADGE_GAP,
  GRAPH_BADGE_HEIGHT,
  GRAPH_BADGE_WIDTH,
  GRAPH_BOTTOM_PADDING,
  GRAPH_LABEL_COUNT,
  GRAPH_LEFT_PADDING,
  GRAPH_MIN_LINE_GAP,
  GRAPH_RIGHT_AXIS_WIDTH,
  GRAPH_TOP_PADDING,
  GRAPH_TRACE_MAIN_STROKE_WIDTH,
  GRAPH_TRACE_SOFT_OPACITY,
  GRAPH_TRACE_SOFT_STROKE_WIDTH,
  type LiveOrderTickExecutionGraphProps,
  type OrderTickExecutionGraphProps,
} from './types';

export const OrderTickExecutionGraph = React.memo(function OrderTickExecutionGraph({
  ticks,
  height = DEFAULT_GRAPH_HEIGHT,
  bidColor = '#2563EB',
  askColor = '#E53935',
  priceDecimals = 5,
  isDark = false,
  backgroundColor,
}: OrderTickExecutionGraphProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  // Keep the embedded execution graph visually attached to the parent order
  // sheet. Without these theme-aware drawing colors, dark mode still showed a
  // light graph card at the bottom of the SL/TP flow.
  const surfaceColor = backgroundColor ?? (isDark ? '#1E1E1E' : '#FFFFFF');
  const gridColor = isDark ? 'rgba(148,163,184,0.2)' : '#D3D8E0';
  const labelColor = isDark ? '#94A3B8' : '#7B8794';

  const visibleTicks = useMemo(() => {
    const nextTicks = ticks.filter(isValidTickPoint).slice(-120);
    if (nextTicks.length === 1) {
      return [
        nextTicks[0],
        { ...nextTicks[0], time: nextTicks[0].time + 1 },
      ];
    }
    return nextTicks;
  }, [ticks]);

  const fallbackTickSize = useMemo(
    () => resolveFallbackTickSize(visibleTicks, priceDecimals),
    [priceDecimals, visibleTicks],
  );
  const gridLineSpacing = Math.max(
    0,
    (height - GRAPH_TOP_PADDING - GRAPH_BOTTOM_PADDING) / Math.max(GRAPH_LABEL_COUNT, 1),
  );

  const { chartMin, chartMax } = useMemo(() => {
    const bidValues = visibleTicks.map((tick) => tick.bid);
    const askValues = visibleTicks.map((tick) => tick.ask);
    const allValues = [...bidValues, ...askValues];

    if (allValues.length === 0) {
      return { chartMin: 0, chartMax: fallbackTickSize * 6 };
    }

    const minPrice = Math.min(...allValues);
    const maxPrice = Math.max(...allValues);
    const pricePadding = (maxPrice - minPrice) * 0.15 || fallbackTickSize;

    return {
      chartMin: minPrice - pricePadding,
      chartMax: maxPrice + pricePadding,
    };
  }, [fallbackTickSize, visibleTicks]);

  const plotWidth = Math.max(0, layoutWidth - GRAPH_RIGHT_AXIS_WIDTH - GRAPH_LEFT_PADDING);
  const plotHeight = Math.max(0, gridLineSpacing * Math.max(GRAPH_LABEL_COUNT - 1, 0));
  const plotLeft = GRAPH_LEFT_PADDING;
  const plotRight = plotLeft + plotWidth;
  const graphBottomGuideY = Math.min(height - 1, GRAPH_TOP_PADDING + gridLineSpacing * Math.max(GRAPH_LABEL_COUNT, 1));
  const priceLabelX = Math.min(
    layoutWidth - GRAPH_AXIS_LABEL_RIGHT_PADDING,
    plotRight + GRAPH_AXIS_LABEL_OFFSET,
  );
  const chartSpan = Math.max(chartMax - chartMin, fallbackTickSize);
  const latestTick = visibleTicks[visibleTicks.length - 1];

  const xForTick = (index: number, total: number) => {
    if (total <= 1) {
      return plotLeft;
    }
    return plotLeft + (index / (total - 1)) * plotWidth;
  };

  const yForPrice = (price: number) =>
    GRAPH_TOP_PADDING + plotHeight - ((price - chartMin) / chartSpan) * plotHeight;

  const buildTracePath = (values: number[]) => {
    if (values.length === 0) return '';

    let path = `M ${xForTick(0, values.length)} ${yForPrice(values[0])}`;
    for (let index = 1; index < values.length; index += 1) {
      path += ` L ${xForTick(index, values.length)} ${yForPrice(values[index])}`;
    }
    return path;
  };

  const askPath = useMemo(
    () => (layoutWidth > 0 ? buildTracePath(visibleTicks.map((tick) => tick.ask)) : ''),
    [layoutWidth, visibleTicks],
  );
  const bidPath = useMemo(
    () => (layoutWidth > 0 ? buildTracePath(visibleTicks.map((tick) => tick.bid)) : ''),
    [layoutWidth, visibleTicks],
  );

  const priceLevels = useMemo(
    () =>
      Array.from({ length: GRAPH_LABEL_COUNT }, (_, index) =>
        chartMax - (chartSpan * index) / Math.max(GRAPH_LABEL_COUNT - 1, 1),
      ),
    [chartMax, chartSpan],
  );
  const bottomGuidePriceLevel =
    chartMin - chartSpan / Math.max(GRAPH_LABEL_COUNT - 1, 1);

  const badgePositions = useMemo(() => {
    if (!latestTick) return null;

    const topLimit = GRAPH_TOP_PADDING;
    const bottomLimit = GRAPH_TOP_PADDING + plotHeight - GRAPH_BADGE_HEIGHT;
    let askTop = clampValue(yForPrice(latestTick.ask) - GRAPH_BADGE_HEIGHT / 2, topLimit, bottomLimit);
    let bidTop = clampValue(yForPrice(latestTick.bid) - GRAPH_BADGE_HEIGHT / 2, topLimit, bottomLimit);

    if (bidTop < askTop + GRAPH_MIN_LINE_GAP) {
      bidTop = Math.min(bottomLimit, askTop + GRAPH_MIN_LINE_GAP);
      if (bidTop >= bottomLimit) {
        askTop = Math.max(topLimit, bidTop - GRAPH_MIN_LINE_GAP);
      }
    }

    return { askTop, bidTop };
  }, [latestTick, plotHeight]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setLayoutWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={[styles.card, { height, backgroundColor: surfaceColor }]} onLayout={handleLayout}>
      {layoutWidth > 0 ? (
        <Svg width={layoutWidth} height={height}>
          {priceLevels.map((priceLevel, index) => {
            const y = yForPrice(priceLevel);
            return (
              <Line
                key={`grid-${index}`}
                x1={plotLeft} y1={y} x2={plotRight} y2={y}
                stroke={gridColor} strokeDasharray="4 4" strokeWidth="1"
              />
            );
          })}

          {askPath ? (
            <>
              <Path d={askPath} stroke={askColor} strokeWidth={GRAPH_TRACE_SOFT_STROKE_WIDTH} strokeOpacity={GRAPH_TRACE_SOFT_OPACITY} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <Path d={askPath} stroke={askColor} strokeWidth={GRAPH_TRACE_MAIN_STROKE_WIDTH} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : null}
          {bidPath ? (
            <>
              <Path d={bidPath} stroke={bidColor} strokeWidth={GRAPH_TRACE_SOFT_STROKE_WIDTH} strokeOpacity={GRAPH_TRACE_SOFT_OPACITY} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <Path d={bidPath} stroke={bidColor} strokeWidth={GRAPH_TRACE_MAIN_STROKE_WIDTH} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : null}

          {priceLevels.map((priceLevel, index) => (
            <SvgText
              key={`label-${index}`}
              x={priceLabelX} y={yForPrice(priceLevel) + 4}
              fill={labelColor} fontSize="10" fontWeight="500" textAnchor="end"
            >
              {priceLevel.toFixed(priceDecimals)}
            </SvgText>
          ))}

          <Line
            x1={plotLeft} y1={graphBottomGuideY} x2={plotRight} y2={graphBottomGuideY}
            stroke={gridColor} strokeDasharray="4 4" strokeWidth="1"
          />
          <SvgText
            x={priceLabelX} y={graphBottomGuideY + 4}
            fill={labelColor} fontSize="10" fontWeight="500" textAnchor="end"
          >
            {bottomGuidePriceLevel.toFixed(priceDecimals)}
          </SvgText>

          {latestTick ? (
            <>
              <Line x1={plotRight - 2} y1={yForPrice(latestTick.ask)} x2={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP} y2={yForPrice(latestTick.ask)} stroke={askColor} strokeWidth="0.9" />
              <Line x1={plotRight - 2} y1={yForPrice(latestTick.bid)} x2={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP} y2={yForPrice(latestTick.bid)} stroke={bidColor} strokeWidth="0.9" />
            </>
          ) : null}

          {latestTick && badgePositions ? (
            <>
              <G x={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP} y={badgePositions.askTop}>
                <Rect width={GRAPH_BADGE_WIDTH} height={GRAPH_BADGE_HEIGHT} rx={5} fill={askColor} />
                <SvgText x={GRAPH_BADGE_WIDTH / 2} y={GRAPH_BADGE_HEIGHT / 2 + 3} fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">
                  {latestTick.ask.toFixed(priceDecimals)}
                </SvgText>
              </G>
              <G x={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP} y={badgePositions.bidTop}>
                <Rect width={GRAPH_BADGE_WIDTH} height={GRAPH_BADGE_HEIGHT} rx={5} fill={bidColor} />
                <SvgText x={GRAPH_BADGE_WIDTH / 2} y={GRAPH_BADGE_HEIGHT / 2 + 3} fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">
                  {latestTick.bid.toFixed(priceDecimals)}
                </SvgText>
              </G>
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
});

export function LiveOrderTickExecutionGraph(props: LiveOrderTickExecutionGraphProps) {
  const ticks = useOrderExecutionTicks(props);

  return (
    <OrderTickExecutionGraph
      ticks={ticks}
      height={props.height}
      bidColor={props.bidColor}
      askColor={props.askColor}
      priceDecimals={props.priceDecimals}
      isDark={props.isDark}
      backgroundColor={props.backgroundColor}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
});

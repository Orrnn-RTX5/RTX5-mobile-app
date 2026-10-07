import { useTheme } from '../../../ui/theme/useTheme';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import {
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';
import {
  type ChartTimeRange,
} from '../timeRangePresets';
import {
  type FooterLotPickerMode,
} from '../chartTradeInteractionUtils';

import { CHART_TRADE_MINI_PREVIEW_AXIS_WIDTH, CHART_TRADE_MINI_PREVIEW_LEFT_PAD, CHART_TRADE_MINI_PREVIEW_HEIGHT, CHART_TRADE_MINI_PREVIEW_TOP_PAD, CHART_TRADE_MINI_PREVIEW_BOTTOM_PAD, CHART_TRADE_MINI_PREVIEW_TAG_WIDTH, CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT, clampValue } from "../ChartScreen.constants";


export const PendingOrderPreviewChart = React.memo(({
  styles,
  candles,
  bid,
  ask,
  entryPrice,
  entryLabel,
  stopLimitPriceEnabled,
  stopLimitPrice,
  stopLossEnabled,
  stopLossPrice,
  takeProfitEnabled,
  takeProfitPrice,
  displayDecimals,
  buyColor,
  sellColor,
}: any) => {
  const T = useTheme();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const pointSize = useMemo(() => Math.pow(10, -Math.max(displayDecimals, 0)), [displayDecimals]);

  const previewCandles = useMemo(
    () =>
      Array.isArray(candles)
        ? candles
            .filter(
              (candle: any) =>
                candle &&
                Number.isFinite(candle.open) &&
                Number.isFinite(candle.high) &&
                Number.isFinite(candle.low) &&
                Number.isFinite(candle.close),
            )
            .slice(-28)
        : [],
    [candles],
  );

  const range = useMemo(() => {
    const values: number[] = [];
    previewCandles.forEach((candle: any) => {
      values.push(candle.high, candle.low);
    });
    if (Number.isFinite(bid) && bid > 0) values.push(bid);
    if (Number.isFinite(ask) && ask > 0) values.push(ask);
    if (Number.isFinite(entryPrice) && entryPrice > 0) values.push(entryPrice);
    if (stopLimitPriceEnabled && Number.isFinite(stopLimitPrice) && stopLimitPrice > 0) values.push(stopLimitPrice);
    if (stopLossEnabled && Number.isFinite(stopLossPrice) && stopLossPrice > 0) values.push(stopLossPrice);
    if (takeProfitEnabled && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) values.push(takeProfitPrice);

    if (values.length === 0) {
      return { min: 0, max: pointSize * 16 };
    }

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawSpan = Math.max(rawMax - rawMin, pointSize * 12);
    const padding = Math.max(rawSpan * 0.18, pointSize * 10);

    return {
      min: rawMin - padding,
      max: rawMax + padding,
    };
  }, [
    ask,
    bid,
    entryPrice,
    pointSize,
    previewCandles,
    stopLimitPrice,
    stopLimitPriceEnabled,
    stopLossEnabled,
    stopLossPrice,
    takeProfitEnabled,
    takeProfitPrice,
  ]);

  const plotWidth = Math.max(100, layoutWidth - CHART_TRADE_MINI_PREVIEW_AXIS_WIDTH - CHART_TRADE_MINI_PREVIEW_LEFT_PAD - 6);
  const plotHeight = CHART_TRADE_MINI_PREVIEW_HEIGHT - CHART_TRADE_MINI_PREVIEW_TOP_PAD - CHART_TRADE_MINI_PREVIEW_BOTTOM_PAD;
  const valueSpan = Math.max(range.max - range.min, pointSize * 12);
  const tagX = Math.max(
    CHART_TRADE_MINI_PREVIEW_LEFT_PAD + 8,
    layoutWidth - CHART_TRADE_MINI_PREVIEW_TAG_WIDTH - 2,
  );

  const yForPrice = useCallback(
    (price: number) => {
      if (!Number.isFinite(price)) {
        return CHART_TRADE_MINI_PREVIEW_TOP_PAD + plotHeight / 2;
      }
      return CHART_TRADE_MINI_PREVIEW_TOP_PAD + ((range.max - price) / valueSpan) * plotHeight;
    },
    [plotHeight, range.max, valueSpan],
  );

  const guideLines = useMemo(
    () => Array.from({ length: 8 }, (_, index) => range.max - (valueSpan * index) / 7),
    [range.max, valueSpan],
  );

  const effectiveSpread = useMemo(() => {
    if (Number.isFinite(ask) && Number.isFinite(bid) && ask > bid) {
      return ask - bid;
    }
    return Math.max(pointSize * 10, pointSize * 2);
  }, [ask, bid, pointSize]);

  const priceLines = useMemo(() => {
    const lines: Array<{
      key: string;
      price: number;
      stroke: string;
      tagFill: string;
      textColor: string;
      dashed?: boolean;
      lineWidth?: number;
      showMarker?: boolean;
      helperLabel?: string;
    }> = [];

    if (Number.isFinite(entryPrice) && entryPrice > 0) {
      lines.push({
        key: 'entry',
        price: entryPrice,
        stroke: '#8A8F98',
        tagFill: '#2B2F36',
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        showMarker: true,
        helperLabel: typeof entryLabel === 'string' && entryLabel.trim() ? entryLabel.trim() : 'Price',
      });
    }

    if (stopLimitPriceEnabled && Number.isFinite(stopLimitPrice) && stopLimitPrice > 0) {
      lines.push({
        key: 'stop-limit',
        price: stopLimitPrice,
        stroke: '#2563EB',
        tagFill: '#2563EB',
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        helperLabel: 'Stop Limit',
      });
    }

    if (stopLossEnabled && Number.isFinite(stopLossPrice) && stopLossPrice > 0) {
      lines.push({
        key: 'sl',
        price: stopLossPrice,
        stroke: '#F97316',
        tagFill: '#F97316',
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        helperLabel: 'SL',
      });
    }

    if (takeProfitEnabled && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) {
      lines.push({
        key: 'tp',
        price: takeProfitPrice,
        stroke: T.trading.profit,
        tagFill: T.trading.profit,
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        helperLabel: 'TP',
      });
    }

    if (Number.isFinite(ask) && ask > 0) {
      lines.push({
        key: 'ask',
        price: ask,
        stroke: sellColor,
        tagFill: sellColor,
        textColor: '#FFFFFF',
        lineWidth: 1.5,
      });
    }

    if (Number.isFinite(bid) && bid > 0) {
      lines.push({
        key: 'bid',
        price: bid,
        stroke: buyColor,
        tagFill: buyColor,
        textColor: '#FFFFFF',
        lineWidth: 1.5,
      });
    }

    return lines;
  }, [
    T.trading.profit,
    ask,
    bid,
    buyColor,
    entryLabel,
    entryPrice,
    sellColor,
    stopLimitPrice,
    stopLimitPriceEnabled,
    stopLossEnabled,
    stopLossPrice,
    takeProfitEnabled,
    takeProfitPrice,
  ]);

  const tagTops = useMemo(() => {
    if (layoutWidth <= 0 || priceLines.length === 0) {
      return new Map<string, number>();
    }

    const topLimit = CHART_TRADE_MINI_PREVIEW_TOP_PAD;
    const bottomLimit = CHART_TRADE_MINI_PREVIEW_TOP_PAD + plotHeight - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT;
    const minGap = CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT + 3;
    const positions = priceLines
      .map((line) => ({
        key: line.key,
        top: clampValue(
          yForPrice(line.price) - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT / 2,
          topLimit,
          bottomLimit,
        ),
      }))
      .sort((left, right) => left.top - right.top);

    for (let index = 1; index < positions.length; index += 1) {
      positions[index].top = Math.max(positions[index].top, positions[index - 1].top + minGap);
    }

    if (positions.length > 0 && positions[positions.length - 1].top > bottomLimit) {
      positions[positions.length - 1].top = bottomLimit;
      for (let index = positions.length - 2; index >= 0; index -= 1) {
        positions[index].top = Math.min(positions[index].top, positions[index + 1].top - minGap);
      }
    }

    return new Map(
      positions.map((position) => [
        position.key,
        clampValue(position.top, topLimit, bottomLimit),
      ]),
    );
  }, [layoutWidth, plotHeight, priceLines, yForPrice]);

  const previewTracePoints = useMemo(() => {
    const history = previewCandles.slice(-10);
    if (layoutWidth <= 0 || history.length === 0) {
      return { ask: '', bid: '' };
    }

    const traceWidth = Math.max(56, plotWidth * 0.17);
    const denom = Math.max(1, history.length - 1);

    const askPoints = history
      .map((candle: any, index: number) => {
        const x = CHART_TRADE_MINI_PREVIEW_LEFT_PAD + (traceWidth * index) / denom;
        const derivedAsk =
          index === history.length - 1 && Number.isFinite(ask) && ask > 0
            ? ask
            : candle.close + effectiveSpread / 2;
        return `${x},${yForPrice(derivedAsk)}`;
      })
      .join(' ');

    const bidPoints = history
      .map((candle: any, index: number) => {
        const x = CHART_TRADE_MINI_PREVIEW_LEFT_PAD + (traceWidth * index) / denom;
        const derivedBid =
          index === history.length - 1 && Number.isFinite(bid) && bid > 0
            ? bid
            : candle.close - effectiveSpread / 2;
        return `${x},${yForPrice(derivedBid)}`;
      })
      .join(' ');

    return { ask: askPoints, bid: bidPoints };
  }, [ask, bid, effectiveSpread, layoutWidth, plotWidth, previewCandles, yForPrice]);

  const markerX = CHART_TRADE_MINI_PREVIEW_LEFT_PAD + plotWidth * 0.48;

  return (
    <View
      style={styles.chartTradeMiniPreview}
      onLayout={(event) => {
        const nextWidth = Math.max(0, Math.floor(event.nativeEvent.layout.width));
        if (nextWidth !== layoutWidth) {
          setLayoutWidth(nextWidth);
        }
      }}
    >
      {layoutWidth > 0 ? (
        <Svg width={layoutWidth} height={CHART_TRADE_MINI_PREVIEW_HEIGHT}>
          {guideLines.map((price, index) => {
            const y = yForPrice(price);
            return (
              <G key={`guide-${index}`}>
                <Line
                  x1={CHART_TRADE_MINI_PREVIEW_LEFT_PAD}
                  y1={y}
                  x2={layoutWidth - 2}
                  y2={y}
                  stroke="#E2E7EE"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />
                <SvgText
                  x={layoutWidth - 6}
                  y={Math.min(CHART_TRADE_MINI_PREVIEW_HEIGHT - 6, Math.max(12, y + 5))}
                  fill="#5E6673"
                  fontSize="11"
                  textAnchor="end"
                >
                  {price.toFixed(displayDecimals)}
                </SvgText>
              </G>
            );
          })}

          {previewTracePoints.ask ? (
            <Polyline
              points={previewTracePoints.ask}
              fill="none"
              stroke={sellColor}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {previewTracePoints.bid ? (
            <Polyline
              points={previewTracePoints.bid}
              fill="none"
              stroke={buyColor}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {priceLines.map((line) => {
            const y = yForPrice(line.price);
            const tagTop = tagTops.get(line.key) ?? clampValue(
              y - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT / 2,
              CHART_TRADE_MINI_PREVIEW_TOP_PAD,
              CHART_TRADE_MINI_PREVIEW_TOP_PAD + plotHeight - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT,
            );

            return (
              <G key={line.key}>
                <Line
                  x1={CHART_TRADE_MINI_PREVIEW_LEFT_PAD}
                  y1={y}
                  x2={tagX + 4}
                  y2={y}
                  stroke={line.stroke}
                  strokeWidth={line.lineWidth ?? 1}
                  strokeDasharray={line.dashed ? '4 4' : undefined}
                />
                {line.helperLabel ? (
                  <SvgText
                    x={CHART_TRADE_MINI_PREVIEW_LEFT_PAD + 4}
                    y={Math.max(14, y - 8)}
                    fill="#4B5563"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {line.helperLabel}
                  </SvgText>
                ) : null}
                {line.showMarker ? (
                  <Circle
                    cx={markerX}
                    cy={y}
                    r={6}
                    fill="#4B5563"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                ) : null}
                <Rect
                  x={tagX}
                  y={tagTop}
                  width={CHART_TRADE_MINI_PREVIEW_TAG_WIDTH}
                  height={CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT}
                  rx={4}
                  fill={line.tagFill}
                />
                <SvgText
                  x={tagX + CHART_TRADE_MINI_PREVIEW_TAG_WIDTH / 2}
                  y={tagTop + 14.5}
                  fill={line.textColor}
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {line.price.toFixed(displayDecimals)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
});


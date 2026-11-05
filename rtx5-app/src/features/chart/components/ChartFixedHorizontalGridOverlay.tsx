import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  CHART_GRID_DASH_PATTERN,
  CHART_GRID_HORIZONTAL_LINE_COUNT,
  CHART_GRID_STROKE_WIDTH,
} from '../ChartScreen.constants';

export type FixedHorizontalGridPlotArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ChartFixedHorizontalGridOverlayProps = {
  color: string;
  dashPattern?: string;
  lineCount?: number;
  plotArea: FixedHorizontalGridPlotArea | null;
  visible: boolean;
};

const DEFAULT_LINE_COUNT = CHART_GRID_HORIZONTAL_LINE_COUNT;

export function ChartFixedHorizontalGridOverlay({
  color,
  dashPattern = CHART_GRID_DASH_PATTERN,
  lineCount = DEFAULT_LINE_COUNT,
  plotArea,
  visible,
}: ChartFixedHorizontalGridOverlayProps) {
  const horizontalLines = useMemo(() => {
    if (!visible || !plotArea || plotArea.width <= 0 || plotArea.height <= 0 || lineCount <= 0) {
      return [];
    }

    const safeCount = Math.max(1, lineCount);

    return Array.from({ length: safeCount }, (_, index) => {
      const progress = (index + 1) / (safeCount + 1);
      const y = Math.round((plotArea.top + plotArea.height * progress) * 2) / 2;
      return {
        key: `fixed-grid-horizontal-${index}`,
        y,
      };
    });
  }, [lineCount, plotArea, visible]);

  if (!horizontalLines.length || !plotArea) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Svg width="100%" height="100%">
        {horizontalLines.map((line) => (
          // MT5 keeps horizontal price guides fixed on screen while the price
          // scale pans underneath them; vertical time guides are drawn in the
          // WebView so they can move with the candles during left/right scroll.
          <Line
            key={line.key}
            x1={plotArea.left}
            y1={line.y}
            x2={plotArea.left + plotArea.width}
            y2={line.y}
            stroke={color}
            strokeWidth={CHART_GRID_STROKE_WIDTH}
            strokeDasharray={dashPattern}
            strokeLinecap="round"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

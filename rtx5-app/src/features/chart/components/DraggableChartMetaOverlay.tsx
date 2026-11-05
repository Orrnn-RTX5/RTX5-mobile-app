import React, {  } from 'react';
import { PanResponder, Text, View } from 'react-native';
import {
  type ChartTapMenuBounds,
} from './ChartTapRadialMenu';
import {
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';
import {
  type ChartTimeRange,
} from '../timeRangePresets';
import {
  type FooterLotPickerMode,
} from '../chartTradeInteractionUtils';
import { makeStyles } from "../ChartScreen.styles";
import { ChartTapMenuViewport, CHART_META_FALLBACK_WIDTH, CHART_META_FALLBACK_HEIGHT, CHART_META_DEFAULT_LEFT, CHART_META_DEFAULT_TOP, clampOverlayOffset } from "../ChartScreen.constants";


export function DraggableChartMetaOverlay({
  visible,
  bounds,
  viewport,
  items,
  isUp,
  upColor,
  downColor,
  styles,
}: {
  visible: boolean;
  bounds: ChartTapMenuBounds;
  viewport: ChartTapMenuViewport;
  items: Array<{ label: string; value: string }>;
  isUp: boolean;
  upColor: string;
  downColor: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [cardSize, setCardSize] = React.useState({
    width: CHART_META_FALLBACK_WIDTH,
    height: CHART_META_FALLBACK_HEIGHT,
  });
  const [position, setPosition] = React.useState({
    left: CHART_META_DEFAULT_LEFT,
    top: CHART_META_DEFAULT_TOP,
  });
  const dragOriginRef = React.useRef(position);
  const containerWidth = bounds.width > 0 ? bounds.width : viewport.width;
  const containerHeight = bounds.height > 0 ? bounds.height : viewport.height;

  const resolveCardPosition = React.useCallback(
    (left: number, top: number) => ({
      left: clampOverlayOffset(left, containerWidth, cardSize.width),
      top: clampOverlayOffset(top, containerHeight, cardSize.height),
    }),
    [cardSize.height, cardSize.width, containerHeight, containerWidth],
  );

  const applyCardPosition = React.useCallback(
    (left: number, top: number) => {
      const nextPosition = resolveCardPosition(left, top);
      setPosition(nextPosition);
      return nextPosition;
    },
    [resolveCardPosition],
  );

  React.useEffect(() => {
    setPosition((current) => resolveCardPosition(current.left, current.top));
  }, [resolveCardPosition]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          dragOriginRef.current = position;
        },
        onPanResponderMove: (_event, gestureState) => {
          applyCardPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
          );
        },
        onPanResponderRelease: (_event, gestureState) => {
          applyCardPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
          );
        },
        onPanResponderTerminate: (_event, gestureState) => {
          applyCardPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
          );
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [applyCardPosition, position],
  );

  if (!visible) {
    return null;
  }

  return (
    <View
      collapsable={false}
      pointerEvents="box-only"
      renderToHardwareTextureAndroid
      needsOffscreenAlphaCompositing
      style={[
        styles.chartMetaOverlay,
        {
          top: position.top,
          left: position.left,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View
        style={styles.chartMetaOhlc}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCardSize((current) =>
            current.width === width && current.height === height
              ? current
              : { width, height },
          );
        }}
      >
        {items.map((item) => (
          <View key={item.label} style={styles.chartMetaPair}>
            <Text style={styles.chartMetaLabel}>{item.label}</Text>
            <Text style={[styles.chartMetaValue, { color: isUp ? upColor : downColor }]}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}


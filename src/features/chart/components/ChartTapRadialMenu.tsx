import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';
import {
  TvRadialIndicators,
  TvFx,
  TvLayers,
  TvRadialPencil,
  TvTileWindows,
} from './ChartToolbarIcons';
import { useTranslation } from '../../../i18n/useTranslation';

export type ChartTapMenuAnchor = {
  x: number;
  y: number;
  price?: number | null;
};

export type ChartTapMenuBounds = {
  width: number;
  height: number;
};

type ChartTapRadialMenuProps = {
  anchor: ChartTapMenuAnchor | null;
  visible: boolean;
  bounds: ChartTapMenuBounds;
  activeTimeframe: string;
  accentColor: string;
  mutedColor: string;
  isDark: boolean;
  onDismiss: () => void;
  onSelectTimeframe: (timeframe: string) => void;
  onOpenChartWindows: () => void;
  onOpenObjects: () => void;
  onOpenDrawingTools: () => void;
  onOpenIndicators: () => void;

  onOpenSymbolPicker: () => void;
  onOpenScaleControls: () => void;
};

// Keep the visible ring compact without shrinking its touch targets; the
// separate hitSlop values below preserve comfortable taps on every option.
const CHART_TAP_MENU_SIZE = 224;
const CHART_TAP_RING_WIDTH = 36;
const CHART_TAP_TIMEFRAME_HEIGHT = 30;
const CHART_TAP_OUTER_ITEM_RADIUS = CHART_TAP_MENU_SIZE / 2 - CHART_TAP_RING_WIDTH / 2;
const CHART_TAP_ACTION_RADIUS = CHART_TAP_OUTER_ITEM_RADIUS;
const CHART_TAP_MENU_PADDING = 10;
const CHART_TAP_MENU_DISMISS_GRACE_MS = 32;
const CHART_TAP_MENU_OPEN_DURATION_MS = 165;
const CHART_TAP_MENU_OPEN_SCALE_FROM = 0.5;
const CHART_TAP_MENU_OPEN_ROTATION_FROM_DEG = -90;
// These sampled stops reproduce the measured MT5 grow-and-turn entrance.
// One native progress value keeps scale and rotation perfectly synchronized.
const CHART_TAP_MENU_OPEN_SCALE_TIMESTAMPS_MS = [
  0,
  16,
  33,
  50,
  67,
  84,
  100,
  115,
  CHART_TAP_MENU_OPEN_DURATION_MS,
];
const CHART_TAP_MENU_OPEN_SCALE_PROGRESS_STOPS = CHART_TAP_MENU_OPEN_SCALE_TIMESTAMPS_MS.map(
  (timestampMs) => timestampMs / CHART_TAP_MENU_OPEN_DURATION_MS,
);
const CHART_TAP_MENU_OPEN_SCALE_STOPS = [
  CHART_TAP_MENU_OPEN_SCALE_FROM,
  0.6,
  0.7,
  0.79,
  0.875,
  0.94,
  0.985,
  1,
  1,
];
const CHART_TAP_MENU_OPEN_ROTATION_TIMESTAMPS_MS = [
  0,
  16,
  33,
  50,
  67,
  84,
  100,
  116,
  133,
  CHART_TAP_MENU_OPEN_DURATION_MS,
];
const CHART_TAP_MENU_OPEN_ROTATION_PROGRESS_STOPS = CHART_TAP_MENU_OPEN_ROTATION_TIMESTAMPS_MS.map(
  (timestampMs) => timestampMs / CHART_TAP_MENU_OPEN_DURATION_MS,
);
const CHART_TAP_MENU_OPEN_ROTATION_STOPS = [
  `${CHART_TAP_MENU_OPEN_ROTATION_FROM_DEG}deg`,
  '-51deg',
  '-40deg',
  '-30deg',
  '-23deg',
  '-16deg',
  '-10deg',
  '-6deg',
  '-2deg',
  '0deg',
];
// Large enough for fingers on the ring, but not so large that neighbors collide.
const CHART_TAP_ACTION_HIT_SLOP = { top: 14, bottom: 14, left: 14, right: 14 } as const;
const CHART_TAP_TIMEFRAME_HIT_SLOP = { top: 12, bottom: 12, left: 10, right: 10 } as const;
// Drag claim must stay looser than a normal tap — capture:true used to steal
// Android presses from timeframe labels before onPress could fire.
const CHART_TAP_MENU_DRAG_CLAIM_PX = 12;

const TIMEFRAME_ITEMS: Array<{ key: string; angle: number; width: number }> = [
  { key: 'M1', angle: 312, width: 38 },
  { key: 'M5', angle: 336, width: 38 },
  { key: 'M15', angle: 0, width: 48 },
  { key: 'M30', angle: 24, width: 48 },
  { key: 'H1', angle: 48, width: 38 },
  { key: 'H4', angle: 72, width: 38 },
  { key: 'D1', angle: 96, width: 38 },
  { key: 'W1', angle: 120, width: 38 },
  { key: 'MN', angle: 144, width: 40 },
];

/**
 * Helper to restrict a value within a given min and max range.
 */
const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Ensures the radial menu does not render partially off-screen by clamping its center
 * position relative to the container boundaries and its padding.
 */
const clampMenuCenter = (value: number, containerSize: number) =>
  clampValue(
    value,
    CHART_TAP_MENU_PADDING + CHART_TAP_MENU_SIZE / 2,
    Math.max(
      CHART_TAP_MENU_PADDING + CHART_TAP_MENU_SIZE / 2,
      containerSize - CHART_TAP_MENU_SIZE / 2 - CHART_TAP_MENU_PADDING,
    ),
  );

/**
 * Calculates the absolute (left, top) pixel position of a radial menu item
 * given its angle and distance (radius) from the center.
 */
const getRadialItemPosition = (
  angleFromTop: number,
  radius: number,
  itemWidth: number,
  itemHeight: number = itemWidth,
) => {
  const radians = ((angleFromTop - 90) * Math.PI) / 180;
  const center = CHART_TAP_MENU_SIZE / 2;
  return {
    left: center + Math.cos(radians) * radius - itemWidth / 2,
    top: center + Math.sin(radians) * radius - itemHeight / 2,
  };
};

/**
 * Calculates the proper rotation angle for text items on the radial ring
 * so they remain readable (not upside-down).
 */
const getRadialTextRotation = (angleFromTop: number) => {
  let rotation = angleFromTop <= 180 ? angleFromTop : angleFromTop - 360;
  if (rotation > 90) {
    rotation -= 180;
  }
  if (rotation < -90) {
    rotation += 180;
  }
  return `${rotation}deg`;
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
      elevation: 120,
    },
    layerHidden: {
      opacity: 0,
    },
    menu: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: CHART_TAP_MENU_SIZE,
      height: CHART_TAP_MENU_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 41,
      elevation: 121,
      backgroundColor: 'transparent',
    },
    menuContent: {
      width: CHART_TAP_MENU_SIZE,
      height: CHART_TAP_MENU_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    ring: {
      position: 'absolute',
      width: CHART_TAP_MENU_SIZE,
      height: CHART_TAP_MENU_SIZE,
      borderRadius: CHART_TAP_MENU_SIZE / 2,
      borderWidth: CHART_TAP_RING_WIDTH,
      backgroundColor: 'transparent',
    },
    timeframeItem: {
      position: 'absolute',
      height: CHART_TAP_TIMEFRAME_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      // Above the ring + inner dismiss so TF taps never fall into a dead zone.
      zIndex: 24,
      elevation: 16,
    },
    timeframeText: {
      color: '#FFFFFF',
      fontSize: 13,
      lineHeight: 14,
      fontWeight: '600',
      letterSpacing: 0,
      opacity: 0.95,
      textAlign: 'center',
      includeFontPadding: false,
      textAlignVertical: 'center',
      minWidth: '100%',
      textShadowColor: 'rgba(0,0,0,0.18)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
      // Text must not compete for the press responder.
      pointerEvents: 'none',
    },
    timeframeTextActive: {
      opacity: 1,
    },
    actionItem: {
      position: 'absolute',
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 22,
      elevation: 14,
    },
    centerAction: {
      position: 'absolute',
      width: 66,
      height: 66,
      borderRadius: 33,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2962FF',
      borderWidth: 2,
      borderColor: '#2962FF',
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.26 : 0.18,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      elevation: 18,
      gap: 1,
    },
    centerActionLabel: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
    innerDismissArea: {
      position: 'absolute',
      width: CHART_TAP_MENU_SIZE - CHART_TAP_RING_WIDTH * 2,
      height: CHART_TAP_MENU_SIZE - CHART_TAP_RING_WIDTH * 2,
      top: CHART_TAP_RING_WIDTH,
      left: CHART_TAP_RING_WIDTH,
      borderRadius: (CHART_TAP_MENU_SIZE - CHART_TAP_RING_WIDTH * 2) / 2,
      backgroundColor: 'transparent',
      // Below timeframe / action items so their presses still win on overlap.
      zIndex: 1,
    },
  });

/**
 * Renders an MT5-style interactive radial menu at a specific tap location on the chart.
 * This menu allows quick access to timeframes, drawing tools, objects, and settings.
 */
function ChartTapRadialMenuComponent({
  anchor,
  visible,
  bounds,
  activeTimeframe,
  accentColor,
  mutedColor,
  isDark,
  onDismiss,
  onSelectTimeframe,
  onOpenChartWindows,
  onOpenObjects,
  onOpenDrawingTools,
  onOpenIndicators,
  onOpenSymbolPicker,
  onOpenScaleControls,
}: ChartTapRadialMenuProps) {
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(isDark), [isDark]);
  const containerWidth = bounds.width;
  const containerHeight = bounds.height;
  // The component stays mounted while hidden. Until a real tap anchor arrives,
  // keep that retained native layer at a harmless center fallback.
  const anchorX = anchor?.x ?? containerWidth / 2;
  const anchorY = anchor?.y ?? containerHeight / 2;
  const timeframeMenuLabel = t('Timeframes');

  const resolveMenuPosition = React.useCallback(
    (centerX: number, centerY: number) => {
      const clampedCenterX = clampMenuCenter(centerX, containerWidth);
      const clampedCenterY = clampMenuCenter(centerY, containerHeight);
      return {
        left: Math.round(clampedCenterX - CHART_TAP_MENU_SIZE / 2),
        top: Math.round(clampedCenterY - CHART_TAP_MENU_SIZE / 2),
      };
    },
    [containerHeight, containerWidth],
  );

  const computeAnchorPosition = React.useCallback(() => (
    resolveMenuPosition(anchorX, anchorY)
  ), [anchorX, anchorY, resolveMenuPosition]);

  const [menuPosition, setMenuPosition] = React.useState(computeAnchorPosition);
  const menuViewRef = React.useRef<View>(null);
  const menuPositionRef = React.useRef(menuPosition);
  const dragOriginRef = React.useRef(menuPosition);
  const dismissReadyAtRef = React.useRef(Date.now() + CHART_TAP_MENU_DISMISS_GRACE_MS);
  // Track the retained layer's real open cycle separately from ordinary parent
  // renders, and make delayed work cancellable when a newer tap opens it again.
  const lastAnchorKeyRef = React.useRef('hidden');
  const wasVisibleRef = React.useRef(false);
  const syncFrameRef = React.useRef<number | null>(null);
  const hiddenResetFrameRef = React.useRef<number | null>(null);
  const entranceProgress = React.useRef(new Animated.Value(0)).current;
  const entranceScale = React.useMemo(
    () => entranceProgress.interpolate({
      inputRange: CHART_TAP_MENU_OPEN_SCALE_PROGRESS_STOPS,
      outputRange: CHART_TAP_MENU_OPEN_SCALE_STOPS,
    }),
    [entranceProgress],
  );
  const entranceRotation = React.useMemo(
    () => entranceProgress.interpolate({
      inputRange: CHART_TAP_MENU_OPEN_ROTATION_PROGRESS_STOPS,
      outputRange: CHART_TAP_MENU_OPEN_ROTATION_STOPS,
    }),
    [entranceProgress],
  );
  const startEntranceAnimation = React.useCallback(() => {
    Animated.timing(entranceProgress, {
      toValue: 1,
      duration: CHART_TAP_MENU_OPEN_DURATION_MS,
      // The sampled scale/rotation stops already contain the motion curve.
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [entranceProgress]);
  const cancelHiddenResetFrame = React.useCallback(() => {
    if (hiddenResetFrameRef.current !== null) {
      cancelAnimationFrame(hiddenResetFrameRef.current);
      hiddenResetFrameRef.current = null;
    }
  }, []);

  // Resolve a changed anchor during render so the retained menu cannot flash
  // at the previous tap position while the layout effect catches up.
  const anchorKey = `${anchorX}:${anchorY}:${containerWidth}:${containerHeight}`;
  const renderedMenuPosition = visible && lastAnchorKeyRef.current !== anchorKey
    ? computeAnchorPosition()
    : menuPositionRef.current;

  const applyMenuPosition = React.useCallback(
    (left: number, top: number, commitToState = false) => {
      const nextPosition = resolveMenuPosition(
        left + CHART_TAP_MENU_SIZE / 2,
        top + CHART_TAP_MENU_SIZE / 2,
      );
      menuPositionRef.current = nextPosition;
      // Move the native view immediately during a drag. React state is synced
      // at most once per frame so dragging does not queue a render per event.
      menuViewRef.current?.setNativeProps({
        style: { top: nextPosition.top, left: nextPosition.left },
      });
      if (commitToState) {
        setMenuPosition(nextPosition);
      } else if (syncFrameRef.current === null) {
        syncFrameRef.current = requestAnimationFrame(() => {
          syncFrameRef.current = null;
          setMenuPosition(menuPositionRef.current);
        });
      }
      return nextPosition;
    },
    [resolveMenuPosition],
  );

  // If the retained component itself unmounts, stop its native animation and
  // cancel every queued hidden reset or drag-position state update.
  React.useLayoutEffect(() => {
    return () => {
      entranceProgress.stopAnimation();
      cancelHiddenResetFrame();
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
    };
  }, [cancelHiddenResetFrame, entranceProgress]);

  React.useLayoutEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      lastAnchorKeyRef.current = 'hidden';
      return;
    }
    cancelHiddenResetFrame();
    const isOpening = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (lastAnchorKeyRef.current !== anchorKey) {
      lastAnchorKeyRef.current = anchorKey;
      const nextPosition = computeAnchorPosition();
      menuPositionRef.current = nextPosition;
    }
    // WebView/layout bounds can settle again after the menu becomes visible.
    // Reposition for those updates, but animate exactly once per open.
    if (!isOpening) {
      return;
    }
    dismissReadyAtRef.current = Date.now() + CHART_TAP_MENU_DISMISS_GRACE_MS;
    entranceProgress.setValue(0);
    // The first visible render already has the final tap position. Start the
    // native clock now so busy chart JS cannot freeze the starting pose.
    startEntranceAnimation();
  }, [
    anchorKey,
    cancelHiddenResetFrame,
    computeAnchorPosition,
    entranceProgress,
    startEntranceAnimation,
    visible,
  ]);

  // Hide the parent first, then reset the transform one frame later. Resetting
  // during the hide commit caused a visible half-size flash. A quick reopen
  // cancels this stale reset so it cannot rewind the new entrance animation.
  React.useEffect(() => {
    if (visible) {
      cancelHiddenResetFrame();
      return;
    }
    cancelHiddenResetFrame();
    hiddenResetFrameRef.current = requestAnimationFrame(() => {
      hiddenResetFrameRef.current = null;
      if (!wasVisibleRef.current) {
        entranceProgress.setValue(0);
      }
    });
    return cancelHiddenResetFrame;
  }, [cancelHiddenResetFrame, entranceProgress, visible]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        // Never claim the initial touch — children (timeframes/actions) own taps.
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > CHART_TAP_MENU_DRAG_CLAIM_PX
          || Math.abs(gestureState.dy) > CHART_TAP_MENU_DRAG_CLAIM_PX,
        // Do not capture moves: capturing cancelled FastPressable presses on
        // Android before timeframe onPress could run.
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: () => {
          dragOriginRef.current = menuPositionRef.current;
        },
        onPanResponderMove: (_event, gestureState) => {
          applyMenuPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
            false,
          );
        },
        onPanResponderRelease: (_event, gestureState) => {
          applyMenuPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
            true,
          );
        },
        onPanResponderTerminate: (_event, gestureState) => {
          applyMenuPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
            true,
          );
        },
        // Allow Pressable children to keep the responder for clean taps.
        onPanResponderTerminationRequest: () => true,
      }),
    [applyMenuPosition],
  );

  const handleBackdropPress = React.useCallback(() => {
    // Ignore the chart tap that opened the menu if Android delivers its release
    // to the newly visible backdrop; later taps dismiss normally.
    if (Date.now() < dismissReadyAtRef.current) {
      return;
    }
    onDismiss();
  }, [onDismiss]);

  // Stop the item press from reaching the chart/backdrop, then delegate to a
  // destination handler that closes the retained layer before opening new UI.
  const handleActionItemPress = React.useCallback((event: any, onPress: () => void) => {
    event.stopPropagation?.();
    onPress();
  }, []);

  const actionItems: Array<{
    key: string;
    angle: number;
    boxSize?: number;
    accessibilityLabel: string;
    render: (color: string) => React.ReactNode;
    onPress: () => void;
  }> = [
    {
      key: 'windows',
      angle: 288,
      boxSize: 24,
      accessibilityLabel: t('Tile windows'),
      render: (color) => <TvTileWindows color={color} />,
      onPress: onOpenChartWindows,
    },
    {
      key: 'objects',
      angle: 264,
      boxSize: 26,
      accessibilityLabel: t('Objects'),
      render: (color) => <TvLayers color={color} />,
      onPress: onOpenObjects,
    },
    {
      key: 'draw',
      angle: 240,
      boxSize: 24,
      accessibilityLabel: t('Drawing Tools'),
      render: (color) => <TvRadialPencil color={color} />,
      onPress: onOpenDrawingTools,
    },
    {
      key: 'scale',
      angle: 216,
      boxSize: 24,
      accessibilityLabel: `${t('Chart')} ${t('Options')}`,
      onPress: onOpenScaleControls,
      render: (color) => <Ionicons name="options-outline" size={22} color={color} />,
    },
    {
      key: 'symbol',
      angle: 192,
      boxSize: 24,
      accessibilityLabel: t('Select Symbol'),
      render: (color) => <TvFx color={color} />,
      onPress: onOpenSymbolPicker,
    },
    {
      key: 'indicators',
      angle: 168,
      boxSize: 24,
      accessibilityLabel: t('Indicators'),
      render: (color) => <TvRadialIndicators color={color} />,
      onPress: onOpenIndicators,
    },
  ];
  // Keep this native subtree mounted between taps. Opacity, pointer events and
  // accessibility hide it without paying a mount/layout cost on the next tap.
  return (
    <View
      style={[styles.layer, !visible && styles.layerHidden]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      collapsable={false}
    >
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPressIn={handleBackdropPress}
        unstable_pressDelay={0}
      />
      <View
        ref={menuViewRef}
        collapsable={false}
        style={[
          styles.menu,
          {
            top: renderedMenuPosition.top,
            left: renderedMenuPosition.left,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Animate the complete ring and its icons as one Android hardware
            texture. Transform-only motion avoids an extra fade/compositing pass
            and keeps every option synchronized with the measured MT5 curve. */}
        <Animated.View
          accessibilityLabel={timeframeMenuLabel}
          renderToHardwareTextureAndroid
          style={[
            styles.menuContent,
            {
              transform: [
                { scale: entranceScale },
                { rotate: entranceRotation },
              ],
            },
          ]}
        >
          <View style={[styles.ring, { borderColor: accentColor }]} />

          {/* Tapping inside the empty inner circle dismisses the menu. Without
              this, the ring's containing View absorbs the touch but the
              panResponder only claims drags — so taps in the centre fall into
              a dead zone instead of reaching the backdrop Pressable behind. */}
          <Pressable
            style={styles.innerDismissArea}
            onPressIn={handleBackdropPress}
            unstable_pressDelay={0}
          />

          {TIMEFRAME_ITEMS.map((item) => {
            const position = getRadialItemPosition(
              item.angle,
              CHART_TAP_OUTER_ITEM_RADIUS,
              item.width,
              CHART_TAP_TIMEFRAME_HEIGHT,
            );
            const isActive = String(activeTimeframe ?? '').toUpperCase() === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`${timeframeMenuLabel} ${item.key}`}
                accessibilityState={{ selected: isActive }}
                // Same fast-press path as action icons — plain onPress alone
                // dropped many Android taps over the WebView chart surface.
                onPress={(event) => handleActionItemPress(event, () => onSelectTimeframe(item.key))}
                activateOnPressIn
                activateOnTouchStart
                hitSlop={CHART_TAP_TIMEFRAME_HIT_SLOP}
                unstable_pressDelay={0}
                style={[
                  styles.timeframeItem,
                  position,
                  {
                    width: item.width,
                    transform: [{ rotate: getRadialTextRotation(item.angle) }],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timeframeText,
                    isActive && styles.timeframeTextActive,
                  ]}
                >
                  {item.key}
                </Text>
              </Pressable>
            );
          })}

          {actionItems.map((item) => {
            const itemBoxSize = item.boxSize ?? 30;
            const position = getRadialItemPosition(
              item.angle,
              CHART_TAP_ACTION_RADIUS,
              itemBoxSize,
            );
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.accessibilityLabel}
                onPress={(event) => handleActionItemPress(event, item.onPress)}
                activateOnPressIn
                activateOnTouchStart
                hitSlop={CHART_TAP_ACTION_HIT_SLOP}
                unstable_pressDelay={0}
                style={[styles.actionItem, position, { width: itemBoxSize, height: itemBoxSize }]}
              >
                {item.render(mutedColor)}
              </Pressable>
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
}

// ChartScreen updates continuously with live prices. Skip unchanged radial
// props so unrelated parent renders cannot disturb the entrance animation.
export const ChartTapRadialMenu = React.memo(ChartTapRadialMenuComponent);
ChartTapRadialMenu.displayName = 'ChartTapRadialMenu';

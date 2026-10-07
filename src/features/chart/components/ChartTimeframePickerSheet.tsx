import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import {
  chartTimeframePickerController,
  type ChartTimeframePickerController,
  useChartTimeframePickerVisible,
} from '../chartTimeframePickerController';

type TimeframePickerGroup = {
  title: string;
  options: readonly string[];
};

type TimeframePickerActionSheetAction = {
  label: string;
  subtitle?: string;
  selected?: boolean;
  disabled?: boolean;
  activateOnPressIn?: boolean;
  onPress?: () => void;
};

type CreateTimeframePickerActionSheetActionsOptions = {
  activeTimeframe: string;
  supportedTimeframes: readonly string[];
  onSelect: (timeframe: string) => void;
};

type ChartTimeframePickerOverlayProps = {
  controller?: ChartTimeframePickerController;
  activeTimeframe: string;
  supportedTimeframes: readonly string[];
  accentColor: string;
  isDark: boolean;
  textColor: string;
  mutedColor: string;
  onSelect: (timeframe: string) => void;
};

const CHART_DARK_PANEL_BACKGROUND = '#1E1E1E';

/**
 * Categorizes the available chart timeframes into Minutes, Hours, and Days for organized rendering in the picker.
 */
export const TIMEFRAME_PICKER_GROUPS: readonly TimeframePickerGroup[] = [
  {
    // Short-term intraday timeframes (1 minute to 30 minutes)
    title: 'Minutes',
    options: ['M1', 'M5', 'M15', 'M30'],
  },
  {
    // Medium-term intraday timeframes (1 hour to 4 hours)
    title: 'Hours',
    options: ['H1', 'H4'],
  },
  {
    // Long-term macro timeframes (Daily, Weekly, Monthly)
    title: 'Days',
    options: ['D1', 'W1', 'MN'],
  },
];

export function createTimeframePickerActionSheetActions({
  activeTimeframe,
  supportedTimeframes,
  onSelect,
}: CreateTimeframePickerActionSheetActionsOptions): TimeframePickerActionSheetAction[] {
  const supportedSet = new Set(supportedTimeframes);

  return TIMEFRAME_PICKER_GROUPS.flatMap((group) =>
    group.options.map((timeframe) => {
      const supported = supportedSet.has(timeframe);
      const active = supported && timeframe === activeTimeframe;

      return {
        label: timeframe,
        subtitle: active ? 'Current' : group.title,
        selected: active,
        disabled: !supported,
        // The grid is non-scrollable and compact, so taps should commit immediately.
        activateOnPressIn: true,
        onPress: supported && !active ? () => onSelect(timeframe) : undefined,
      };
    }),
  );
}

/**
 * Retained centered timeframe grid. Stays mounted under the chart so open/close
 * is a native opacity flip — never a mount of this tree, and never a
 * ChartScreen setState on the open path.
 */
export const ChartTimeframePickerOverlay = memo(function ChartTimeframePickerOverlay({
  controller = chartTimeframePickerController,
  activeTimeframe,
  supportedTimeframes,
  accentColor,
  isDark,
  textColor,
  mutedColor,
  onSelect,
}: ChartTimeframePickerOverlayProps) {
  const visible = useChartTimeframePickerVisible(controller);
  const hostRef = useRef<View>(null);
  const supportedSet = useMemo(() => new Set(supportedTimeframes), [supportedTimeframes]);
  const styles = useMemo(
    () => makeTimeframePickerStyles({ accentColor, isDark, textColor, mutedColor }),
    [accentColor, isDark, mutedColor, textColor],
  );

  const applyVisibilityNow = useCallback((isVisible: boolean) => {
    hostRef.current?.setNativeProps({
      pointerEvents: isVisible ? 'auto' : 'none',
      style: [
        styles.overlay,
        isVisible ? styles.overlayVisible : styles.overlayHidden,
      ],
    });
  }, [styles]);

  useLayoutEffect(
    () => controller.registerApplier(applyVisibilityNow),
    [applyVisibilityNow, controller],
  );

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      controller.hide();
      return true;
    });

    return () => subscription.remove();
  }, [controller, visible]);

  const handleClose = useCallback(() => {
    controller.hide();
  }, [controller]);

  return (
    <View
      ref={hostRef}
      collapsable={false}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.overlay, visible ? styles.overlayVisible : styles.overlayHidden]}
    >
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={handleClose}
        activateOnPressIn
        latencyLabel="chart.timeframePicker.backdrop"
        unstable_pressDelay={0}
      />
      <View style={styles.card}>
        {TIMEFRAME_PICKER_GROUPS.map((group) => {
          const options = group.options.filter((timeframe) => supportedSet.has(timeframe));
          if (options.length === 0) return null;

          return (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.optionGrid}>
                {options.map((timeframe) => {
                  const active = timeframe === activeTimeframe;
                  return (
                    <Pressable
                      key={timeframe}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.option,
                        active && styles.optionActive,
                        pressed && !active && styles.optionPressed,
                      ]}
                      onPress={active ? undefined : () => onSelect(timeframe)}
                      activateOnPressIn={!active}
                      disabled={active}
                      latencyLabel={`chart.timeframePicker.${timeframe}`}
                      unstable_pressDelay={0}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>{timeframe}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const makeTimeframePickerStyles = ({
  accentColor,
  isDark,
  textColor,
  mutedColor,
}: {
  accentColor: string;
  isDark: boolean;
  textColor: string;
  mutedColor: string;
}) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    // No `elevation` here: on Android, elevation on a translucent fullscreen
    // view makes HWUI cast real spot/ambient shadows that show through the
    // dim as a large gray rectangle over the chart. Sibling order + zIndex
    // already keep this overlay on top.
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: isDark ? 'rgba(0,0,0,0.58)' : 'rgba(15,23,42,0.36)',
  },
  overlayVisible: {
    opacity: 1,
  },
  overlayHidden: {
    opacity: 0,
  },
  card: {
    width: '90%',
    maxWidth: 366,
    borderRadius: 12,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
    backgroundColor: isDark ? CHART_DARK_PANEL_BACKGROUND : '#FFFFFF',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  group: {
    alignItems: 'center',
    marginBottom: 18,
  },
  groupTitle: {
    color: textColor,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  optionGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
  },
  option: {
    width: 54,
    height: 38,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(148,163,184,0.14)' : 'transparent',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
  },
  optionPressed: {
    borderColor: isDark ? 'rgba(255,255,255,0.15)' : accentColor,
    backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#E8F1FF',
  },
  optionActive: {
    borderColor: isDark ? 'transparent' : accentColor,
    backgroundColor: accentColor,
  },
  optionText: {
    color: isDark ? mutedColor : '#2F343D',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
});

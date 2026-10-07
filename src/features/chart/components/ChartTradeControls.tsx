import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import React, {  } from 'react';
import { Keyboard, Modal, ScrollView, StyleSheet, Text, TextInput, View, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useTranslation } from '../../../i18n/useTranslation';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import {
  normalizeTradeVolume,
  resolveTradeVolumeBounds,
  sanitizeTradeVolumeDraft,
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';
import {
  type ChartTimeRange,
} from '../timeRangePresets';
import {
  buildFooterLotPickerQuickAdjustments,
  buildFooterLotPickerValues,
  type FooterLotPickerMode,
} from '../chartTradeInteractionUtils';


import { makeStyles } from "../ChartScreen.styles";
import { CHART_TRADE_SLIDER_THUMB_SIZE, FOOTER_LOT_PICKER_VALUE_ITEM_HEIGHT } from "../ChartScreen.constants";


/**
 * Modal component allowing the user to precisely step-adjust the trade volume/lot size with +/- buttons.
 */
export function ChartStepperModal({
  visible,
  title,
  initial,
  step,
  decimals,
  min,
  max,
  editable = false,
  styles,
  onClose,
  onCommit,
}: {
  visible: boolean;
  title: string;
  initial: number;
  step: number;
  decimals: number;
  min?: number;
  max?: number;
  editable?: boolean;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onCommit: (next: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = React.useState(initial);
  const [draft, setDraft] = React.useState(() => initial.toFixed(Math.max(decimals, 0)));

  const clamp = React.useCallback(
    (v: number) => {
      let out = v;
      if (typeof min === 'number') out = Math.max(min, out);
      if (typeof max === 'number') out = Math.min(max, out);
      return Number(out.toFixed(Math.max(decimals, 0)));
    },
    [decimals, max, min],
  );

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    const nextValue = clamp(initial);
    setValue(nextValue);
    setDraft(nextValue.toFixed(decimals));
  }, [clamp, decimals, initial, visible]);

  const syncDraftToValue = React.useCallback((nextValue: number) => {
    const clampedValue = clamp(nextValue);
    setValue(clampedValue);
    setDraft(clampedValue.toFixed(decimals));
    return clampedValue;
  }, [clamp, decimals]);

  const bump = React.useCallback(
    (dir: -1 | 1) => syncDraftToValue(value + dir * step),
    [step, syncDraftToValue, value],
  );

  if (!visible) return null;
  const prev = clamp(value - step);
  const next = clamp(value + step);

  const handleDraftChange = (text: string) => {
    const nextDraft = sanitizeTradeVolumeDraft(text);
    setDraft(nextDraft);

    if (!nextDraft.trim() || nextDraft === '.') {
      return;
    }

    const parsed = Number(nextDraft);
    if (Number.isFinite(parsed)) {
      setValue(clamp(parsed));
    }
  };

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      return syncDraftToValue(value);
    }

    return syncDraftToValue(parsed);
  };

  const commitValue = () => {
    const nextValue = editable ? commitDraft() : value;
    onCommit(nextValue);
    onClose();
  };

  return (
    <Modal
      transparent
      visible
      animationType='fade'
      {...OVERLAY_MODAL_PROPS}
      onRequestClose={onClose}
    >
      <View style={styles.stepperModalLayer}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.stepperModalCard}>
          {title ? <Text style={styles.stepperModalTitle}>{title}</Text> : null}
          <View style={styles.stepperModalBody}>
            <Pressable style={styles.stepperModalMinus} onPress={() => bump(-1)} hitSlop={10}>
              <Text style={styles.stepperModalMinusText}>−</Text>
            </Pressable>
            <View style={styles.stepperModalStack}>
              <Text style={styles.stepperModalGhost}>{prev.toFixed(decimals)}</Text>
              <View style={styles.stepperModalDivider} />
              {editable ? (
                <TextInput
                  style={[styles.stepperModalMain, styles.stepperModalMainInput]}
                  value={draft}
                  onChangeText={handleDraftChange}
                  onBlur={commitDraft}
                  onSubmitEditing={() => {
                    commitDraft();
                    Keyboard.dismiss();
                  }}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={12}
                  accessibilityLabel={title}
                />
              ) : (
                <Text style={styles.stepperModalMain}>{value.toFixed(decimals)}</Text>
              )}
              <View style={styles.stepperModalDivider} />
              <Text style={styles.stepperModalGhost}>{next.toFixed(decimals)}</Text>
            </View>
            <Pressable style={styles.stepperModalPlus} onPress={() => bump(1)} hitSlop={10}>
              <Text style={styles.stepperModalPlusText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.stepperModalActions}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.stepperModalCancel}>{t('Cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={commitValue}
              hitSlop={8}
            >
              <Text style={styles.stepperModalOk}>{t('OK')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A tappable footer component displaying the currently selected lot size, opening the ChartStepperModal when pressed.
 */
export function ChartFooterLotPicker({
  visible,
  mode,
  value,
  bounds,
  bottomOffset,
  styles,
  onClose,
  onSelect,
}: {
  visible: boolean;
  mode: FooterLotPickerMode;
  value: number;
  bounds?: TradeVolumeBounds;
  bottomOffset: number;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onSelect: (next: number) => void;
}) {
  const windowSize = useWindowDimensions();
  const safeInsets = useSafeAreaInsets();
  const availableWidth = Math.max(1, windowSize.width - safeInsets.left - safeInsets.right - 24);
  const availableHeight = Math.max(1, windowSize.height - bottomOffset - safeInsets.top - 24);
  const valueScrollRef = React.useRef<ScrollView>(null);
  const [activeRangeMultiplier, setActiveRangeMultiplier] = React.useState<number | null>(null);
  const resolved = React.useMemo(() => resolveTradeVolumeBounds(bounds), [bounds]);
  const quickAdjustments = React.useMemo(
    () => buildFooterLotPickerQuickAdjustments(value, mode, bounds),
    [bounds, mode, value],
  );
  const defaultRangeMultiplier = quickAdjustments[0]?.multiplier ?? 1;
  const selectedRangeMultiplier = mode === 'absolute'
    ? undefined
    : activeRangeMultiplier ?? defaultRangeMultiplier;
  const valueOptions = React.useMemo(
    () => buildFooterLotPickerValues(value, mode, bounds, selectedRangeMultiplier),
    [bounds, mode, selectedRangeMultiplier, value],
  );
  const normalizedValue = normalizeTradeVolume(value, bounds);
  const selectionEpsilon = resolved.stepVolume / 1000;
  const activeValueStartIndex = mode === 'absolute'
    ? 0
    : Math.max(0, valueOptions.findIndex((option) => option.multiplier >= (selectedRangeMultiplier ?? 0)));

  React.useEffect(() => {
    setActiveRangeMultiplier(null);
  }, [bounds, mode, visible]);

  React.useEffect(() => {
    if (!visible || mode === 'absolute' || activeValueStartIndex < 0) {
      return;
    }
    requestAnimationFrame(() => {
      valueScrollRef.current?.scrollTo({
        y: activeValueStartIndex * FOOTER_LOT_PICKER_VALUE_ITEM_HEIGHT,
        animated: true,
      });
    });
  }, [activeValueStartIndex, mode, selectedRangeMultiplier, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.footerLotPickerLayer}>
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: Math.max(0, bottomOffset - 8),
        }}
        onPress={onClose}
      />
      <View
        style={[
          styles.footerLotPickerCard,
          styles.footerLotPickerCardVertical,
          {
            bottom: bottomOffset,
            width: Math.min(availableWidth, 228),
            maxHeight: Math.min(availableHeight, 384),
          },
        ]}
      >
        <View style={styles.footerLotPickerVerticalBody}>
          <View style={styles.footerLotPickerQuickRail}>
            {quickAdjustments.map((option) => {
              const active = mode !== 'absolute' && option.multiplier === selectedRangeMultiplier;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.footerLotPickerQuickButton, active && styles.footerLotPickerQuickButtonActive]}
                  onPress={() => {
                    if (mode === 'absolute') {
                      onSelect(option.nextValue);
                      return;
                    }
                    setActiveRangeMultiplier(option.multiplier);
                  }}
                  hitSlop={6}
                >
                  <Text style={[styles.footerLotPickerQuickText, active && styles.footerLotPickerQuickTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <ScrollView
            canCancelContentTouches={Platform.OS === 'ios'}
            ref={valueScrollRef}
            showsVerticalScrollIndicator={valueOptions.length > 5}
            style={styles.footerLotPickerValuesScrollVertical}
            contentContainerStyle={styles.footerLotPickerValuesContentVertical}
            keyboardShouldPersistTaps="always"
          >
            {valueOptions.map((option) => {
              const active = mode === 'absolute' && Math.abs(option.value - normalizedValue) <= selectionEpsilon;
              const isRangeSelector = mode !== 'absolute' && typeof option.rangeMultiplier === 'number';
              const isRangeBoundary = isRangeSelector && option.multiplier === selectedRangeMultiplier;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.footerLotPickerValueButton,
                    styles.footerLotPickerValueButtonVertical,
                    active && styles.footerLotPickerValueButtonActive,
                    isRangeBoundary && styles.footerLotPickerValueButtonRange,
                  ]}
                  onPress={() => {
                    if (isRangeSelector && typeof option.rangeMultiplier === 'number') {
                      setActiveRangeMultiplier(option.rangeMultiplier);
                    }
                    onSelect(option.value);
                  }}
                  hitSlop={6}
                >
                  <Text
                    style={[
                      styles.footerLotPickerValueText,
                      active && styles.footerLotPickerValueTextActive,
                      isRangeBoundary && styles.footerLotPickerValueTextRange,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

/**
 * A slider component used to rapidly adjust the trade volume (lot size) within the chart's one-click trading panel.
 */
export function ChartTradeVolumeSlider({
  styles,
  value,
  bounds,
  onChange,
}: {
  styles: ReturnType<typeof makeStyles>;
  value: number;
  bounds: { minVolume?: number | null; maxVolume?: number | null; stepVolume?: number | null };
  onChange: (next: number) => void;
}) {
  const resolved = React.useMemo(() => resolveTradeVolumeBounds(bounds), [bounds]);
  const { minVolume, maxVolume } = resolved;
  const resolvedRef = React.useRef(resolved);
  const trackWidthRef = React.useRef(0);
  const trackWidthShared = useSharedValue(0);
  const sliderValueShared = useSharedValue(value);
  const minVolumeShared = useSharedValue(resolved.minVolume);
  const maxVolumeShared = useSharedValue(resolved.maxVolume);
  const stepVolumeShared = useSharedValue(resolved.stepVolume);
  const decimalsShared = useSharedValue(resolved.decimals);
  const sliderDraggingRef = React.useRef(false);
  const onChangeRef = React.useRef(onChange);
  const commitFrameRef = React.useRef<number | null>(null);
  const pendingCommitValueRef = React.useRef<number | null>(null);
  const lastCommittedValueRef = React.useRef(value);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const clampedExternalValue = Math.min(maxVolume, Math.max(minVolume, value));
  const thumbRadius = CHART_TRADE_SLIDER_THUMB_SIZE / 2;

  React.useEffect(() => {
    resolvedRef.current = resolved;
    minVolumeShared.value = resolved.minVolume;
    maxVolumeShared.value = resolved.maxVolume;
    stepVolumeShared.value = resolved.stepVolume;
    decimalsShared.value = resolved.decimals;
    if (!sliderDraggingRef.current) {
      sliderValueShared.value = clampedExternalValue;
      lastCommittedValueRef.current = clampedExternalValue;
    }
  }, [
    clampedExternalValue,
    decimalsShared,
    maxVolumeShared,
    minVolumeShared,
    resolved,
    sliderValueShared,
    stepVolumeShared,
  ]);

  const flushPendingCommit = React.useCallback(() => {
    commitFrameRef.current = null;
    const nextValue = pendingCommitValueRef.current;
    pendingCommitValueRef.current = null;
    if (nextValue === null) {
      return;
    }
    const epsilon = resolvedRef.current.stepVolume / 1000;
    if (Math.abs(nextValue - lastCommittedValueRef.current) <= epsilon) {
      return;
    }
    lastCommittedValueRef.current = nextValue;
    onChangeRef.current(nextValue);
  }, []);

  const scheduleCommit = React.useCallback((nextValue: number, immediate = false) => {
    pendingCommitValueRef.current = nextValue;
    if (immediate) {
      if (commitFrameRef.current !== null) {
        cancelAnimationFrame(commitFrameRef.current);
        commitFrameRef.current = null;
      }
      flushPendingCommit();
      return;
    }
    if (commitFrameRef.current !== null) {
      return;
    }
    commitFrameRef.current = requestAnimationFrame(flushPendingCommit);
  }, [flushPendingCommit]);

  React.useEffect(() => () => {
    if (commitFrameRef.current !== null) {
      cancelAnimationFrame(commitFrameRef.current);
    }
  }, []);

  const setSliderDragging = React.useCallback((dragging: boolean) => {
    sliderDraggingRef.current = dragging;
  }, []);

  const sliderGesture = React.useMemo(() => {
    const resolveValueFromX = (x: number) => {
      'worklet';
      const width = trackWidthShared.value;
      if (width <= 0) {
        return sliderValueShared.value;
      }
      const min = minVolumeShared.value;
      const max = maxVolumeShared.value;
      const step = Math.max(stepVolumeShared.value, 0.0000001);
      const usable = Math.max(1, width - CHART_TRADE_SLIDER_THUMB_SIZE);
      const ratio = Math.min(1, Math.max(0, (x - CHART_TRADE_SLIDER_THUMB_SIZE / 2) / usable));
      const raw = min + ratio * (max - min);
      const stepped = min + Math.round((raw - min) / step) * step;
      const clamped = Math.min(max, Math.max(min, stepped));
      const factor = Math.pow(10, Math.max(0, decimalsShared.value));
      return Math.round(clamped * factor) / factor;
    };

    return Gesture.Pan()
      .minDistance(0)
      .onBegin((event) => {
        runOnJS(setSliderDragging)(true);
        const nextValue = resolveValueFromX(event.x);
        sliderValueShared.value = nextValue;
        runOnJS(scheduleCommit)(nextValue, false);
      })
      .onUpdate((event) => {
        const nextValue = resolveValueFromX(event.x);
        sliderValueShared.value = nextValue;
        runOnJS(scheduleCommit)(nextValue, false);
      })
      .onEnd((event) => {
        const nextValue = resolveValueFromX(event.x);
        sliderValueShared.value = nextValue;
        runOnJS(scheduleCommit)(nextValue, true);
      })
      .onFinalize(() => {
        runOnJS(setSliderDragging)(false);
      });
  }, [scheduleCommit]);

  const animatedFillStyle = useAnimatedStyle(() => {
    const width = trackWidthShared.value;
    const min = minVolumeShared.value;
    const max = maxVolumeShared.value;
    const range = Math.max(max - min, stepVolumeShared.value);
    const value = Math.min(max, Math.max(min, sliderValueShared.value));
    const progress = (value - min) / range;
    const usable = Math.max(0, width - CHART_TRADE_SLIDER_THUMB_SIZE);
    return { width: thumbRadius + progress * usable };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    const width = trackWidthShared.value;
    const min = minVolumeShared.value;
    const max = maxVolumeShared.value;
    const range = Math.max(max - min, stepVolumeShared.value);
    const value = Math.min(max, Math.max(min, sliderValueShared.value));
    const progress = (value - min) / range;
    const usable = Math.max(0, width - CHART_TRADE_SLIDER_THUMB_SIZE);
    return { left: progress * usable };
  });

  return (
    <GestureDetector gesture={sliderGesture}>
      <View
        style={styles.chartTradeSliderTouch}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackWidthRef.current = w;
          trackWidthShared.value = w;
        }}
      >
        <View style={styles.chartTradeSliderTrack}>
          <Animated.View style={[styles.chartTradeSliderFill, animatedFillStyle]} />
        </View>
        <Animated.View
          style={[
            styles.chartTradeSliderThumb,
            animatedThumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}

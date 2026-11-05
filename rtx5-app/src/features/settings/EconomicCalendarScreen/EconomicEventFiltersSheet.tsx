import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import type { ImpactLevel } from '../../../api/economicCalendar';
import { useTranslation } from '../../../i18n/useTranslation';
import { useIsDarkTheme } from '../../../state/themeMode';
import { FastPressable } from '../../../ui/components/FastPressable';
import { useTheme } from '../../../ui/theme/useTheme';
import { IMPACT_CONFIG, IMPACT_FILTERS } from './eventHelpers';
import { makeEconomicCalendarStyles } from './styles';

// Ignore the open-frame touch so the same finger cannot dismiss immediately.
const EVENT_FILTER_OPEN_GUARD_MS = 220;

export type EconomicEventFiltersSheetHandle = {
  open: () => void;
  close: () => void;
};

type EconomicEventFiltersSheetProps = {
  selectedImpacts: ReadonlySet<ImpactLevel>;
  onApply: (nextImpacts: Set<ImpactLevel>) => void;
};

/**
 * Retained multi-select filter sheet. It owns visibility and draft selections
 * so opening, closing, and toggling filters do not rebuild the calendar rows
 * behind it. The parent receives one update only after Apply is pressed.
 *
 * The host stays mounted and measured behind a React-owned visibility barrier.
 * Opening starts native-driven motion on touch-down without creating a native
 * Modal window or rebuilding the calendar. Only the card's translation and the
 * separate backdrop's opacity animate; the card remains opaque and full-size.
 */
export const EconomicEventFiltersSheet = React.memo(React.forwardRef<
  EconomicEventFiltersSheetHandle,
  EconomicEventFiltersSheetProps
>(function EconomicEventFiltersSheet({ selectedImpacts, onApply }, ref) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const styles = React.useMemo(
    () => makeEconomicCalendarStyles(T, isDark),
    [T, isDark],
  );
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [draftImpacts, setDraftImpacts] = useState<Set<ImpactLevel>>(
    () => new Set(selectedImpacts),
  );
  const visibleRef = useRef(false);
  const closingRef = useRef(false);
  const hostRef = useRef<View>(null);
  const sheetHeightRef = useRef(Dimensions.get('window').height);
  const translateY = useRef(new Animated.Value(sheetHeightRef.current)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const motionRef = useRef<Animated.CompositeAnimation | null>(null);
  const motionGenerationRef = useRef(0);
  const reduceMotionRef = useRef(false);
  const selectedImpactsRef = useRef(selectedImpacts);
  selectedImpactsRef.current = selectedImpacts;
  const openedAtRef = useRef(0);
  const backdropColor = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)';

  const hideNow = useCallback(() => {
    ++motionGenerationRef.current;
    motionRef.current?.stop();
    motionRef.current = null;
    visibleRef.current = false;
    closingRef.current = false;
    hostRef.current?.setNativeProps({
      pointerEvents: 'none', accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants', style: { opacity: 0 },
    });
    translateY.setValue(sheetHeightRef.current);
    backdropOpacity.setValue(0);
    setVisible(false);
    setDraftImpacts(new Set(selectedImpactsRef.current));
  }, [backdropOpacity, translateY]);

  const open = useCallback(() => {
    if (visibleRef.current) return;
    const reopening = closingRef.current;
    ++motionGenerationRef.current;
    motionRef.current?.stop();
    motionRef.current = null;
    closingRef.current = false;
    if (!reopening) {
      translateY.setValue(sheetHeightRef.current);
      backdropOpacity.setValue(0);
    }
    visibleRef.current = true;
    openedAtRef.current = Date.now();
    setDraftImpacts(new Set(selectedImpactsRef.current));
    setVisible(true);
    // Install the parked pose before revealing the measured native host.
    // Motion starts in this tap's JS turn, without waiting for a React effect.
    if (reduceMotionRef.current) {
      translateY.setValue(0);
      backdropOpacity.setValue(1);
    } else {
      motionRef.current = Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0, duration: 210, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]);
      motionRef.current.start();
    }
    hostRef.current?.setNativeProps({
      pointerEvents: 'box-none', accessibilityElementsHidden: false,
      importantForAccessibility: 'auto', style: { opacity: 1 },
    });
  }, [backdropOpacity, translateY]);

  const dismiss = useCallback(() => {
    if (!visibleRef.current || closingRef.current) return false;
    visibleRef.current = false;
    closingRef.current = true;
    const generation = ++motionGenerationRef.current;
    motionRef.current?.stop();
    // Consume touches during exit; none of the outgoing controls can submit twice.
    hostRef.current?.setNativeProps({ pointerEvents: 'box-only', accessibilityElementsHidden: true });
    if (reduceMotionRef.current) {
      hideNow();
      return true;
    }
    motionRef.current = Animated.parallel([
      Animated.timing(translateY, {
        toValue: sheetHeightRef.current, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]);
    motionRef.current.start(({ finished }) => {
      if (finished && generation === motionGenerationRef.current) hideNow();
    });
    return true;
  }, [backdropOpacity, hideNow, translateY]);

  const handleCardLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (!Number.isFinite(height) || height <= 0) return;
    sheetHeightRef.current = height;
    if (!visibleRef.current && !closingRef.current) translateY.setValue(height);
  }, [translateY]);

  useImperativeHandle(ref, () => ({ open, close: hideNow }), [hideNow, open]);

  useEffect(() => {
    if (!visibleRef.current && !closingRef.current) {
      setDraftImpacts(new Set(selectedImpacts));
    }
  }, [selectedImpacts]);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const updateReducedMotion = (enabled: boolean) => {
      if (!active) return;
      reduceMotionRef.current = enabled;
      if (!enabled) return;
      if (closingRef.current) { hideNow(); return; }
      if (!visibleRef.current) return;
      ++motionGenerationRef.current;
      motionRef.current?.stop();
      motionRef.current = null;
      translateY.setValue(0);
      backdropOpacity.setValue(1);
    };
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!preferenceChanged) updateReducedMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceChanged = true;
      updateReducedMotion(enabled);
    });
    return () => { active = false; subscription.remove(); };
  }, [backdropOpacity, hideNow, translateY]);

  useEffect(() => () => {
    ++motionGenerationRef.current;
    motionRef.current?.stop();
    visibleRef.current = false;
    closingRef.current = false;
    hostRef.current?.setNativeProps({ pointerEvents: 'none', style: { opacity: 0 } });
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (closingRef.current) return true;
      if (!visibleRef.current) return false;
      dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [dismiss]);

  const toggleDraftImpact = useCallback((impact: ImpactLevel) => {
    if (!visibleRef.current || closingRef.current) return;
    setDraftImpacts((current) => {
      const next = new Set(current);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      return next;
    });
  }, []);

  const handleBackdropPress = useCallback(() => {
    if (Date.now() - openedAtRef.current < EVENT_FILTER_OPEN_GUARD_MS) return;
    dismiss();
  }, [dismiss]);

  const handleApply = useCallback(() => {
    const nextImpacts = new Set(draftImpacts);
    if (dismiss()) onApply(nextImpacts);
  }, [draftImpacts, dismiss, onApply]);

  return (
    <View
      ref={hostRef}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      accessibilityViewIsModal={visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.filterSheetHost,
        visible ? null : styles.filterSheetHostHidden,
      ]}
      testID="economic-event-filters-sheet-host"
    >
      <View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={styles.filterSheetAnimatedHost}
      >
        <View style={styles.modalOverlay} testID="economic-event-filters-sheet">
          {/* Backdrop is a sibling of the sheet — never parent opacity of the card. */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: backdropColor },
              { opacity: backdropOpacity },
            ]}
          />
          <FastPressable
            style={StyleSheet.absoluteFillObject}
            onPress={handleBackdropPress}
            activateOnPressIn
            activateOnTouchStart
            latencyLabel="economicCalendar.filters.dismiss"
            unstable_pressDelay={0}
          />

          <Animated.View
            collapsable={false}
            style={[styles.modalCard, { transform: [{ translateY }] }]}
            onLayout={handleCardLayout}
            testID="economic-event-filters-card"
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{t('Event Filters')}</Text>
              <Text style={styles.modalSub}>{t('Customize which events appear')}</Text>
            </View>

            <Text style={styles.modalGroupTitle}>{t('IMPACT LEVEL')}</Text>
            <View style={styles.modalImpactRow}>
              {IMPACT_FILTERS.map((impact) => {
                const config = IMPACT_CONFIG[impact];
                const isActive = draftImpacts.has(impact);
                return (
                  <FastPressable
                    key={impact}
                    style={[
                      styles.modalImpactBtn,
                      isActive && {
                        borderColor: `${config.color}60`,
                        backgroundColor: `${config.color}10`,
                      },
                    ]}
                    onPress={() => toggleDraftImpact(impact)}
                    activateOnPressIn
                    latencyLabel={`economicCalendar.filters.${impact}`}
                    unstable_pressDelay={0}
                  >
                    <View style={[styles.modalImpactIndicator, { opacity: isActive ? 1 : 0.6 }]}>
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: isActive ? `${config.color}30` : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: isActive ? config.color : isDark ? T.textMuted : '#CBD5E1',
                          }}
                        />
                      </View>
                    </View>
                    <Text style={[styles.modalImpactLabel, isActive && { color: config.color }]}>
                      {t(config.label)}
                    </Text>
                  </FastPressable>
                );
              })}
            </View>

            <Text style={styles.modalGroupTitle}>{t('OTHER')}</Text>
            <FastPressable
              style={[
                styles.modalToggleRow,
                draftImpacts.has('holiday') && styles.modalToggleRowActive,
              ]}
              onPress={() => toggleDraftImpact('holiday')}
              activateOnPressIn
              latencyLabel="economicCalendar.filters.holiday"
              unstable_pressDelay={0}
            >
              <Ionicons name="calendar" size={16} color="#8B5CF6" />
              <Text style={styles.modalToggleLabel}>{t('Show Bank Holidays')}</Text>
              <View style={[styles.modalToggle, draftImpacts.has('holiday') && styles.modalToggleOn]}>
                <View
                  style={[
                    styles.modalToggleThumb,
                    draftImpacts.has('holiday') && styles.modalToggleThumbOn,
                  ]}
                />
              </View>
            </FastPressable>

            <FastPressable
              style={styles.modalDoneBtn}
              onPress={handleApply}
              activateOnPressIn
              activateOnTouchStart
              latencyLabel="economicCalendar.filters.apply"
              unstable_pressDelay={0}
            >
              <LinearGradient
                colors={isDark ? [T.accent, T.trading.buy.active] : ['#4F46E5', '#4338CA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]}
              />
              <Text style={styles.modalDoneBtnText}>{t('Apply Filters')}</Text>
            </FastPressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}));

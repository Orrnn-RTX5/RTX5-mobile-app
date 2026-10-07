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
  BackHandler,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ImpactLevel } from '../../../dev/mock/calendarData';
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
 * Opening reveals its settled layout immediately, without creating a native
 * Modal window or restarting an entrance when display preferences update.
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
  const selectedImpactsRef = useRef(selectedImpacts);
  selectedImpactsRef.current = selectedImpacts;
  const openedAtRef = useRef(0);
  const backdropColor = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)';

  const hideNow = useCallback(() => {
    if (!visibleRef.current) return;
    visibleRef.current = false;
    setVisible(false);
    setDraftImpacts(new Set(selectedImpactsRef.current));
  }, []);

  const open = useCallback(() => {
    if (visibleRef.current) return;
    visibleRef.current = true;
    openedAtRef.current = Date.now();
    setDraftImpacts(new Set(selectedImpactsRef.current));
    setVisible(true);
  }, []);

  useImperativeHandle(ref, () => ({ open, close: hideNow }), [hideNow, open]);

  useEffect(() => {
    if (!visibleRef.current) {
      setDraftImpacts(new Set(selectedImpacts));
    }
  }, [selectedImpacts]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!visibleRef.current) return false;
      hideNow();
      return true;
    });
    return () => subscription.remove();
  }, [hideNow]);

  const toggleDraftImpact = useCallback((impact: ImpactLevel) => {
    setDraftImpacts((current) => {
      const next = new Set(current);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      return next;
    });
  }, []);

  const handleBackdropPress = useCallback(() => {
    if (Date.now() - openedAtRef.current < EVENT_FILTER_OPEN_GUARD_MS) return;
    hideNow();
  }, [hideNow]);

  const handleApply = useCallback(() => {
    const nextImpacts = new Set(draftImpacts);
    hideNow();
    onApply(nextImpacts);
  }, [draftImpacts, hideNow, onApply]);

  return (
    <View
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
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: backdropColor },
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

          <View
            collapsable={false}
            style={styles.modalCard}
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
          </View>
        </View>
      </View>
    </View>
  );
}));

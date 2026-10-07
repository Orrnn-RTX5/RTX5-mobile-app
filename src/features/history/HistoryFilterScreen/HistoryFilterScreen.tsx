import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * History Feature UI: HistoryFilterScreen
 *
 * Provides an interactive calendar and preset toggle interface for explicitly
 * defining the time window of historical trades to pull from the backend.
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, SCREEN_H_PAD } from '../../../ui/components/Screen';
import { useTranslation } from '../../../i18n/useTranslation';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTheme } from '../../../ui/theme/useTheme';
import { safeRouterBack } from '../../../utils/navigation';
import {
  PRESETS,
  fromDateKey,
  formatLocalizedDate,
  formatMonthYear,
  getDaysInMonth,
  getFirstDayOfMonth,
  getWeekdayLabels,
  toDateKey,
} from './dateUtils';
import { makeHistoryFilterStyles } from './styles';

export type HistoryFilterScreenProps = Readonly<{
  /** When true, shown from HistoryFilterHost over the History tab. */
  hosted?: boolean;
  hostedActive?: boolean;
  onHostedBack?: () => void;
}>;

export function HistoryFilterScreen({
  hosted = false,
  hostedActive = false,
  onHostedBack,
}: HistoryFilterScreenProps = {}) {
  const { t, language } = useTranslation();
  const historyRange = useUserPreferences((s) => s.historyRange);
  const historyFromMs = useUserPreferences((s) => s.historyFromMs);
  const historyToMs = useUserPreferences((s) => s.historyToMs);
  const setHistoryRange = useUserPreferences((s) => s.setHistoryRange);
  const setHistoryDateRange = useUserPreferences((s) => s.setHistoryDateRange);
  const themeActive = !hosted || hostedActive;
  const T = useTheme({ active: themeActive });
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const contentWidth = viewportWidth - insets.left - insets.right;
  const stackDateFields = contentWidth < 360 || fontScale > 1.2;
  const s = useMemo(() => makeHistoryFilterStyles(T), [T]);

  const initialCalendarDate = useMemo(
    () => (historyFromMs == null ? new Date() : new Date(historyFromMs)),
    [historyFromMs],
  );
  const initialStartDate = useMemo(
    () =>
      historyFromMs == null
        ? null
        : toDateKey(
            initialCalendarDate.getFullYear(),
            initialCalendarDate.getMonth(),
            initialCalendarDate.getDate(),
          ),
    [historyFromMs, initialCalendarDate],
  );
  const initialEndDate = useMemo(() => {
    if (historyToMs == null) return null;
    const date = new Date(historyToMs);
    return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
  }, [historyToMs]);
  const initialCustomMode =
    historyRange === 'Custom' || !PRESETS.includes(historyRange);
  const scrollRef = useRef<ScrollView>(null);
  const calendarOffset = useRef(0);
  const revealCalendarOnLayout = useRef(initialCustomMode);

  const [calYear, setCalYear] = useState(initialCalendarDate.getFullYear());
  const [calMonth, setCalMonth] = useState(initialCalendarDate.getMonth());
  const [isCustom, setIsCustom] = useState(initialCustomMode);
  const [startDate, setStartDate] = useState<string | null>(initialStartDate);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate);
  const weekdayLabels = useMemo(() => getWeekdayLabels(language), [language]);
  const monthLabel = useMemo(
    () => formatMonthYear(calYear, calMonth, language),
    [calYear, calMonth, language],
  );

  const todayDate = useMemo(() => new Date(), []);
  const today = useMemo(() => {
    return toDateKey(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate(),
    );
  }, [todayDate]);
  const canNavigateNextMonth =
    calYear < todayDate.getFullYear() ||
    (calYear === todayDate.getFullYear() && calMonth < todayDate.getMonth());
  const customPresetSelected =
    isCustom || historyRange === 'Custom' || !PRESETS.includes(historyRange);

  const handlePresetPress = (preset: string) => {
    if (preset === 'Custom') {
      const startingFromPreset =
        PRESETS.includes(historyRange) && historyRange !== 'Custom';
      revealCalendarOnLayout.current = !isCustom;
      if (isCustom) {
        scrollRef.current?.scrollTo({ y: calendarOffset.current, animated: true });
      }
      setIsCustom(true);
      if (startingFromPreset && !isCustom) {
        setStartDate(null);
        setEndDate(null);
        setCalYear(todayDate.getFullYear());
        setCalMonth(todayDate.getMonth());
      }
      return;
    }

    setHistoryRange(preset);
    setIsCustom(false);

    if (preset === 'All time') {
      setStartDate(null);
      setEndDate(null);
      setHistoryDateRange(null, null);
      return;
    }

    const now = new Date();
    const todayKey = toDateKey(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startD = new Date(now);

    if (preset === 'Today') {
      // no offset
    } else if (preset === 'Last week') {
      startD.setDate(startD.getDate() - 7);
    } else if (preset === 'Last month') {
      startD.setMonth(startD.getMonth() - 1);
    } else if (preset === 'Last 3 months') {
      startD.setMonth(startD.getMonth() - 3);
    } else if (preset === 'Last 6 months') {
      startD.setMonth(startD.getMonth() - 6);
    } else if (preset === 'Last year') {
      startD.setFullYear(startD.getFullYear() - 1);
    }

    const start = toDateKey(
      startD.getFullYear(),
      startD.getMonth(),
      startD.getDate(),
    );
    const end = todayKey;

    setStartDate(start);
    setEndDate(end);

    setHistoryDateRange(
      startD.setHours(0, 0, 0, 0),
      now.setHours(23, 59, 59, 999),
    );

    setCalYear(startD.getFullYear());
    setCalMonth(startD.getMonth());
  };

  const handleDayPress = useCallback(
    (year: number, month: number, day: number) => {
      const key = toDateKey(year, month, day);
      if (!startDate || endDate) {
        setStartDate(key);
        setEndDate(null);
      } else if (key < startDate) {
        setEndDate(startDate);
        setStartDate(key);
      } else {
        setEndDate(key);
      }
    },
    [startDate, endDate],
  );

  const isInRange = useCallback(
    (key: string) => {
      if (!startDate || !endDate) return false;
      return key >= startDate && key <= endDate;
    },
    [startDate, endDate],
  );

  const isStart = useCallback((key: string) => key === startDate, [startDate]);
  const isEnd = useCallback((key: string) => key === endDate, [endDate]);

  const applyCustomRange = () => {
    if (startDate && endDate) {
      const sDate = fromDateKey(startDate);
      const eDate = fromDateKey(endDate ?? startDate);
      if (!sDate || !eDate) return;
      const effectiveEndDate = endDate ?? startDate;
      const label =
        startDate === effectiveEndDate
          ? formatLocalizedDate(sDate, language)
          : `${formatLocalizedDate(sDate, language)} – ${formatLocalizedDate(eDate, language)}`;
      setHistoryRange(label);
      setHistoryDateRange(
        sDate.setHours(0, 0, 0, 0),
        eDate.setHours(23, 59, 59, 999),
      );
      setIsCustom(false);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else setCalMonth(calMonth - 1);
  };

  const nextMonth = () => {
    if (!canNavigateNextMonth) return;
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else setCalMonth(calMonth + 1);
  };

  const handleBack = useCallback(() => {
    if (hosted && onHostedBack) {
      onHostedBack();
      return;
    }
    safeRouterBack(router, '/(tabs)/history');
  }, [hosted, onHostedBack]);

  const calendarGrid = useMemo(() => {
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDayOfMonth(calYear, calMonth);
    const rows: (number | null)[][] = [];
    let currentRow: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) currentRow.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      currentRow.push(d);
      if (currentRow.length === 7) {
        rows.push(currentRow);
        currentRow = [];
      }
    }
    if (currentRow.length > 0) {
      while (currentRow.length < 7) currentRow.push(null);
      rows.push(currentRow);
    }
    return rows;
  }, [calYear, calMonth]);

  const selectedStartLabel = useMemo(() => {
    if (!startDate) return null;
    const start = fromDateKey(startDate);
    return start ? formatLocalizedDate(start, language) : null;
  }, [language, startDate]);

  const selectedEndLabel = useMemo(() => {
    if (!endDate) return null;
    const end = fromDateKey(endDate);
    return end ? formatLocalizedDate(end, language) : null;
  }, [endDate, language]);

  const customSelectionReady = Boolean(startDate && endDate);

  return (
    <Screen style={s.screen} noBottomInset noSideInset>
      <View style={s.page}>
        <View
          style={[
            s.header,
            {
              paddingTop: Math.max(insets.top, 0) + 6,
              paddingLeft: insets.left + 12,
              paddingRight: insets.right + 12,
            },
          ]}
        >
          <View style={s.headerRow}>
            <Pressable
              onPress={handleBack}
              activateOnPressIn
              activateOnTouchStart
              unstable_pressDelay={0}
              latencyLabel="history.filter.back"
              hitSlop={16}
              style={s.headerBackButton}
              accessibilityRole="button"
              accessibilityLabel={t('Back')}
            >
              <Ionicons name="arrow-back" size={22} color={T.text} />
            </Pressable>
            <View style={s.headerTitleWrap} pointerEvents="none">
              <Text
                style={s.headerTitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {t('History Filter')}
              </Text>
            </View>
            <View style={s.headerSideSlot} />
          </View>
          <Text style={s.intro}>{t('Choose which dates to show in your history.')}</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={s.scrollView}
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          contentContainerStyle={[
            s.scrollContent,
            {
              paddingLeft: insets.left + SCREEN_H_PAD,
              paddingRight: insets.right + SCREEN_H_PAD,
              paddingBottom: isCustom ? 24 : Math.max(insets.bottom, 16) + 16,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.contentColumn}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{t('Time period')}</Text>
            </View>

            <View style={s.presetList}>
              {PRESETS.map((preset, index) => {
                const selected =
                  preset === 'Custom'
                    ? customPresetSelected
                    : historyRange === preset && !isCustom;
                return (
                  <Pressable
                    key={preset}
                    onPress={() => handlePresetPress(preset)}
                    style={s.optionPressTarget}
                    android_ripple={{ color: 'transparent', borderless: false }}
                    accessibilityRole="radio"
                    accessibilityLabel={t(preset)}
                    accessibilityHint={preset === 'Custom' ? t('Choose exact dates') : undefined}
                    accessibilityState={{ checked: selected }}
                  >
                    <View
                      pointerEvents="none"
                      collapsable={false}
                      style={[s.option, index > 0 && s.optionDivider, selected && s.optionSelected]}
                    >
                      <View style={s.optionCopy}>
                        <Text style={[s.optionText, selected && s.optionTextSelected]}>
                          {t(preset)}
                        </Text>
                        {preset === 'Custom' ? (
                          <Text style={s.optionDetail}>{t('Choose exact dates')}</Text>
                        ) : null}
                      </View>
                      <View style={s.optionStatus}>
                        <Ionicons
                          name={
                            selected ? 'checkmark-circle' : 'ellipse-outline'
                          }
                          size={22}
                          color={selected ? T.accent : T.textMuted}
                        />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {isCustom ? (
              <View
                style={s.calendarCard}
                onLayout={(event) => {
                  calendarOffset.current = event.nativeEvent.layout.y;
                  if (revealCalendarOnLayout.current) {
                    revealCalendarOnLayout.current = false;
                    scrollRef.current?.scrollTo({
                      y: calendarOffset.current,
                      animated: true,
                    });
                  }
                }}
              >
                <View style={s.calendarHeading}>
                  <Text style={s.sectionTitle}>{t('Custom range')}</Text>
                </View>

                <View style={s.calendarSurface}>
                  <View style={s.monthNav}>
                    <Pressable
                      onPress={prevMonth}
                      hitSlop={8}
                      style={s.monthNavButton}
                      accessibilityRole="button"
                      accessibilityLabel={t('Previous month')}
                    >
                      <Ionicons name="chevron-back" size={20} color={T.text} />
                    </Pressable>
                    <Text
                      style={s.monthLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {monthLabel}
                    </Text>
                    <Pressable
                      onPress={nextMonth}
                      hitSlop={8}
                      disabled={!canNavigateNextMonth}
                      style={[
                        s.monthNavButton,
                        !canNavigateNextMonth && s.monthNavButtonDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={t('Next month')}
                      accessibilityState={{ disabled: !canNavigateNextMonth }}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={T.text}
                      />
                    </Pressable>
                  </View>

                  <View style={s.dayHeaderRow}>
                    {weekdayLabels.map((d) => (
                      <Text key={d} style={s.dayHeaderText}>
                        {d}
                      </Text>
                    ))}
                  </View>

                  {calendarGrid.map((row, rowIdx) => (
                    <View key={rowIdx} style={s.calRow}>
                      {row.map((day, colIdx) => {
                        if (day === null) {
                          return <View key={colIdx} style={s.calCell} />;
                        }

                        const key = toDateKey(calYear, calMonth, day);
                        const isFuture = key > today;
                        const isToday = key === today;
                        const selected = isStart(key) || isEnd(key);
                        const inRange = isInRange(key) && !selected;
                        const isRangeStart =
                          isStart(key) && endDate && startDate !== endDate;
                        const isRangeEnd =
                          isEnd(key) && startDate && startDate !== endDate;

                        return (
                          <Pressable
                            key={colIdx}
                            style={[
                              s.calCell,
                              inRange && s.calCellInRange,
                              isRangeStart && s.calCellRangeStart,
                              isRangeEnd && s.calCellRangeEnd,
                            ]}
                            onPress={() =>
                              handleDayPress(calYear, calMonth, day)
                            }
                            disabled={isFuture}
                            accessibilityRole="button"
                            accessibilityLabel={formatLocalizedDate(
                              new Date(calYear, calMonth, day),
                              language,
                            )}
                            accessibilityState={{
                              disabled: isFuture,
                              selected,
                            }}
                          >
                            <View
                              style={[
                                s.calDayCircle,
                                selected && s.calDaySelected,
                                isToday && !selected && s.calDayToday,
                              ]}
                            >
                              <Text
                                style={[
                                  s.calDayText,
                                  selected && s.calDayTextSelected,
                                  isToday && !selected && s.calDayTextToday,
                                  inRange && s.calDayTextInRange,
                                  isFuture && s.calDayTextDisabled,
                                ]}
                              >
                                {day}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>

                <View style={s.selectionInfo}>
                  <View style={[s.selectionFields, stackDateFields && s.selectionFieldsStacked]}>
                    <View style={s.selectionField}>
                      <Text style={s.selectionFieldLabel}>
                        {t('Start date')}
                      </Text>
                      <Text
                        style={s.selectionFieldValue}
                      >
                        {selectedStartLabel ?? '\u2014'}
                      </Text>
                    </View>
                    <View style={s.selectionField}>
                      <Text style={s.selectionFieldLabel}>{t('End date')}</Text>
                      <Text
                        style={s.selectionFieldValue}
                      >
                        {selectedEndLabel ?? '\u2014'}
                      </Text>
                    </View>
                  </View>
                </View>

              </View>
            ) : null}
          </View>
        </ScrollView>
        {isCustom ? (
          <View style={[
            s.footer,
            {
              paddingLeft: insets.left + SCREEN_H_PAD,
              paddingRight: insets.right + SCREEN_H_PAD,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}>
            <Pressable
              style={[s.applyBtn, !customSelectionReady && s.applyBtnDisabled]}
              onPress={applyCustomRange}
              disabled={!customSelectionReady}
              accessibilityRole="button"
              accessibilityState={{ disabled: !customSelectionReady }}
            >
              <Text style={s.applyBtnText}>{t('Apply Custom Range')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

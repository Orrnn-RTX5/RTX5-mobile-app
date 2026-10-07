import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Settings Feature UI: EconomicCalendarScreen
 *
 * Enterprise-grade economic calendar with glassmorphic cards,
 * animated impact indicators, expandable event detail panels,
 * multi-dimension filtering, and live countdown timers.
 */
import { Ionicons } from '@expo/vector-icons';
import { AppMenuIcon } from '../../../ui/components/AppMenuIcon';
import { useIsFocused } from '@react-navigation/native';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../../ui/components/Screen';
import { useRetainedRouteContentReady } from '../../../ui/components/DeferredRouteMount';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useUIState } from '../../../state/uiState';
import { useTheme } from '../../../ui/theme/useTheme';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../../ui/components/sidebarDrawerController';
import {
  fetchEconomicCalendarData,
  getInitialEconomicCalendarData,
  type EconomicEvent,
  type ImpactLevel,
} from '../../../dev/mock/calendarData';
import {
  CURRENCY_FILTERS,
  DATE_TABS,
  IMPACT_CONFIG,
  getEventsForTab,
  parseAndDiff,
} from './eventHelpers';
import { CountryBadge, PulseDot } from './subComponents';
import { makeEconomicCalendarStyles } from './styles';
import { useNextFrameValue } from '../../../hooks/useNextFrameValue';
import { useTranslation } from '../../../i18n/useTranslation';
import { runImmediateAction } from '../../../utils/actionLatency';
import {
  EconomicEventFiltersSheet,
  type EconomicEventFiltersSheetHandle,
} from './EconomicEventFiltersSheet';

const ECON_CALENDAR_IDLE_PREWARM_DELAY_MS = 6000;
// Mount the retained calendar body before it is selected so the first sidebar
// reveal is complete. Live refreshes remain focus-only.
const ECON_CALENDAR_BODY_PREWARM_DELAY_MS = 0;

/**
 * Screen displaying a calendar of upcoming global macroeconomic events and their expected market impact.
 */
export const EconomicCalendarScreenInner = React.memo(function EconomicCalendarScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const routeBodyReady = useRetainedRouteContentReady(
    isScreenFocused, ECON_CALENDAR_BODY_PREWARM_DELAY_MS,
  );
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeEconomicCalendarStyles(T, isDark), [T, isDark]);
  const insets = useSafeAreaInsets();
  const hideActionSheet = useUIState((state) => state.hideActionSheet);
  const { t } = useTranslation();
  const initialEvents = useMemo(() => getInitialEconomicCalendarData(), []);

  const [activeTab, setActiveTab] = useState('Today');
  const [selectedImpacts, setSelectedImpacts] = useState<Set<ImpactLevel>>(new Set(['high', 'medium', 'low', 'holiday']));
  const [selectedCurrency, setSelectedCurrency] = useState('All');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const eventFiltersSheetRef = useRef<EconomicEventFiltersSheetHandle>(null);

  const [dataEvents, setDataEvents] = useState<EconomicEvent[]>(initialEvents);
  const [fetchError, setFetchError] = useState(initialEvents.length === 0);
  const dataEventsCountRef = useRef(initialEvents.length);

  useEffect(() => {
    dataEventsCountRef.current = dataEvents.length;
  }, [dataEvents.length]);

  useEffect(() => {
    if (!routeBodyReady) return;
    // MT5-parity prewarm: this shell stays mounted (inactive) in the sidebar
    // destination host from boot. Replace the generated-fallback cache with
    // LIVE events once during idle boot time so the FIRST sidebar visit
    // reveals real rows instead of kicking off a ~1s fetch on focus. The
    // fetch itself serves from the fresh cache when live data already exists.
    const prewarmTimer = setTimeout(() => {
      fetchEconomicCalendarData().then((data) => {
        if (data.length > 0) {
          dataEventsCountRef.current = data.length;
          setDataEvents(data);
          setFetchError(false);
        }
      }).catch(() => undefined);
    }, ECON_CALENDAR_IDLE_PREWARM_DELAY_MS);
    return () => clearTimeout(prewarmTimer);
  }, [routeBodyReady]);

  const loadData = useCallback(() => {
    fetchEconomicCalendarData().then((data) => {
      if (data.length > 0) {
        dataEventsCountRef.current = data.length;
        setDataEvents(data);
        setFetchError(false);
      } else {
        setFetchError(dataEventsCountRef.current === 0);
      }
    }).catch(() => {
      setFetchError(dataEventsCountRef.current === 0);
    });
  }, []);

  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isScreenFocused, loadData]);

  const openEventFilters = useCallback(() => {
    runImmediateAction('economicCalendar.filters.open', () => {
      eventFiltersSheetRef.current?.open();
    });
  }, []);

  const applyEventFilters = useCallback((nextImpacts: Set<ImpactLevel>) => {
    React.startTransition(() => {
      setSelectedImpacts(nextImpacts);
    });
  }, []);

  /**
   * Opens the sidebar navigation drawer.
   */
  const handleOpenMenu = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  const sections = useMemo(() => {
    const raw = getEventsForTab(activeTab, dataEvents);
    return raw.map((section) => ({
      ...section,
      events: section.events.filter((e) => {
        if (!selectedImpacts.has(e.impact)) return false;
        if (selectedCurrency !== 'All' && e.currency !== selectedCurrency) return false;
        return true;
      }),
    })).filter((s) => s.events.length > 0);
  }, [activeTab, selectedImpacts, selectedCurrency, dataEvents]);

  const visibleSections = sections;

  const renderEvent = useCallback((event: EconomicEvent, idx: number, total: number) => {
    const isExpanded = expandedEventId === event.id;
    const config = IMPACT_CONFIG[event.impact];
    const hasActual = !!event.actual && event.actual !== '—';
    const isLast = idx === total - 1;

    if (isExpanded && !event.isAllDay) {
      const forecastDiff = parseAndDiff(event.actual, event.forecast, T.trading.profit);
      const previousDiff = parseAndDiff(event.actual, event.previous, T.trading.profit);

      return (
        <Pressable
          key={event.id}
          style={[styles.eventCard, { padding: 12, backgroundColor: isDark ? T.glass1 : '#F8FAFC', borderWidth: 1, borderColor: isDark ? T.border : 'rgba(0,0,0,0.05)', marginBottom: 8 }]}
          onPress={() => setExpandedEventId(null)}
        >
          <View style={{ flexDirection: 'column' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View style={{ width: 80 }}>
                <Text style={{ color: isDark ? T.text : '#0F172A', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {event.time} <Text style={{ fontSize: 11, color: isDark ? T.textMuted : '#94A3B8', fontWeight: '500' }}>GMT</Text>
                </Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 12, flexDirection: 'row' }}>
                <View style={styles.currencyTag}>
                  <Text style={styles.currencyTagText}>{event.currency}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: config.color + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }}>
                <PulseDot color={config.color} size={5} active={isScreenFocused} />
                <Text style={{ marginLeft: 6, color: config.color, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }}>{t(config.label).toUpperCase()}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ width: 80 }} />
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 16, color: isDark ? T.text : '#0F172A', fontWeight: 'bold' }}>{event.title}</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', backgroundColor: isDark ? T.glass2 : '#F1F5F9', borderRadius: 12, borderWidth: 1, borderColor: isDark ? T.border : 'rgba(0,0,0,0.05)', marginTop: 8 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRightWidth: 1, borderRightColor: isDark ? T.borderSubtle : 'rgba(0,0,0,0.05)' }}>
              <Text style={{ color: hasActual ? config.color : (isDark ? T.textDimmed : '#94A3B8'), fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 }}>{t('Actual').toUpperCase()}</Text>
              <Text style={{ fontSize: 22, fontWeight: '600', color: hasActual ? config.color : (isDark ? T.textDimmed : '#94A3B8'), fontVariant: ['tabular-nums'] }}>
                {hasActual ? event.actual : '—'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRightWidth: 1, borderRightColor: isDark ? T.borderSubtle : 'rgba(0,0,0,0.05)' }}>
              <Text style={{ color: isDark ? T.textMuted : '#94A3B8', fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 }}>{t('Forecast').toUpperCase()}</Text>
              <Text style={{ color: isDark ? T.text : '#0F172A', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{event.forecast || '—'}</Text>
              {forecastDiff ? (
                <Text style={{ color: forecastDiff.color, fontSize: 10, fontWeight: '600', marginTop: 4 }}>vs: {forecastDiff.text} {forecastDiff.symbol}</Text>
              ) : <View style={{ height: 16 }} />}
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
              <Text style={{ color: isDark ? T.textMuted : '#94A3B8', fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 }}>{t('Previous').toUpperCase()}</Text>
              <Text style={{ color: isDark ? T.text : '#0F172A', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{event.previous || '—'}</Text>
              {previousDiff ? (
                <Text style={{ color: previousDiff.color, fontSize: 10, fontWeight: '600', marginTop: 4 }}>vs: {previousDiff.text} {previousDiff.symbol}</Text>
              ) : <View style={{ height: 16 }} />}
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={14} color={isDark ? T.textMuted : '#94A3B8'} />
              <Text style={{ color: isDark ? T.textSub : '#475569', fontSize: 13, fontWeight: '600' }}>{event.country}</Text>
            </View>
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
        key={event.id}
        style={[
          styles.eventCard,
          idx === 0 && styles.eventCardFirst,
          isLast && styles.eventCardLast,
          !isLast && styles.eventCardNotLast,
        ]}
        onPress={() => setExpandedEventId(event.id)}
      >
        <View style={styles.eventRow}>
          <View style={styles.timeBlock}>
            {event.isAllDay ? (
              <View style={styles.allDayPill}>
                <Ionicons name="calendar" size={10} color="#8B5CF6" />
                <Text style={styles.allDayText}>{t('All Day').toUpperCase()}</Text>
              </View>
            ) : (
              <Text style={styles.timeText}>{event.time}</Text>
            )}
          </View>

          <View style={styles.eventInfo}>
            <View style={styles.eventMetaRow}>
              <CountryBadge country={event.country} />
              <View style={styles.currencyTag}>
                <Text style={styles.currencyTagText}>{event.currency}</Text>
              </View>
            </View>
            <Text style={[styles.eventTitle, event.impact === 'holiday' && styles.eventTitleHoliday]} numberOfLines={1}>
              {event.title}
            </Text>
          </View>

          {!event.isAllDay && (
            <View style={styles.valuePreview}>
              {hasActual ? (
                <>
                  <Text style={[styles.previewActual, { color: config.color }]}>{event.actual}</Text>
                  <Text style={styles.previewLabel}>{t('Actual')}</Text>
                </>
              ) : event.forecast && event.forecast !== '—' ? (
                <>
                  <Text style={styles.previewForecast}>{event.forecast}</Text>
                  <Text style={styles.previewLabel}>{t('Forecast')}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="time-outline" size={14} color={isDark ? T.textDimmed : '#94A3B8'} />
                  <Text style={styles.previewLabel}>{t('Pending')}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  }, [expandedEventId, styles, isDark, T, t, isScreenFocused]);

  return (
    <Screen style={styles.screen}>
      <View style={{
        paddingTop: insets.top,
        backgroundColor: T.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? T.borderSubtle : 'rgba(0,0,0,0.06)',
      }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
          <Pressable
            onPress={handleOpenMenu}
            activateOnTouchStart
            latencyLabel="economicCalendar.menu"
            unstable_pressDelay={0}
            hitSlop={15}
            style={{ width: 46, alignItems: 'flex-start', padding: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <AppMenuIcon color={T.text} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '500', color: T.text }}>
            {t('Economic Calender')}
          </Text>
          <View style={{ width: 46 }} />
        </View>
      </View>
      {routeBodyReady ? <>
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <View style={[styles.heroCard, { marginBottom: 0 }]}>
          <View style={styles.heroContent}>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="calendar-outline" size={30} color={isDark ? T.accent : '#4F46E5'} />
              </View>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={styles.heroTitle}>{t('Economic Calender')}</Text>
                <Text style={styles.heroSub}>{t('Market events calendar')}</Text>
              </View>
              <Pressable
                style={styles.filterBtn}
                onPress={openEventFilters}
                activateOnPressIn
                activateOnTouchStart
                latencyLabel="economicCalendar.filters.open"
                unstable_pressDelay={0}
              >
                <Ionicons name="options-outline" size={16} color={isDark ? T.accent : '#4F46E5'} />
              </Pressable>
            </View>

            <View style={styles.segmentRow}>
              {DATE_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <Pressable key={tab} style={[styles.segmentBtn, isActive && styles.segmentBtnActive]} onPress={() => setActiveTab(tab)}>
                    {isActive && (
                      <LinearGradient
                        colors={isDark ? [T.accent, T.trading.buy.active] : ['#4F46E5', '#4338CA']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={[StyleSheet.absoluteFillObject, { borderRadius: 10 }]}
                      />
                    )}
                    <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>{t(tab)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {Platform.OS === 'web' && (
              <style>{`
                [data-scroll="chips"]::-webkit-scrollbar { height: 4px; }
                [data-scroll="chips"]::-webkit-scrollbar-track { background: transparent; }
                [data-scroll="chips"]::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}; border-radius: 4px; }
                [data-scroll="chips"]::-webkit-scrollbar-thumb:hover { background: ${isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)'}; }
              `}</style>
            )}
            <ScrollView
              keyboardShouldPersistTaps="always"
              horizontal
              showsHorizontalScrollIndicator={true}
              indicatorStyle={isDark ? 'white' : 'black'}
              {...({ dataSet: { scroll: 'chips' } } as any)}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipScrollContent}
            >
              {CURRENCY_FILTERS.map((cur) => {
                const isActive = selectedCurrency === cur;
                return (
                  <Pressable key={cur} style={[styles.chipBtn, isActive && styles.chipBtnActive]} onPress={() => setSelectedCurrency(cur)}>
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {cur === 'All' ? `● ${t('All')}` : cur}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: 20 }]} showsVerticalScrollIndicator={false}>

        {fetchError && dataEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={32} color={isDark ? '#EF4444' : '#DC2626'} />
            </View>
            <Text style={styles.emptyTitle}>{t('Unable to load events')}</Text>
            <Text style={styles.emptySub}>{t('Check your internet connection and try again')}</Text>
            <Pressable style={[styles.emptyResetBtn, { backgroundColor: isDark ? T.glass3 : 'rgba(79,70,229,0.1)' }]} onPress={loadData}>
              <Text style={styles.emptyResetText}>{t('Retry')}</Text>
            </Pressable>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search" size={32} color={isDark ? T.textMuted : '#CBD5E1'} />
            </View>
            <Text style={styles.emptyTitle}>{t('No events found')}</Text>
            <Text style={styles.emptySub}>{t('Try adjusting your filters or date range')}</Text>
            <Pressable style={styles.emptyResetBtn} onPress={() => { setSelectedCurrency('All'); setSelectedImpacts(new Set(['high', 'medium', 'low', 'holiday'])); }}>
              <Text style={styles.emptyResetText}>{t('Reset All Filters')}</Text>
            </Pressable>
          </View>
        ) : (
          visibleSections.map((section) => (
            <View key={section.date} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <View style={styles.dayHeaderLeft}>
                  <View style={styles.dayHeaderDot} />
                  <View>
                    <Text style={styles.dayHeaderTitle}>{section.date}</Text>
                  </View>
                </View>
                <View style={styles.dayHeaderBadge}>
                  <Text style={styles.dayHeaderBadgeText}>{section.events.length} {t('events')}</Text>
                </View>
              </View>

              <View style={styles.eventsGroup}>
                {section.events.map((event, idx) => renderEvent(event, idx, section.events.length))}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 36 }} />
      </ScrollView>

      <EconomicEventFiltersSheet
        ref={eventFiltersSheetRef}
        selectedImpacts={selectedImpacts}
        onApply={applyEventFilters}
      />
      </> : <View style={styles.scroll} />}
    </Screen>
  );
});

export function EconomicCalendarScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <EconomicCalendarScreenInner isScreenFocused={deferredScreenFocused} />;
}

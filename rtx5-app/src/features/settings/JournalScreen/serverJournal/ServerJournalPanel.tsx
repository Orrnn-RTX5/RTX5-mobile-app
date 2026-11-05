import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  FlatList,
  PixelRatio,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { FastPressable as Pressable } from '../../../../ui/components/FastPressable';
import {
  JOURNAL_DEFAULT_MODE,
  JOURNAL_DEFAULT_TYPE,
  JOURNAL_MODES,
  JOURNAL_TIME_RANGES,
  JOURNAL_TYPES,
  buildJournalTsv,
  filterJournalRows,
  formatJournalCode,
  formatJournalDateTime,
  formatJournalType,
  formatLatency,
  journalRowKeys,
  journalTypeTone,
  type JournalLogEntry,
} from './journalModel';
import { useServerJournal } from './useServerJournal';
import { makeJournalPalette, type JournalPalette } from './journalPalette';

const SEARCH_DEBOUNCE_MS = 150;
const COPY_FEEDBACK_MS = 2000;
const AUTO_FOLLOW_THRESHOLD_PX = 40;
const PHONE_ROW_HEIGHT = 56;
const TABLE_ROW_HEIGHT = 32;
const TABLE_MIN_WIDTH_DP = 600;
const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

type CopyStatus = 'idle' | 'copied' | 'error';

type ServerJournalPanelProps = {
  isScreenFocused: boolean;
  isAuthenticated: boolean;
  sessionScope: string;
  isDark: boolean;
  t: (key: string) => string;
  /** Rendered above the toolbar (e.g. the session summary card). */
  header?: React.ReactNode;
  bottomInset?: number;
};

const entriesWord = (count: number, t: (key: string) => string) => t(count === 1 ? 'entry' : 'entries');

/**
 * MT5-style server journal (web terminal `JournalTab` parity): authenticated
 * server rows from GET /api/v2/journal, mobile filters, TSV sharing and
 * auto-follow. Trade and close rows are never synthesized on the phone.
 */
export const ServerJournalPanel = React.memo(function ServerJournalPanel({
  isScreenFocused,
  isAuthenticated,
  sessionScope,
  isDark,
  t,
  header,
  bottomInset = 0,
}: ServerJournalPanelProps) {
  const palette = useMemo(() => makeJournalPalette(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { width } = useWindowDimensions();
  const isTable = width >= TABLE_MIN_WIDTH_DP;
  const fontScale = Math.max(1, PixelRatio.getFontScale());
  const rowHeight = Math.round((isTable ? TABLE_ROW_HEIGHT : PHONE_ROW_HEIGHT) * fontScale);

  // Filter state: never persisted; every visit starts from the defaults.
  const [logType, setLogType] = useState<number>(JOURNAL_DEFAULT_TYPE);
  const [logMode, setLogMode] = useState<number>(JOURNAL_DEFAULT_MODE);
  const [timeRange, setTimeRange] = useState<number>(24);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [detailRow, setDetailRow] = useState<JournalLogEntry | null>(null);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const copySequenceRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<JournalLogEntry>>(null);

  const journal = useServerJournal({
    active: isScreenFocused,
    isAuthenticated,
    sessionScope,
    mode: logMode,
    type: logType,
    filter: search,
  });

  // The retained sidebar host keeps this component mounted while hidden.
  // Reset on blur so the next visit starts from the web-terminal defaults
  // without first dispatching a request for filters from the previous visit.
  useEffect(() => {
    if (isScreenFocused) return;
    copySequenceRef.current += 1;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setLogType(JOURNAL_DEFAULT_TYPE);
    setLogMode(JOURNAL_DEFAULT_MODE);
    setTimeRange(24);
    setSearchInput('');
    setSearch('');
    setAutoScroll(true);
    setShowAdvancedFilters(false);
    setCopyStatus('idle');
    setDetailRow(null);
    setIsPullRefreshing(false);
  }, [isScreenFocused]);

  // Search is debounced; while pending the filters are "settling".
  useEffect(() => {
    if (searchInput === search) return undefined;
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, searchInput]);
  const isFilterSettling = searchInput !== search;

  const filteredLogs = useMemo(() => filterJournalRows(journal.serverLogs, {
    timeRangeHours: timeRange,
    type: logType,
    mode: logMode,
    search,
    responseMatchesRequest: journal.responseMatchesRequest,
    nowMs: Date.now(),
  }), [journal.responseMatchesRequest, journal.serverLogs, logMode, logType, search, timeRange]);
  const rowKeys = useMemo(() => journalRowKeys(filteredLogs), [filteredLogs]);
  const keyByRow = useMemo(() => {
    const map = new Map<JournalLogEntry, string>();
    filteredLogs.forEach((row, index) => map.set(row, rowKeys[index]));
    return map;
  }, [filteredLogs, rowKeys]);

  const ownsCurrentRequest = journal.scopeHasLoaded && journal.responseMatchesRequest && !isFilterSettling;
  const scopeFetchError = isFilterSettling ? null : journal.scopeFetchError;
  const busy = isFilterSettling || journal.isLoading || journal.isRefreshing;
  const canCopy = ownsCurrentRequest && filteredLogs.length > 0;
  const canRefresh = isAuthenticated && !isFilterSettling && !journal.isLoading && !journal.isRefreshing;

  // Copy feedback resets whenever what would be copied changes.
  useEffect(() => {
    copySequenceRef.current += 1;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopyStatus('idle');
  }, [logMode, logType, search, searchInput, sessionScope, timeRange]);
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    if (!journal.isRefreshing) setIsPullRefreshing(false);
  }, [journal.isRefreshing]);

  // The WebTerminal keeps the server's chronological order and follows the
  // newest row at the bottom.
  useEffect(() => {
    if (autoScroll && filteredLogs.length > 0) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, [autoScroll, filteredLogs]);

  useEffect(() => {
    if (!isScreenFocused || !detailRow) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetailRow(null);
      return true;
    });
    return () => subscription.remove();
  }, [detailRow, isScreenFocused]);

  useEffect(() => {
    if (!isScreenFocused) setDetailRow(null);
  }, [isScreenFocused]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const nearBottom = distanceFromBottom < AUTO_FOLLOW_THRESHOLD_PX;
    setAutoScroll((current) => (current === nearBottom ? current : nearBottom));
  }, []);

  const handleCopy = useCallback(() => {
    if (!canCopy) return;
    const sequence = ++copySequenceRef.current;
    const count = filteredLogs.length;
    const finish = (status: CopyStatus) => {
      if (sequence !== copySequenceRef.current) return;
      setCopyStatus(status);
      AccessibilityInfo.announceForAccessibility(status === 'copied'
        ? `${count} ${t('filtered journal')} ${entriesWord(count, t)} ${t('copied')}`
        : t('Unable to copy the filtered journal'));
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        if (sequence === copySequenceRef.current) setCopyStatus('idle');
      }, COPY_FEEDBACK_MS);
    };
    // The installed production binaries ship no clipboard native module, so
    // the TSV goes through the core Share sheet, which offers Copy on both
    // platforms. A dismissed sheet is not a failure.
    Share.share({ message: buildJournalTsv(filteredLogs) })
      .then((result) => {
        if (result.action === Share.dismissedAction) {
          if (sequence === copySequenceRef.current) setCopyStatus('idle');
          return;
        }
        finish('copied');
      })
      .catch(() => finish('error'));
  }, [canCopy, filteredLogs, t]);

  const handlePullRefresh = useCallback(() => {
    if (!canRefresh) return;
    setIsPullRefreshing(true);
    journal.manualRefresh();
  }, [canRefresh, journal]);

  const renderRow = useCallback(({ item }: { item: JournalLogEntry }) => {
    const tone = journalTypeTone(item);
    const toneColor = tone === 'strong' ? palette.typeStrong : tone === 'faint' ? palette.typeFaint : palette.typeMuted;
    const isError = item.code !== 0;
    const code = formatJournalCode(item);
    const type = formatJournalType(item).toUpperCase();
    if (isTable) {
      return (
        <Pressable
          style={({ pressed }) => [styles.tableRow, { height: rowHeight }, pressed && styles.rowPressed]}
          onPress={() => setDetailRow(item)}
          latencyLabel="journal.row.detail"
          accessibilityRole="button"
        >
          <Text numberOfLines={1} style={[styles.cell, styles.colTime]}>{formatJournalDateTime(item.datetime)}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.colCode, isError && styles.errorText]}>{code}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.colType, { color: toneColor }]}>{type}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.colSource]}>{item.source}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.colLatency]}>{formatLatency(item.latency_ms)}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.colMessage, { color: toneColor }]}>{item.message}</Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [styles.phoneRow, { height: rowHeight }, pressed && styles.rowPressed]}
        onPress={() => setDetailRow(item)}
        latencyLabel="journal.row.detail"
        accessibilityRole="button"
      >
        <View style={styles.phoneLine}>
          <Text numberOfLines={1} style={styles.cell}>{formatJournalDateTime(item.datetime)}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.phoneCode, isError && styles.errorText]}>{code}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.phoneType, { color: toneColor }]}>{type}</Text>
          <Text numberOfLines={1} style={[styles.cell, styles.phoneLatency]}>{formatLatency(item.latency_ms)}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.cell, styles.phoneMessage]}>
          <Text style={styles.sourceText}>{item.source}</Text>
          <Text style={{ color: toneColor }}>{` · ${item.message}`}</Text>
        </Text>
      </Pressable>
    );
  }, [isTable, palette, rowHeight, styles]);

  const getItemLayout = useCallback((_: ArrayLike<JournalLogEntry> | null | undefined, index: number) => ({
    length: rowHeight,
    offset: rowHeight * index,
    index,
  }), [rowHeight]);

  const keyExtractor = useCallback(
    (item: JournalLogEntry, index: number) => keyByRow.get(item) ?? String(index),
    [keyByRow],
  );

  const recordsLabel = `${filteredLogs.length} ${t('records')}`;
  const refreshLabel = journal.isLoading ? t('Loading…') : journal.isRefreshing ? t('Refreshing…') : t('Refresh');
  const copyLabel = copyStatus === 'copied' ? t('Copied') : copyStatus === 'error' ? t('Failed') : t('Copy');

  const toolbar = (
    <View style={styles.toolbar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.chipRow}
      >
        {JOURNAL_TIME_RANGES.map((range) => {
          const selected = range.hours === timeRange;
          return (
            <Pressable
              key={range.label}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setTimeRange(range.hours)}
              latencyLabel={`journal.range.${range.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{t(range.label)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.actionRow}>
        <Text style={styles.recordsText}>{recordsLabel}</Text>
        <Pressable
          style={[
            styles.toolButton,
            copyStatus === 'copied' && styles.copyCopied,
            copyStatus === 'error' && styles.copyFailed,
            !canCopy && styles.disabled,
          ]}
          onPress={handleCopy}
          disabled={!canCopy}
          latencyLabel="journal.copy"
          accessibilityRole="button"
          accessibilityLabel={t('Copy filtered journal')}
          accessibilityHint={`${t('Copy')} ${filteredLogs.length} ${t('filtered journal')} ${entriesWord(filteredLogs.length, t)}`}
        >
          <Ionicons
            name={copyStatus === 'copied' ? 'checkmark' : 'copy-outline'}
            size={13}
            color={copyStatus === 'copied' ? palette.copiedText : copyStatus === 'error' ? palette.errorText : palette.toolText}
          />
          <Text style={[
            styles.toolText,
            copyStatus === 'copied' && { color: palette.copiedText },
            copyStatus === 'error' && { color: palette.errorText },
          ]}>
            {copyLabel}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toolButton, showAdvancedFilters && styles.toolButtonOn]}
          onPress={() => setShowAdvancedFilters((open) => !open)}
          latencyLabel="journal.filters"
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvancedFilters }}
        >
          <Ionicons name="options-outline" size={13} color={palette.toolText} />
          <Text style={styles.toolText}>{t('Filters')}</Text>
        </Pressable>
        <Pressable
          style={[styles.refreshButton, !canRefresh && styles.refreshDisabled]}
          onPress={journal.manualRefresh}
          disabled={!canRefresh}
          latencyLabel="journal.refresh"
          accessibilityRole="button"
          accessibilityLabel={t('Refresh journal')}
          accessibilityHint={refreshLabel}
        >
          {journal.isLoading || journal.isRefreshing
            ? <ActivityIndicator size="small" color={palette.refreshText} />
            : <Ionicons name="refresh" size={15} color={palette.refreshText} />}
        </Pressable>
      </View>

      {showAdvancedFilters ? (
        <View style={styles.filterPanel}>
          <Text style={styles.fieldLabel}>{t('Type').toUpperCase()}</Text>
          <View style={styles.optionWrap} accessibilityLabel={t('Journal type')}>
            {JOURNAL_TYPES.map((option) => {
              const selected = option.value === logType;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.option, selected && styles.chipActive]}
                  onPress={() => setLogType(option.value)}
                  latencyLabel={`journal.type.${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{t(option.label)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>{t('Mode').toUpperCase()}</Text>
          <View style={styles.optionWrap} accessibilityLabel={t('Journal mode')}>
            {JOURNAL_MODES.map((option) => {
              const selected = option.value === logMode;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.option, selected && styles.chipActive]}
                  onPress={() => setLogMode(option.value)}
                  latencyLabel={`journal.mode.${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{t(option.label)}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color={palette.fieldLabel} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder={t('Filter messages…')}
              placeholderTextColor={palette.fieldLabel}
              accessibilityLabel={t('Filter journal messages')}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
          <View style={styles.autoRow}>
            <Pressable
              style={[styles.toolButton, autoScroll ? styles.autoOn : styles.autoOff]}
              onPress={() => setAutoScroll((current) => !current)}
              latencyLabel="journal.autoFollow"
              accessibilityRole="button"
              accessibilityState={{ selected: autoScroll }}
              accessibilityHint={t('Toggle auto-follow newest entries')}
            >
              <Text style={[styles.toolText, { color: autoScroll ? palette.autoOnText : palette.autoOffText }]}>
                {t('↓ Auto')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {isAuthenticated && journal.scopeHasLoaded && scopeFetchError ? (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerText}>{t('Refresh failed. Showing the latest response for this account.')}</Text>
          <Pressable onPress={journal.manualRefresh} latencyLabel="journal.banner.retry" accessibilityRole="button">
            <Text style={[styles.bannerText, styles.underline]}>{t('Retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {isTable && isAuthenticated && journal.scopeHasLoaded && filteredLogs.length > 0 ? (
        <View style={styles.tableHead}>
          {[
            ['Time', styles.colTime],
            ['Code', styles.colCode],
            ['Type', styles.colType],
            ['Source', styles.colSource],
            ['Latency', styles.colLatency],
            ['Message', styles.colMessage],
          ].map(([label, style]) => (
            <Text key={label as string} numberOfLines={1} style={[styles.headCell, style as object]}>
              {t(label as string).toUpperCase()}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (!isAuthenticated) {
    body = <Text style={styles.centerText}>{t('Sign in to view the server journal')}</Text>;
  } else if (!journal.scopeHasLoaded && (journal.isLoading || !scopeFetchError)) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={palette.loadingText} />
        <Text style={styles.centerText}>{t('Loading server journal…')}</Text>
      </View>
    );
  } else if (!journal.scopeHasLoaded && scopeFetchError) {
    body = (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.coldErrorTitle}>{t('Unable to load the server journal')}</Text>
        <Text style={styles.coldErrorDetail}>{scopeFetchError}</Text>
        <Pressable style={styles.retryButton} onPress={journal.manualRefresh} latencyLabel="journal.retry" accessibilityRole="button">
          <Text style={styles.retryText}>{t('Retry')}</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <FlatList
        ref={listRef}
        data={filteredLogs}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialNumToRender={20}
        maxToRenderPerBatch={16}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('No journal entries for the selected filters')}</Text>}
        refreshControl={(
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handlePullRefresh}
            tintColor={palette.loadingText}
            colors={[palette.chipActiveBg]}
          />
        )}
      />
    );
  }

  return (
    <View style={styles.root} accessibilityState={{ busy }}>
      {header}
      {toolbar}
      <View style={styles.body}>{body}</View>
      {detailRow ? (
        <JournalRowDetail row={detailRow} onClose={() => setDetailRow(null)} styles={styles} t={t} bottomInset={bottomInset} />
      ) : null}
    </View>
  );
});

function JournalRowDetail({
  row,
  onClose,
  styles,
  t,
  bottomInset,
}: {
  row: JournalLogEntry;
  onClose: () => void;
  styles: ReturnType<typeof makeStyles>;
  t: (key: string) => string;
  bottomInset: number;
}) {
  const fields: Array<[string, string | undefined]> = [
    ['Time', formatJournalDateTime(row.datetime)],
    ['Code', formatJournalCode(row)],
    ['Type', formatJournalType(row)],
    ['Source', row.source],
    ['Latency', formatLatency(row.latency_ms)],
    ['client_order_id', row.client_order_id === undefined ? undefined : String(row.client_order_id)],
    ['request_id', row.request_id === undefined ? undefined : String(row.request_id)],
    ['order_ticket', row.order_ticket === undefined ? undefined : String(row.order_ticket)],
    ['position_ticket', row.position_ticket === undefined ? undefined : String(row.position_ticket)],
  ];
  return (
    <View style={styles.detailOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} latencyLabel="journal.detail.backdrop" activateOnPressIn />
      <ScrollView
        style={styles.detailSheet}
        contentContainerStyle={[styles.detailSheetContent, { paddingBottom: bottomInset + 16 }]}
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
      >
        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>{t('Journal')}</Text>
          <Pressable onPress={onClose} latencyLabel="journal.detail.close" activateOnPressIn accessibilityRole="button" accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={20} color={styles.detailTitle.color} />
          </Pressable>
        </View>
        {fields.filter(([, value]) => value !== undefined).map(([label, value]) => (
          <View key={label} style={styles.detailField}>
            <Text style={styles.detailLabel}>{label.includes('_') ? label : t(label)}</Text>
            <Text selectable style={styles.detailValue}>{value}</Text>
          </View>
        ))}
        <Text style={styles.detailLabel}>{t('Message')}</Text>
        <Text selectable style={styles.detailMessage}>{row.message}</Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(p: JournalPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    body: { flex: 1 },
    toolbar: { backgroundColor: p.toolbarBg, borderBottomWidth: 1, borderBottomColor: p.toolbarBorder },
    chipRow: { gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
    chip: { paddingHorizontal: 10, height: 28, borderRadius: 4, justifyContent: 'center' },
    chipActive: { backgroundColor: p.chipActiveBg },
    chipText: { color: p.chipText, fontSize: 12, fontWeight: '600' },
    chipTextActive: { color: p.chipActiveText },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
    recordsText: { flex: 1, color: p.fieldLabel, fontSize: 12, fontVariant: ['tabular-nums'] },
    toolButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 28,
      paddingHorizontal: 9,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: p.toolBorder,
    },
    toolButtonOn: { borderColor: p.autoOnBorder },
    toolText: { color: p.toolText, fontSize: 12, fontWeight: '600' },
    copyCopied: { borderColor: p.copiedBorder },
    copyFailed: { borderColor: p.failedBorder },
    disabled: { opacity: 0.4 },
    refreshButton: {
      width: 32,
      height: 28,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.refreshBg,
    },
    refreshDisabled: { opacity: 0.5 },
    filterPanel: { paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
    fieldLabel: { color: p.fieldLabel, fontSize: 12, fontWeight: '500', marginTop: 2 },
    optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    option: {
      paddingHorizontal: 9,
      height: 28,
      borderRadius: 4,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: p.inputBorder,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 34,
      paddingHorizontal: 8,
      marginTop: 4,
      borderRadius: 2,
      borderWidth: 1,
      borderColor: p.inputBorder,
      backgroundColor: p.inputBg,
    },
    searchInput: { flex: 1, color: p.inputText, fontSize: 13, paddingVertical: 0 },
    autoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
    autoOn: { borderColor: p.autoOnBorder, backgroundColor: p.autoOnBg },
    autoOff: { borderColor: p.toolBorder },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: p.bannerBg,
      borderTopWidth: 1,
      borderTopColor: p.bannerBorder,
    },
    bannerText: { color: p.bannerText, fontSize: 12, flexShrink: 1 },
    underline: { textDecorationLine: 'underline', fontWeight: '600' },
    tableHead: {
      flexDirection: 'row',
      paddingHorizontal: 8,
      paddingVertical: 7,
      backgroundColor: p.headBg,
      borderTopWidth: 1,
      borderTopColor: p.toolbarBorder,
    },
    headCell: { color: p.headText, fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 },
    cell: { color: p.rowText, fontSize: 13, lineHeight: 19.5, fontFamily: MONO_FONT, fontVariant: ['tabular-nums'] },
    colTime: { width: 144, textAlign: 'center' },
    colCode: { width: 64, textAlign: 'center', paddingHorizontal: 4 },
    colType: { width: 80, textAlign: 'center', paddingHorizontal: 4 },
    colSource: { width: 112, textAlign: 'center', paddingHorizontal: 4 },
    colLatency: { width: 96, textAlign: 'center', paddingHorizontal: 4 },
    colMessage: { flex: 1, textAlign: 'left', paddingHorizontal: 6 },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.divider,
      backgroundColor: p.bg,
    },
    phoneRow: {
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.divider,
      backgroundColor: p.bg,
    },
    rowPressed: { backgroundColor: p.rowPressed },
    phoneLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    phoneCode: { minWidth: 28 },
    phoneType: { flexShrink: 1 },
    phoneLatency: { marginLeft: 'auto' },
    phoneMessage: { marginTop: 1 },
    sourceText: { color: p.sourceText },
    errorText: { color: p.errorText },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
    centerText: { color: p.loadingText, fontSize: 12, textAlign: 'center', padding: 24 },
    coldErrorTitle: { color: p.errorText, fontSize: 13, fontWeight: '600', textAlign: 'center' },
    coldErrorDetail: { color: p.loadingText, fontSize: 12, textAlign: 'center' },
    retryButton: { marginTop: 4, paddingHorizontal: 14, height: 30, borderRadius: 4, justifyContent: 'center', backgroundColor: p.retryBg },
    retryText: { color: p.retryText, fontSize: 12, fontWeight: '600' },
    emptyText: { color: p.emptyText, fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: 24 },
    detailOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    detailSheet: {
      backgroundColor: p.toolbarBg,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      maxHeight: '80%',
    },
    detailSheetContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 6,
    },
    detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    detailTitle: { color: p.rowText, fontSize: 15, fontWeight: '700' },
    detailField: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    detailLabel: { color: p.fieldLabel, fontSize: 12, fontWeight: '500' },
    detailValue: { color: p.rowText, fontSize: 12, fontFamily: MONO_FONT, flexShrink: 1, textAlign: 'right' },
    detailMessage: { color: p.rowText, fontSize: 13, lineHeight: 19, fontFamily: MONO_FONT },
  });
}

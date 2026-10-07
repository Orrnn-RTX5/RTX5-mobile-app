import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: CloseByScreen
 *
 * Safe fallback for the legacy Close By route. The active strict close API has
 * no documented atomic pair-close contract, so this screen never submits.
 */

import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/shallow';
import { usePositionsState } from '../../state/positionsState';
import { useIsDarkTheme } from '../../state/themeMode';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { useTranslation } from '../../i18n/useTranslation';
import { findPositionById, positionPairCandidates } from './tradeFlow';
import { resolveLivePositionPnl, resolveLivePositionPrice } from './livePositionMetrics';
import { hideTradePositionActionHost } from './tradePositionActionHostController';
import { useExecutableQuote } from '../quotes/useExecutableQuote';

const CANVAS_DARK = '#121212';
const CARD_DARK = '#1E1E1E';
const DIVIDER_DARK = 'rgba(255,255,255,0.06)';
const CLOSE_BY_UNAVAILABLE_MESSAGE =
  'Close By is unavailable for this API contract. Close each position individually.';

type RetainedCloseByPositionState = Pick<
  ReturnType<typeof usePositionsState.getState>,
  'positions' | 'positionSnapshots'
>;

export type CloseByScreenProps = Readonly<{
  hosted?: boolean;
  hostedActive?: boolean;
  hostedPositionId?: string | null;
  onHostedBack?: () => void;
}>;

export function CloseByScreen({
  hosted = false,
  hostedActive = true,
  hostedPositionId = null,
  onHostedBack,
}: CloseByScreenProps = {}) {
  const params = useLocalSearchParams<{ positionId?: string }>();
  const positionId = hosted
    ? (hostedPositionId ?? undefined)
    : (Array.isArray(params.positionId) ? params.positionId[0] : params.positionId);
  const isDark = useIsDarkTheme();
  const routeFocused = useIsFocused();
  const isScreenFocused = hosted ? hostedActive : routeFocused;
  const themeActive = isScreenFocused;
  const T = useTheme({ active: themeActive });
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const insets = useSafeAreaInsets();
  const screenBg = isDark ? CANVAS_DARK : T.bg;

  const retainedPositionStateRef = useRef<RetainedCloseByPositionState | null>(null);
  if (retainedPositionStateRef.current === null) {
    const initialPositionState = usePositionsState.getState();
    retainedPositionStateRef.current = {
      positions: initialPositionState.positions,
      positionSnapshots: initialPositionState.positionSnapshots,
    };
  }
  const positionState = usePositionsState(
    useShallow((state): RetainedCloseByPositionState => (
      isScreenFocused
        ? { positions: state.positions, positionSnapshots: state.positionSnapshots }
        : retainedPositionStateRef.current as RetainedCloseByPositionState
    )),
  );
  if (isScreenFocused) {
    retainedPositionStateRef.current = positionState;
  }
  const positions = positionState.positions;
  const primedPosition = positionId
    ? positionState.positionSnapshots[Array.isArray(positionId) ? positionId[0] : positionId]
    : undefined;
  const resolvedLogin = resolveTradingLoginString();

  const sourcePosition = useMemo(
    () => findPositionById(positions, positionId) ?? primedPosition,
    [positions, positionId, primedPosition]
  );
  const candidates = useMemo(
    () => positionPairCandidates(positions, sourcePosition),
    [positions, sourcePosition]
  );
  const { quote: executableQuote } = useExecutableQuote(
    sourcePosition?.symbol ?? '',
    themeActive && Boolean(sourcePosition?.symbol),
  );

  const getLivePrice = (position: typeof sourcePosition) => {
    if (!position) return 0;
    return resolveLivePositionPrice(position, executableQuote);
  };
  const getLivePnl = (position: typeof sourcePosition) => {
    if (!position) return 0;
    return resolveLivePositionPnl(position, executableQuote);
  };

  const [selectedPairId, setSelectedPairId] = useState<string>('');

  useEffect(() => {
    if (isScreenFocused && !sourcePosition && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [isScreenFocused, resolvedLogin, sourcePosition]);

  const activePairId = selectedPairId || candidates[0]?.id || '';

  const leaveScreen = useCallback(() => {
    if (hosted) {
      if (onHostedBack) {
        onHostedBack();
      } else {
        hideTradePositionActionHost();
      }
      return;
    }
    safeRouterBack(router, '/(tabs)/trade');
  }, [hosted, onHostedBack]);

  if (!isScreenFocused) {
    return <View style={[styles.root, { backgroundColor: screenBg }]} />;
  }

  const header = (
    <>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable
          onPress={leaveScreen}
          hitSlop={16}
          style={styles.headerBtn}
          activateOnPressIn
          latencyLabel="closeBy.back"
          unstable_pressDelay={0}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitleText, { color: T.text }]}>{t('Close By')}</Text>
        <View style={styles.headerBtn} />
      </View>
    </>
  );

  if (!sourcePosition) {
    return (
      <View style={[styles.root, { backgroundColor: screenBg, paddingLeft: insets.left, paddingRight: insets.right }]}>
        {header}
        <View style={[styles.statusBox, styles.statusBoxError]}>
          <Text style={[styles.statusText, styles.statusTextError]}>
            {t(CLOSE_BY_UNAVAILABLE_MESSAGE)}
          </Text>
        </View>
      </View>
    );
  }

  const sourceIsBuy = sourcePosition.side === 'buy';
  const sourcePnl = getLivePnl(sourcePosition);

  return (
    <View style={[styles.root, { backgroundColor: screenBg, paddingLeft: insets.left, paddingRight: insets.right }]}>
      {header}
      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <Text style={styles.subTitle}>{t('Select a matching position to pair-close.')}</Text>

        <Text style={styles.sectionLabel}>{t('Source Position')}</Text>
        <View style={styles.sourceCard}>
          <View style={styles.rowTop}>
            <Text style={styles.ticket}>#{sourcePosition.id}</Text>
            <Text style={[styles.pnl, sourcePnl < 0 ? styles.negative : sourcePnl > 0 ? styles.positive : null]}>
              {fmt.pnl(sourcePnl)}
            </Text>
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.symbol}>{sourcePosition.symbol.replace(/\//g, '')}</Text>
            <View style={[styles.sideChip, sourceIsBuy ? styles.sideChipBuy : styles.sideChipSell]}>
              <Text style={[styles.sideChipText, sourceIsBuy ? styles.sideTextBuy : styles.sideTextSell]}>
                {sourcePosition.side.toUpperCase()} {(sourcePosition.volume || 0).toFixed(2)}
              </Text>
            </View>
          </View>
          <Text style={styles.priceLine}>
            {t('Price')} · {fmt.price(getLivePrice(sourcePosition))}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>{t('Opposite positions')}</Text>
        <View style={styles.candidateList}>
          {candidates.map((candidate) => {
            const selected = activePairId === candidate.id;
            const candIsBuy = candidate.side === 'buy';
            const candPnl = getLivePnl(candidate);
            return (
              <Pressable
                key={candidate.id}
                style={[styles.pairCard, selected && styles.pairCardSelected]}
                onPress={() => setSelectedPairId(candidate.id)}
                activateOnPressIn
                latencyLabel={`closeBy.select.${candidate.id}`}
                unstable_pressDelay={0}
              >
                <View style={styles.pairLeft}>
                  <View style={styles.rowTop}>
                    <Text style={styles.ticket}>#{candidate.id}</Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={18} color={T.accent} />
                    ) : (
                      <View style={styles.radioIdle} />
                    )}
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.symbol}>{candidate.symbol.replace(/\//g, '')}</Text>
                    <View style={[styles.sideChip, candIsBuy ? styles.sideChipBuy : styles.sideChipSell]}>
                      <Text style={[styles.sideChipText, candIsBuy ? styles.sideTextBuy : styles.sideTextSell]}>
                        {candidate.side.toUpperCase()} {(candidate.volume || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.priceLine}>
                    {t('Price')} · {fmt.price(getLivePrice(candidate))}
                  </Text>
                </View>
                <Text style={[styles.pnl, candPnl < 0 ? styles.negative : candPnl > 0 ? styles.positive : null]}>
                  {fmt.pnl(candPnl)}
                </Text>
              </Pressable>
            );
          })}
          {candidates.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="swap-horizontal-outline" size={28} color={T.textMuted} />
              <Text style={styles.emptyText}>{t('No matching positions available for close-by.')}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.statusBox, styles.statusBoxError]}>
          <Text style={[styles.statusText, styles.statusTextError]}>
            {t(CLOSE_BY_UNAVAILABLE_MESSAGE)}
          </Text>
        </View>

        <Pressable
          style={[styles.submitButton, styles.submitDisabled]}
          disabled
          activateOnPressIn
          latencyLabel="closeBy.submit"
          unstable_pressDelay={0}
        >
          <Text style={styles.submitText}>{t('Send Close By Request')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark = false) => StyleSheet.create({
  root: { flex: 1 },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? DIVIDER_DARK : T.borderSubtle,
  },
  headerBtn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitleText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.15,
  },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 12 },
  subTitle: {
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: spacing.md,
  },
  sectionLabel: {
    marginHorizontal: spacing.md,
    marginBottom: 8,
    color: T.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sourceCard: {
    marginHorizontal: spacing.md,
    marginBottom: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: isDark ? CARD_DARK : T.glass2,
    borderWidth: 1,
    borderColor: isDark ? DIVIDER_DARK : T.borderMedium,
  },
  candidateList: {
    paddingHorizontal: spacing.md,
    gap: 10,
  },
  pairCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: isDark ? CARD_DARK : T.glass2,
    borderWidth: 1,
    borderColor: isDark ? DIVIDER_DARK : T.borderMedium,
  },
  pairCardSelected: {
    borderColor: T.accent,
    backgroundColor: isDark ? 'rgba(52,125,255,0.10)' : T.accentGlow,
  },
  pairLeft: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ticket: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  symbol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sideChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sideChipBuy: { backgroundColor: 'rgba(37,99,235,0.12)' },
  sideChipSell: { backgroundColor: 'rgba(220,38,38,0.12)' },
  sideChipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  sideTextBuy: { color: T.trading.buy.primary },
  sideTextSell: { color: T.trading.sell.primary },
  priceLine: {
    marginTop: 6,
    color: T.textSub,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  pnl: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: T.text,
  },
  positive: { color: T.trading.profit },
  negative: { color: T.trading.loss },
  radioIdle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.2)' : T.borderMedium,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? DIVIDER_DARK : T.borderSubtle,
    backgroundColor: isDark ? CARD_DARK : T.glass1,
    gap: 10,
  },
  emptyText: {
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  statusBox: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  statusBoxSuccess: {
    borderColor: `${T.trading.profit}55`,
    backgroundColor: T.upGlow,
  },
  statusBoxError: {
    borderColor: isDark ? 'rgba(239,68,68,0.34)' : 'rgba(220,38,38,0.24)',
    backgroundColor: T.downGlow,
  },
  statusText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  statusTextSuccess: { color: T.trading.profit },
  statusTextError: { color: T.trading.loss },
  submitButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderRadius: 14,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  submitDisabled: { opacity: 0.45 },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

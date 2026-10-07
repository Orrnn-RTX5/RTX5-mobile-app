/**
 * Summary header for the Trade screen.
 *
 * Split in two so only the Floating Profit/Loss hero stays pinned: `TradeSummaryHeader`
 * renders that hero and owns the screen's single live-account subscription, while
 * `TradeSummaryDetailsHeader` renders the balance/equity/margin breakdown and the
 * Positions section header from inside the positions FlatList header, so they scroll
 * away under the hero the same way the History screen's summary details do.
 * Memoized so neither half re-renders on every position-row tick.
 */
import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useShallow } from 'zustand/shallow';
import { useTranslation } from '../../../i18n/useTranslation';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useLiveAccountState } from '../../../state/liveAccountState';
import { useTradingState } from '../../../state/tradingState';
import { useUserPreferences } from '../../../state/userPreferences';
import { fmt } from '../../../utils/format';
import { FastPressable } from '../../../ui/components/FastPressable';
import { useLiveSymbolQuotes } from '../../../query/websocket';
import { buildTradeAccountSummary, resolveRenderableTradeAccountSummary, resolveTradeFloatingPnl } from '../accountSummary';
import type { TradeAccountSummary } from '../accountSummary';
import type { ThemeColors } from '../../../ui/theme/glass';
import type { TradeScreenStyles } from './styles';
import type { AccountSummary as ApiAccountSummary } from '../../../api/account';
import { formatMarginLevel } from '../../../api/account';

const EMPTY_TRADE_LIVE_ACCOUNT = Object.freeze({
  balance: 0,
  floating: 0,
  equity: 0,
  margin: 0,
  margin_free: 0,
  margin_level: 0,
});

const EMPTY_TRADE_ACCOUNT_SUMMARY: TradeAccountSummary = resolveRenderableTradeAccountSummary(
  buildTradeAccountSummary(EMPTY_TRADE_LIVE_ACCOUNT, null),
  0,
);

/**
 * One live-account subscription feeds both halves of the Trade summary. The pinned
 * Floating P/L hero and the scrolling details card sit in different parts of the
 * tree, but `useTradeLiveAccountSummary` attaches a per-symbol websocket tick
 * listener and commits a coalesced snapshot every frame — calling it a second time
 * on this screen would double that JS-thread work. `TradeSummaryHeader` owns the
 * single call and publishes the result here.
 */
const TradeAccountSummaryContext = React.createContext<TradeAccountSummary>(EMPTY_TRADE_ACCOUNT_SUMMARY);

function SummaryMetricRow({ label, currency, value, s, T }: { label: string; currency?: string; value: string; s: TradeScreenStyles; T: ThemeColors }) {
  return (
    <View style={s.summaryMetricRow}>
      <Text style={[s.summaryMetricLabel, { color: T.textMuted }]}>
        {label}
        {currency ? <Text style={[s.summaryMetricCurrency, { color: T.textFaint }]}> ({currency})</Text> : null}
      </Text>
      <View style={s.summaryMetricLeader} />
      <Text style={[s.summaryMetricValue, { color: T.text }]}>{value}</Text>
    </View>
  );
}

const LiveUnrealizedPnLHeader = React.memo(({ account, s, T, isDark, detailsVisible, hasOpenPositions, onToggleDetails }: { account: TradeAccountSummary; s: TradeScreenStyles; T: ThemeColors; isDark: boolean; detailsVisible: boolean; hasOpenPositions: boolean; onToggleDetails: () => void }) => {
  const { t } = useTranslation();
  const safeFloating = Number.isFinite(account.floating) ? account.floating : 0;
  const accountCurrency = account.currency || 'USD';

  return (
    <View
      style={[
        s.summaryBlock,
        detailsVisible && s.summaryBlockFused,
        {
          borderLeftWidth: 1,
          borderLeftColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
        },
      ]}
    >
      <FastPressable
        onPress={onToggleDetails}
        latencyLabel="trade.summary.toggle"
        accessibilityRole="button"
        accessibilityLabel="Toggle account summary details"
        accessibilityState={{ expanded: detailsVisible }}
        style={[
          s.summaryTop,
          detailsVisible && {
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
          },
        ]}
      >
        {/* The Hero: Floating P/L is the only pinned part of the Trade summary —
            every account detail row scrolls away with the positions list. */}
        <View style={s.summaryHeadlineRow}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76} style={[s.summaryHeadlineLabel, { color: T.textSub }]}>
            {t('Floating Profit/Loss')}
          </Text>
          <View style={s.summaryHeadlineRight}>
            {/* With nothing open there is no floating P/L yet — leave the readout
                blank rather than advertising a settled 0.00. */}
            {hasOpenPositions ? (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[s.summaryHeadlineValue, { color: safeFloating >= 0 ? T.up : T.down }]}>
                {fmt.pnlPrecise(safeFloating)} {accountCurrency}
              </Text>
            ) : null}
          </View>
        </View>
      </FastPressable>
    </View>
  );
});

/**
 * Scrolling half of the Trade summary: the account breakdown card plus the
 * Positions section header. Rendered as the positions FlatList header so it slides
 * under the pinned Floating P/L card, the same way the History screen's summary
 * details slide under its pinned Balance header.
 */
export const TradeSummaryDetailsHeader = React.memo(({ positions, s, T, isDark, totalVolume, onBulkPress, scrollSummary = false }: { positions: PositionItem[]; s: TradeScreenStyles; T: ThemeColors; isDark: boolean; totalVolume: number; onBulkPress: () => void; scrollSummary?: boolean }) => {
  const { t } = useTranslation();
  const account = React.useContext(TradeAccountSummaryContext);
  const detailsVisible = useUserPreferences((state) => state.tradeSummaryDetailsVisible);
  const safeBalance = Number.isFinite(account.balance) ? account.balance : 0;
  const safeEquity = Number.isFinite(account.equity) ? account.equity : 0;
  const safeMargin = Number.isFinite(account.margin) ? account.margin : 0;
  const safeFreeMargin = Number.isFinite(account.freeMargin) ? account.freeMargin : 0;
  const safeMarginLevel = Number.isFinite(account.marginLevel) ? account.marginLevel : 0;
  const accountCurrency = account.currency || 'USD';

  const totalSwap = useMemo(() => {
    return positions.reduce((sum: number, pos: any) => sum + (Number.isFinite(pos.swap) ? pos.swap : 0), 0);
  }, [positions]);

  return (
    <>
      {scrollSummary ? <TradeFloatingSummaryHeader positions={positions} s={s} T={T} isDark={isDark} /> : null}
      {detailsVisible ? (
        <View
          style={[
            s.summaryDetailsCard,
            scrollSummary && s.summaryDetailsCardScrolling,
            {
              borderLeftWidth: 1,
              borderLeftColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
            },
          ]}
        >
          <View style={s.summaryMetrics}>
            {/* Keep Floating P/L as the pinned headline; equity belongs in the account breakdown. */}
            <SummaryMetricRow label={t('Balance')} currency={accountCurrency} value={fmt.decimal(safeBalance)} s={s} T={T} />
            <SummaryMetricRow label={t('Equity')} value={fmt.decimal(safeEquity)} s={s} T={T} />
            <SummaryMetricRow label={t('Margin')} value={fmt.decimal(safeMargin)} s={s} T={T} />
            <SummaryMetricRow label={t('Free Margin')} value={fmt.decimal(safeFreeMargin)} s={s} T={T} />
            <SummaryMetricRow label={t('Margin Level')} value={formatMarginLevel(safeMarginLevel, fmt.decimal)} s={s} T={T} />
            <SummaryMetricRow label={t('Swap')} value={fmt.pnl(totalSwap)} s={s} T={T} />

            {account.credit > 0 ? <SummaryMetricRow label={t('Credit')} value={fmt.decimal(Number.isFinite(account.credit) ? account.credit : 0)} s={s} T={T} /> : null}
          </View>
        </View>
      ) : null}

      <View style={[s.positionsHeader, { borderBottomColor: T.border }]}>
        <View style={s.positionsHeaderLeft}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.positionsTitleRow}>
              <Text style={[s.positionsTitle, { color: T.text }]}>{t('Positions')}</Text>
            </View>
            <Text style={[s.positionsMeta, { color: T.textMuted }]}>
              {positions.length} {t('open')} • {(totalVolume || 0).toFixed(2)} {t('lots')}
            </Text>
          </View>
        </View>
        <FastPressable latencyLabel="trade.bulk.open" onPress={onBulkPress} activateOnPressIn activateOnTouchStart unstable_pressDelay={0} style={({ pressed }) => [s.bulkButton, { borderColor: T.border, backgroundColor: T.glass1 }, pressed && { backgroundColor: T.glass3 }]}>
          <Text style={[s.bulkButtonText, { color: T.textMuted }]}>{t('Bulk')}</Text>
        </FastPressable>
      </View>
    </>
  );
});

/**
 * Live account summary shared by the Trade summary block and the Trade
 * menubar floating-P/L readout. Subscriptions stay gated by `active` so a
 * retained offscreen Trade tab keeps its last values without observing the
 * high-frequency account stores.
 */
export const useTradeLiveAccountSummary = ({
  positions,
  hydratedLogin,
  resolvedLogin,
  active,
  restAccountSummary,
  quoteCommitIntervalMs = 0,
}: {
  positions: PositionItem[];
  hydratedLogin: string | null;
  resolvedLogin: number | undefined;
  active: boolean;
  restAccountSummary?: ApiAccountSummary;
  /** Live-quote commit throttle; the always-mounted tab-bar badge slows this down. */
  quoteCommitIntervalMs?: number;
}) => {
  // The Trade tab is retained offscreen. Keep its last rendered account values,
  // but stop observing high-frequency account stores while another tab owns the
  // screen. Those hidden summary renders were saturating the JS thread and could
  // delay the real Chart/Trade navigation callback for minutes.
  const selectedTradingAccount = useTradingState((state: any) => (active ? state.account : null));
  const restTradingAccount = useMemo(
    () =>
      restAccountSummary
        ? {
            balance: restAccountSummary.balance,
            credit: restAccountSummary.credit,
            floating: restAccountSummary.profit,
            equity: restAccountSummary.equity,
            margin: restAccountSummary.margin,
            freeMargin: restAccountSummary.freeMargin,
            marginLevel: restAccountSummary.marginLevel,
            currency: restAccountSummary.currency,
          }
        : null,
    [restAccountSummary],
  );
  const selectedFallbackAccount = active ? (restTradingAccount ?? selectedTradingAccount) : null;
  const retainedTradingAccountRef = React.useRef(selectedFallbackAccount);
  if (active) {
    retainedTradingAccountRef.current = selectedFallbackAccount;
  }
  const tradingAccount = active ? selectedFallbackAccount : retainedTradingAccountRef.current;

  const selectedLiveAcc = useLiveAccountState(
    useShallow((state) =>
      active
        ? {
            balance: state.balance,
            floating: state.floating,
            equity: state.equity,
            margin: state.margin,
            margin_free: state.margin_free,
            margin_level: state.margin_level,
            metricFlags: state.metricFlags,
          }
        : null,
    ),
  );
  const retainedLiveAccRef = React.useRef(selectedLiveAcc);
  if (active && selectedLiveAcc) {
    retainedLiveAccRef.current = selectedLiveAcc;
  }
  const liveAcc = selectedLiveAcc ?? retainedLiveAccRef.current ?? EMPTY_TRADE_LIVE_ACCOUNT;
  const liveQuoteSymbols = useMemo(() => Array.from(new Set(positions.map((position) => position.symbol))), [positions]);
  const liveQuotes = useLiveSymbolQuotes(liveQuoteSymbols, active, quoteCommitIntervalMs);
  const account = useMemo(() => {
    const summary = buildTradeAccountSummary(liveAcc, tradingAccount);
    const floating = resolveTradeFloatingPnl(summary.floating, positions, hydratedLogin, resolvedLogin, liveQuotes);
    return resolveRenderableTradeAccountSummary(summary, floating);
  }, [hydratedLogin, liveAcc, liveQuotes, positions, resolvedLogin, tradingAccount]);

  return account;
};

/**
 * Owns the Trade screen's single live-account subscription, renders the
 * Floating P/L hero when space permits, and publishes the account summary
 * through context.
 *
 * The positions list is passed through as `children`; the context provider renders
 * no host element. Short windows move the hero into that list's scrolling header,
 * while the scrolling details inside the list header can still read the one account
 * summary. When only the account ticks, `children` keeps the identity it had on the
 * last TradeScreen render, so React bails out on the list and only the context
 * consumers re-render.
 */
export const TradeSummaryHeader = React.memo(({ positions, hydratedLogin, resolvedLogin, s, T, isDark, active, restAccountSummary, children, scrollSummary = false }: { positions: PositionItem[]; hydratedLogin: string | null; resolvedLogin: number | undefined; s: TradeScreenStyles; T: ThemeColors; isDark: boolean; active: boolean; restAccountSummary?: ApiAccountSummary; children: React.ReactNode; scrollSummary?: boolean }) => {
  const account = useTradeLiveAccountSummary({
    positions,
    hydratedLogin,
    resolvedLogin,
    active,
    restAccountSummary,
  });
  return (
    <TradeAccountSummaryContext.Provider value={account}>
      {!scrollSummary ? <TradeFloatingSummaryHeader positions={positions} s={s} T={T} isDark={isDark} /> : null}
      {children}
    </TradeAccountSummaryContext.Provider>
  );
});

const TradeFloatingSummaryHeader = React.memo(({ positions, s, T, isDark }: { positions: PositionItem[]; s: TradeScreenStyles; T: ThemeColors; isDark: boolean }) => {
  const account = React.useContext(TradeAccountSummaryContext);
  const detailsVisible = useUserPreferences((state) => state.tradeSummaryDetailsVisible);
  const setTradeSummaryDetailsVisible = useUserPreferences((state) => state.setTradeSummaryDetailsVisible);
  const toggleSummaryDetails = useCallback(() => {
    setTradeSummaryDetailsVisible(!detailsVisible);
  }, [detailsVisible, setTradeSummaryDetailsVisible]);
  return <LiveUnrealizedPnLHeader account={account} s={s} T={T} isDark={isDark} detailsVisible={detailsVisible} hasOpenPositions={positions.length > 0} onToggleDetails={toggleSummaryDetails} />;
});

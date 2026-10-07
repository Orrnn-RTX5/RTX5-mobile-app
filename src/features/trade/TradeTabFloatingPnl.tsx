/**
 * Live floating-P/L readout for the BOTTOM tab bar's Trade item.
 *
 * MT5-style: while any position is open, the Trade tab's LABEL (the word
 * "Trade") is replaced by the account's live floating profit/loss, colored
 * blue/red, so the trader sees it from every tab. The trade icon stays in
 * the icon slot. With no open positions the normal "Trade" label returns.
 *
 * The tab bar is always mounted, so the quote commit interval is throttled —
 * this badge must never become a background churn source for the Chart tab.
 */
import { useTheme } from '../../ui/theme/useTheme';
import React, { createContext, useContext, useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useShallow } from 'zustand/shallow';
import { usePositionsState } from '../../state/positionsState';
import { dedupePositionsById } from '../../state/positionsState.helpers';
import { isRenderablePositionSymbol } from '../../state/positionsMapper';
import { useResolvedTradingLogin } from '../../state/tradingLogin';
import { fmt } from '../../utils/format';
import { useTradeLiveAccountSummary } from './TradeScreen/SummaryHeader';
import { BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER } from '../../ui/layout/bottomTabBar';

const TAB_PNL_DOWN_COLOR = '#F23645';
const TAB_PNL_QUOTE_COMMIT_INTERVAL_MS = 500;

const TradeTabFloatingPnlContext = createContext<number | null>(null);

// Native tab chrome keeps active and inactive labels mounted together. Own
// their live data once, so those two presentations do not duplicate account
// subscriptions, per-symbol quote listeners, or position/P&L calculations.
// The unchanged children keep quote updates below the native opacity layers.
export const TradeTabFloatingPnlProvider = React.memo(({ children }: { children: React.ReactNode }) => {
  const { positions, hydratedLogin } = usePositionsState(
    useShallow((state) => ({
      positions: state.positions,
      hydratedLogin: state.hydratedLogin,
    })),
  );
  const resolvedLogin = useResolvedTradingLogin();
  const renderablePositions = useMemo(
    () => dedupePositionsById(positions.filter((position) => isRenderablePositionSymbol(position.symbol))),
    [positions],
  );
  const account = useTradeLiveAccountSummary({
    positions: renderablePositions,
    hydratedLogin,
    resolvedLogin,
    active: true,
    quoteCommitIntervalMs: TAB_PNL_QUOTE_COMMIT_INTERVAL_MS,
  });

  const floating = renderablePositions.length === 0
    ? null
    : Number.isFinite(account.floating) ? account.floating : 0;
  return (
    <TradeTabFloatingPnlContext.Provider value={floating}>
      {children}
    </TradeTabFloatingPnlContext.Provider>
  );
});

export const TradeTabFloatingPnl = React.memo(({
  fallbackLabel,
  fallbackColor,
  labelStyle,
}: {
  /** The normal tab label text ("Trade") shown when no positions are open. */
  fallbackLabel: string;
  /** Tab tint used for the fallback label. */
  fallbackColor: string;
  /** Base tab-label typography so both states align with the other tabs. */
  labelStyle?: StyleProp<TextStyle>;
}) => {
  const T = useTheme();
  const floating = useContext(TradeTabFloatingPnlContext);

  if (floating === null) {
    return (
      <Text
        maxFontSizeMultiplier={BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        style={[labelStyle, { color: fallbackColor }]}
      >
        {fallbackLabel}
      </Text>
    );
  }

  return (
    <Text
      maxFontSizeMultiplier={BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.72}
      style={[
        labelStyle,
        {
          color: floating >= 0 ? T.trading.profit : TAB_PNL_DOWN_COLOR,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        },
      ]}
    >
      {fmt.pnlPrecise(floating)}
    </Text>
  );
});

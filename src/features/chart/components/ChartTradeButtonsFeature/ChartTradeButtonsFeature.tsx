import { FastPressable as Pressable } from '../../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  InputAccessoryView,
  Platform,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useActiveBrokerQuerySession } from '../../../../query/authenticatedQueryScope';
import { useInvestorReadOnlySession } from '../../../../hooks/useInvestorReadOnlySession';
import { useUserPreferences } from '../../../../state/userPreferences';
import { formatTradeVolume, type TradeVolumeBounds } from '../../../../utils/tradeVolume';
import type { TradeSide } from '../../../../domain/tradeSide';
import { useExecutableQuote } from '../../../quotes/useExecutableQuote';
import { getChartTradeAction } from '../../chartTradeActions';
import {
  resolveFooterLotChevronPressBehavior,
  resolveFooterLotChevronState,
} from '../../chartTradeInteractionUtils';
import {
  resolveChartTradeButtonDisplayQuote,
} from './quoteFallback';
import { splitFormattedChartTradePrice } from './pricePresentation';
import { baseStyles, COMPACT_TRADE_FOOTER_ROW_HEIGHT, darkStyles, lightStyles, textBaseStyles } from './styles';
import { useTradeHandler, type TradeFeedback } from './useTradeHandler';
import { resolveChartTradeQuoteAvailability } from './tradeAvailability';
import type { ChartTradeQueueEvent } from '../ChartTradeReceiptStack';

type FooterLotPickerMode = 'absolute' | 'increase' | 'decrease';

const LOT_ADJUST_HIT_SLOP = { top: 8, bottom: 8, left: 6, right: 6 } as const;
const LOT_VALUE_HIT_SLOP = { top: 8, bottom: 8, left: 0, right: 0 } as const;
const LOT_CHEVRON_INWARD_MARGIN = 20;
// Frame-rate commits so bid/ask motion is visible while still coalescing bursts.
const TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS = 16;
const TRADE_BUTTON_PRICE_TEXT_COLOR = '#FFFFFF';
const IOS_LOT_INPUT_ACCESSORY_ID = 'chart-trade-lot-input-accessory';

type ChartTradeButtonsProps = {
  symbol: string;
  displayDecimals: number;
  lotSize: number;
  volumeBounds?: TradeVolumeBounds;
  onTradeResult?: (feedback: TradeFeedback) => void;
  onTradeQueueEvent?: (event: ChartTradeQueueEvent) => void;
  comment?: string;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  protectionDraftId?: string;
  pointSize?: number;
  onEditLot?: () => void;
  onOpenLotEditor?: (mode?: FooterLotPickerMode) => void;
  isLotEditing?: boolean;
  lotDraft?: string;
  lotInputRef?: React.RefObject<TextInput | null>;
  onLotDraftChange?: (text: string) => void;
  onLotDraftBlur?: () => void;
  onLotDraftEndEditing?: (event: any) => void;
  onLotDraftSubmit?: (event?: any) => void;
  onDecreaseLot?: () => void;
  onIncreaseLot?: () => void;
  variant?: 'compact' | 'mt5-market';
  active?: boolean;
  fallbackBid?: number | null;
  fallbackAsk?: number | null;
  isSymbolExecutionOwner?: () => boolean;
  /** Stable chart-window owner for asynchronous receipt placement. */
  chartWindowPaneId?: string;
  isDark: boolean;
  buyColor: string;
  sellColor: string;
  // MT5-style invalid manual lot: when true, show `invalidLotDisplay` flagged in
  // red and block BUY/SELL until the user enters a valid step/range.
  lotInvalid?: boolean;
  invalidLotDisplay?: string;
  compactPane?: boolean;
};

type ChartTradeButtonsSessionScopedProps = ChartTradeButtonsProps & {
  displayQuoteScopeKey: string;
};

const INVALID_LOT_COLOR = '#EF4444';

const ChartTradeButtonPriceText = React.memo(function ChartTradeButtonPriceText({
  text,
  testID,
  compact = false,
}: {
  text: string;
  testID: string;
  compact?: boolean;
}) {
  // No per-tick color animation. JS-thread color tweens on every bid/ask tick
  // made the horizontal BUY/SELL strip blink on iOS and Android.
  const priceParts = splitFormattedChartTradePrice(text);
  return (
    <Text
      style={[
        baseStyles.actionBtnPriceText,
        compact && baseStyles.actionBtnPriceTextCompact,
        {
          color: TRADE_BUTTON_PRICE_TEXT_COLOR,
          opacity: 1,
        },
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      testID={testID}
    >
      {priceParts.leading}
      {priceParts.trailing ? (
        <Text style={baseStyles.actionBtnPriceTrailingText}>
          {priceParts.trailing}
        </Text>
      ) : null}
    </Text>
  );
});

export const ChartTradeButtons = React.memo(function ChartTradeButtons(
  props: ChartTradeButtonsProps,
) {
  const activeSession = useActiveBrokerQuerySession();
  const investorReadOnly = useInvestorReadOnlySession();
  const displayQuoteScopeKey =
    `${activeSession?.cacheNamespace ?? ''}:${props.symbol.trim().toUpperCase()}`;
  // Investor (read-only) logins cannot trade: the Buy/Sell footer is hidden.
  if (investorReadOnly) return null;
  return (
    <ChartTradeButtonsSessionScoped
      key={displayQuoteScopeKey}
      {...props}
      displayQuoteScopeKey={displayQuoteScopeKey}
    />
  );
});

const ChartTradeButtonsSessionScoped = React.memo(function ChartTradeButtonsSessionScoped({
  symbol,
  displayDecimals,
  lotSize,
  volumeBounds,
  onTradeResult,
  onTradeQueueEvent,
  comment,
  stopLossPrice,
  takeProfitPrice,
  protectionDraftId,
  pointSize,
  onEditLot,
  onOpenLotEditor,
  isLotEditing = false,
  lotDraft,
  lotInputRef,
  onLotDraftChange,
  onLotDraftBlur,
  onLotDraftEndEditing,
  onLotDraftSubmit,
  onDecreaseLot,
  onIncreaseLot,
  variant = 'compact',
  active = true,
  fallbackBid = null,
  fallbackAsk = null,
  isSymbolExecutionOwner,
  chartWindowPaneId,
  isDark,
  buyColor,
  sellColor,
  lotInvalid = false,
  invalidLotDisplay = '',
  compactPane: requestedCompactPane = false,
  displayQuoteScopeKey,
}: ChartTradeButtonsSessionScopedProps) {
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [controlWidth, setControlWidth] = React.useState<number | null>(null);
  // Measure the pane itself: tablet split charts can be narrower than the window.
  const compactPane = requestedCompactPane || (controlWidth ?? windowWidth) < 360;
  const footerRowHeight = Math.ceil(COMPACT_TRADE_FOOTER_ROW_HEIGHT * Math.max(1, fontScale));
  const retainedDisplayQuoteRef = React.useRef<{
    scopeKey: string;
    bid: number;
    ask: number;
  } | null>(null);
  // This shared hook adds the one-second freshness clock and feed-health
  // subscription that a quote-only render path cannot provide. The controls
  // therefore repaint into a disabled state even when ticks simply stop.
  const {
    quote: liveQuote,
    getCurrentExecutableQuoteState,
  } = useExecutableQuote(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS);
  const isPublicDemoTradePrompt = useUserPreferences((state) => !state.isLoggedIn);
  const quoteActionAvailability = resolveChartTradeQuoteAvailability({
    quote: liveQuote,
    isPublicDemoTradePrompt,
  });
  const getCurrentQuoteActionAvailability = React.useCallback(() => {
    const current = getCurrentExecutableQuoteState();
    return resolveChartTradeQuoteAvailability({
      quote: current.quote,
      isPublicDemoTradePrompt,
    });
  }, [getCurrentExecutableQuoteState, isPublicDemoTradePrompt]);
  // Must pass a single options object — positional args crash when liveQuote is
  // null/undefined (destructure of undefined) and tripped the trading ErrorBoundary after OTA.
  const resolvedDisplayQuote = resolveChartTradeButtonDisplayQuote({
    liveBid: liveQuote?.bid,
    liveAsk: liveQuote?.ask,
    fallbackBid,
    fallbackAsk,
  });
  const resolvedDisplayBid = Number(resolvedDisplayQuote?.bid);
  const resolvedDisplayAsk = Number(resolvedDisplayQuote?.ask);
  if (
    Number.isFinite(resolvedDisplayBid) &&
    resolvedDisplayBid > 0 &&
    Number.isFinite(resolvedDisplayAsk) &&
    resolvedDisplayAsk > 0
  ) {
    retainedDisplayQuoteRef.current = {
      scopeKey: displayQuoteScopeKey,
      bid: resolvedDisplayBid,
      ask: resolvedDisplayAsk,
    };
  }
  const retainedDisplayQuote =
    retainedDisplayQuoteRef.current?.scopeKey === displayQuoteScopeKey
      ? retainedDisplayQuoteRef.current
      : null;
  // Visual continuity only: route blur clears the live execution quote, but
  // the retained footer keeps its last numeric Bid/Ask instead of flashing
  // placeholders. Trade authorization still uses the current executable quote.
  const displayBid =
    Number.isFinite(resolvedDisplayBid) && resolvedDisplayBid > 0
      ? resolvedDisplayBid
      : retainedDisplayQuote?.bid ?? 0;
  const displayAsk =
    Number.isFinite(resolvedDisplayAsk) && resolvedDisplayAsk > 0
      ? resolvedDisplayAsk
      : retainedDisplayQuote?.ask ?? 0;
  const hasDisplayBid = Number.isFinite(displayBid) && displayBid > 0;
  const hasDisplayAsk = Number.isFinite(displayAsk) && displayAsk > 0;
  // Guard toFixed range — invalid decimals throw and crash the ErrorBoundary.
  const safeDisplayDecimals =
    typeof displayDecimals === 'number' && Number.isFinite(displayDecimals)
      ? Math.max(0, Math.min(10, Math.round(displayDecimals)))
      : 5;
  const formattedBid = hasDisplayBid ? displayBid.toFixed(safeDisplayDecimals) : '---';
  const formattedAsk = hasDisplayAsk ? displayAsk.toFixed(safeDisplayDecimals) : '---';
  const formattedLotSize = formatTradeVolume(lotSize, volumeBounds);
  const lotDisplayText = lotInvalid && invalidLotDisplay ? invalidLotDisplay : formattedLotSize;
  const hasLotValueEditor = typeof onEditLot === 'function';
  const lotEditorAction = hasLotValueEditor ? onEditLot : undefined;
  const lotPickerAction = typeof onOpenLotEditor === 'function' ? onOpenLotEditor : undefined;
  const decreaseLotPressBehavior = resolveFooterLotChevronPressBehavior({
    hasStepAction: typeof onDecreaseLot === 'function',
    hasLotPickerAction: typeof lotPickerAction === 'function',
  });
  const increaseLotPressBehavior = resolveFooterLotChevronPressBehavior({
    hasStepAction: typeof onIncreaseLot === 'function',
    hasLotPickerAction: typeof lotPickerAction === 'function',
  });
  const { canDecreaseLot, canIncreaseLot } = resolveFooterLotChevronState({
    lotSize,
    bounds: volumeBounds,
    hasDecreaseAction: decreaseLotPressBehavior !== 'none',
    hasIncreaseAction: increaseLotPressBehavior !== 'none',
  });
  const canOpenDecreaseLotPicker = decreaseLotPressBehavior === 'picker' && typeof lotPickerAction === 'function';
  const canOpenIncreaseLotPicker = increaseLotPressBehavior === 'picker' && typeof lotPickerAction === 'function';
  const canUseDecreaseLotControl = canOpenDecreaseLotPicker || canDecreaseLot;
  const canUseIncreaseLotControl = canOpenIncreaseLotPicker || canIncreaseLot;
  const handleLotCenterPress = lotEditorAction ?? (lotPickerAction ? () => lotPickerAction('absolute') : undefined);
  const handleLotCenterLongPress = lotPickerAction ? () => lotPickerAction('absolute') : undefined;
  const handleDecreaseLotPress = React.useMemo(() => {
    if (!canUseDecreaseLotControl) return undefined;
    if (decreaseLotPressBehavior === 'step') return onDecreaseLot;
    if (decreaseLotPressBehavior === 'picker' && lotPickerAction) {
      return () => lotPickerAction('decrease');
    }
    return undefined;
  }, [canUseDecreaseLotControl, decreaseLotPressBehavior, lotPickerAction, onDecreaseLot]);
  const handleIncreaseLotPress = React.useMemo(() => {
    if (!canUseIncreaseLotControl) return undefined;
    if (increaseLotPressBehavior === 'step') return onIncreaseLot;
    if (increaseLotPressBehavior === 'picker' && lotPickerAction) {
      return () => lotPickerAction('increase');
    }
    return undefined;
  }, [canUseIncreaseLotControl, increaseLotPressBehavior, lotPickerAction, onIncreaseLot]);
  const handleLotAccessoryApply = React.useCallback(() => {
    onLotDraftSubmit?.();
  }, [onLotDraftSubmit]);

  const {
    handleTrade,
    isChartTradeActionBusy,
    isChartTradeActionVisuallyLocked,
    chartTradeActionDisabled,
    isCurrentChartSymbol,
  } = useTradeHandler({
    symbol,
    variant,
    comment,
    stopLossPrice,
    takeProfitPrice,
    protectionDraftId,
    pointSize,
    lotSize,
    quoteActionAllowed: quoteActionAvailability.allowed,
    getCurrentQuoteActionAvailability,
    isSymbolExecutionOwner,
    chartWindowPaneId,
    onTradeResult,
    onTradeQueueEvent,
  });
  // Lot chrome only cares about identity + invalid draft — not quote integrity.
  const tradeControlsDisabled = !isCurrentChartSymbol;
  // The helper includes both selected-symbol identity and executable quote
  // freshness. The press handler still rechecks to close the render-to-tap race.
  const tradeBlocked = chartTradeActionDisabled || lotInvalid;

  const themeStyles = isDark ? darkStyles : lightStyles;
  const sellAction = getChartTradeAction('sell');
  const buyAction = getChartTradeAction('buy');
  // Keep each side visually stable while quote values update: Sell is always
  // red and Buy is always blue.
  const sellTileColor = sellColor;
  const buyTileColor = buyColor;
  const lotControl = (
    <View
      style={[
        baseStyles.actionLotControl,
        themeStyles.actionLotControl,
        isLotEditing && baseStyles.actionLotControlEditing,
        typeof lotPickerAction === 'function' && themeStyles.actionLotControlPicker,
      ]}
    >
      <Pressable
        style={[
          baseStyles.actionLotAdjustButton,
          compactPane && baseStyles.actionLotAdjustButtonCompact,
          (!canUseDecreaseLotControl || tradeControlsDisabled) && baseStyles.actionLotAdjustButtonDisabled,
        ]}
        onPress={handleDecreaseLotPress}
        disabled={!canUseDecreaseLotControl || tradeControlsDisabled}
        accessibilityState={{ disabled: !canUseDecreaseLotControl || tradeControlsDisabled }}
        accessibilityLabel="Decrease lot"
        testID="chart-trade-lot-decrease-button"
        hitSlop={LOT_ADJUST_HIT_SLOP}
        activateOnPressIn
      >
        <Ionicons
          name="chevron-down"
          size={12}
          style={[
            themeStyles.actionLotAdjustIcon,
            { marginLeft: compactPane ? 0 : LOT_CHEVRON_INWARD_MARGIN },
            (!canUseDecreaseLotControl || tradeControlsDisabled) && themeStyles.actionLotAdjustIconDisabled,
            !isLotEditing && baseStyles.actionLotUnderlayIconHidden,
          ]}
        />
      </Pressable>
      {isLotEditing ? (
        <>
          <View style={baseStyles.actionLotInputWrap}>
            <TextInput
              ref={lotInputRef}
              style={[textBaseStyles.actionLotInput, themeStyles.actionLotInput]}
              value={lotDraft}
              onChangeText={onLotDraftChange}
              onBlur={onLotDraftBlur}
              onEndEditing={onLotDraftEndEditing}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
              autoFocus
              showSoftInputOnFocus
              caretHidden={false}
              onSubmitEditing={onLotDraftSubmit}
              inputAccessoryViewID={Platform.OS === 'ios' ? IOS_LOT_INPUT_ACCESSORY_ID : undefined}
              placeholder={formattedLotSize}
              placeholderTextColor="#94A3B8"
            />
          </View>
          {Platform.OS === 'ios' ? (
            <InputAccessoryView nativeID={IOS_LOT_INPUT_ACCESSORY_ID}>
              <View style={[baseStyles.actionLotKeyboardAccessory, themeStyles.actionLotKeyboardAccessory]}>
                <Pressable
                  style={baseStyles.actionLotKeyboardAccessoryButton}
                  onPress={handleLotAccessoryApply}
                  accessibilityRole="button"
                  accessibilityLabel="Apply lot"
                  testID="chart-trade-lot-ios-apply-button"
                >
                  <Text style={textBaseStyles.actionLotKeyboardAccessoryButtonText}>Apply</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          ) : null}
        </>
      ) : (
        <Pressable
          style={baseStyles.actionLotPill}
          onPress={handleLotCenterPress}
          onLongPress={handleLotCenterLongPress}
          disabled={tradeControlsDisabled}
          accessibilityState={{ disabled: tradeControlsDisabled }}
          accessibilityLabel="Edit lot"
          testID="chart-trade-lot-value-button"
          hitSlop={LOT_VALUE_HIT_SLOP}
          activateOnPressIn
        >
          <Text
            style={[
              textBaseStyles.actionLotValue,
              themeStyles.actionLotValue,
              lotInvalid && { color: INVALID_LOT_COLOR },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {lotDisplayText}
          </Text>
        </Pressable>
      )}
      <Pressable
        style={[
          baseStyles.actionLotAdjustButton,
          compactPane && baseStyles.actionLotAdjustButtonCompact,
          (!canUseIncreaseLotControl || tradeControlsDisabled) && baseStyles.actionLotAdjustButtonDisabled,
        ]}
        onPress={handleIncreaseLotPress}
        disabled={!canUseIncreaseLotControl || tradeControlsDisabled}
        accessibilityState={{ disabled: !canUseIncreaseLotControl || tradeControlsDisabled }}
        accessibilityLabel="Increase lot"
        testID="chart-trade-lot-increase-button"
        hitSlop={LOT_ADJUST_HIT_SLOP}
        activateOnPressIn
      >
        <Ionicons
          name="chevron-up"
          size={12}
          style={[
            themeStyles.actionLotAdjustIcon,
            { marginRight: compactPane ? 0 : LOT_CHEVRON_INWARD_MARGIN },
            (!canUseIncreaseLotControl || tradeControlsDisabled) && themeStyles.actionLotAdjustIconDisabled,
            !isLotEditing && baseStyles.actionLotUnderlayIconHidden,
          ]}
        />
      </Pressable>
    </View>
  );

  // Busy state must NOT swap children (spinner) or change layout height.
  // Order Ticket launch feedback keeps labels/prices mounted with a thin pulse.
  // Immediate one-click market orders deliberately bypass this busy state.
  const sellBusy = isChartTradeActionBusy('sell') || isChartTradeActionVisuallyLocked('sell');
  const buyBusy = isChartTradeActionBusy('buy') || isChartTradeActionVisuallyLocked('buy');

  if (variant === 'mt5-market') {
    return (
      <View style={baseStyles.chartTradeMarketActionRow}>
        <Pressable
          style={[
            baseStyles.chartTradeMarketActionButton,
            { backgroundColor: sellColor },
            sellBusy && baseStyles.chartTradeMarketActionButtonBusy,
            tradeBlocked && baseStyles.chartTradeActionButtonDisabled,
          ]}
          disabled={tradeBlocked}
          accessibilityState={{ disabled: tradeBlocked, busy: isChartTradeActionBusy('sell') }}
          onPress={() => handleTrade('sell')}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel="chart.trade.sell.market"
          accessibilityRole="button"
          accessibilityLabel={sellAction.marketAccessibilityLabel}
          testID={sellAction.marketTestID}
        >
          <Text style={baseStyles.chartTradeMarketActionTitle}>{sellAction.marketLabel}</Text>
          <Text style={baseStyles.chartTradeMarketActionMeta}>
            {lotDisplayText} Lots · {formattedBid}
          </Text>
        </Pressable>
        <Pressable
          style={[
            baseStyles.chartTradeMarketActionButton,
            { backgroundColor: buyColor },
            buyBusy && baseStyles.chartTradeMarketActionButtonBusy,
            tradeBlocked && baseStyles.chartTradeActionButtonDisabled,
          ]}
          disabled={tradeBlocked}
          accessibilityState={{ disabled: tradeBlocked, busy: isChartTradeActionBusy('buy') }}
          onPress={() => handleTrade('buy')}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel="chart.trade.buy.market"
          accessibilityRole="button"
          accessibilityLabel={buyAction.marketAccessibilityLabel}
          testID={buyAction.marketTestID}
        >
          <Text style={baseStyles.chartTradeMarketActionTitle}>{buyAction.marketLabel}</Text>
          <Text style={baseStyles.chartTradeMarketActionMeta}>
            {lotDisplayText} Lots · {formattedAsk}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[baseStyles.tradeControlsRow, themeStyles.tradeControlsRow, { minHeight: footerRowHeight }]}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        if (nextWidth > 0) setControlWidth((current) => current === nextWidth ? current : nextWidth);
      }}
    >
      <View style={[baseStyles.actionButtonSlot, { backgroundColor: sellTileColor, height: footerRowHeight }]}>
        <Pressable
          style={[
            baseStyles.actionBtn,
            {
              backgroundColor: sellTileColor,
              borderWidth: 2,
              borderColor: sellBusy ? 'rgba(255,255,255,0.55)' : 'transparent',
              shadowColor: sellTileColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0 : 0.05,
              shadowRadius: 8,
              elevation: 0,
            },
            lotInvalid && baseStyles.actionBtnLotInvalid,
            tradeBlocked && baseStyles.chartTradeActionButtonDisabled,
          ]}
          disabled={tradeBlocked}
          accessibilityState={{ disabled: tradeBlocked, busy: isChartTradeActionBusy('sell') }}
          onPress={() => handleTrade('sell')}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel="chart.trade.sell"
          accessibilityRole="button"
          accessibilityLabel={sellAction.accessibilityLabel}
          testID={sellAction.testID}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>{sellAction.displayLabel}</Text>
          </View>
          <ChartTradeButtonPriceText text={formattedBid} testID="chart-trade-sell-price-text" compact={compactPane} />
        </Pressable>
      </View>

      <View style={[baseStyles.actionLotSlot, compactPane && baseStyles.actionLotSlotCompact, themeStyles.actionLotSlot, { height: footerRowHeight }]}>
        {lotControl}
        {!isLotEditing ? (
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={baseStyles.actionLotCommittedOverlay}
          >
            <View style={[
              baseStyles.actionLotCommittedIconBox,
              compactPane && baseStyles.actionLotCommittedIconBoxCompact,
            ]}>
              <Ionicons
                name="chevron-down"
                size={12}
                style={[
                  themeStyles.actionLotAdjustIcon,
                  { marginLeft: compactPane ? 0 : LOT_CHEVRON_INWARD_MARGIN },
                  (!canUseDecreaseLotControl || tradeControlsDisabled) && themeStyles.actionLotAdjustIconDisabled,
                ]}
              />
            </View>
            <Text
              style={[textBaseStyles.actionLotValue, baseStyles.actionLotCommittedValue, themeStyles.actionLotValue, lotInvalid && { color: INVALID_LOT_COLOR }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {lotDisplayText}
            </Text>
            <View style={[
              baseStyles.actionLotCommittedIconBox,
              compactPane && baseStyles.actionLotCommittedIconBoxCompact,
            ]}>
              <Ionicons
                name="chevron-up"
                size={12}
                style={[
                  themeStyles.actionLotAdjustIcon,
                  { marginRight: compactPane ? 0 : LOT_CHEVRON_INWARD_MARGIN },
                  (!canUseIncreaseLotControl || tradeControlsDisabled) && themeStyles.actionLotAdjustIconDisabled,
                ]}
              />
            </View>
          </View>
        ) : null}
      </View>

      <View style={[baseStyles.actionButtonSlot, { backgroundColor: buyTileColor, height: footerRowHeight }]}>
        <Pressable
          style={[
            baseStyles.actionBtn,
            {
              backgroundColor: buyTileColor,
              borderWidth: 2,
              borderColor: buyBusy ? 'rgba(255,255,255,0.55)' : 'transparent',
              shadowColor: buyTileColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0 : 0.05,
              shadowRadius: 8,
              elevation: 0,
            },
            lotInvalid && baseStyles.actionBtnLotInvalid,
            tradeBlocked && baseStyles.chartTradeActionButtonDisabled,
          ]}
          disabled={tradeBlocked}
          accessibilityState={{ disabled: tradeBlocked, busy: isChartTradeActionBusy('buy') }}
          onPress={() => handleTrade('buy')}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel="chart.trade.buy"
          accessibilityRole="button"
          accessibilityLabel={buyAction.accessibilityLabel}
          testID={buyAction.testID}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>{buyAction.displayLabel}</Text>
          </View>
          <ChartTradeButtonPriceText text={formattedAsk} testID="chart-trade-buy-price-text" compact={compactPane} />
        </Pressable>
      </View>
    </View>
  );
});

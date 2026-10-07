import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTheme } from '../../../ui/theme/useTheme';
import {
  type LayoutChangeEvent, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { CHART_ORDER_TYPES, type ChartOrderType, isPendingChartOrderType } from '../chartTradeOrderUtils';
import { COMPACT_TRADE_FOOTER_ROW_HEIGHT } from './ChartTradeButtonsFeature/styles';
import {
  resolveChartTradeSheetFrameHeight,
  resolveFooterTradeDockBottom,
  shouldRenderChartTradeSheetBody,
  shouldShowChartTradeSheetHandle,
  shouldShowChartTradeSheetMarketExecutionButtons,
} from '../chartTradeInteractionUtils';
import { LiveOrderTickExecutionGraph } from '../../trade/OrderTickExecutionGraph';
import { isPendingOrderTypeBackendLocked } from '../../trade/tradeBackendCapabilities';
import { getActiveSltpUnavailableMessage } from '../../trade/tradeBackendCapabilities';
import { useTranslation } from '../../../i18n/useTranslation';
import { ChartTradeSheetPortal } from '../../../ui/navigation/ChartTradeSheetPortal';

const FOOTER_LOT_PICKER_BASE_OFFSET = 54;
const FOOTER_TRADE_DOCK_ANDROID_BOTTOM_SAFE_GAP = 12;
const INLINE_FOOTER_TRADE_ROW_RESERVE_STYLE = { height: COMPACT_TRADE_FOOTER_ROW_HEIGHT };

type ChartTradeTypeTabLayout = { x: number; width: number };

type TradeFeatureComponents = {
  LiveQuotePairHeader: React.ComponentType<any>;
  LiveTradeButtons: React.ComponentType<any>;
  PendingOrderPreviewChart: React.ComponentType<any>;
  ChartTradeVolumeSlider: React.ComponentType<any>;
  ChartFooterLotPicker: React.ComponentType<any>;
};

function ChartTradeSheetHeaderActions({
  styles,
  colors,
  sheet,
  handlers,
}: {
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  sheet: any;
  handlers: any;
}) {
  const { t } = useTranslation();
  const slEnabled = !!sheet.chartTradeSlEnabled;
  const tpEnabled = !!sheet.chartTradeTpEnabled;
  const isDirectMarketProtection = !!sheet.chartDirectProtectionActive;
  const selectionRequired =
    !isDirectMarketProtection &&
    !isPendingChartOrderType(sheet.chartTradeOrderType) &&
    (
      !!sheet.chartPositionSelectionInvalid ||
      (
        Array.isArray(sheet.chartPositionCandidates) &&
        sheet.chartPositionCandidates.length > 1 &&
        !sheet.chartSelectedPositionTicket
      )
    );
  const protectionControlsDisabled =
    !!sheet.chartProtectionBackendLocked || selectionRequired;
  return (
    <View style={styles.chartTradeQuickActions}>
      <Pressable
        style={[
          styles.chartTradeQuickChip,
          styles.chartTradeQuickChipSl,
          slEnabled && styles.chartTradeQuickChipSlActive,
          protectionControlsDisabled && { opacity: 0.5 },
        ]}
        onPress={() => handlers.onToggleStopLevel('sl')}
        disabled={protectionControlsDisabled}
        unstable_pressDelay={0}
        accessibilityRole="button"
        accessibilityLabel={t('Stop Loss')}
        accessibilityState={{ selected: slEnabled, disabled: protectionControlsDisabled }}
      >
        <Text style={[styles.chartTradeQuickChipText, slEnabled && styles.chartTradeQuickChipTextActive]}>
          SL
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.chartTradeQuickChip,
          styles.chartTradeQuickChipTp,
          tpEnabled && styles.chartTradeQuickChipTpActive,
          protectionControlsDisabled && { opacity: 0.5 },
        ]}
        onPress={() => handlers.onToggleStopLevel('tp')}
        disabled={protectionControlsDisabled}
        unstable_pressDelay={0}
        accessibilityRole="button"
        accessibilityLabel={t('Take Profit')}
        accessibilityState={{ selected: tpEnabled, disabled: protectionControlsDisabled }}
      >
        <Text style={[styles.chartTradeQuickChipText, tpEnabled && styles.chartTradeQuickChipTextActive]}>
          TP
        </Text>
      </Pressable>
      <Pressable
        style={styles.chartTradeQuickExpandButton}
        onPress={handlers.onToggleSheetMode}
        unstable_pressDelay={0}
        accessibilityRole="button"
        accessibilityLabel={
          sheet.chartTradeSheetMode === 'expanded' ? t('Collapse trade panel') : t('Expand trade panel')
        }
      >
        <Ionicons
          name={sheet.chartTradeSheetMode === 'expanded' ? 'chevron-down' : 'arrow-forward'}
          size={20}
          color={colors.blue}
        />
      </Pressable>
    </View>
  );
}

type ChartTradeSheetContentProps = {
  components: TradeFeatureComponents;
  styles: any;
  isDark: boolean;
  colors: {
    blue: string;
    textMuted: string;
    sellPrimary: string;
  };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  handlers: any;
  tabs: {
    scrollRef?: React.RefObject<ScrollView | null>;
    onViewportLayout: (width: number) => void;
    onTabLayout: (orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => void;
  };
  sheetScrollRef?: React.RefObject<ScrollView | null>;
};

function ChartTradeVolumeSection({
  ChartTradeVolumeSlider,
  styles,
  colors,
  sheet,
  handlers,
  useMtPendingTradeSheetLayout,
}: {
  ChartTradeVolumeSlider: React.ComponentType<any>;
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  sheet: any;
  handlers: any;
  useMtPendingTradeSheetLayout: boolean;
}) {
  const { t } = useTranslation();
  const isMarginMode = sheet.chartTradeVolumeDisplayMode === 'margin';
  const primaryMetricLabel = isMarginMode ? t('Lots') : t('Margin');
  const primaryMetricValue = isMarginMode
    ? sheet.passiveLotDisplay
    : `${sheet.chartTradeMarginEstimate} ${sheet.accountCurrency}`;
  const secondaryMetricLabel = isMarginMode ? t('Max') : t('Balance');
  const secondaryMetricValue = isMarginMode
    ? sheet.chartTradeMaxVolumeDisplay
    : `${sheet.accountBalance} ${sheet.accountCurrency}`;

  return (
    <>
      <View
        style={[styles.chartTradeVolumeCard, useMtPendingTradeSheetLayout && styles.chartTradeVolumeCardPending]}
      >
        <View style={[styles.chartTradeVolumeSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeSidePending]}>
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Volume')}</Text>
          <View style={styles.chartTradeVolumeValueGroup}>
            <TextInput
              style={[
                styles.chartTradeVolumeInput,
                useMtPendingTradeSheetLayout && styles.chartTradeVolumeInputPending,
              ]}
              value={sheet.chartTradeVolumeInputFocused ? sheet.chartTradeVolumeDraft : sheet.chartTradeVolumePrimaryDisplay}
              onFocus={handlers.onFocusTradeVolumeInput}
              onChangeText={handlers.onChangeTradeVolumeDraft}
              onBlur={handlers.onBlurTradeVolumeDraft}
              onEndEditing={handlers.onEndTradeVolumeDraft}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
              showSoftInputOnFocus
              onSubmitEditing={handlers.onSubmitTradeVolumeDraft}
              placeholder={sheet.passiveLotDisplay}
              placeholderTextColor="#94A3B8"
            />
            <Pressable
              style={[
                styles.chartTradeStepperLaunchButton,
                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
              ]}
              onPress={(event) => {
                event.stopPropagation?.();
                handlers.onOpenVolumeStepper();
              }}
              hitSlop={8}
              unstable_pressDelay={0}
              activateOnPressIn
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </View>
        <View style={styles.chartTradeVolumeDivider} />
        <Pressable
          style={[styles.chartTradeVolumeUnitSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeUnitSidePending]}
          onPress={(event) => {
            event.stopPropagation?.();
            handlers.onToggleTradeVolumeDisplayMode();
          }}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Text
            style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {t(sheet.chartTradeVolumeInputFocused ? 'Lots' : sheet.chartTradeVolumeModeLabel)}
          </Text>
          <View
            style={[
              styles.chartTradeStepperLaunchButton,
              useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
            ]}
          >
            <View style={styles.chartTradeStepperLaunchIconStack}>
              <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </View>
          </View>
        </Pressable>
      </View>

      <ChartTradeVolumeSlider
        styles={styles}
        value={sheet.tradeVolume}
        bounds={sheet.tradeVolumeBounds}
        onChange={handlers.onChangeTradeVolume}
      />

      <View style={[styles.chartTradeMetaRow, useMtPendingTradeSheetLayout && styles.chartTradeMetaRowPending]}>
        <View style={styles.chartTradeMetricCard}>
          <Text style={[styles.chartTradeMetaText, styles.chartTradeMetricLabel, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]} numberOfLines={1}>
            {primaryMetricLabel}
          </Text>
          <Text style={styles.chartTradeMetricValue} numberOfLines={1} adjustsFontSizeToFit>
            {primaryMetricValue}
          </Text>
        </View>
        <View style={styles.chartTradeMetricCard}>
          <Text style={[styles.chartTradeMetaText, styles.chartTradeMetricLabel, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]} numberOfLines={1}>
            {secondaryMetricLabel}
          </Text>
          <Text style={styles.chartTradeMetricValue} numberOfLines={1} adjustsFontSizeToFit>
            {secondaryMetricValue}
          </Text>
        </View>
        <View style={styles.chartTradeMetricCard}>
          <Text style={[styles.chartTradeMetaText, styles.chartTradeMetricLabel, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]} numberOfLines={1}>
            {t('Free')}
          </Text>
          <Text style={styles.chartTradeMetricValue} numberOfLines={1} adjustsFontSizeToFit>
            {sheet.accountFreeMargin} {sheet.accountCurrency}
          </Text>
        </View>
      </View>
    </>
  );
}

function ChartTradeStopLevelsSection({
  styles,
  colors,
  symbolHeader,
  sheet,
  handlers,
  useMtPendingTradeSheetLayout,
}: {
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  symbolHeader: { displayDecimals: number };
  sheet: any;
  handlers: any;
  useMtPendingTradeSheetLayout: boolean;
}) {
  const T = useTheme();
  const { t } = useTranslation();
  const slEnabled = !!sheet.chartTradeSlEnabled;
  const tpEnabled = !!sheet.chartTradeTpEnabled;
  const showStopControls = slEnabled || tpEnabled;
  const isDirectMarketProtection = !!sheet.chartDirectProtectionActive;
  const modifyPhase = String(sheet.chartModifyTicketState?.phase ?? 'idle');
  const modifyAttemptActive = sheet.chartModifyTicketState?.activeAttemptId !== undefined;
  const positionCandidates = Array.isArray(sheet.chartPositionCandidates)
    ? sheet.chartPositionCandidates
    : [];
  const positionSelectionRequired =
    !isDirectMarketProtection &&
    !isPendingChartOrderType(sheet.chartTradeOrderType) &&
    (
      !!sheet.chartPositionSelectionInvalid ||
      (positionCandidates.length > 1 && !sheet.chartSelectedPositionTicket)
    );
  const protectionCapabilityLocked = !!sheet.chartProtectionBackendLocked;
  const modifyRateLimited = !!sheet.chartModifyRateLimited;
  const protectionControlsDisabled =
    protectionCapabilityLocked || positionSelectionRequired || modifyRateLimited;
  const protectionStatus = protectionCapabilityLocked
    ? t('Unavailable')
    : modifyRateLimited
      ? t('Rate limited')
      : positionSelectionRequired
        ? t('Select position')
        : modifyPhase === 'pending'
          ? t('Saving')
          : modifyPhase === 'reconciling' && modifyAttemptActive
            ? t('Confirming')
            : modifyPhase === 'unknown'
              ? t('Outcome unknown')
              : modifyPhase === 'changed_elsewhere'
                ? t('Changed elsewhere')
                : modifyPhase === 'position_unavailable'
                  ? t('Unavailable')
                  : modifyPhase === 'rejected'
                    ? t('Not saved')
                    : modifyPhase === 'saved'
                      ? t('Saved')
                      : showStopControls
                        ? t('Active')
                        : t('Off');
  const showPositionSelector =
    !isDirectMarketProtection &&
    !isPendingChartOrderType(sheet.chartTradeOrderType) &&
    (positionCandidates.length > 0 || !!sheet.chartPositionSelectionInvalid);
  const stopsTargetExistingPosition = !!sheet.chartStopsTargetExistingPosition;
  const protectionContextLabel = stopsTargetExistingPosition
    ? t('Position protection')
    : isPendingChartOrderType(sheet.chartTradeOrderType)
      ? t('Pending order protection')
      : t('New order protection');

  return (
    <>
      {showPositionSelector ? (
        <View style={styles.chartTradePositionSelector}>
          <Text style={styles.chartTradeProtectionEyebrow}>{t('Position')}</Text>
          <View style={styles.chartTradePositionSelectorList}>
            {positionCandidates.map((position: any) => {
              const ticket = String(position.id);
              const selected = String(sheet.chartSelectedPositionTicket ?? '') === ticket;
              return (
                <Pressable
                  key={ticket}
                  style={[
                    styles.chartTradePositionSelectorItem,
                    selected && styles.chartTradePositionSelectorItemSelected,
                  ]}
                  onPress={() => handlers.onSelectPositionTicket(ticket)}
                  unstable_pressDelay={0}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${t('Position')} ${ticket}`}
                >
                  <Text
                    style={[
                      styles.chartTradePositionSelectorTicket,
                      selected && styles.chartTradePositionSelectorTicketSelected,
                    ]}
                    numberOfLines={1}
                  >
                    #{ticket} {String(position.side ?? '').toUpperCase()}
                  </Text>
                  <Text style={styles.chartTradePositionSelectorMeta} numberOfLines={1}>
                    {Number(position.volume ?? 0).toFixed(2)} @ {String(position.openPrice ?? 0)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {sheet.chartPositionSelectionInvalid ? (
            <Text style={styles.chartTradePositionSelectorError}>
              {t('The selected position is no longer available. Select another ticket.')}
            </Text>
          ) : positionCandidates.length > 1 && !sheet.chartSelectedPositionTicket ? (
            <Text style={styles.chartTradePositionSelectorError}>
              {t('Select the exact position ticket before changing SL/TP.')}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.chartTradeProtectionHeader}>
        <View style={styles.chartTradeProtectionTitleGroup}>
          <Text style={styles.chartTradeProtectionEyebrow} numberOfLines={1}>
            {protectionContextLabel}
          </Text>
          <Text style={styles.chartTradeProtectionTitle} numberOfLines={1}>
            {t('Stop Loss')} / {t('Take Profit')}
          </Text>
        </View>
        <View
          style={[
            styles.chartTradeProtectionStatus,
            showStopControls && styles.chartTradeProtectionStatusActive,
          ]}
        >
          <Text
            style={[
              styles.chartTradeProtectionStatusText,
              showStopControls && styles.chartTradeProtectionStatusTextActive,
            ]}
            numberOfLines={1}
          >
            {protectionStatus}
          </Text>
        </View>
      </View>
      {protectionCapabilityLocked ? (
        <Text style={styles.chartTradePositionSelectorError} accessibilityRole="alert">
          {t(getActiveSltpUnavailableMessage())}
        </Text>
      ) : null}

      {!isDirectMarketProtection ? (
        <Pressable
          style={[
            styles.chartTradeStopButton,
            useMtPendingTradeSheetLayout && styles.chartTradeStopButtonPending,
            protectionControlsDisabled && { opacity: 0.5 },
          ]}
          onPress={handlers.onEnableStops}
          disabled={protectionControlsDisabled}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={slEnabled || tpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
          accessibilityState={{ disabled: protectionControlsDisabled }}
        >
          <View style={styles.chartTradeStopButtonContent}>
            <View style={styles.chartTradeStopButtonIcon}>
              <Ionicons name="shield-checkmark-outline" size={17} color={colors.blue} />
            </View>
            <Text style={[styles.chartTradeStopButtonText, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonTextPending]}>
              {slEnabled || tpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.blue} />
          </View>
        </Pressable>
      ) : null}

      {showStopControls ? (
        <View style={styles.chartTradeStopsBlock}>
          <View style={styles.chartTradeStopUnitRow}>
            {sheet.chartTradeStopUnitOptions.map((unit: any) => {
              const active = sheet.chartTradeStopUnit === unit.key;
              return (
                <Pressable
                  key={unit.key}
                  style={[styles.chartTradeStopUnitTab, active && styles.chartTradeStopUnitTabActive]}
                  onPress={() => handlers.onSelectStopUnit(unit.key)}
                  disabled={protectionControlsDisabled}
                  unstable_pressDelay={0}
                >
                  <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{t(unit.label)}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chartTradeStopPairRow}>
            <Pressable
              style={[
                styles.chartTradeStopPairCard,
                styles.chartTradeStopPairCardSl,
                !slEnabled && styles.chartTradeStopPairCardInactive,
              ]}
              onPress={handlers.onOpenSlStepper}
              disabled={protectionControlsDisabled}
              unstable_pressDelay={0}
              accessibilityRole="button"
              accessibilityLabel={t('Stop Loss')}
            >
              <View style={styles.chartTradeStopPairHeader}>
                <View style={[styles.chartTradeStopPairBadge, styles.chartTradeStopPairBadgeSl]}>
                  <Ionicons name="trending-down-outline" size={16} color="#EF4444" />
                </View>
                {sheet.chartTradeStopUnit === 'Pips' ? (
                  <Pressable
                    hitSlop={8}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      handlers.onToggleSlLock();
                    }}
                    disabled={protectionControlsDisabled}
                    style={[styles.chartTradeStopPairLock, sheet.chartTradeSlLocked && styles.chartTradeStopPairLockActive]}
                    unstable_pressDelay={0}
                    accessibilityRole="button"
                    accessibilityLabel={t('Stop Loss')}
                  >
                    <Ionicons
                      name={sheet.chartTradeSlLocked ? 'lock-closed' : 'lock-open-outline'}
                      size={15}
                      color={sheet.chartTradeSlLocked ? colors.blue : colors.textMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.chartTradeStopPairLabel} numberOfLines={1}>{t('Stop Loss')}</Text>
              <Text
                style={[
                  styles.chartTradeStopPairValue,
                  !slEnabled && styles.chartTradeStopPairValueMuted,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {slEnabled ? sheet.chartTradeSlPrice.toFixed(symbolHeader.displayDecimals) : '--'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.chartTradeStopPairCard,
                styles.chartTradeStopPairCardTp,
                !tpEnabled && styles.chartTradeStopPairCardInactive,
              ]}
              onPress={handlers.onOpenTpStepper}
              disabled={protectionControlsDisabled}
              unstable_pressDelay={0}
              accessibilityRole="button"
              accessibilityLabel={t('Take Profit')}
            >
              <View style={styles.chartTradeStopPairHeader}>
                <View style={[styles.chartTradeStopPairBadge, styles.chartTradeStopPairBadgeTp]}>
                  <Ionicons name="trending-up-outline" size={16} color={T.trading.profit} />
                </View>
                {sheet.chartTradeStopUnit === 'Pips' ? (
                  <Pressable
                    hitSlop={8}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      handlers.onToggleTpLock();
                    }}
                    disabled={protectionControlsDisabled}
                    style={[styles.chartTradeStopPairLock, sheet.chartTradeTpLocked && styles.chartTradeStopPairLockActive]}
                    unstable_pressDelay={0}
                    accessibilityRole="button"
                    accessibilityLabel={t('Take Profit')}
                  >
                    <Ionicons
                      name={sheet.chartTradeTpLocked ? 'lock-closed' : 'lock-open-outline'}
                      size={15}
                      color={sheet.chartTradeTpLocked ? colors.blue : colors.textMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.chartTradeStopPairLabel} numberOfLines={1}>{t('Take Profit')}</Text>
              <Text
                style={[
                  styles.chartTradeStopPairValue,
                  !tpEnabled && styles.chartTradeStopPairValueMuted,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {tpEnabled ? sheet.chartTradeTpPrice.toFixed(symbolHeader.displayDecimals) : '--'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

function ChartTradeSheetContent({
  components,
  styles,
  isDark,
  colors,
  symbolHeader,
  sheet,
  handlers,
  tabs,
  sheetScrollRef,
}: ChartTradeSheetContentProps) {
  const { t } = useTranslation();
  const {
    LiveTradeButtons,
    ChartTradeVolumeSlider,
  } = components;
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;
  const shouldShowMarketExecutionButtons = shouldShowChartTradeSheetMarketExecutionButtons({
    chartTradeOrderType: sheet.chartTradeOrderType,
    showInlineFooterWhileSheetOpen: !!sheet.showInlineFooterWhileSheetOpen,
  });
  const stopsTargetExistingPosition = !!sheet.chartStopsTargetExistingPosition;

  return (
    <>
      {sheet.showChartTradeSheetHeader ? (
        <View
          style={[
            styles.chartTradeSheetHeader,
            useMtPendingTradeSheetLayout && styles.chartTradeSheetHeaderPending,
          ]}
        >
          {/* Open from the first accepted touch so the already-preloaded symbol
              picker begins moving before a normal release-based press fires. */}
          <View style={styles.chartTradeSheetSymbolBlock}>
            <Pressable
              style={styles.chartTradeSheetSymbolButton}
              hitSlop={0}
              pressRetentionOffset={0}
              onPress={handlers.onOpenSymbolPicker}
              activateOnPressIn
              activateOnTouchStart
              latencyLabel="chart.symbolPicker.open"
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeSheetSymbolRow}>
                <Text style={styles.chartTradeSheetSymbolText} numberOfLines={1} adjustsFontSizeToFit>
                  {symbolHeader.displaySymbol}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
              <Text style={styles.chartTradeSheetSymbolMeta} numberOfLines={1} adjustsFontSizeToFit>
                {symbolHeader.symbolName}
              </Text>
            </Pressable>
          </View>
          <ChartTradeSheetHeaderActions
            styles={styles}
            colors={colors}
            sheet={sheet}
            handlers={handlers}
          />
        </View>
      ) : null}

      <ScrollView
        ref={tabs.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        style={[
          styles.chartTradeTypeTabsScroll,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsScrollPending,
        ]}
        onLayout={(event) => {
          tabs.onViewportLayout(event.nativeEvent.layout.width);
        }}
        contentContainerStyle={[
          styles.chartTradeTypeTabs,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsPending,
        ]}
      >
        {CHART_ORDER_TYPES.map((option) => {
          const active = option === sheet.chartTradeOrderType;
          const isMarketExecution = option === 'Market Execution';
          const isBackendLocked = isPendingOrderTypeBackendLocked(option);
          return (
            <Pressable
              key={option}
              onLayout={(event) => {
                tabs.onTabLayout(option, {
                  x: event.nativeEvent.layout.x,
                  width: event.nativeEvent.layout.width,
                });
              }}
              style={[
                styles.chartTradeTypeTab,
                useMtPendingTradeSheetLayout && styles.chartTradeTypeTabPending,
                useMtPendingTradeSheetLayout && isMarketExecution && styles.chartTradeTypeTabPendingMarketExecution,
                active && styles.chartTradeTypeTabActive,
                useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabPendingActive,
                isBackendLocked && styles.chartTradeTypeTabLocked,
              ]}
              disabled={isBackendLocked}
              accessibilityRole="button"
              accessibilityLabel={isBackendLocked ? `${t(option)}. ${t('Locked')}` : t(option)}
              accessibilityState={{ selected: active, disabled: isBackendLocked }}
              onPress={() => handlers.onSelectOrderType(option)}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeTypeTabText,
                  useMtPendingTradeSheetLayout && styles.chartTradeTypeTabTextPending,
                  useMtPendingTradeSheetLayout
                  && isMarketExecution
                  && styles.chartTradeTypeTabTextPendingMarketExecution,
                  active && styles.chartTradeTypeTabTextActive,
                  useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                  isBackendLocked && styles.chartTradeTypeTabTextLocked,
                ]}
                numberOfLines={1}
              >
                {t(option)}
              </Text>
              {isBackendLocked ? (
                <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
        <ChartTradeVolumeSection
          ChartTradeVolumeSlider={ChartTradeVolumeSlider}
          styles={styles}
          colors={colors}
          sheet={sheet}
          handlers={handlers}
          useMtPendingTradeSheetLayout={useMtPendingTradeSheetLayout}
        />

        {isPendingChartOrderType(sheet.chartTradeOrderType) ? (
          <Pressable
            style={[
              styles.chartTradePriceCard,
              styles.chartTradePriceCardPending,
              useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
            ]}
            onPress={handlers.onOpenPriceStepper}
            unstable_pressDelay={0}
            accessibilityRole="button"
            accessibilityLabel={t('Price')}
          >
            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Price')}</Text>
            <View style={styles.chartTradeVolumeValueGroup}>
              <Text
                style={[
                  styles.chartTradePriceInput,
                  styles.chartTradePriceInputPending,
                  useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                ]}
              >
                {sheet.chartTradePrice > 0
                  ? sheet.chartTradePrice.toFixed(symbolHeader.displayDecimals)
                  : (sheet.chartBid > 0 ? sheet.chartBid.toFixed(symbolHeader.displayDecimals) : '--')}
              </Text>
              <Pressable
                style={[
                  styles.chartTradeStepperLaunchButton,
                  useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                ]}
                onPress={(event) => {
                  event.stopPropagation?.();
                  handlers.onOpenPriceStepper();
                }}
                hitSlop={8}
                unstable_pressDelay={0}
              >
                <View style={styles.chartTradeStepperLaunchIconStack}>
                  <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </Pressable>
        ) : null}

        {sheet.isStopLimitChartOrder ? (
          <Pressable
            style={[
              styles.chartTradePriceCard,
              styles.chartTradePriceCardPending,
              useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
            ]}
            onPress={handlers.onOpenStopLimitPriceStepper}
            unstable_pressDelay={0}
            accessibilityRole="button"
            accessibilityLabel={t('Stop Limit Price')}
          >
            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>
              {t('Stop Limit Price')}
            </Text>
            <View style={styles.chartTradeVolumeValueGroup}>
              <Text
                style={[
                  styles.chartTradePriceInput,
                  styles.chartTradePriceInputPending,
                  useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                ]}
              >
                {sheet.chartTradeStopLimitPrice > 0 ? sheet.chartTradeStopLimitPrice.toFixed(symbolHeader.displayDecimals) : '--'}
              </Text>
              <Pressable
                style={[
                  styles.chartTradeStepperLaunchButton,
                  useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                ]}
                onPress={(event) => {
                  event.stopPropagation?.();
                  handlers.onOpenStopLimitPriceStepper();
                }}
                hitSlop={8}
                unstable_pressDelay={0}
              >
                <View style={styles.chartTradeStepperLaunchIconStack}>
                  <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </Pressable>
        ) : null}

        <ChartTradeStopLevelsSection
          styles={styles}
          colors={colors}
          symbolHeader={symbolHeader}
          sheet={sheet}
          handlers={handlers}
          useMtPendingTradeSheetLayout={useMtPendingTradeSheetLayout}
        />

        {sheet.showChartTradeExpiration ? (
          <Pressable
            style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
            onPress={handlers.onOpenExpirationMenu}
            unstable_pressDelay={0}
          >
            <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>{t('Expiration')}:</Text>
            <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{t(sheet.chartTradeExpiration)}</Text>
            <Ionicons name="swap-vertical" size={12} color={colors.blue} />
          </Pressable>
        ) : null}

        {sheet.showChartTradeComment ? (
          <View style={[styles.chartTradeCommentBlock, useMtPendingTradeSheetLayout && styles.chartTradeCommentBlockPending]}>
            {sheet.chartTradeCommentFocused && !sheet.showFloatingChartTradeCommentEditor ? (
              <View style={styles.chartTradeCommentEditorInlineRow}>
                <View style={styles.chartTradeCommentEditorInlineInputWrap}>
                  <TextInput
                    ref={sheet.chartTradeCommentInputRef}
                    autoFocus
                    showSoftInputOnFocus
                    style={styles.chartTradeCommentEditorInlineInput}
                    value={sheet.chartTradeComment}
                    onChangeText={handlers.onChangeComment}
                    onBlur={handlers.onBlurComment}
                    placeholder={t('Comment')}
                    placeholderTextColor='#94A3B8'
                    maxLength={31}
                    multiline={false}
                    returnKeyType='done'
                    onSubmitEditing={handlers.onSubmitComment}
                  />
                </View>
                <Pressable
                  onPressIn={handlers.onPrepareCommentSubmit}
                  style={[
                    styles.chartTradeCommentEditorInlineSubmit,
                    !sheet.chartTradeComment.trim() && styles.chartTradeCommentEditorSubmitDisabled,
                  ]}
                  disabled={!sheet.chartTradeComment.trim()}
                  onPress={handlers.onSubmitComment}
                >
                  <Ionicons
                    name='checkmark'
                    size={16}
                    color={sheet.chartTradeComment.trim() ? colors.blue : '#94A3B8'}
                  />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.chartTradeInfoRow,
                  useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending,
                  sheet.chartTradeCommentFocused && styles.chartTradeCommentInfoRowActive,
                ]}
                onPress={handlers.onFocusComment}
                unstable_pressDelay={0}
              >
                <Text
                  style={[
                    styles.chartTradeInfoLabel,
                    useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending,
                    styles.chartTradeCommentInlineLabel,
                  ]}
                >
                  {t('Comment')}:
                </Text>
                <Text
                  style={[
                    styles.chartTradeCommentInlineValue,
                    !sheet.chartTradeComment.trim() && styles.chartTradeCommentInlinePlaceholder,
                    useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending,
                    sheet.chartTradeCommentFocused && styles.chartTradeCommentInlineValueActive,
                  ]}
                  numberOfLines={1}
                >
                  {sheet.chartTradeComment.trim() || t('Add comment')}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {sheet.chartTradeOrderType === 'Market Execution' ? (
          shouldShowMarketExecutionButtons ? (
            <LiveTradeButtons
              key={`chart-trade-sheet-market-${sheet.chartSymbol}`}
              symbol={sheet.chartSymbol}
              displayDecimals={symbolHeader.displayDecimals}
              lotSize={sheet.tradeVolume}
              volumeBounds={sheet.tradeVolumeBounds}
              chartWindowPaneId={sheet.chartWindowPaneId}
              comment={sheet.chartTradeComment}
              stopLossPrice={
                !stopsTargetExistingPosition &&
                !sheet.newMarketOrderProtectionBackendLocked &&
                sheet.chartTradeSlEnabled
                  ? sheet.chartTradeSlPrice
                  : undefined
              }
              takeProfitPrice={
                !stopsTargetExistingPosition &&
                !sheet.newMarketOrderProtectionBackendLocked &&
                sheet.chartTradeTpEnabled
                  ? sheet.chartTradeTpPrice
                  : undefined
              }
              pointSize={sheet.chartProtectionTickSize ?? 0}
              protectionDraftId={sheet.directMarketProtectionDraftId}
              variant='mt5-market'
              onTradeResult={sheet.onTradeResult}
              onTradeQueueEvent={sheet.onTradeQueueEvent}
              fallbackBid={sheet.chartBid}
              fallbackAsk={sheet.chartAsk}
              isDark={isDark}
              buyColor={colors.blue}
              sellColor={colors.sellPrimary}
            />
          ) : null
        ) : (
          <>
            <Pressable
              style={[
                styles.chartTradePlaceButton,
                sheet.disablePendingTradePlaceButton
                  ? styles.chartTradePlaceButtonDisabled
                  : { backgroundColor: sheet.chartTradeCtaColor },
              ]}
              onPress={sheet.disablePendingTradePlaceButton ? undefined : handlers.onSubmitPendingTrade}
              disabled={sheet.disablePendingTradePlaceButton}
              accessibilityRole="button"
              accessibilityState={{ disabled: sheet.disablePendingTradePlaceButton }}
            >
              <Text
                style={[
                  styles.chartTradePlaceButtonText,
                  sheet.disablePendingTradePlaceButton && styles.chartTradePlaceButtonTextDisabled,
                ]}
                numberOfLines={1}
              >
                {`${t('Place')} ${t(sheet.chartTradeOrderType)}`}
              </Text>
            </Pressable>
          </>
        )}

        <LiveOrderTickExecutionGraph
          symbol={sheet.chartSymbol}
          bid={sheet.chartBid}
          ask={sheet.chartAsk}
          timestamp={sheet.chartTradeTickTimestamp}
          enabled={sheet.showChartTradeSheet}
          priceDecimals={symbolHeader.displayDecimals}
          bidColor="#2563EB"
          askColor="#EF4444"
          height={286}
          isDark={isDark}
        />
      </View>
    </>
  );
}

/**
 * Pinned header rendered OUTSIDE the ScrollView so it never scrolls away.
 * Contains: symbol selector + SL/TP shortcuts + order type tabs.
 */
function ChartTradeSheetPinnedHeader({
  styles,
  colors,
  symbolHeader,
  sheet,
  handlers,
  tabs,
  components,
  compactForAppMenu = false,
}: {
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  handlers: any;
  tabs: {
    scrollRef?: React.RefObject<ScrollView | null>;
    onViewportLayout: (width: number) => void;
    onTabLayout: (orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => void;
  };
  components: TradeFeatureComponents;
  compactForAppMenu?: boolean;
}) {
  const { t } = useTranslation();
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;

  return (
    <>
      {/* Symbol header row */}
      <View
        style={[
          styles.chartTradeSheetHeader,
          useMtPendingTradeSheetLayout && styles.chartTradeSheetHeaderPending,
          compactForAppMenu && styles.chartTradeSheetHeaderCompact,
        ]}
      >
        {/* The pinned header uses the same touch-start path as the inline
            header, keeping symbol-picker response equal in both layouts. */}
        {/* Keep the flexible spacing outside the symbol's touch target. */}
        <View
          style={[
            styles.chartTradeSheetSymbolBlock,
            compactForAppMenu && styles.chartTradeSheetSymbolBlockCompact,
          ]}
        >
          <Pressable
            style={styles.chartTradeSheetSymbolButton}
            hitSlop={0}
            pressRetentionOffset={0}
            onPress={handlers.onOpenSymbolPicker}
            activateOnPressIn
            activateOnTouchStart
            latencyLabel="chart.symbolPicker.open"
            unstable_pressDelay={0}
          >
            <View style={styles.chartTradeSheetSymbolRow}>
              <Text style={styles.chartTradeSheetSymbolText} numberOfLines={1} adjustsFontSizeToFit>
                {symbolHeader.displaySymbol}
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </View>
            {!compactForAppMenu ? (
              <Text style={styles.chartTradeSheetSymbolMeta} numberOfLines={1} adjustsFontSizeToFit>
                {symbolHeader.symbolName}
              </Text>
            ) : null}
          </Pressable>
        </View>
        <ChartTradeSheetHeaderActions
          styles={styles}
          colors={colors}
          sheet={sheet}
          handlers={handlers}
        />
      </View>

      {/* Order type tabs row */}
      <ScrollView
        ref={tabs.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        style={[
          styles.chartTradeTypeTabsScroll,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsScrollPending,
        ]}
        onLayout={(event) => {
          tabs.onViewportLayout(event.nativeEvent.layout.width);
        }}
        contentContainerStyle={[
          styles.chartTradeTypeTabs,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsPending,
        ]}
      >
        {CHART_ORDER_TYPES.map((option) => {
          const active = option === sheet.chartTradeOrderType;
          const isMarketExecution = option === 'Market Execution';
          const isBackendLocked = isPendingOrderTypeBackendLocked(option);
          return (
            <Pressable
              key={option}
              onLayout={(event) => {
                tabs.onTabLayout(option, {
                  x: event.nativeEvent.layout.x,
                  width: event.nativeEvent.layout.width,
                });
              }}
              style={[
                styles.chartTradeTypeTab,
                useMtPendingTradeSheetLayout && styles.chartTradeTypeTabPending,
                useMtPendingTradeSheetLayout && isMarketExecution && styles.chartTradeTypeTabPendingMarketExecution,
                active && styles.chartTradeTypeTabActive,
                useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabPendingActive,
                isBackendLocked && styles.chartTradeTypeTabLocked,
              ]}
              disabled={isBackendLocked}
              accessibilityRole="button"
              accessibilityLabel={isBackendLocked ? `${t(option)}. ${t('Locked')}` : t(option)}
              accessibilityState={{ selected: active, disabled: isBackendLocked }}
              onPress={() => handlers.onSelectOrderType(option)}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeTypeTabText,
                  useMtPendingTradeSheetLayout && styles.chartTradeTypeTabTextPending,
                  useMtPendingTradeSheetLayout
                  && isMarketExecution
                  && styles.chartTradeTypeTabTextPendingMarketExecution,
                  active && styles.chartTradeTypeTabTextActive,
                  useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                  isBackendLocked && styles.chartTradeTypeTabTextLocked,
                ]}
                numberOfLines={1}
              >
                {t(option)}
              </Text>
              {isBackendLocked ? (
                <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

/**
 * Body content rendered INSIDE the ScrollView — everything below symbol header and tabs.
 */
function ChartTradeSheetBody({
  components,
  styles,
  isDark,
  colors,
  symbolHeader,
  sheet,
  handlers,
}: {
  components: TradeFeatureComponents;
  styles: any;
  isDark: boolean;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  handlers: any;
}) {
  const { t } = useTranslation();
  const {
    LiveTradeButtons,
    ChartTradeVolumeSlider,
  } = components;
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;
  const shouldShowMarketExecutionButtons = shouldShowChartTradeSheetMarketExecutionButtons({
    chartTradeOrderType: sheet.chartTradeOrderType,
    showInlineFooterWhileSheetOpen: !!sheet.showInlineFooterWhileSheetOpen,
  });
  const stopsTargetExistingPosition = !!sheet.chartStopsTargetExistingPosition;

  return (
    <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
      <ChartTradeVolumeSection
        ChartTradeVolumeSlider={ChartTradeVolumeSlider}
        styles={styles}
        colors={colors}
        sheet={sheet}
        handlers={handlers}
        useMtPendingTradeSheetLayout={useMtPendingTradeSheetLayout}
      />

      {isPendingChartOrderType(sheet.chartTradeOrderType) ? (
        <Pressable
          style={[
            styles.chartTradePriceCard,
            styles.chartTradePriceCardPending,
            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
          ]}
          onPress={handlers.onOpenPriceStepper}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={t('Price')}
        >
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Price')}</Text>
          <View style={styles.chartTradeVolumeValueGroup}>
            <Text
              style={[
                styles.chartTradePriceInput,
                styles.chartTradePriceInputPending,
                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
              ]}
            >
              {sheet.chartTradePrice > 0
                ? sheet.chartTradePrice.toFixed(symbolHeader.displayDecimals)
                : (sheet.chartBid > 0 ? sheet.chartBid.toFixed(symbolHeader.displayDecimals) : '--')}
            </Text>
            <Pressable
              style={[
                styles.chartTradeStepperLaunchButton,
                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
              ]}
              onPress={(event) => {
                event.stopPropagation?.();
                handlers.onOpenPriceStepper();
              }}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      {sheet.isStopLimitChartOrder ? (
        <Pressable
          style={[
            styles.chartTradePriceCard,
            styles.chartTradePriceCardPending,
            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
          ]}
          onPress={handlers.onOpenStopLimitPriceStepper}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={t('Stop Limit Price')}
        >
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>
            {t('Stop Limit Price')}
          </Text>
          <View style={styles.chartTradeVolumeValueGroup}>
            <Text
              style={[
                styles.chartTradePriceInput,
                styles.chartTradePriceInputPending,
                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
              ]}
            >
              {sheet.chartTradeStopLimitPrice > 0 ? sheet.chartTradeStopLimitPrice.toFixed(symbolHeader.displayDecimals) : '--'}
            </Text>
            <Pressable
              style={[
                styles.chartTradeStepperLaunchButton,
                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
              ]}
              onPress={(event) => {
                event.stopPropagation?.();
                handlers.onOpenStopLimitPriceStepper();
              }}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      <ChartTradeStopLevelsSection
        styles={styles}
        colors={colors}
        symbolHeader={symbolHeader}
        sheet={sheet}
        handlers={handlers}
        useMtPendingTradeSheetLayout={useMtPendingTradeSheetLayout}
      />

      {sheet.showChartTradeExpiration ? (
        <Pressable
          style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
          onPress={handlers.onOpenExpirationMenu}
          unstable_pressDelay={0}
        >
          <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>{t('Expiration')}:</Text>
          <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{t(sheet.chartTradeExpiration)}</Text>
          <Ionicons name="swap-vertical" size={12} color={colors.blue} />
        </Pressable>
      ) : null}

      {sheet.showChartTradeComment ? (
        <View style={[styles.chartTradeCommentBlock, useMtPendingTradeSheetLayout && styles.chartTradeCommentBlockPending]}>
          {sheet.chartTradeCommentFocused && !sheet.showFloatingChartTradeCommentEditor ? (
            <View style={styles.chartTradeCommentEditorInlineRow}>
              <View style={styles.chartTradeCommentEditorInlineInputWrap}>
                <TextInput
                  ref={sheet.chartTradeCommentInputRef}
                  autoFocus
                  showSoftInputOnFocus
                  style={styles.chartTradeCommentEditorInlineInput}
                  value={sheet.chartTradeComment}
                  onChangeText={handlers.onChangeComment}
                  onBlur={handlers.onBlurComment}
                  placeholder={t('Comment')}
                  placeholderTextColor='#94A3B8'
                  maxLength={31}
                  multiline={false}
                  returnKeyType='done'
                  onSubmitEditing={handlers.onSubmitComment}
                />
              </View>
              <Pressable
                onPressIn={handlers.onPrepareCommentSubmit}
                style={[
                  styles.chartTradeCommentEditorInlineSubmit,
                  !sheet.chartTradeComment.trim() && styles.chartTradeCommentEditorSubmitDisabled,
                ]}
                disabled={!sheet.chartTradeComment.trim()}
                onPress={handlers.onSubmitComment}
              >
                <Ionicons
                  name='checkmark'
                  size={16}
                  color={sheet.chartTradeComment.trim() ? colors.blue : '#94A3B8'}
                />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[
                styles.chartTradeInfoRow,
                useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending,
                sheet.chartTradeCommentFocused && styles.chartTradeCommentInfoRowActive,
              ]}
              onPress={handlers.onFocusComment}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeInfoLabel,
                  useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending,
                  styles.chartTradeCommentInlineLabel,
                ]}
              >
                {t('Comment')}:
              </Text>
              <Text
                style={[
                  styles.chartTradeCommentInlineValue,
                  !sheet.chartTradeComment.trim() && styles.chartTradeCommentInlinePlaceholder,
                  useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending,
                  sheet.chartTradeCommentFocused && styles.chartTradeCommentInlineValueActive,
                ]}
                numberOfLines={1}
              >
                {sheet.chartTradeComment.trim() || t('Add comment')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {sheet.chartTradeOrderType === 'Market Execution' ? (
        shouldShowMarketExecutionButtons ? (
          <LiveTradeButtons
            key={`chart-trade-sheet-market-${sheet.chartSymbol}`}
            symbol={sheet.chartSymbol}
            displayDecimals={symbolHeader.displayDecimals}
            lotSize={sheet.tradeVolume}
            volumeBounds={sheet.tradeVolumeBounds}
            chartWindowPaneId={sheet.chartWindowPaneId}
            comment={sheet.chartTradeComment}
            stopLossPrice={
              !stopsTargetExistingPosition &&
              !sheet.newMarketOrderProtectionBackendLocked &&
              sheet.chartTradeSlEnabled
                ? sheet.chartTradeSlPrice
                : undefined
            }
            takeProfitPrice={
              !stopsTargetExistingPosition &&
              !sheet.newMarketOrderProtectionBackendLocked &&
              sheet.chartTradeTpEnabled
                ? sheet.chartTradeTpPrice
                : undefined
            }
            pointSize={sheet.chartProtectionTickSize ?? 0}
            protectionDraftId={sheet.directMarketProtectionDraftId}
            variant='mt5-market'
            onTradeResult={sheet.onTradeResult}
            onTradeQueueEvent={sheet.onTradeQueueEvent}
            fallbackBid={sheet.chartBid}
            fallbackAsk={sheet.chartAsk}
            isDark={isDark}
            buyColor={colors.blue}
            sellColor={colors.sellPrimary}
          />
        ) : null
      ) : (
        <>
          <Pressable
            style={[
              styles.chartTradePlaceButton,
              sheet.disablePendingTradePlaceButton
                ? styles.chartTradePlaceButtonDisabled
                : { backgroundColor: sheet.chartTradeCtaColor },
            ]}
            onPress={sheet.disablePendingTradePlaceButton ? undefined : handlers.onSubmitPendingTrade}
            disabled={sheet.disablePendingTradePlaceButton}
            accessibilityRole="button"
            accessibilityState={{ disabled: sheet.disablePendingTradePlaceButton }}
          >
            <Text
              style={[
                styles.chartTradePlaceButtonText,
                sheet.disablePendingTradePlaceButton && styles.chartTradePlaceButtonTextDisabled,
              ]}
              numberOfLines={1}
            >
              {`${t('Place')} ${t(sheet.chartTradeOrderType)}`}
            </Text>
          </Pressable>
        </>
      )}

      <LiveOrderTickExecutionGraph
        symbol={sheet.chartSymbol}
        bid={sheet.chartBid}
        ask={sheet.chartAsk}
        timestamp={sheet.chartTradeTickTimestamp}
        enabled={sheet.showChartTradeSheet}
        priceDecimals={symbolHeader.displayDecimals}
        bidColor="#2563EB"
        askColor="#EF4444"
        height={286}
        isDark={isDark}
      />
    </View>
  );
}

function ChartTradeSheetDragHeader({
  styles,
  sheet,
  handlers,
  compactForAppMenu = false,
}: {
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  sheet: any;
  handlers: any;
  compactForAppMenu?: boolean;
}) {
  if (!shouldShowChartTradeSheetHandle({ chartTradeSheetMode: sheet.chartTradeSheetMode })) {
    return null;
  }

  return (
    <View
      style={[
        styles.chartTradeSheetDragRegion,
        sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetDragRegionPending,
        compactForAppMenu && styles.chartTradeSheetDragRegionCompact,
      ]}
    >
      <Pressable
        style={[
          styles.chartTradeSheetHandleWrap,
          compactForAppMenu && styles.chartTradeSheetHandleWrapCompact,
        ]}
        onPress={handlers.onToggleSheetMode}
        unstable_pressDelay={0}
      >
        <View
          style={[
            styles.chartTradeSheetHandle,
            compactForAppMenu && styles.chartTradeSheetHandleCompact,
          ]}
        />
      </Pressable>
    </View>
  );
}

type ChartTradeOverlayLayerProps = {
  components: TradeFeatureComponents;
  styles: any;
  isDark: boolean;
  colors: {
    blue: string;
    textMuted: string;
    sellPrimary: string;
  };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  footer: any;
  handlers: any;
};

export function ChartTradeOverlayLayer({
  components,
  styles,
  isDark,
  colors,
  symbolHeader,
  sheet,
  footer,
  handlers,
}: ChartTradeOverlayLayerProps) {
  const {
    LiveTradeButtons,
    ChartFooterLotPicker,
  } = components;
  const showInlineFooterDock = !!sheet.showInlineFooterDockWhileSheetOpen;
  const showSheetBody = shouldRenderChartTradeSheetBody({
    chartTradeSheetMode: sheet.chartTradeSheetMode,
  });
  const compactForAppMenu =
    !!sheet.chartTradeSheetPortalEnabled && sheet.chartTradeSheetMode === 'collapsed';
  // Full max height + translateY for every mode (hidden/collapsed/expanded).
  // Using only the collapsed height without transform clipped the pinned header
  // and order-type tabs so SL/TP looked empty after open.
  const chartTradeSheetFrameHeight = Math.max(
    Number(sheet.chartTradeSheetMaxHeight) || 0,
    Number(sheet.chartTradeSheetCollapsedHeight) || 0,
    resolveChartTradeSheetFrameHeight({
      chartTradeSheetMode: sheet.chartTradeSheetMode,
      collapsedHeight: sheet.chartTradeSheetCollapsedHeight,
      maxHeight: sheet.chartTradeSheetMaxHeight,
    }),
  );
  const showTradeFooterDock = showInlineFooterDock || footer.showFloatingFooterTradeRow;
  const tradeFooterDockVisible = showInlineFooterDock || footer.floatingFooterTradeRowVisible;
  const isAndroidFloatingFooterLotEditor =
    Platform.OS === 'android' &&
    footer.footerLotEditorFocused &&
    footer.showFloatingFooterTradeRow;
  const fallbackTradeFooterDockBottom = isAndroidFloatingFooterLotEditor
    ? FOOTER_TRADE_DOCK_ANDROID_BOTTOM_SAFE_GAP
    : footer.footerTradeRowKeyboardOffset;
  const resolvedTradeFooterDockBottom = resolveFooterTradeDockBottom({
    platform: Platform.OS,
    footerLotEditorFocused: !!footer.footerLotEditorFocused,
    showFloatingFooterTradeRow: !!footer.showFloatingFooterTradeRow,
    showInlineFooterDock,
    footerTradeRowKeyboardOffset: footer.footerTradeRowKeyboardOffset,
    keyboardVisibleHeight: footer.keyboardVisibleHeight,
    keyboardResizesHost: footer.keyboardResizesHost,
    footerKeyboardAvoidanceOffset: footer.footerKeyboardAvoidanceOffset,
    androidFocusedLotEditorBottomGap: FOOTER_TRADE_DOCK_ANDROID_BOTTOM_SAFE_GAP,
  });
  const tradeFooterDockBottom = Number.isFinite(resolvedTradeFooterDockBottom)
    ? resolvedTradeFooterDockBottom
    : fallbackTradeFooterDockBottom;
  const tradeSheetBottomInset =
    Number.isFinite(sheet.chartTradeSheetBottomInset) && sheet.chartTradeSheetBottomInset > 0
      ? sheet.chartTradeSheetBottomInset
      : 0;
  // Optional bottom reservation for callers that deliberately keep a footer
  // visible.
  const tradeSheetFrameBottom = tradeSheetBottomInset;
  // Pre-mounted while Chart is focused for legacy/internal sheet routes.
  const mountTradeSheet = !!(sheet.mountChartTradeSheet || sheet.showChartTradeSheet);

  return (
    <>
      <ChartTradeSheetPortal
        enabled={!!sheet.chartTradeSheetPortalEnabled}
        keepMounted={!!sheet.chartTradeSheetPortalKeepMounted}
        visible={!!sheet.chartTradeSheetPortalVisible}
        top={sheet.chartTradeSheetPortalTop}
        bottom={sheet.chartTradeSheetPortalBottom}
      >
        {mountTradeSheet ? (
        <View
          pointerEvents={sheet.showChartTradeSheet ? 'box-none' : 'none'}
          accessibilityElementsHidden={!sheet.showChartTradeSheet}
          importantForAccessibility={sheet.showChartTradeSheet ? 'auto' : 'no-hide-descendants'}
          style={[
            styles.chartTradeSheetLayer,
            sheet.chartTradeSheetFrozenLayerHeight > 0 && { height: sheet.chartTradeSheetFrozenLayerHeight },
          ]}
        >
          <Animated.View
            style={[
              styles.chartTradeSheetFrame,
              styles.chartTradeSheetOverlayFrame,
              { height: chartTradeSheetFrameHeight },
              tradeSheetFrameBottom > 0 && { bottom: tradeSheetFrameBottom },
              // Always drive translateY — skipping it in collapsed mode left the
              // sheet at the wrong offset and clipped handle/header/tabs.
              sheet.chartTradeSheetAnimatedStyle,
            ]}
          >
            <View
              collapsable={false}
              style={[
                styles.chartTradeSheet,
                styles.chartTradeSheetInline,
                styles.chartTradeSheetInlineFloating,
                sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
              ]}
            >
              <View
                collapsable={false}
                style={!showSheetBody ? styles.chartTradeSheetCollapsedDragSurface : undefined}
              >
                {/* Keep the pan recognizer on the handle only. The pinned
                    symbol control opens on touch-start, so sharing the whole
                    header with the pan recognizer could open the picker when
                    the user intended to drag the trade sheet. */}
                <GestureDetector gesture={sheet.chartTradeSheetDragGesture}>
                  <View collapsable={false}>
                    <ChartTradeSheetDragHeader
                      styles={styles}
                      colors={colors}
                      sheet={sheet}
                      handlers={handlers}
                      compactForAppMenu={compactForAppMenu}
                    />
                  </View>
                </GestureDetector>

                {/* Pinned symbol header - always visible, never scrolls away */}
                <ChartTradeSheetPinnedHeader
                  styles={styles}
                  colors={colors}
                  symbolHeader={symbolHeader}
                  sheet={sheet}
                  handlers={handlers}
                  compactForAppMenu={compactForAppMenu}
                  tabs={{
                    scrollRef: sheet.chartTradeTypeTabsOverlayScrollRef,
                    onViewportLayout: handlers.onOverlayTabsViewportLayout,
                    onTabLayout: handlers.onOverlayTabLayout,
                  }}
                  components={components}
                />
              </View>

              {showSheetBody ? (
                <ScrollView
                  canCancelContentTouches={Platform.OS === 'ios'}
                  ref={sheet.chartTradeSheetScrollRef}
                  style={styles.chartTradeSheetContentScroll}
                  contentContainerStyle={[
                    styles.chartTradeSheetContent,
                    { paddingBottom: sheet.chartTradeSheetContentBottomPadding },
                  ]}
                  nestedScrollEnabled
                  // Smooth native scrolling: allow light bounce on iOS, keep
                  // Android overscroll off, and avoid thrashing on every frame.
                  bounces={Platform.OS === 'ios'}
                  alwaysBounceVertical={false}
                  overScrollMode="never"
                  decelerationRate="normal"
                  removeClippedSubviews={Platform.OS === 'android'}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                  keyboardDismissMode={sheet.chartTradeCommentFocused ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  // 16ms is enough for offset bookkeeping; lower values force
                  // JS scroll events every frame and make the sheet feel sticky.
                  scrollEventThrottle={32}
                  onScroll={(event) => {
                    handlers.onTradeSheetScroll(event.nativeEvent.contentOffset.y);
                  }}
                >
                  <ChartTradeSheetBody
                    components={components}
                    styles={styles}
                    isDark={isDark}
                    colors={colors}
                    symbolHeader={symbolHeader}
                    sheet={sheet}
                    handlers={handlers}
                  />
                </ScrollView>
              ) : null}
            </View>
          </Animated.View>
        </View>
        ) : null}
      </ChartTradeSheetPortal>

      {sheet.showHiddenInlineTradeSheet ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { display: 'none' },
            styles.chartTradeSheetFrame,
            { height: sheet.chartTradeSheetMaxHeight },
            tradeSheetFrameBottom > 0 && { bottom: tradeSheetFrameBottom },
            sheet.chartTradeSheetAnimatedStyle,
          ]}
        >
          <View
            style={[
              styles.chartTradeSheet,
              styles.chartTradeSheetInline,
              styles.chartTradeSheetInlineFloating,
              sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
            ]}
          >
            {shouldShowChartTradeSheetHandle({ chartTradeSheetMode: sheet.chartTradeSheetMode }) ? (
              <View collapsable={false}>
                <ChartTradeSheetDragHeader
                  styles={styles}
                  colors={colors}
                  sheet={sheet}
                  handlers={handlers}
                />
              </View>
            ) : null}

            <ScrollView
              canCancelContentTouches={Platform.OS === 'ios'}
              style={styles.chartTradeSheetContentScroll}
              contentContainerStyle={[
                styles.chartTradeSheetContent,
                { paddingBottom: sheet.chartTradeSheetContentBottomPadding },
              ]}
              nestedScrollEnabled
              bounces={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode={sheet.chartTradeCommentFocused ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              scrollEventThrottle={16}
              onScroll={(event) => {
                handlers.onTradeSheetScroll(event.nativeEvent.contentOffset.y);
              }}
            >
              <ChartTradeSheetContent
                components={components}
                styles={styles}
                isDark={isDark}
                colors={colors}
                symbolHeader={symbolHeader}
                sheet={sheet}
                handlers={handlers}
                tabs={{
                  scrollRef: sheet.chartTradeTypeTabsInlineScrollRef,
                  onViewportLayout: handlers.onInlineTabsViewportLayout,
                  onTabLayout: handlers.onInlineTabLayout,
                }}
              />
            </ScrollView>
          </View>
        </Animated.View>
      ) : null}

      {showTradeFooterDock ? (
        <View
          pointerEvents={tradeFooterDockVisible ? 'box-none' : 'none'}
          style={styles.footerTradeDockLayer}
        >
          <View
            pointerEvents={tradeFooterDockVisible ? 'auto' : 'none'}
            style={[
              styles.footerTradeDock,
              {
                bottom: tradeFooterDockBottom,
                opacity: tradeFooterDockVisible ? 1 : 0,
              },
            ]}
          >
            <LiveTradeButtons
              key={`chart-trade-footer-dock-${sheet.chartSymbol}`}
              symbol={sheet.chartSymbol}
              displayDecimals={symbolHeader.displayDecimals}
              lotSize={sheet.tradeVolume}
              volumeBounds={sheet.tradeVolumeBounds}
              chartWindowPaneId={sheet.chartWindowPaneId}
              onTradeResult={sheet.onTradeResult}
              onTradeQueueEvent={sheet.onTradeQueueEvent}
              comment={sheet.chartTradeComment}
              stopLossPrice={sheet.directMarketStopLossPrice}
              takeProfitPrice={sheet.directMarketTakeProfitPrice}
              protectionDraftId={sheet.directMarketProtectionDraftId}
              pointSize={sheet.chartProtectionTickSize ?? 0}
              onEditLot={handlers.onEditLot}
              onOpenLotEditor={handlers.onOpenLotEditor}
              isLotEditing={footer.footerLotEditorFocused}
              lotDraft={footer.lotInput}
              lotInputRef={footer.footerLotEditorInputRef}
              onLotDraftChange={handlers.onLotDraftChange}
              onLotDraftBlur={handlers.onLotDraftBlur}
              onLotDraftEndEditing={handlers.onLotDraftEndEditing}
              onLotDraftSubmit={handlers.onLotDraftSubmit}
              onDecreaseLot={handlers.onDecreaseLot}
              onIncreaseLot={handlers.onIncreaseLot}
              fallbackBid={sheet.chartBid}
              fallbackAsk={sheet.chartAsk}
              isDark={isDark}
              buyColor={colors.blue}
              sellColor={colors.sellPrimary}
            />
          </View>
        </View>
      ) : null}

      {footer.showFooterLotPicker && !sheet.showChartTradeSheet ? (
        <ChartFooterLotPicker
          visible={footer.showFooterLotPicker}
          mode={footer.footerLotPickerMode ?? 'absolute'}
          value={sheet.tradeVolume}
          bounds={sheet.tradeVolumeBounds}
          bottomOffset={
            footer.floatingFooterTradeRowVisible
              ? footer.footerTradeRowKeyboardOffset + FOOTER_LOT_PICKER_BASE_OFFSET
              : FOOTER_LOT_PICKER_BASE_OFFSET
          }
          styles={styles}
          onClose={handlers.onCloseFooterLotPicker}
          onSelect={handlers.onSelectFooterLot}
        />
      ) : null}

    </>
  );
}

type ChartTradeInlineFooterProps = {
  LiveTradeButtons: React.ComponentType<any>;
  styles: any;
  animatedStyle: any;
  containerRef?: React.RefObject<View | null>;
  isDark: boolean;
  buyColor: string;
  sellColor: string;
  hideInlineTradeRow?: boolean;
  showFloatingFooterTradeRow: boolean;
  chartSymbol: string;
  chartWindowPaneId?: string;
  displayDecimals: number;
  tradeVolume: number;
  tradeVolumeBounds: any;
  onTradeResult: (feedback: any) => void;
  onTradeQueueEvent: (event: any) => void;
  comment?: string;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  protectionDraftId?: string;
  pointSize?: number;
  onEditLot: () => void;
  onOpenLotEditor: (mode?: 'absolute' | 'increase' | 'decrease') => void;
  isLotEditing: boolean;
  lotDraft: string;
  lotInputRef: React.RefObject<TextInput | null>;
  onLotDraftChange: (text: string) => void;
  onLotDraftBlur: () => void;
  onLotDraftEndEditing: (event: any) => void;
  onLotDraftSubmit: (event?: any) => void;
  onDecreaseLot: () => void;
  onIncreaseLot: () => void;
  lotInvalid?: boolean;
  invalidLotDisplay?: string;
  active?: boolean;
  fallbackBid?: number | null;
  fallbackAsk?: number | null;
  compactPane?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function ChartTradeInlineFooter({
  LiveTradeButtons,
  styles,
  animatedStyle,
  containerRef,
  isDark,
  buyColor,
  sellColor,
  hideInlineTradeRow = false,
  showFloatingFooterTradeRow,
  chartSymbol,
  chartWindowPaneId,
  displayDecimals,
  tradeVolume,
  tradeVolumeBounds,
  onTradeResult,
  onTradeQueueEvent,
  comment,
  stopLossPrice,
  takeProfitPrice,
  protectionDraftId,
  pointSize,
  onEditLot,
  onOpenLotEditor,
  isLotEditing,
  lotDraft,
  lotInputRef,
  onLotDraftChange,
  onLotDraftBlur,
  onLotDraftEndEditing,
  onLotDraftSubmit,
  onDecreaseLot,
  onIncreaseLot,
  lotInvalid = false,
  invalidLotDisplay,
  active = true,
  fallbackBid,
  fallbackAsk,
  compactPane = false,
  onLayout,
}: ChartTradeInlineFooterProps) {
  const inlineFooterReceivesTouches = !showFloatingFooterTradeRow && !hideInlineTradeRow;
  const shouldPreserveInlineFooterSpace = showFloatingFooterTradeRow && !hideInlineTradeRow;

  return (
    <Animated.View
      ref={containerRef}
      pointerEvents={inlineFooterReceivesTouches ? 'auto' : 'none'}
      onLayout={onLayout}
      style={[styles.bottomArea, animatedStyle]}
    >
      {inlineFooterReceivesTouches ? (
        <LiveTradeButtons
          key={`chart-trade-inline-footer-${chartSymbol}`}
          symbol={chartSymbol}
          chartWindowPaneId={chartWindowPaneId}
          displayDecimals={displayDecimals}
          lotSize={tradeVolume}
          volumeBounds={tradeVolumeBounds}
          onTradeResult={onTradeResult}
          onTradeQueueEvent={onTradeQueueEvent}
          comment={comment}
          stopLossPrice={stopLossPrice}
          takeProfitPrice={takeProfitPrice}
          protectionDraftId={protectionDraftId}
          pointSize={pointSize}
          onEditLot={onEditLot}
          onOpenLotEditor={onOpenLotEditor}
          isLotEditing={isLotEditing}
          lotDraft={lotDraft}
          lotInputRef={lotInputRef}
          onLotDraftChange={onLotDraftChange}
          onLotDraftBlur={onLotDraftBlur}
          onLotDraftEndEditing={onLotDraftEndEditing}
          onLotDraftSubmit={onLotDraftSubmit}
          onDecreaseLot={onDecreaseLot}
          onIncreaseLot={onIncreaseLot}
          lotInvalid={lotInvalid}
          invalidLotDisplay={invalidLotDisplay}
          active={active}
          fallbackBid={fallbackBid}
          fallbackAsk={fallbackAsk}
          isDark={isDark}
          buyColor={buyColor}
          sellColor={sellColor}
          compactPane={compactPane}
        />
      ) : shouldPreserveInlineFooterSpace ? (
        <View pointerEvents="none" style={INLINE_FOOTER_TRADE_ROW_RESERVE_STYLE} />
      ) : null}
    </Animated.View>
  );
}

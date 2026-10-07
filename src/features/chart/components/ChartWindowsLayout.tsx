import React, { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PositionItem } from '../../../dev/mock/tradingData';
import { GDark, GLight } from '../../../ui/theme/glass';
import type { ChartWindowPane, ChartWindowState } from '../chartWindowState';
import type { PersistedChartDrawing } from '../drawingPersistence';
import type { PreviewOverlayPriceLine } from '../preview/LiveChartPreview.native';
import type {
  ChartWindowVisualPreferencesByPane,
} from '../chartWindowVisualPreferences';
import {
  createChartWindowRadialMenuRequest,
  type ChartWindowPaneGesture,
  type ChartWindowRadialMenuRequest,
} from '../chartWindowRadialMenu';
import {
  AuxiliaryChartPane,
  type AuxiliaryChartSurfaceFrame,
  type AuxiliaryChartTradeRowRenderContext,
} from './AuxiliaryChartPane';
import {
  ChartWindowTradeRow,
  type ChartWindowTradeRowProps,
} from './ChartWindowTradeRow';

export type ChartWindowPaneFrame = AuxiliaryChartSurfaceFrame & Readonly<{
  paneId: string;
}>;
export type AuxiliaryChartPaneFrame = ChartWindowPaneFrame;

export type ChartWindowsLayoutProps = Readonly<{
  state: ChartWindowState;
  visualPreferencesByPane?: ChartWindowVisualPreferencesByPane;
  drawingsByPane?: Readonly<Record<string, readonly PersistedChartDrawing[]>>;
  viewportCommandsByPane?: Readonly<Record<string, Readonly<{
    revision: number;
    type: 'scrollToLastBar' | 'resetVerticalScale' | 'resetViewport';
  }>>>;
  overlayPriceLinesByPane?: Readonly<
    Record<string, readonly PreviewOverlayPriceLine[]>
  >;
  positions: readonly PositionItem[];
  children: ReactNode;
  isScreenFocused: boolean;
  isDark: boolean;
  lotSize: number;
  showTradeRow: boolean;
  lotInvalid?: boolean;
  invalidLotDisplay?: string;
  /** Immediate navigation-focus check used only by the trade tap safety gate. */
  isTradeExecutionFocused?: () => boolean;
  radialMenuOpen?: boolean;
  /** Fullscreen keeps both panes unless an explicit toolbar target was chosen. */
  showOnlyActivePane?: boolean;
  /** Claims toolbar ownership on pointer down without waiting for tap disambiguation. */
  onClaimPane: (paneId: string) => void;
  onSelectPane: (paneId: string) => void;
  onOpenPaneRadialMenu?: (request: ChartWindowRadialMenuRequest) => void;
  onOpenPaneSymbolPicker?: (paneId: string) => void;
  onAuxiliaryPaneFrameChange?: (frame: ChartWindowPaneFrame | null) => void;
  onTradeResult?: ChartWindowTradeRowProps['onTradeResult'];
  onTradeQueueEvent?: ChartWindowTradeRowProps['onTradeQueueEvent'];
  onOpenLotEditor?: ChartWindowTradeRowProps['onOpenLotEditor'];
  onDecreaseLot?: ChartWindowTradeRowProps['onDecreaseLot'];
  onIncreaseLot?: ChartWindowTradeRowProps['onIncreaseLot'];
}>;

const renderDirection = (state: ChartWindowState): 'row' | 'column' => (
  state.layout === 'vertical' ? 'row' : 'column'
);

const resolveDirection = (
  state: ChartWindowState,
  activeIndex: number,
): 'row' | 'row-reverse' | 'column' | 'column-reverse' => {
  const direction = renderDirection(state);
  if (activeIndex === 0) return direction;
  return direction === 'row' ? 'row-reverse' : 'column-reverse';
};

/**
 * Keeps the full ChartScreen WebView under one stable key while only the
 * lightweight auxiliary pane changes identity. Selecting/reordering a pane
 * therefore moves the existing native chart instead of remounting it.
 */
export const ChartWindowsLayout = memo(function ChartWindowsLayout({
  state,
  visualPreferencesByPane,
  drawingsByPane,
  viewportCommandsByPane,
  overlayPriceLinesByPane,
  positions,
  children,
  isScreenFocused,
  isDark,
  lotSize,
  showTradeRow,
  lotInvalid = false,
  invalidLotDisplay = '',
  isTradeExecutionFocused,
  radialMenuOpen = false,
  showOnlyActivePane = false,
  onClaimPane,
  onSelectPane,
  onOpenPaneRadialMenu,
  onOpenPaneSymbolPicker,
  onAuxiliaryPaneFrameChange,
  onTradeResult,
  onTradeQueueEvent,
  onOpenLotEditor,
  onDecreaseLot,
  onIncreaseLot,
}: ChartWindowsLayoutProps) {
  const isSplit = state.panes.length > 1;
  const rendersAuxiliaryPane = isSplit && !showOnlyActivePane;
  const stateRef = useRef(state);
  const screenFocusedRef = useRef(isScreenFocused);
  const tradeExecutionFocusResolverRef = useRef(isTradeExecutionFocused);
  stateRef.current = state;
  screenFocusedRef.current = isScreenFocused;
  tradeExecutionFocusResolverRef.current = isTradeExecutionFocused;
  const activeIndex = Math.max(
    0,
    state.panes.findIndex((pane) => pane.id === state.activePaneId),
  );
  const auxiliaryPaneTouchesToolbar =
    rendersAuxiliaryPane
    && state.layout === 'horizontal'
    && activeIndex > 0;
  const auxiliaryPane = useMemo<ChartWindowPane | null>(() => (
    state.panes.find((pane) => pane.id !== state.activePaneId) ?? null
  ), [state.activePaneId, state.panes]);
  const renderedAuxiliaryPaneId = rendersAuxiliaryPane ? auxiliaryPane?.id ?? null : null;
  const renderedAuxiliaryPaneIdRef = useRef(renderedAuxiliaryPaneId);
  const lastRenderedAuxiliaryPaneIdRef = useRef<string | null | undefined>(undefined);
  renderedAuxiliaryPaneIdRef.current = renderedAuxiliaryPaneId;
  // Read the auxiliary pane's own snapshot so its Area/Renko selection is not
  // overwritten by whichever visual type the active full WebView is using.
  const auxiliaryVisualPreferences = auxiliaryPane
    ? visualPreferencesByPane?.[auxiliaryPane.id]
    : undefined;
  const resolveAuxiliaryExecutionOwnership = useCallback((
    context: AuxiliaryChartTradeRowRenderContext,
  ) => {
    const focusResolver = tradeExecutionFocusResolverRef.current;
    const routeFocused = focusResolver
      ? focusResolver() === true
      : screenFocusedRef.current;
    if (!routeFocused || !context.paneId) return false;
    const current = stateRef.current;
    return current.panes.length > 1 && current.panes.some((pane) => (
      pane.id === context.paneId
      && pane.symbol === context.symbol
      && pane.timeframe === context.timeframe
    ));
  }, []);
  const renderAuxiliaryTradeRow = useCallback((
    context: AuxiliaryChartTradeRowRenderContext,
  ) => (
    <ChartWindowTradeRow
      context={context}
      active={isScreenFocused && isSplit}
      isDark={isDark}
      lotSize={lotSize}
      lotInvalid={lotInvalid}
      invalidLotDisplay={invalidLotDisplay}
      resolveExecutionOwnership={resolveAuxiliaryExecutionOwnership}
      onTradeResult={onTradeResult}
      onTradeQueueEvent={onTradeQueueEvent}
      onOpenLotEditor={onOpenLotEditor}
      onDecreaseLot={onDecreaseLot}
      onIncreaseLot={onIncreaseLot}
    />
  ), [
    invalidLotDisplay,
    isDark,
    isScreenFocused,
    isSplit,
    lotInvalid,
    lotSize,
    onDecreaseLot,
    onIncreaseLot,
    onOpenLotEditor,
    onTradeQueueEvent,
    onTradeResult,
    resolveAuxiliaryExecutionOwnership,
  ]);
  const handleAuxiliaryDoubleTap = useCallback((gesture: ChartWindowPaneGesture) => {
    if (!auxiliaryPane || !onOpenPaneRadialMenu) return;
    const current = stateRef.current;
    const currentPane = current.panes.find((pane) => pane.id === auxiliaryPane.id);
    if (
      current.panes.length <= 1
      || !currentPane
      || currentPane.symbol !== auxiliaryPane.symbol
      || currentPane.timeframe !== auxiliaryPane.timeframe
    ) {
      return;
    }
    // Preserve the exact pane identity and tap coordinates. ChartScreen
    // revalidates this request after the selected pane/context has committed.
    onOpenPaneRadialMenu(createChartWindowRadialMenuRequest(currentPane, gesture));
  }, [auxiliaryPane, onOpenPaneRadialMenu]);
  const handleActivePaneTouchStart = useCallback(() => {
    onClaimPane(stateRef.current.activePaneId);
  }, [onClaimPane]);
  const handleAuxiliaryPaneTouchStart = useCallback(() => {
    if (!auxiliaryPane) return;
    onClaimPane(auxiliaryPane.id);
  }, [auxiliaryPane, onClaimPane]);
  const handleAuxiliaryChartSurfaceFrameChange = useCallback((
    frame: AuxiliaryChartSurfaceFrame,
  ) => {
    const measuredPaneId = auxiliaryPane?.id ?? null;
    if (
      !measuredPaneId
      || renderedAuxiliaryPaneIdRef.current !== measuredPaneId
    ) {
      return;
    }
    onAuxiliaryPaneFrameChange?.({ paneId: measuredPaneId, ...frame });
  }, [auxiliaryPane?.id, onAuxiliaryPaneFrameChange]);
  useEffect(() => {
    if (lastRenderedAuxiliaryPaneIdRef.current !== renderedAuxiliaryPaneId) {
      lastRenderedAuxiliaryPaneIdRef.current = renderedAuxiliaryPaneId;
      onAuxiliaryPaneFrameChange?.(null);
    }
  }, [onAuxiliaryPaneFrameChange, renderedAuxiliaryPaneId]);

  const activeChart = (
    <View
      key="chart-window-active-engine"
      testID="chart-window-active-pane"
      onTouchStart={handleActivePaneTouchStart}
      style={[
        styles.pane,
        rendersAuxiliaryPane && styles.splitPane,
        rendersAuxiliaryPane && styles.transparentSplitFrame,
        // Split panes normally clip their chart. Lift only the active pane while
        // the radial is visible so a menu near an edge can cross the divider.
        rendersAuxiliaryPane && radialMenuOpen && styles.radialMenuPane,
      ]}
    >
      {children}
    </View>
  );

  const auxiliaryChart = auxiliaryPane ? (
    <AuxiliaryChartPane
      key="chart-window-auxiliary-engine"
      paneId={auxiliaryPane.id}
      symbol={auxiliaryPane.symbol}
      timeframe={auxiliaryPane.timeframe}
      isScreenFocused={isScreenFocused && rendersAuxiliaryPane}
      isDark={isDark}
      layout={state.layout}
      lotSize={lotSize}
      showTradeRow={
        auxiliaryVisualPreferences?.chartDisplay.showQuickTradingButtons
        ?? showTradeRow
      }
      visualPreferences={auxiliaryVisualPreferences}
      drawings={drawingsByPane?.[auxiliaryPane.id] ?? []}
      viewportCommand={viewportCommandsByPane?.[auxiliaryPane.id]}
      overlayPriceLines={overlayPriceLinesByPane?.[auxiliaryPane.id] ?? []}
      positions={positions}
      onChartSurfaceFrameChange={handleAuxiliaryChartSurfaceFrameChange}
      onPaneTouchStart={handleAuxiliaryPaneTouchStart}
      onTapIntent={handleAuxiliaryPaneTouchStart}
      onPress={() => onSelectPane(auxiliaryPane.id)}
      onDoublePress={handleAuxiliaryDoubleTap}
      onSymbolPress={() => onOpenPaneSymbolPicker?.(auxiliaryPane.id)}
      renderTradeRow={renderAuxiliaryTradeRow}
      testID={`chart-window-pane-${auxiliaryPane.id}`}
    />
  ) : null;

  return (
    <View
      testID="chart-windows-layout"
      style={[
        styles.root,
        { flexDirection: rendersAuxiliaryPane ? resolveDirection(state, activeIndex) : 'column' },
      ]}
    >
      {activeChart}
      {rendersAuxiliaryPane ? auxiliaryChart : null}
      {auxiliaryPaneTouchesToolbar ? (
        <View
          pointerEvents="none"
          testID="chart-window-toolbar-separator"
          style={[
            styles.toolbarBoundarySeparator,
            { backgroundColor: isDark ? GDark.borderMedium : GLight.borderMedium },
          ]}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: 'relative',
  },
  pane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  splitPane: {
    borderWidth: 1.5,
  },
  transparentSplitFrame: {
    borderColor: 'transparent',
  },
  radialMenuPane: {
    overflow: 'visible',
    zIndex: 80,
    elevation: 80,
  },
  toolbarBoundarySeparator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 20,
  },
});

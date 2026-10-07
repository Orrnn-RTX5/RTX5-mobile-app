/**
 * Core module: uiState.ts
 */

import React from 'react';
import type { TextStyle } from 'react-native';
import { create } from 'zustand';
import type { ChartDrawingKind } from '../features/chart/drawingPersistence';

export type PendingChartCommand = 'scrollToLastBar' | 'resetVerticalScale';

/** Represents a single interactive button in an ActionSheet */
type ActionSheetAction = {
  /** Display label for the button */
  label: string;
  /** Optional secondary line below the main label */
  subtitle?: string;
  /** If true, styles the current choice with the active brand color */
  selected?: boolean;
  /** If true, renders text like a disabled row while keeping the action tappable */
  muted?: boolean;
  /** If true, styles the button as a destructive/danger action */
  danger?: boolean;
  /** Optional override for the primary label color */
  textColor?: string;
  /** Optional override for the primary label font weight */
  textFontWeight?: TextStyle['fontWeight'];
  /** If true, the action appears greyed-out and is not interactive */
  disabled?: boolean;
  /** If true, fires on press-in for tiny non-scroll action groups */
  activateOnPressIn?: boolean;
  /** Let a retained destination paint before React reconciles the hidden sheet. */
  deferCloseCommitForVisualHandoff?: boolean;
  /** Callback fired when the user taps this action */
  onPress?: () => void;
  /** Optional leading icon element */
  icon?: React.ReactNode;
};

/** Configuration object for triggering the global ActionSheet component */
export type ActionSheetConfig = {
  /** Optional title to display at the top of the sheet */
  title?: string;
  /** Optional title alignment override for sheets that need centered headers */
  titleAlign?: 'left' | 'center';
  /** Use compact text sizing for dense picker rows */
  compactText?: boolean;
  /** Optional visual treatment for feature-specific native parity sheets */
  presentation?: 'default' | 'mt5Plain' | 'mt5TimeframeGrid';
  /** Keep leading action icons visible even in plain presentations */
  showActionIcons?: boolean;
  /** For long sheets, mount only the opening viewport and render more rows while scrolling. */
  deferOffscreenActions?: boolean;
  /** Optional cap for how many fixed-height action rows are visible at once. */
  maximumVisibleActionRows?: number;
  /** List of buttons to render */
  actions: ActionSheetAction[];
  /** Enable search filtering in the sheet */
  searchable?: boolean;
  /** Optional placeholder for searchable sheets */
  searchPlaceholder?: string;
  /** Sheet sizing detent */
  detent?: 'auto' | 'adaptive' | 'large';
  /** Minimum distance from the top of the screen */
  minimumTopInset?: number;
  /** If true, mounts the sheet visible immediately without the entry delay */
  instantOpen?: boolean;
  /** Optional entry motion; MT5 slide keeps first-pixel response immediate while animating native values. */
  entryMotion?: 'instant' | 'mt5Slide' | 'standard';
  /** Hide the retained host synchronously on close without changing the entry animation. */
  immediateHostHideOnClose?: boolean;
  /** Opaque identity used to reveal an exact retained sheet before React adopts visibility. */
  visualKey?: string;
  /** If true, defers action execution until after sheet dismiss animation */
  runActionAfterClose?: boolean;
  /** Android keyboard avoidance mode for searchable sheets */
  androidKeyboardAvoidance?: 'event' | 'resize';
  /**
   * Opt-in for fixed-height searchable lists such as Symbol Picker and Drawing
   * Tools. The search box and top results stay put while the keyboard overlays
   * the lower part of the list. Other sheets keep their existing avoidance.
   */
  keepFullHeightOnKeyboard?: boolean;
};

export type ActionSheetScope =
  | 'quotes'
  | 'chart'
  | 'trade'
  | 'history'
  | 'settingsAccounts'
  | 'settingsBrokerDetail';
type ScopedActionSheetState = Record<ActionSheetScope, ActionSheetConfig | null>;

const ACTION_SHEET_SCOPES: ActionSheetScope[] = [
  'quotes',
  'chart',
  'trade',
  'history',
  'settingsAccounts',
  'settingsBrokerDetail',
];

const createEmptyScopedActionSheets = (): ScopedActionSheetState => ({
  quotes: null,
  chart: null,
  trade: null,
  history: null,
  settingsAccounts: null,
  settingsBrokerDetail: null,
});

const hasScopedActionSheet = (sheets: ScopedActionSheetState) =>
  ACTION_SHEET_SCOPES.some((scope) => sheets[scope] !== null);

const withInstantActionSheetOpen = (config: ActionSheetConfig): ActionSheetConfig => (
  config.instantOpen === true ? config : { ...config, instantOpen: true }
);

const openScopedActionSheet = (
  sheets: ScopedActionSheetState,
  scope: ActionSheetScope,
  config: ActionSheetConfig,
): ScopedActionSheetState => {
  const nextConfig = withInstantActionSheetOpen(config);
  // Re-publishing an already-held config must not re-render the giant sheet
  // host — focus effects re-preload the same object on every dependency tick,
  // and sheet openers preload synchronously on the tap's critical path.
  return sheets[scope] === nextConfig ? sheets : { ...sheets, [scope]: nextConfig };
};

const hideScopedActionSheetState = (
  sheets: ScopedActionSheetState,
  scope: ActionSheetScope,
): ScopedActionSheetState => (
  sheets[scope] === null ? sheets : { ...sheets, [scope]: null }
);

const closeScopedActionSheet = (
  state: {
    actionSheetScope: ActionSheetScope | null;
    scopedActionSheets: ScopedActionSheetState;
    preloadedScopedActionSheets: ScopedActionSheetState;
  },
  scope: ActionSheetScope,
) => {
  const nextSheets = hideScopedActionSheetState(state.scopedActionSheets, scope);
  const nextScope = state.actionSheetScope === scope
    ? (state.preloadedScopedActionSheets[scope] ? scope : null)
    : state.actionSheetScope;
  if (nextSheets === state.scopedActionSheets && nextScope === state.actionSheetScope) {
    return state;
  }

  return {
    actionSheetScope: nextScope,
    scopedActionSheets: nextSheets,
  };
};

/**
 * Zustand interface for ephemereal, pure UI states that don't need persistence.
 */
type UIState = {
  /** Controls visibility of the main app sidebar/drawer */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  /** Controls whether the chart view is expanded to conceal the trade panels */
  isChartFullscreen: boolean;
  setChartFullscreen: (open: boolean) => void;

  /** Tracks if a global search modal/input is active */
  isSearchActive: boolean;
  setSearchActive: (active: boolean) => void;

  /** Tracks whether the chart is running an inline text-entry flow */
  isChartInlineInputActive: boolean;
  setChartInlineInputActive: (active: boolean) => void;

  /** Lifts the chart tab bar above Android keyboards when the host app does not resize */
  chartTabBarKeyboardLift: number;
  setChartTabBarKeyboardLift: (height: number) => void;

  /** Tool selection requested from the objects screen and consumed by the chart */
  pendingChartDrawingTool: ChartDrawingKind | null;
  queueChartDrawingTool: (tool: ChartDrawingKind) => void;
  clearPendingChartDrawingTool: () => void;

  /** One-shot chart viewport command requested from another chart screen. */
  pendingChartCommand: PendingChartCommand | null;
  queueChartCommand: (command: PendingChartCommand) => void;
  clearPendingChartCommand: () => void;

  /** Current active action sheet config. Null means closed. */
  actionSheet: ActionSheetConfig | null;
  /** Action sheet config to render invisibly in the background to pre-warm the layout engine */
  preloadedActionSheet: ActionSheetConfig | null;
  /** Independent action sheet configs for feature-owned dropdowns. */
  scopedActionSheets: ScopedActionSheetState;
  /** Feature-owned preloaded configs for local dropdown warmup. */
  preloadedScopedActionSheets: ScopedActionSheetState;
  /** Scope currently rendered by the shared host. */
  actionSheetScope: ActionSheetScope | null;
  /** Opens the global action sheet with the provided config */
  showActionSheet: (config: ActionSheetConfig) => void;
  /** Pre-loads a config into the hidden action sheet to trigger Native UI measurement */
  preloadActionSheet: (config: ActionSheetConfig) => void;
  /** Closes/hides the active action sheet */
  hideActionSheet: () => void;
  showScopedActionSheet: (scope: ActionSheetScope, config: ActionSheetConfig) => void;
  preloadScopedActionSheet: (scope: ActionSheetScope, config: ActionSheetConfig) => void;
  hideScopedActionSheet: (scope: ActionSheetScope) => void;
  showQuotesActionSheet: (config: ActionSheetConfig) => void;
  preloadQuotesActionSheet: (config: ActionSheetConfig) => void;
  hideQuotesActionSheet: () => void;
  showChartActionSheet: (config: ActionSheetConfig) => void;
  hideChartActionSheet: () => void;
  showTradeActionSheet: (config: ActionSheetConfig) => void;
  hideTradeActionSheet: () => void;
  showHistoryActionSheet: (config: ActionSheetConfig) => void;
  hideHistoryActionSheet: () => void;
  showAccountsActionSheet: (config: ActionSheetConfig) => void;
  hideAccountsActionSheet: () => void;
  showBrokerDetailActionSheet: (config: ActionSheetConfig) => void;
  hideBrokerDetailActionSheet: () => void;
};

/**
 * Global store for ephemeral UI state (modals, overlays, toggles).
 * State is not persisted between app launches.
 */
export const useUIState = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set((state) => (state.sidebarOpen === open ? state : { sidebarOpen: open })),

  isChartFullscreen: false,
  setChartFullscreen: (open) => set({ isChartFullscreen: open }),

  isSearchActive: false,
  setSearchActive: (active) => set({ isSearchActive: active }),

  isChartInlineInputActive: false,
  setChartInlineInputActive: (active) => set({ isChartInlineInputActive: active }),

  chartTabBarKeyboardLift: 0,
  setChartTabBarKeyboardLift: (height) => set({ chartTabBarKeyboardLift: Math.max(0, Math.round(height)) }),

  pendingChartDrawingTool: null,
  queueChartDrawingTool: (tool) => set({ pendingChartDrawingTool: tool }),
  clearPendingChartDrawingTool: () => set({ pendingChartDrawingTool: null }),
  pendingChartCommand: null,
  queueChartCommand: (command) => set({ pendingChartCommand: command }),
  clearPendingChartCommand: () => set({ pendingChartCommand: null }),

  actionSheet: null,
  preloadedActionSheet: null,
  scopedActionSheets: createEmptyScopedActionSheets(),
  preloadedScopedActionSheets: createEmptyScopedActionSheets(),
  actionSheetScope: null,
  showActionSheet: (config) => set({ actionSheet: withInstantActionSheetOpen(config) }),
  preloadActionSheet: (config) => set({ preloadedActionSheet: withInstantActionSheetOpen(config) }),
  hideActionSheet: () => set((state) => {
    if (
      state.actionSheet === null &&
      state.actionSheetScope === null &&
      !hasScopedActionSheet(state.scopedActionSheets)
    ) {
      return state;
    }

    return {
      actionSheet: null,
      actionSheetScope: null,
      scopedActionSheets: createEmptyScopedActionSheets(),
    };
  }),
  showScopedActionSheet: (scope, config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: scope,
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, scope, config),
  })),
  preloadScopedActionSheet: (scope, config) => set((state) => ({
    actionSheetScope: hasScopedActionSheet(state.scopedActionSheets)
      ? (state.actionSheetScope ?? scope)
      : scope,
    preloadedScopedActionSheets: openScopedActionSheet(
      state.preloadedScopedActionSheets,
      scope,
      config,
    ),
  })),
  hideScopedActionSheet: (scope) => set((state) => closeScopedActionSheet(state, scope)),
  showQuotesActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'quotes',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'quotes', config),
  })),
  preloadQuotesActionSheet: (config) => set((state) => ({
    actionSheetScope: hasScopedActionSheet(state.scopedActionSheets)
      ? (state.actionSheetScope ?? 'quotes')
      : 'quotes',
    preloadedScopedActionSheets: openScopedActionSheet(
      state.preloadedScopedActionSheets,
      'quotes',
      config,
    ),
  })),
  hideQuotesActionSheet: () => set((state) => closeScopedActionSheet(state, 'quotes')),
  showChartActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'chart',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'chart', config),
  })),
  hideChartActionSheet: () => set((state) => closeScopedActionSheet(state, 'chart')),
  showTradeActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'trade',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'trade', config),
  })),
  hideTradeActionSheet: () => set((state) => closeScopedActionSheet(state, 'trade')),
  showHistoryActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'history',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'history', config),
  })),
  hideHistoryActionSheet: () => set((state) => closeScopedActionSheet(state, 'history')),
  showAccountsActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'settingsAccounts',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'settingsAccounts', config),
  })),
  hideAccountsActionSheet: () => set((state) => closeScopedActionSheet(state, 'settingsAccounts')),
  showBrokerDetailActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'settingsBrokerDetail',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'settingsBrokerDetail', config),
  })),
  hideBrokerDetailActionSheet: () => set((state) => closeScopedActionSheet(state, 'settingsBrokerDetail')),
}));

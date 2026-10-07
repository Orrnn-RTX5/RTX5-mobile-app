import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import type { NavigationHelpers, ParamListBase } from '@react-navigation/native';
import { PlatformPressable } from '@react-navigation/elements';
import { usePathname } from 'expo-router';
import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Platform, View, StyleSheet, Text, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/ui/components/ActionSheet';
import { useThemeMode } from '../../src/state/themeMode';
import { GDark, GLight } from '../../src/ui/theme/glass';
import { useTranslation } from '../../src/i18n/useTranslation';
import { warmActionRoutes } from '../../src/utils/actionRouteWarmup';
import { BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER, resolveBottomTabBarLayout } from '../../src/ui/layout/bottomTabBar';
import {
  registerSidebarTabNavigationHandler,
  type SidebarMountedTabPath,
} from '../../src/ui/components/sidebarDrawerController';
import {
  hideSidebarDestination,
  sidebarDestinationController,
} from '../../src/ui/components/sidebarDestinationHostController';
import { hideChartSettingsHost } from '../../src/features/chart/chartSettingsHostController';
import { hideChartConfigDestination } from '../../src/features/chart/chartConfigDestinationController';
import { hideAboutDetailDestination } from '../../src/features/settings/aboutDetailDestinationController';
import { hideHistoryFilterHost } from '../../src/features/history/historyFilterHostController';
import {
  hideTradePositionActionHost,
  tradePositionActionHostController,
} from '../../src/features/trade/tradePositionActionHostController';
import { OrderTicketLaunchHost } from '../../src/features/trade/OrderTicketLaunchHost';
import { TradeTabFloatingPnl, TradeTabFloatingPnlProvider } from '../../src/features/trade/TradeTabFloatingPnl';
import { QuotesSymbolActionSheetHost } from '../../src/features/quotes/QuotesSymbolActionSheet';
import { ChartSymbolPickerSheetHost } from '../../src/features/chart/components/ChartSymbolPickerSheet';
import { hideChartSymbolPickerSheet } from '../../src/features/chart/chartSymbolPickerSheetController';
import { requestOrrnnDemoTradeAuth } from '../../src/features/trade/tradeAuthPrompt';
import { useUserPreferences } from '../../src/state/userPreferences';
import { prefetchChartSelectionHistory } from '../../src/utils/navigationPrefetch';
import { scheduleIdleWork } from '../../src/utils/startupScheduler';
import { interactionLifecycle } from '../../src/utils/interactionLifecycle';
import { isStartupBackgroundWorkAllowed, subscribeStartupBackgroundWork } from '../../src/utils/startupWorkGate';
import {
  ChartTradeFeedbackPortalHost,
  ChartTradeSheetPortalHost,
  ChartTradeSheetPortalProvider,
} from '../../src/ui/navigation/ChartTradeSheetPortal';

import { FastTabs as Tabs } from '../../src/ui/navigation/FastTabNavigator';
import { createBottomTabPressGate } from '../../src/ui/navigation/bottomTabPressGate';
import { commitFastTabPress, FastTabPressNavigationContext } from '../../src/ui/navigation/commitFastTabPress';
import {
  registerFastTabSidebarChromeApplier,
  fastTabVisualController,
  scheduleFastTabNavigation,
  showFastTabVisual,
  TAB_BAR_NAVIGATION_SETTLE_DELAY_MS,
  type FastTabRouteName,
} from '../../src/ui/navigation/fastTabVisualController';

const icons = {
  quotes: 'swap-vertical-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

const tabLabelKeys: Record<FastTabRouteName, string> = {
  quotes: 'Quotes',
  chart: 'Chart',
  trade: 'Trade',
  history: 'History',
  settings: 'Settings',
};

const PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_DELAY_MS = 500;
const PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_TIMEOUT_MS = 1500;
type TabPressEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPress']>>[0];
type TabPressInEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPressIn']>>[0];
type TabTouchEvent = GestureResponderEvent;
type FastTabBarButtonProps = BottomTabBarButtonProps & {
  routeKey: string;
  routeName: FastTabRouteName;
  label: string;
  activeColor: string;
  inactiveColor: string;
  inlineLabels: boolean;
};

type FastTabVisualItemProps = {
  routeName: FastTabRouteName;
  label: string;
  activeColor: string;
  inactiveColor: string;
  inlineLabels: boolean;
  initiallyActive: boolean;
};

const renderTabIcon = (routeName: FastTabRouteName, color: string) => routeName === 'chart'
  ? <MaterialIcons name="candlestick-chart" size={27} color={color} />
  : (
    <Ionicons
      name={icons[routeName as keyof typeof icons] ?? 'ellipse-outline'}
      size={25}
      color={color}
    />
  );

/**
 * Keeps each tab's icon and label inside the same native opacity layer.
 * A visual-route change can therefore never composite one as active without
 * the other, even when taps arrive faster than React Navigation can commit.
 */
const FastTabVisualItem = memo(function FastTabVisualItem({
  routeName,
  label,
  activeColor,
  inactiveColor,
  inlineLabels,
  initiallyActive,
}: FastTabVisualItemProps) {
  const activeLayerRef = useRef<View>(null);
  const inactiveLayerRef = useRef<View>(null);
  const appliedActiveRef = useRef<boolean | null>(null);
  const applyVisualRoute = useCallback((visualRouteName: FastTabRouteName, force = false) => {
    const active = visualRouteName === routeName;
    // A tab switch changes only the outgoing and incoming buttons. Avoid
    // sending native style updates to every unchanged icon/label pair.
    if (appliedActiveRef.current === active && !force) return;
    appliedActiveRef.current = active;
    activeLayerRef.current?.setNativeProps({
      style: [
        styles.tabVisualItemLayer,
        inlineLabels && styles.tabVisualItemLayerLandscape,
        { opacity: active ? 1 : 0 },
      ],
    });
    inactiveLayerRef.current?.setNativeProps({
      style: [
        styles.tabVisualItemLayer,
        inlineLabels && styles.tabVisualItemLayerLandscape,
        { opacity: active ? 0 : 1 },
      ],
    });
  }, [inlineLabels, routeName]);

  useLayoutEffect(() => {
    // These are the opacity values React just committed. Only restore native
    // selection if a newer optimistic tap differs from that real focus.
    appliedActiveRef.current = initiallyActive;
    return registerFastTabSidebarChromeApplier(applyVisualRoute);
  }, [applyVisualRoute, initiallyActive, activeColor, inactiveColor]);

  const renderPresentation = (color: string) => (
    <>
      <View style={styles.tabIconSlot}>
        {renderTabIcon(routeName, color)}
      </View>
      {routeName === 'trade' ? (
        // MT5 parity: with open positions the label reads the live floating
        // P/L (green/red); the word "Trade" returns when the account is flat.
        <TradeTabFloatingPnl
          fallbackLabel={label}
          fallbackColor={color}
          labelStyle={[
            styles.tabLabel,
            inlineLabels && styles.tabLabelLandscape,
          ]}
        />
      ) : (
        <Text
          maxFontSizeMultiplier={BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={[
            styles.tabLabel,
            inlineLabels && styles.tabLabelLandscape,
            { color },
          ]}
        >
          {label}
        </Text>
      )}
    </>
  );

  const presentation = (
    <View
      collapsable={false}
      pointerEvents="none"
      style={styles.tabVisualItemRoot}
    >
      <View
        ref={inactiveLayerRef}
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.tabVisualItemLayer,
          inlineLabels && styles.tabVisualItemLayerLandscape,
          { opacity: initiallyActive ? 0 : 1 },
        ]}
      >
        {renderPresentation(inactiveColor)}
      </View>
      <View
        ref={activeLayerRef}
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.tabVisualItemLayer,
          inlineLabels && styles.tabVisualItemLayerLandscape,
          { opacity: initiallyActive ? 1 : 0 },
        ]}
      >
        {renderPresentation(activeColor)}
      </View>
    </View>
  );

  return routeName === 'trade'
    ? <TradeTabFloatingPnlProvider>{presentation}</TradeTabFloatingPnlProvider>
    : presentation;
});

/**
 * Handles a bottom-menu tap as soon as the finger goes down.
 * It shows the selected screen first, then updates the real navigation route.
 */
const FastTabBarButton = memo(function FastTabBarButton({
  routeName,
  routeKey,
  label,
  activeColor,
  inactiveColor,
  inlineLabels,
  children: _children,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: FastTabBarButtonProps) {
  const navigation = useContext(FastTabPressNavigationContext);
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const pressGateRef = useRef(createBottomTabPressGate(interactionLifecycle.getEpoch));
  const disabledRef = useRef(props.disabled);
  disabledRef.current = props.disabled;
  const pressCallbacksRef = useRef({ onPress, onPressIn, onPressOut });
  pressCallbacksRef.current = { onPress, onPressIn, onPressOut };

  const runTabPress = useCallback((event: TabPressEvent) => {
    if (disabledRef.current || !interactionLifecycle.isForeground()) return;
    if (
      routeName === 'trade'
      && requestOrrnnDemoTradeAuth({ kind: 'trade-tab' })
    ) {
      return;
    }
    // Step 1: show the already-mounted screen immediately.
    const visualRevision = showFastTabVisual(routeName);
    useUIState.getState().hideActionSheet();
    (event as TabPressEvent & { persist?: () => void }).persist?.();
    const commitNavigation = () => {
      // A render between touch-down and this commit may change navigation
      // ownership. Read the latest callbacks and live focus at execution time.
      const callbacks = pressCallbacksRef.current;
      if (navigationRef.current) {
        if (!commitFastTabPress(navigationRef.current, { name: routeName, key: routeKey }, visualRevision)) return;
      } else {
        callbacks.onPress?.(event);
      }
      if (routeName === 'chart') {
        // Route/focus adoption gets the next frame before optional cache or
        // network work. A superseding tap must not start hidden Chart work.
        scheduleIdleWork(() => {
          if (visualRevision !== null && fastTabVisualController.getSnapshot().revision !== visualRevision) return;
          const preferences = useUserPreferences.getState();
          void prefetchChartSelectionHistory(
            preferences.chartSymbol,
            preferences.chartTimeframe,
          );
        }, { timeoutMs: 500 });
      }
    };
    if (visualRevision !== null) {
      // A bottom-menu tap has no drawer animation to wait for.
      // Step 2: after that screen paints, make the real route match it.
      scheduleFastTabNavigation(visualRevision, commitNavigation, TAB_BAR_NAVIGATION_SETTLE_DELAY_MS);
    } else {
      commitNavigation();
    }
  }, [routeKey, routeName]);

  const handleTouchStart = useCallback((event: TabTouchEvent) => {
    pressGateRef.current.beginGesture();
    // Native tab-bar buttons cannot scroll. Reveal on the raw touch event,
    // before Pressability/responder negotiation or finger release.
    if (Platform.OS !== 'web' && pressCallbacksRef.current.onPress && pressGateRef.current.claimPressIn()) {
      runTabPress(event as TabPressEvent);
    }
  }, [runTabPress]);

  const handlePressIn = useCallback((event: TabPressInEvent) => {
    pressCallbacksRef.current.onPressIn?.(event);
    // Native responder grant can deliver press-in before touch-start. Let the
    // raw touch handler own activation so that order cannot dispatch twice.
    // Web clicks stay with PlatformPressable's link/modifier-key handling.
  }, []);

  const handlePress: NonNullable<BottomTabBarButtonProps['onPress']> = useCallback((event) => {
    if (pressGateRef.current.claimPress(event)) runTabPress(event);
  }, [runTabPress]);

  const handlePressOut: NonNullable<BottomTabBarButtonProps['onPressOut']> = useCallback((event) => {
    pressCallbacksRef.current.onPressOut?.(event);
  }, []);

  return (
    <PlatformPressable
      {...props}
      accessibilityLabel={label}
      onTouchStart={handleTouchStart}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onPressOut={handlePressOut}
      unstable_pressDelay={0}
    >
      <FastTabVisualItem
        routeName={routeName}
        label={label}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
        inlineLabels={inlineLabels}
        initiallyActive={props['aria-selected'] === true}
      />
    </PlatformPressable>
  );
});

const GlobalActionSheetHost = memo(function GlobalActionSheetHost() {
  const actionSheet = useUIState((s) => s.actionSheet);
  const preloadConfig = useUIState((s) => s.preloadedActionSheet);
  const scopedActionSheets = useUIState((s) => s.scopedActionSheets);
  const preloadedScopedActionSheets = useUIState((s) => s.preloadedScopedActionSheets);
  const actionSheetScope = useUIState((s) => s.actionSheetScope);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const hideScopedActionSheet = useUIState((s) => s.hideScopedActionSheet);

  const scopedActionSheet = actionSheetScope ? scopedActionSheets[actionSheetScope] : null;
  const scopedPreloadConfig = actionSheetScope
    ? preloadedScopedActionSheets[actionSheetScope]
    : Object.values(preloadedScopedActionSheets).find(Boolean) ?? null;
  const activeConfig = actionSheet || scopedActionSheet || scopedPreloadConfig || preloadConfig;
  const visible = actionSheet !== null || scopedActionSheet !== null;
  const handleClose = useCallback(() => {
    if (actionSheet !== null) {
      hideActionSheet();
      return;
    }
    if (actionSheetScope) {
      hideScopedActionSheet(actionSheetScope);
      return;
    }
    hideActionSheet();
  }, [actionSheet, actionSheetScope, hideActionSheet, hideScopedActionSheet]);

  return (
    <ActionSheet
      visible={visible}
      title={activeConfig?.title}
      titleAlign={activeConfig?.titleAlign}
      compactText={activeConfig?.compactText}
      presentation={activeConfig?.presentation}
      showActionIcons={activeConfig?.showActionIcons}
      deferOffscreenActions={activeConfig?.deferOffscreenActions}
      maximumVisibleActionRows={activeConfig?.maximumVisibleActionRows}
      actions={activeConfig?.actions ?? []}
      onClose={handleClose}
      searchable={activeConfig?.searchable}
      searchPlaceholder={activeConfig?.searchPlaceholder}
      detent={activeConfig?.detent}
      minimumTopInset={activeConfig?.minimumTopInset}
      instantOpen={activeConfig?.instantOpen}
      entryMotion={activeConfig?.entryMotion}
      immediateHostHideOnClose={activeConfig?.immediateHostHideOnClose}
      visualKey={activeConfig?.visualKey}
      runActionAfterClose={activeConfig?.runActionAfterClose}
      androidKeyboardAvoidance={activeConfig?.androidKeyboardAvoidance}
      keepFullHeightOnKeyboard={activeConfig?.keepFullHeightOnKeyboard}
    />
  );
});

/**
 * Starts the logged-out Chart baseline from the lightweight tabs shell.
 *
 * Keeping this outside the retained Chart tree means its network dispatch is
 * not delayed by that screen's large initial render. It also survives Chart
 * surface lifecycle changes while Quotes remains visible. QueryClient owns
 * deduplication, so a very early Chart press safely joins this same request.
 */
const AnonymousChartHistoryStartupPrefetch = memo(function AnonymousChartHistoryStartupPrefetch() {
  const backgroundWorkAllowed = useSyncExternalStore(subscribeStartupBackgroundWork, isStartupBackgroundWorkAllowed, isStartupBackgroundWorkAllowed);
  const hasHydrated = useUserPreferences((state) => state.hasHydrated);
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const chartSymbol = useUserPreferences((state) => state.chartSymbol);
  const chartTimeframe = useUserPreferences((state) => state.chartTimeframe);
  const dispatchedKeyRef = useRef('');

  useEffect(() => {
    if (!backgroundWorkAllowed) return;
    const normalizedSymbol = chartSymbol.trim().toUpperCase();
    const normalizedTimeframe = chartTimeframe.trim().toUpperCase();
    if (isLoggedIn || !hasHydrated || !normalizedSymbol || !normalizedTimeframe) {
      return undefined;
    }

    const prefetchKey = `${normalizedSymbol}:${normalizedTimeframe}`;
    if (dispatchedKeyRef.current === prefetchKey) {
      return undefined;
    }

    return scheduleIdleWork(
      () => {
        // Mark the key only when work really starts. If an intervening state
        // change cancels the idle callback, the next effect can reschedule it.
        dispatchedKeyRef.current = prefetchKey;
        void prefetchChartSelectionHistory(normalizedSymbol, normalizedTimeframe);
      },
      {
        delayMs: PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_DELAY_MS,
        timeoutMs: PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_TIMEOUT_MS,
      },
    );
  }, [backgroundWorkAllowed, chartSymbol, chartTimeframe, hasHydrated, isLoggedIn]);

  return null;
});

function SidebarTabNavigationRegistrar({
  children,
  navigation,
}: {
  children: ReactNode;
  navigation: NavigationHelpers<ParamListBase>;
}) {
  useEffect(() => registerSidebarTabNavigationHandler((path: SidebarMountedTabPath) => {
    navigation.navigate(path.slice(1));
  }), [navigation]);

  return <>{children}</>;
}

// Thin wrapper: derive the tab-bar inputs from the path here so the memoized
// navigator below does not reconcile on every route change. Pushing a sidebar
// detail over an already-active detail keeps both props stable, so the whole
// Tabs subtree (5 mounted screens) skips reconciliation on those navigations.
/**
 * Main navigator configuring the bottom tab/menu bar. Handles routing between primary sections (Quotes, Chart, Trade, History, Settings).
 */
export default function TabsLayout() {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const isChartTab = pathname === '/chart' || pathname.startsWith('/chart');

  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      const hostedDestination = sidebarDestinationController.getSnapshot();
      const isRestoringAccountsFromBrokerFlow =
        hostedDestination.activeDestination === 'accounts'
        && hostedDestination.source === 'route-sync';

      // A hosted sidebar page may push a normal stack route (for example,
      // About -> Privacy Policy). Reveal that real route as soon as its path
      // changes instead of leaving the independent fast host over it.
      // Broker-flow Back is the inverse handoff: it deliberately restores the
      // retained Accounts screen before the native route pops. The tabs tree
      // can be frozen while root-stack routes are above it, so its remembered
      // previous pathname is not reliable proof of that handoff. The explicit
      // route-sync ownership is the stable signal.
      if (!isRestoringAccountsFromBrokerFlow) {
        hideSidebarDestination();
      }
      // Chart Preferences is a retained overlay (no route push). Clear it when
      // the user leaves the chart tab / navigates elsewhere so it never sticks.
      hideChartConfigDestination();
      hideChartSettingsHost();
      // The symbol picker is also retained outside ChartScreen; close its host
      // on navigation so hidden native pixels cannot reappear on another tab.
      hideChartSymbolPickerSheet();
      hideAboutDetailDestination();
      hideHistoryFilterHost();
      hideTradePositionActionHost();
      const uiState = useUIState.getState();
      const visibleScopedActionSheet = uiState.actionSheetScope
        ? uiState.scopedActionSheets[uiState.actionSheetScope] !== null
        : false;

      if (uiState.actionSheet !== null || visibleScopedActionSheet) {
        useUIState.getState().hideActionSheet();
      }
    }
    previousPathRef.current = pathname;
  }, [pathname]);

  return (
    <TabsLayoutInner isChartTab={isChartTab} />
  );
}

/**
 * Theme-dependent tab chrome only. Kept outside the retained tab screens and
 * launch hosts so a theme tap does not re-render Quotes/Chart/Trade trees.
 */
const ThemedTabsChrome = memo(function ThemedTabsChrome({
  isChartTab,
}: {
  isChartTab: boolean;
}) {
  const isChartFullscreen = useUIState((s) => s.isChartFullscreen);
  const isSearchActive = useUIState((s) => s.isSearchActive);
  const isChartInlineInputActive = useUIState((s) => s.isChartInlineInputActive);
  const chartTabBarKeyboardLift = useUIState((s) => s.chartTabBarKeyboardLift);
  const tradePositionActionSnapshot = useSyncExternalStore(
    tradePositionActionHostController.subscribe,
    tradePositionActionHostController.getSnapshot,
    tradePositionActionHostController.getSnapshot,
  );
  const themeMode = useThemeMode();
  const isDark = themeMode === 'dark';
  const T = themeMode === 'light' ? GLight : GDark;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const renderTabsLayout = useCallback(({
    children,
    navigation,
  }: {
    children: ReactNode;
    navigation: NavigationHelpers<ParamListBase>;
  }) => (
    <SidebarTabNavigationRegistrar navigation={navigation}>
      {children}
    </SidebarTabNavigationRegistrar>
  ), []);

  const isLandscape = width > height;
  const shouldHideMenu =
    (isChartFullscreen && isChartTab) ||
    (isChartTab && isChartInlineInputActive) ||
    isSearchActive;
  const shouldConcealMenuForTradeAction = tradePositionActionSnapshot.visible;
  const shouldLiftChartTabBar =
    isChartTab &&
    !shouldHideMenu &&
    chartTabBarKeyboardLift > 0;

  const tabBarLayout = resolveBottomTabBarLayout({
    availableWidth: Math.max(0, width - insets.left - insets.right),
    safeAreaBottom: insets.bottom,
    isLandscape,
    viewportHeight: height,
    fontScale,
  });
  const tabBarHeight = tabBarLayout.height;
  const { paddingTop, paddingBottom, useInlineLabels } = tabBarLayout;

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: isDark ? T.bg : '#ffffff',
      borderTopColor: isDark ? T.borderSubtle : 'rgba(0,0,0,0.05)',
      borderTopWidth: 1,
      height: tabBarHeight,
      paddingTop,
      paddingBottom,
      paddingLeft: Math.max(insets.left, 0),
      paddingRight: Math.max(insets.right, 0),
    }),
    [T.bg, T.borderSubtle, insets.left, insets.right, isDark, paddingBottom, paddingTop, tabBarHeight],
  );
  const inactiveTabColor = isDark ? T.textMuted : T.textDimmed;
  const bottomTabActiveColor = T.trading.buy.primary;

  useEffect(() => warmActionRoutes(), []);

  return (
    <Tabs
      layout={renderTabsLayout}
      backBehavior='firstRoute'
      detachInactiveScreens={false}
      safeAreaInsets={{ left: insets.left, right: insets.right, top: insets.top, bottom: insets.bottom }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: shouldHideMenu
          ? { display: 'none' }
          : [
            tabBarStyle,
            shouldConcealMenuForTradeAction && {
              opacity: 0,
              transform: [{ translateY: tabBarHeight }],
            },
            shouldLiftChartTabBar && {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: chartTabBarKeyboardLift + Math.max(insets.bottom, 0),
            },
          ],
        tabBarActiveTintColor: bottomTabActiveColor,
        tabBarInactiveTintColor: inactiveTabColor,
        tabBarIcon: () => null,
        tabBarLabel: () => null,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarItemStyle: { backgroundColor: 'transparent' },
        tabBarHideOnKeyboard: !isChartTab,
        tabBarButton: (props) => (
          <FastTabBarButton
            {...props}
            routeName={route.name as FastTabRouteName}
            routeKey={route.key}
            label={t(tabLabelKeys[route.name as FastTabRouteName])}
            activeColor={bottomTabActiveColor}
            inactiveColor={inactiveTabColor}
            inlineLabels={useInlineLabels}
          />
        ),
        lazy: false,
      })}
    >
      <Tabs.Screen name='quotes' options={{ title: t('Quotes') }} />
      <Tabs.Screen
        name='chart'
        options={{
          title: t('Chart'),
          lazy: false,
        }}
      />
      <Tabs.Screen name='trade' options={{ title: t('Trade') }} />
      <Tabs.Screen name='history' options={{ title: t('History') }} />
      <Tabs.Screen name='settings' options={{ title: t('Settings') }} />
    </Tabs>
  );
});

const TabsLayoutInner = memo(function TabsLayoutInner({
  isChartTab,
}: {
  isChartTab: boolean;
}) {
  // Theme is confined to ThemedTabsChrome so launch hosts and tab bodies are
  // not reconciled on every light/dark press.
  return (
    <View style={styles.root}>
      <ChartTradeSheetPortalProvider>
        <AnonymousChartHistoryStartupPrefetch />
        <ThemedTabsChrome isChartTab={isChartTab} />
        <ChartTradeSheetPortalHost />
        {/* Trade receipts / result dialogs stack above the sheet entry. */}
        <ChartTradeFeedbackPortalHost />
        <OrderTicketLaunchHost />
        <GlobalActionSheetHost />
        <QuotesSymbolActionSheetHost />
        {/* Keep the chart picker pre-mounted beside global hosts. Its dedicated
            layer can reveal on the first native frame without competing with
            a shared ActionSheet already used by another destination. */}
        <ChartSymbolPickerSheetHost />
      </ChartTradeSheetPortalProvider>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, minWidth: 0 },
  tabVisualItemRoot: {
    alignSelf: 'stretch',
    flex: 1,
    minHeight: 44,
    minWidth: 0,
  },
  tabVisualItemLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  tabVisualItemLayerLandscape: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  tabIconSlot: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 31,
  },
  tabLabel: {
    alignSelf: 'stretch',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
    minWidth: 0,
    paddingHorizontal: 2,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabLabelLandscape: {
    alignSelf: 'center',
    flex: 1,
    flexShrink: 1,
    marginBottom: 0,
  },
});

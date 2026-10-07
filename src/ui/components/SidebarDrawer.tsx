import { FastPressable as Pressable } from './FastPressable';
/**
 * Reusable React Native UI component: SidebarDrawer.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { usePathname, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useMemo, useState, type MutableRefObject } from 'react';
import {
  Alert, Animated, BackHandler, Easing, Image, Linking, ScrollView, StyleSheet, Text, View,
  Platform, useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GDark, GLight, ThemeColors } from '../theme/glass';
import { useUserPreferences } from '../../state/userPreferences';
import {
  scheduleAfterImmediateThemePaint,
  setImmediateThemeMode,
  useThemeMode,
} from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { useBrokerConfig } from '../../query/broker';
import { useDeferredActiveFlag } from '../../hooks/useDeferredActiveFlag';
import type { ThemeMode } from '../../state/userPreferences/types';
import { AppLogo } from './AppLogo';
import { resolveAppDisplayVersion } from '../../config/appDisplayVersion';
import { getConfiguredSupportEmail } from '../../config/legalLinks';
import { buildHelpMailto } from '../../features/settings/helpViewModel';
import { pauseLiveQuoteSnapshotNotifications } from '../../features/quotes/useLiveQuotes';
import { useTranslation } from '../../i18n/useTranslation';
import { pauseLiveSymbolQuoteNotifications } from '../../query/websocket';
import { quotesWsService } from '../../api/ws/quotesSocket';
import { invalidateSidebarOpenVisualWork, navigateMountedSidebarTab, registerSidebarOpenHandler, scheduleAfterSidebarOpenVisual } from './sidebarDrawerController';
import {
  hideSidebarDestination,
  resolveSidebarHostDestination,
  showSidebarDestination,
  sidebarDestinationController,
} from './sidebarDestinationHostController';
import {
  scheduleFastTabNavigation,
  showFastTabVisualForSidebar,
  TAB_BAR_NAVIGATION_SETTLE_DELAY_MS,
} from '../navigation/fastTabVisualController';
import { requestOrrnnDemoTradeAuth } from '../../features/trade/tradeAuthPrompt';
import { registerInteractionLifecycleHandler } from '../../utils/interactionLifecycle';

// ─── Menu Items ──────────────────────────────────────────────────────────────
type MenuItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  action?: 'support-email';
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Trade', icon: 'stats-chart', route: '/trade' },
  { label: 'Journal', icon: 'reader-outline', route: '/journal' },
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
  { label: 'Economic Calendar', icon: 'calendar-outline', route: '/economic-calendar' },
  { label: 'User Guide', icon: 'book-outline', route: '/user-guide' },
  { label: 'Support', icon: 'headset-outline', action: 'support-email' },
  { label: 'Help', icon: 'chatbubble-ellipses-outline', route: '/help' },
  { label: 'About', icon: 'information-circle-outline', route: '/about' },
];

// ─── Props ───────────────────────────────────────────────────────────────────
// ─── Props ───────────────────────────────────────────────────────────────────
// DELETED Props so component handles its own state
const DRAWER_WIDTH = 310;
const DRAWER_CLOSED_TRANSLATE_X = -DRAWER_WIDTH - 2;
const DRAWER_CLOSE_ANIMATION_MS = 60;
const SIDEBAR_MENU_ITEM_HIT_SLOP = { top: 6, bottom: 6, left: 8, right: 8 } as const;
const SIDEBAR_PROFILE_ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 4 } as const;
const SIDEBAR_NAVIGATION_LOCK_MS = 50;
const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200;
const SIDEBAR_LIVE_WORK_PAUSE_TIMEOUT_MS = 30_000;
const SIDEBAR_LIVE_WORK_RESUME_DELAY_MS = 180;
const SIDEBAR_RECONNECT_DEFER_MS = 1_000;
const LOGGED_OUT_PREFETCH_ROUTES = ['/login'] as const;
const SIDEBAR_STACK_ROUTES = new Set<string>(LOGGED_OUT_PREFETCH_ROUTES);
const SIDEBAR_PUSH_ROUTE_PREFIXES = ['/settings/'] as const;
const SIDEBAR_PRIMARY_TAB_ROUTES = new Set<string>([
  '/quotes',
  '/chart',
  '/trade',
  '/history',
  '/settings',
]);
const SIDEBAR_DETAIL_TAB_ROUTES = new Set<string>([
  '/journal',
  '/economic-calendar',
  '/user-guide',
  '/help',
  '/about',
]);
const SIDEBAR_MOUNTED_TAB_ROUTES = new Set<string>([
  ...SIDEBAR_PRIMARY_TAB_ROUTES,
  ...SIDEBAR_DETAIL_TAB_ROUTES,
]);

type PrefetchRouter = {
  prefetch?: (href: string) => void;
};

function scheduleNextFrame(action: () => void) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(action);
    return;
  }
  setTimeout(action, 0);
}

function normalizeSidebarPath(path: string) {
  return path.replace(/\/\([^)]*\)/g, '') || '/';
}

/**
 * Feeds the current pathname into a ref without re-rendering the drawer.
 * usePathname re-renders its subscriber on EVERY route change; the drawer only
 * needs the path at press time, so subscribing here (a null-rendering child)
 * keeps route changes off the drawer's (and its menu rows') render path.
 */
function SidebarPathnameSync({ pathnameRef }: { pathnameRef: MutableRefObject<string> }) {
  const pathname = usePathname();
  pathnameRef.current = pathname;
  return null;
}

function shouldPushSidebarRoute(route: string) {
  return SIDEBAR_PUSH_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
}

type SidebarMenuRowProps = {
  item: MenuItem;
  /** Localized label for display; latency metrics keep the stable English item.label. */
  displayLabel: string;
  onPressItem: (item: MenuItem) => void;
  ds: ReturnType<typeof makeStyles>;
  iconColor: string;
};

// Memoized so drawer-level state flips (interactive, profile data) do not
// re-reconcile the eight Pressable rows mid-animation.
const SidebarMenuRow = memo(function SidebarMenuRow({
  item,
  displayLabel,
  onPressItem,
  ds,
  iconColor,
}: SidebarMenuRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        ds.menuItem,
        pressed && ds.menuItemPressed,
      ]}
      onPress={() => onPressItem(item)}
      activateOnPressIn
      hitSlop={SIDEBAR_MENU_ITEM_HIT_SLOP}
      latencyLabel={`sidebar.menu.${item.label}`}
      unstable_pressDelay={0}
    >
      <Ionicons
        name={item.icon}
        size={20}
        color={iconColor}
        style={ds.menuIcon}
      />
      <Text style={ds.menuText}>{displayLabel}</Text>
    </Pressable>
  );
});

// ─── Component ───────────────────────────────────────────────────────────────
/**
 * Main global navigation drawer component. It houses the user's active account context, global navigation links (Trade, Quotes, History, Settings), and the theme toggle.
 */
export const SidebarDrawer = memo(function SidebarDrawer() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(DRAWER_WIDTH, Math.max(0, width - Math.max(24, insets.right)));
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const onClose = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);
  const initialSidebarOpenRef = useRef(useUIState.getState().sidebarOpen);
  const [interactive, setInteractive] = useState(initialSidebarOpenRef.current);
  const router = useRouter();
  const pathnameRef = useRef('/');
  const themeMode = useThemeMode();
  const setPreferenceThemeMode = useUserPreferences((s) => s.setThemeMode);
  const themeCommitGenerationRef = useRef(0);
  const T = themeMode === 'light' ? GLight : GDark;
  const { t } = useTranslation();
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const brokerId = useUserPreferences((s) => s.brokerId);
  const brokerLogoUrl = useUserPreferences((s) => s.brokerLogoUrl);
  const sidebarProfileDataActive = useDeferredActiveFlag(interactive && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS);
  const { data: brokerConfig } = useBrokerConfig(brokerId, sidebarProfileDataActive && !!brokerId);
  const displayAccountName = accountDetails?.name?.trim() || (accountDetails?.id ? `Account ${accountDetails.id}` : '---');
  const supportEmail = getConfiguredSupportEmail();
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const nativeAppVersion = Constants.expoConfig?.version ?? 'Local';
  const appVersion = resolveAppDisplayVersion(nativeAppVersion);
  const activeBrokerLogoUrl = useMemo(
    () => (isLoggedIn ? brokerLogoUrl.trim() : ''),
    [brokerLogoUrl, isLoggedIn],
  );
  const [brokerLogoFailed, setBrokerLogoFailed] = useState(false);

  const [slideAnim] = useState(() => new Animated.Value(initialSidebarOpenRef.current ? 0 : DRAWER_CLOSED_TRANSLATE_X, { useNativeDriver: true }));
  const [overlayAnim] = useState(() => new Animated.Value(initialSidebarOpenRef.current ? 1 : 0, { useNativeDriver: true }));
  const isClosingRef = useRef(false);
  const animatedVisibleRef = useRef(initialSidebarOpenRef.current);
  const drawerAnimationGenerationRef = useRef(0);
  const interactiveGenerationRef = useRef(0);
  const cancelOpenCommitRef = useRef<(() => void) | null>(null);
  const navigationLockedRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSnapshotPauseReleaseRef = useRef<(() => void) | null>(null);
  const liveSymbolPauseReleaseRef = useRef<(() => void) | null>(null);
  const liveWorkResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<View>(null);

  useEffect(() => () => {
    cancelOpenCommitRef.current?.();
    themeCommitGenerationRef.current += 1;
  }, []);

  const handleThemeModePress = useCallback((nextMode: ThemeMode) => {
    const generation = themeCommitGenerationRef.current + 1;
    themeCommitGenerationRef.current = generation;
    if (themeMode === nextMode) {
      return;
    }

    // Advance the lightweight app-wide clock in the touch turn. Hidden visual
    // surfaces then settle before the drawer can close and reveal them. Keep
    // durable preference work behind the selector's first themed frame.
    setImmediateThemeMode(nextMode);
    scheduleAfterImmediateThemePaint(() => {
      if (themeCommitGenerationRef.current === generation) {
        setPreferenceThemeMode(nextMode);
      }
    });
  }, [setPreferenceThemeMode, themeMode]);

  useEffect(() => {
    if (isLoggedIn) {
      return;
    }

    scheduleNextFrame(() => {
      const prefetch = (router as PrefetchRouter).prefetch;
      if (typeof prefetch !== 'function') {
        return;
      }
      for (const route of LOGGED_OUT_PREFETCH_ROUTES) {
        try {
          prefetch(route);
        } catch {
          // Login warm-up must never affect first paint or drawer taps.
        }
      }
    });
  }, [isLoggedIn, router]);

  useEffect(() => () => {
    if (navigationUnlockTimerRef.current) {
      clearTimeout(navigationUnlockTimerRef.current);
      navigationUnlockTimerRef.current = null;
    }
    if (liveWorkResumeTimerRef.current) {
      clearTimeout(liveWorkResumeTimerRef.current);
      liveWorkResumeTimerRef.current = null;
    }
    liveSnapshotPauseReleaseRef.current?.();
    liveSnapshotPauseReleaseRef.current = null;
    liveSymbolPauseReleaseRef.current?.();
    liveSymbolPauseReleaseRef.current = null;
  }, []);

  useEffect(() => {
    setBrokerLogoFailed(false);
  }, [activeBrokerLogoUrl]);

  const pauseLiveWorkForDrawer = useCallback(() => {
    if (liveWorkResumeTimerRef.current) {
      clearTimeout(liveWorkResumeTimerRef.current);
      liveWorkResumeTimerRef.current = null;
    }
    liveSnapshotPauseReleaseRef.current ??=
      pauseLiveQuoteSnapshotNotifications(SIDEBAR_LIVE_WORK_PAUSE_TIMEOUT_MS);
    liveSymbolPauseReleaseRef.current ??=
      pauseLiveSymbolQuoteNotifications(SIDEBAR_LIVE_WORK_PAUSE_TIMEOUT_MS);
    // This service API is a shared expiry, not an owned token. Extend it only
    // for this short motion and let it expire; clearing it here could cancel a
    // newer Quotes action-sheet deferral.
    quotesWsService.deferReconnectForInteraction?.(SIDEBAR_RECONNECT_DEFER_MS);
  }, []);

  const scheduleLiveWorkResumeAfterClose = useCallback(() => {
    if (liveWorkResumeTimerRef.current) {
      clearTimeout(liveWorkResumeTimerRef.current);
    }
    liveWorkResumeTimerRef.current = setTimeout(() => {
      liveWorkResumeTimerRef.current = null;
      liveSnapshotPauseReleaseRef.current?.();
      liveSnapshotPauseReleaseRef.current = null;
      liveSymbolPauseReleaseRef.current?.();
      liveSymbolPauseReleaseRef.current = null;
    }, SIDEBAR_LIVE_WORK_RESUME_DELAY_MS);
  }, []);

  /* Keep the drawer warm offscreen and reveal its final position on touch-down. */
  const revealDrawerImmediately = useCallback(() => {
    drawerAnimationGenerationRef.current += 1;
    animatedVisibleRef.current = true;
    isClosingRef.current = false;
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    slideAnim.setValue(0);
    overlayAnim.setValue(1);
    pauseLiveWorkForDrawer();
  }, [overlayAnim, pauseLiveWorkForDrawer, slideAnim]);

  const showInteractiveAfterVisualFrame = useCallback(() => {
    const generation = interactiveGenerationRef.current + 1;
    interactiveGenerationRef.current = generation;

    // Touch and accessibility ownership follow the native reveal immediately.
    containerRef.current?.setNativeProps({
      pointerEvents: 'auto',
      importantForAccessibility: 'auto',
      accessibilityElementsHidden: false,
      style: { opacity: 1 },
    });

    cancelOpenCommitRef.current?.();
    cancelOpenCommitRef.current = scheduleAfterSidebarOpenVisual(() => {
      cancelOpenCommitRef.current = null;
      if (interactiveGenerationRef.current === generation && animatedVisibleRef.current) {
        setInteractive(true);
        setSidebarOpen(true);
      }
    });
  }, [setSidebarOpen]);

  const hideInteractiveNow = useCallback(() => {
    cancelOpenCommitRef.current?.();
    cancelOpenCommitRef.current = null;
    interactiveGenerationRef.current += 1;
    containerRef.current?.setNativeProps({
      pointerEvents: 'none',
      importantForAccessibility: 'no-hide-descendants',
      accessibilityElementsHidden: true,
      style: { opacity: 0 },
    });
    setInteractive(false);
  }, []);

  useEffect(() => registerSidebarOpenHandler(() => {
    if (animatedVisibleRef.current) return;
    revealDrawerImmediately();
    showInteractiveAfterVisualFrame();
  }), [showInteractiveAfterVisualFrame, revealDrawerImmediately]);

  /**
   * Animates the sidebar drawer off-screen and updates the global visibility state to closed.
   */
  const handleClose = useCallback((afterClose?: () => void) => {
    if (isClosingRef.current) return;
    invalidateSidebarOpenVisualWork();
    const animationGeneration = drawerAnimationGenerationRef.current + 1;
    drawerAnimationGenerationRef.current = animationGeneration;
    animatedVisibleRef.current = false;
    isClosingRef.current = true;
    quotesWsService.deferReconnectForInteraction?.(SIDEBAR_RECONNECT_DEFER_MS);
    // Stop intercepting the newly revealed screen in this touch turn without
    // adding a React state commit to the native-driver close animation.
    interactiveGenerationRef.current += 1;
    cancelOpenCommitRef.current?.();
    cancelOpenCommitRef.current = null;
    containerRef.current?.setNativeProps({ pointerEvents: 'none' });
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: DRAWER_CLOSED_TRANSLATE_X,
        duration: DRAWER_CLOSE_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: DRAWER_CLOSE_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (
        animationGeneration !== drawerAnimationGenerationRef.current
        || !finished
        || animatedVisibleRef.current
      ) {
        if (animationGeneration === drawerAnimationGenerationRef.current) {
          isClosingRef.current = false;
        }
        // Route taps use this callback only to release their single-flight
        // lock. Never apply stale close state to a newly reopened drawer.
        afterClose?.();
        return;
      }
      onClose();
      hideInteractiveNow();
      isClosingRef.current = false;
      scheduleLiveWorkResumeAfterClose();
      afterClose?.();
    });
  }, [hideInteractiveNow, onClose, overlayAnim, scheduleLiveWorkResumeAfterClose, slideAnim]);

  useEffect(() => {
    const unsubscribe = useUIState.subscribe((state, previousState) => {
      if (state.sidebarOpen === previousState.sidebarOpen) {
        return;
      }

      if (state.sidebarOpen) {
        if (!animatedVisibleRef.current) {
          revealDrawerImmediately();
          showInteractiveAfterVisualFrame();
        }
        return;
      }

      if (!isClosingRef.current && animatedVisibleRef.current) {
        handleClose();
      }
    });

    return unsubscribe;
  }, [handleClose, showInteractiveAfterVisualFrame, revealDrawerImmediately]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!animatedVisibleRef.current) return false;
      handleClose();
      return true;
    });

    return () => subscription.remove();
  }, [handleClose]);

  const unlockSidebarNavigation = useCallback(() => {
    if (navigationUnlockTimerRef.current) {
      clearTimeout(navigationUnlockTimerRef.current);
    }
    navigationUnlockTimerRef.current = setTimeout(() => {
      navigationLockedRef.current = false;
      navigationUnlockTimerRef.current = null;
    }, SIDEBAR_NAVIGATION_LOCK_MS);
  }, []);

  const snapClosedForNavigation = useCallback(() => {
    // Route taps show the destination immediately. Snap the native-driver
    // visuals before clearing the global state so no destination can inherit
    // an open drawer or wait for the close animation.
    animatedVisibleRef.current = false;
    invalidateSidebarOpenVisualWork();
    isClosingRef.current = false;
    drawerAnimationGenerationRef.current += 1;
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    slideAnim.setValue(DRAWER_CLOSED_TRANSLATE_X);
    overlayAnim.setValue(0);
    interactiveGenerationRef.current += 1;
    cancelOpenCommitRef.current?.();
    cancelOpenCommitRef.current = null;
  }, [overlayAnim, slideAnim]);

  const closeForNavigation = useCallback(() => {
    snapClosedForNavigation();
    hideInteractiveNow();
    onClose();
    scheduleLiveWorkResumeAfterClose();
  }, [hideInteractiveNow, onClose, scheduleLiveWorkResumeAfterClose, snapClosedForNavigation]);

  const resetDrawerForLifecycle = useCallback(() => {
    // A native close animation can be suspended without its completion
    // callback. Settle its values/flags and input barrier synchronously.
    snapClosedForNavigation();
    hideInteractiveNow();
    onClose();
    navigationLockedRef.current = false;
    if (navigationUnlockTimerRef.current !== null) clearTimeout(navigationUnlockTimerRef.current);
    navigationUnlockTimerRef.current = null;
    if (liveWorkResumeTimerRef.current !== null) clearTimeout(liveWorkResumeTimerRef.current);
    liveWorkResumeTimerRef.current = null;
    liveSnapshotPauseReleaseRef.current?.();
    liveSnapshotPauseReleaseRef.current = null;
    liveSymbolPauseReleaseRef.current?.();
    liveSymbolPauseReleaseRef.current = null;
  }, [hideInteractiveNow, onClose, snapClosedForNavigation]);

  useEffect(() => registerInteractionLifecycleHandler(resetDrawerForLifecycle), [resetDrawerForLifecycle]);

  const runSidebarNavigation = useCallback((route: string) => {
    const currentPath = normalizeSidebarPath(pathnameRef.current);

    if (SIDEBAR_MOUNTED_TAB_ROUTES.has(route) && shouldPushSidebarRoute(currentPath)) {
      // One atomic pop-to action reveals the already-mounted tab route. The
      // old back-then-next-frame navigate sequence exposed the underlying open
      // drawer and added a visible extra frame before Trade/Settings appeared.
      router.dismissTo(route as any);
      return;
    }

    if (SIDEBAR_MOUNTED_TAB_ROUTES.has(route) && navigateMountedSidebarTab(route)) {
      // Skip Expo Router's root URL reconciliation for routes that already
      // exist in the mounted tab navigator. This is the same direct navigator
      // switch used by the bottom bar and keeps the tap frame synchronous.
      return;
    }

    if (SIDEBAR_STACK_ROUTES.has(route) || shouldPushSidebarRoute(route)) {
      // Detail → detail swaps the top screen instead of stacking another one.
      // Stacked details stay mounted (a covered live Journal kept re-rendering
      // 60-360ms slices under the new screen), the stack grew without bound,
      // and BACK had to walk every visited detail instead of returning to the
      // source tab.
      if (shouldPushSidebarRoute(currentPath)) {
        router.replace(route as any);
        return;
      }

      // Push detail routes over the (tabs) navigator so it, and the warm chart
      // WebView, stays mounted; BACK is then an instant pop, not a remount.
      router.push(route as any);
      return;
    }

    router.navigate(route as any);
  }, [router]);

  const navigateSidebarRoute = useCallback((route: string) => {
    if (navigationLockedRef.current) {
      return;
    }

    if (route === '/trade' && requestOrrnnDemoTradeAuth({ kind: 'trade-tab' })) {
      // The trade-access dialog owns the next destination. Close the drawer underneath it so
      // choosing Demo Account or Log In cannot reveal a stale open overlay.
      navigationLockedRef.current = true;
      closeForNavigation();
      unlockSidebarNavigation();
      return;
    }

    navigationLockedRef.current = true;

    const targetPath = normalizeSidebarPath(route);
    const hostedPath = sidebarDestinationController.getSnapshot().activePath;
    const currentPath = hostedPath ?? normalizeSidebarPath(pathnameRef.current);
    const shouldNavigate = currentPath !== targetPath;

    if (!shouldNavigate) {
      // The retained layer may already own this path while its deferred focus
      // publication was interrupted. Reissue the hosted request so the
      // controller can repair a header-only/blank destination.
      if (hostedPath === targetPath && resolveSidebarHostDestination(route)) {
        showSidebarDestination(route, 'sidebar');
      }
      closeForNavigation();
      unlockSidebarNavigation();
      return;
    }

    if (resolveSidebarHostDestination(route)) {
      showSidebarDestination(route, 'sidebar');
      closeForNavigation();
      unlockSidebarNavigation();
      return;
    }

    if (SIDEBAR_PRIMARY_TAB_ROUTES.has(route)) {
      const revision = showFastTabVisualForSidebar(route);
      hideSidebarDestination();
      closeForNavigation();
      unlockSidebarNavigation();
      // Match the bottom bar: reveal cached pixels first, then commit focus
      // work after that frame. A newer selection cancels this route commit.
      if (revision !== null) {
        scheduleFastTabNavigation(revision, () => runSidebarNavigation(route), TAB_BAR_NAVIGATION_SETTLE_DELAY_MS);
      } else runSidebarNavigation(route);
      return;
    }

    closeForNavigation();
    unlockSidebarNavigation();
    try {
      runSidebarNavigation(route);
    } catch (error) {
      unlockSidebarNavigation();
      throw error;
    }
  }, [
    closeForNavigation,
    runSidebarNavigation,
    unlockSidebarNavigation,
  ]);

  const openSupportEmail = useCallback(async () => {
    const mailtoUrl = buildHelpMailto({
      appName,
      appVersion,
      platform: Platform.OS,
      supportEmail,
    });

    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      Alert.alert('Email support', `Please email ${supportEmail} from your mail app.`);
    }
  }, [appName, appVersion, supportEmail]);

  const openSupportEmailFromSidebar = useCallback(() => {
    if (navigationLockedRef.current) {
      return;
    }

    navigationLockedRef.current = true;
    closeForNavigation();
    void openSupportEmail().finally(() => {
      unlockSidebarNavigation();
    });
  }, [closeForNavigation, openSupportEmail, unlockSidebarNavigation]);

  /**
   * Navigates to the selected route when a menu item is tapped, automatically closing the drawer.
   */
  const handleMenuItemPress = useCallback((item: MenuItem) => {
    if (item.action === 'support-email') {
      openSupportEmailFromSidebar();
      return;
    }

    if (item.route) {
      navigateSidebarRoute(item.route);
    }
  }, [navigateSidebarRoute, openSupportEmailFromSidebar]);

  const ds = SIDEBAR_STYLES_BY_MODE[themeMode];

  return (
    <View
      ref={containerRef}
      pointerEvents={interactive ? 'auto' : 'none'}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!interactive}
      style={[ds.container, { opacity: interactive ? 1 : 0 }]}
    >
        <SidebarPathnameSync pathnameRef={pathnameRef} />
        {/* Overlay */}
        <Animated.View
          pointerEvents="box-none"
          renderToHardwareTextureAndroid
          needsOffscreenAlphaCompositing
          style={[
            ds.overlay,
            { left: drawerWidth },
            { opacity: overlayAnim },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => handleClose()}
            activateOnTouchStart
            latencyLabel="sidebar.closeOverlay"
            unstable_pressDelay={0}
          />
        </Animated.View>

        {/* Drawer */}
        <Animated.View
          style={[
            ds.drawer,
            { width: drawerWidth, paddingTop: insets.top + 12, paddingLeft: insets.left },
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          <ScrollView
            style={ds.menuScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom) }}
          >
          {/* ── Profile Header ── */}
          <View style={ds.profileHeader}>
            <View style={ds.profileRow}>
              <View style={ds.avatarWrap}>
                {activeBrokerLogoUrl && !brokerLogoFailed ? (
                  <Image
                    accessibilityLabel="Broker logo"
                    resizeMode="cover"
                    source={{ uri: activeBrokerLogoUrl }}
                    style={ds.avatarImage}
                    onError={() => setBrokerLogoFailed(true)}
                  />
                ) : (
                  <AppLogo style={ds.avatarImage} />
                )}
              </View>
              {isLoggedIn && accountDetails ? (
                <View style={ds.profileText}>
                  <Text style={ds.userName} numberOfLines={1}>{displayAccountName}</Text>
                  <Text style={ds.accountDetails} numberOfLines={1}>{accountDetails.id} — {brokerConfig?.server_name || accountDetails.server}</Text>
                  {brokerConfig?.broker_name ? (
                    <Text style={[ds.accountDetails, { marginTop: 0, marginBottom: 4 }]} numberOfLines={1}>{brokerConfig.broker_name}</Text>
                  ) : null}
                  <Pressable
                    style={ds.manageBtn}
                    onPress={() => navigateSidebarRoute('/settings/accounts')}
                    activateOnPressIn
                    hitSlop={SIDEBAR_PROFILE_ACTION_HIT_SLOP}
                    latencyLabel="sidebar.manageAccounts"
                    unstable_pressDelay={0}
                  >
                    <Text style={ds.manageText}>Manage accounts</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={ds.profileText}
                  onPress={() => navigateSidebarRoute('/login')}
                  activateOnPressIn
                  hitSlop={SIDEBAR_PROFILE_ACTION_HIT_SLOP}
                  latencyLabel="sidebar.getStarted"
                  unstable_pressDelay={0}
                  accessibilityRole="button"
                >
                  <Text style={ds.loginText}>Login to an existing account</Text>
                  <View style={ds.getStartedBtn}>
                    <Text style={ds.getStartedText}>Get started</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Theme Toggle ── */}
          <SidebarThemeSelector
            appliedThemeMode={themeMode}
            onSelectThemeMode={handleThemeModePress}
          />

          {/* ── Divider ── */}
          <View style={ds.divider} />

          {/* ── Menu Items ── */}
          <View style={ds.menuContent}>
            {MENU_ITEMS.map((item) => (
              <SidebarMenuRow
                key={item.label}
                item={item}
                displayLabel={t(item.label)}
                onPressItem={handleMenuItemPress}
                ds={ds}
                iconColor={T.textSub}
              />
            ))}
          </View>
          </ScrollView>

        </Animated.View>
      </View>
  );
});

// ─── Dynamic Styles ──────────────────────────────────────────────────────────
type SidebarThemeSelectorProps = {
  appliedThemeMode: ThemeMode;
  onSelectThemeMode: (mode: ThemeMode) => void;
};

/**
 * A segmented control component allowing the user to select their app-wide color theme preference (System, Light, Dark).
 */
function SidebarThemeSelector({
  appliedThemeMode,
  onSelectThemeMode,
}: SidebarThemeSelectorProps) {
  const [pendingThemeMode, setPendingThemeMode] = useState<ThemeMode | null>(null);
  const selectedThemeMode = pendingThemeMode ?? appliedThemeMode;
  const selectedIsDark = selectedThemeMode === 'dark';
  const T = selectedIsDark ? GDark : GLight;
  const ds = SIDEBAR_STYLES_BY_MODE[selectedThemeMode];

  useEffect(() => {
    if (pendingThemeMode === appliedThemeMode) {
      setPendingThemeMode(null);
    }
  }, [appliedThemeMode, pendingThemeMode]);

  const handleThemeModePress = useCallback((nextMode: ThemeMode) => {
    if (selectedThemeMode === nextMode && appliedThemeMode === nextMode) {
      return;
    }

    setPendingThemeMode(nextMode);
    onSelectThemeMode(nextMode);
  }, [appliedThemeMode, onSelectThemeMode, selectedThemeMode]);

  return (
    <View style={ds.themeSection}>
      <Text style={ds.themeLabel}>Theme</Text>
      <View style={ds.themePill}>
        <Pressable
          style={!selectedIsDark ? ds.themeOptActive : ds.themeOptInactive}
          onPress={() => handleThemeModePress('light')}
          activateOnTouchStart
          latencyLabel="sidebar.themeLight"
          unstable_pressDelay={0}
        >
          <Ionicons name="sunny-outline" size={13} color={!selectedIsDark ? T.text : T.textMuted} />
          <Text style={!selectedIsDark ? ds.themeOptTextActive : ds.themeOptTextInactive}>Light</Text>
        </Pressable>
        <Pressable
          style={selectedIsDark ? ds.themeOptActive : ds.themeOptInactive}
          onPress={() => handleThemeModePress('dark')}
          activateOnTouchStart
          latencyLabel="sidebar.themeDark"
          unstable_pressDelay={0}
        >
          <Ionicons name="moon-outline" size={13} color={selectedIsDark ? T.text : T.textMuted} />
          <Text style={selectedIsDark ? ds.themeOptTextActive : ds.themeOptTextInactive}>Dark</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: DRAWER_WIDTH,
      // While switching to dark, conceal the retained chart WebView for its
      // brief native bridge catch-up. The close fade reveals the themed chart.
      backgroundColor: isDark ? '#000000' : 'rgba(0,0,0,0.3)',
      zIndex: 0,
      elevation: 0,
    },
    drawer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 1,
      elevation: 1,
      width: DRAWER_WIDTH,
      backgroundColor: isDark ? T.bg : T.glass1,
      borderRightWidth: 1,
      borderRightColor: T.border,
    },

    /* Profile */
    profileHeader: {
      paddingHorizontal: 18,
      // Keep the account block compact so the first menu rows sit higher on phone screens.
      paddingBottom: 8,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    avatarWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: T.glass2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    profileText: {
      flex: 1,
      minWidth: 0,
      marginLeft: 12,
    },
    userName: {
      color: T.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 3,
    },
    accountDetails: {
      color: T.textSub,
      fontSize: 14,
      marginBottom: 4,
    },
    manageBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 2,
    },
    manageText: {
      color: '#2563EB',
      fontSize: 15,
      fontWeight: '700',
    },
    loginText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    getStartedBtn: {
      backgroundColor: T.accent,
      paddingHorizontal: 16,
      minHeight: 44,
      borderRadius: 22,
      alignSelf: 'flex-start',
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    getStartedText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },
    /* Theme */
    themeSection: {
      paddingHorizontal: 18,
      paddingBottom: 14,
    },
    themeLabel: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 6,
      letterSpacing: 0.3,
    },
    themePill: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: T.glass2,
      borderRadius: 20,
      padding: 3,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: T.border,
    },
    themeOptInactive: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 18,
      gap: 5,
    },
    themeOptTextInactive: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    themeOptActive: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 18,
      backgroundColor: T.glass3,
      gap: 5,
    },
    themeOptTextActive: {
      color: T.text,
      fontSize: 12,
      fontWeight: '700',
    },

    /* Divider */
    divider: {
      height: 1,
      backgroundColor: T.border,
      marginHorizontal: 18,
    },

    /* Menu */
    menuScroll: {
      flex: 1,
    },
    menuContent: {
      paddingVertical: 8,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 10,
      marginHorizontal: 6,
    },
    menuItemPressed: {
      backgroundColor: T.glass2,
    },
    menuIcon: {
      width: 28,
    },
    menuText: {
      flex: 1,
      minWidth: 0,
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.1,
    },

  });
}

const SIDEBAR_STYLES_BY_MODE: Record<ThemeMode, ReturnType<typeof makeStyles>> = {
  light: makeStyles(GLight, false),
  dark: makeStyles(GDark, true),
};

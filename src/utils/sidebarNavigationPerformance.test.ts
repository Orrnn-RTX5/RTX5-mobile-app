import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('native-revealable sidebar destinations keep the settled theme while hidden', () => {
  const hostSource = readSource('src/ui/components/SidebarDestinationHost.tsx');

  assert.match(
    hostSource,
    /<ThemeModeRenderPriorityContext\.Provider value="retained">[\s\S]*<DestinationView active=\{active\}/,
  );
  assert.doesNotMatch(hostSource, /'frozen'/);
});

test('hamburger opens the sidebar on the zero-delay stable press path', () => {
  const source = readSource('src/ui/components/AppHeader.tsx');
  const controllerSource = readSource('src/ui/components/sidebarDrawerController.ts');

  assert.match(source, /const handleOpenSidebar = useCallback/);
  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '\.\/sidebarDrawerController'/);
  assert.match(source, /const hideActionSheet = useUIState\(\(s\) => s\.hideActionSheet\)/);
  assert.doesNotMatch(source, /const setSidebarOpen = useUIState\(\(s\) => s\.setSidebarOpen\)/);
  assert.doesNotMatch(source, /scheduleAfterFirstVisualFrame/);
  assert.match(source, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.doesNotMatch(source, /setSidebarOpen\(true\)/);
  assert.doesNotMatch(source, /scheduleAfterTapFrame/);
  assert.match(source, /export const MENU_BUTTON_VISUAL_LEFT = 28/);
  assert.match(source, /const HEADER_HORIZONTAL_PADDING = 16/);
  assert.match(source, /export const HEADER_ACTION_SLOT_WIDTH = 88/);
  assert.match(source, /export const HEADER_COMPACT_SLOT_WIDTH = MENU_BTN_GUTTER/);
  assert.match(source, /const MENU_BUTTON_LEFT_INSET = MENU_BUTTON_VISUAL_LEFT - HEADER_HORIZONTAL_PADDING/);
  assert.match(source, /const sideSlotStyle = rightActions[\s\S]*styles\.sideSlotWithActions[\s\S]*styles\.sideSlotCompact/);
  assert.match(source, /sideSlotWithActions: \{\s*width: HEADER_ACTION_SLOT_WIDTH/);
  assert.match(source, /sideSlotCompact: \{\s*width: HEADER_COMPACT_SLOT_WIDTH/);
  assert.match(source, /numberOfLines=\{2\}[\s\S]*adjustsFontSizeToFit[\s\S]*minimumFontScale=\{0\.72\}/);
  assert.match(source, /paddingHorizontal: HEADER_HORIZONTAL_PADDING/);
  assert.match(source, /paddingLeft: MENU_BUTTON_LEFT_INSET/);
  assert.match(source, /onPress=\{handleOpenSidebar\}/);
  assert.match(source, /activateOnTouchStart/);
  assert.match(source, /hitSlop=\{MENU_BUTTON_HIT_SLOP\}/);
  assert.match(source, /minHeight: 44/);
  assert.match(source, /latencyLabel="appHeader\.menu"/);
  assert.doesNotMatch(source, /activateOnPressIn/);
  assert.doesNotMatch(source, /onPressIn=\{handleOpenSidebar\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.doesNotMatch(source, /ANDROID_EDGE_GESTURE_SAFE_PAD/);
  assert.match(controllerSource, /const sidebarOpenHandlers: SidebarOpenHandler\[\] = \[\]/);
  assert.match(controllerSource, /sidebarOpenHandlers\.push\(handler\)/);
  assert.match(controllerSource, /const index = sidebarOpenHandlers\.lastIndexOf\(handler\)/);
  assert.match(controllerSource, /sidebarOpenHandlers\.splice\(index, 1\)/);
  assert.match(controllerSource, /sidebarOpenHandlers\[sidebarOpenHandlers\.length - 1\]\?\.\(\)/);
  assert.doesNotMatch(controllerSource, /SIDEBAR_OPEN_VISUAL_SYNC_DELAY_MS/);
  assert.doesNotMatch(controllerSource, /let openSidebarHandler/);
});

test('sidebar drawer reveals instantly and keeps navigation and closing work non-blocking', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');
  const hostControllerSource = readSource('src/ui/components/sidebarDestinationHostController.ts');
  const fastTabVisualSource = readSource('src/ui/navigation/fastTabVisualController.ts');
  const liveSymbolSource = readSource('src/query/websocket.ts');

  assert.doesNotMatch(source, /DRAWER_OPEN_ANIMATION_MS|startOpenAnimation/);
  assert.match(source, /const DRAWER_CLOSE_ANIMATION_MS = 60/);
  assert.match(source, /const DRAWER_CLOSED_TRANSLATE_X = -DRAWER_WIDTH - 2/);
  assert.match(source, /const SIDEBAR_NAVIGATION_LOCK_MS = 50/);
  assert.match(source, /const SIDEBAR_LIVE_WORK_PAUSE_TIMEOUT_MS = 30_000/);
  assert.match(source, /const SIDEBAR_LIVE_WORK_RESUME_DELAY_MS = 180/);
  assert.match(source, /const SIDEBAR_RECONNECT_DEFER_MS = 1_000/);
  assert.match(source, /const pauseLiveWorkForDrawer = useCallback\(\(\) => \{[\s\S]*pauseLiveQuoteSnapshotNotifications\(SIDEBAR_LIVE_WORK_PAUSE_TIMEOUT_MS\)[\s\S]*pauseLiveSymbolQuoteNotifications\(SIDEBAR_LIVE_WORK_PAUSE_TIMEOUT_MS\)[\s\S]*quotesWsService\.deferReconnectForInteraction\?\.\(SIDEBAR_RECONNECT_DEFER_MS\)/);
  const revealSource = source.slice(source.indexOf('const revealDrawerImmediately = useCallback'), source.indexOf('const showInteractiveAfterVisualFrame = useCallback'));
  assert.match(revealSource, /slideAnim\.setValue\(0\);\s*overlayAnim\.setValue\(1\);\s*pauseLiveWorkForDrawer\(\)/);
  assert.doesNotMatch(revealSource, /Animated\.timing|setTimeout|setInteractive|setSidebarOpen/);
  assert.match(source, /new Animated\.Value\(initialSidebarOpenRef\.current \? 0 : DRAWER_CLOSED_TRANSLATE_X, \{ useNativeDriver: true \}\)/);
  assert.match(source, /new Animated\.Value\(initialSidebarOpenRef\.current \? 1 : 0, \{ useNativeDriver: true \}\)/);
  assert.match(source, /const scheduleLiveWorkResumeAfterClose = useCallback\(\(\) => \{[\s\S]*setTimeout\(\(\) => \{[\s\S]*liveSnapshotPauseReleaseRef\.current\?\.\(\)[\s\S]*liveSymbolPauseReleaseRef\.current\?\.\(\)/);
  assert.doesNotMatch(source, /resumeReconnectAfterInteraction/);
  assert.match(liveSymbolSource, /export const pauseLiveSymbolQuoteNotifications = \(durationMs = 2_500\)/);
  assert.match(liveSymbolSource, /if \(liveSymbolNotificationPauseDepth > 0\) \{\s*pendingLiveSymbolTicks\.set\(listener, tick\);\s*return;/);
  assert.match(liveSymbolSource, /flushPausedLiveSymbolTicks\(\)/);
  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200/);
  assert.doesNotMatch(source, /const visible = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(source, /const initialSidebarOpenRef = useRef\(useUIState\.getState\(\)\.sidebarOpen\)/);
  assert.match(source, /const \[interactive, setInteractive\] = useState\(initialSidebarOpenRef\.current\)/);
  assert.match(source, /const sidebarProfileDataActive = useDeferredActiveFlag\(interactive && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS\)/);
  assert.doesNotMatch(source, /profileDataReady/);
  assert.match(source, /const LOGGED_OUT_PREFETCH_ROUTES = \['\/login'\] as const/);
  assert.match(source, /const SIDEBAR_STACK_ROUTES = new Set<string>\(LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.match(source, /const SIDEBAR_PUSH_ROUTE_PREFIXES = \['\/settings\/'\] as const/);
  assert.match(source, /const SIDEBAR_PRIMARY_TAB_ROUTES = new Set<string>/);
  assert.doesNotMatch(source, /lastSidebarDetailBasePath|scheduleAfterTapVisualFrame/);
  assert.match(source, /function shouldPushSidebarRoute\(route: string\)/);
  assert.match(source, /const animatedVisibleRef = useRef\(initialSidebarOpenRef\.current\)/);
  assert.match(source, /const drawerAnimationGenerationRef = useRef\(0\)/);
  assert.match(source, /const interactiveGenerationRef = useRef\(0\)/);
  assert.match(source, /const containerRef = useRef<View>\(null\)/);
  assert.match(source, /const revealDrawerImmediately = useCallback/);
  assert.doesNotMatch(source, /const snapClosed = useCallback/);
  assert.match(source, /const showInteractiveAfterVisualFrame = useCallback/);
  assert.match(source, /containerRef\.current\?\.setNativeProps\(\{\s*pointerEvents: 'auto',\s*importantForAccessibility: 'auto',\s*accessibilityElementsHidden: false/);
  assert.match(source, /scheduleAfterSidebarOpenVisual\(\(\) => \{[\s\S]*interactiveGenerationRef\.current === generation && animatedVisibleRef\.current[\s\S]*setInteractive\(true\);\s*setSidebarOpen\(true\)/);
  assert.match(source, /const hideInteractiveNow = useCallback/);
  assert.match(source, /containerRef\.current\?\.setNativeProps\(\{ pointerEvents: 'none' \}\)/);
  assert.match(source, /setInteractive\(false\);/);
  const snapCloseStart = source.indexOf('const snapClosedForNavigation = useCallback');
  const runNavigationStart = source.indexOf('const runSidebarNavigation = useCallback', snapCloseStart);
  assert.notEqual(snapCloseStart, -1);
  assert.notEqual(runNavigationStart, -1);
  const closeForNavigationStart = source.indexOf('const closeForNavigation = useCallback', snapCloseStart);
  assert.notEqual(closeForNavigationStart, -1);
  const snapCloseSource = source.slice(snapCloseStart, closeForNavigationStart);
  assert.match(snapCloseSource, /slideAnim\.setValue\(DRAWER_CLOSED_TRANSLATE_X\)/);
  assert.match(snapCloseSource, /overlayAnim\.setValue\(0\)/);
  assert.match(snapCloseSource, /interactiveGenerationRef\.current \+= 1/);
  assert.doesNotMatch(snapCloseSource, /hideInteractiveNow\(\)/);
  assert.doesNotMatch(snapCloseSource, /onClose\(\)/);
  assert.match(snapCloseSource, /invalidateSidebarOpenVisualWork\(\)/);
  const closeForNavigationSource = source.slice(closeForNavigationStart, runNavigationStart);
  assert.match(closeForNavigationSource, /snapClosedForNavigation\(\);\s*hideInteractiveNow\(\);\s*onClose\(\);\s*scheduleLiveWorkResumeAfterClose\(\)/);
  assert.doesNotMatch(closeForNavigationSource, /Animated\.timing|setTimeout/);
  const navigateStart = source.indexOf('const navigateSidebarRoute = useCallback', runNavigationStart);
  assert.notEqual(navigateStart, -1);
  const runNavigationSource = source.slice(runNavigationStart, navigateStart);
  // Pathname is read from a ref (fed by the null-rendering SidebarPathnameSync
  // child) so route changes do NOT re-render the drawer — usePathname directly
  // in the drawer body put two drawer re-renders on every navigation commit.
  assert.match(runNavigationSource, /const currentPath = normalizeSidebarPath\(pathnameRef\.current\)/);
  assert.match(source, /function SidebarPathnameSync\(/);
  assert.match(source, /<SidebarPathnameSync pathnameRef=\{pathnameRef\} \/>/);
  assert.match(source, /export const SidebarDrawer = memo\(function SidebarDrawer\(\)/);
  const drawerComponentSource = source.slice(source.indexOf('export const SidebarDrawer = memo'));
  assert.doesNotMatch(drawerComponentSource, /const pathname = usePathname\(\)/);
  assert.match(runNavigationSource, /SIDEBAR_MOUNTED_TAB_ROUTES\.has\(route\) && shouldPushSidebarRoute\(currentPath\)/);
  assert.match(runNavigationSource, /SIDEBAR_MOUNTED_TAB_ROUTES\.has\(route\) && navigateMountedSidebarTab\(route\)/);
  assert.match(runNavigationSource, /router\.dismissTo\(route as any\);\s*return;/);
  assert.doesNotMatch(runNavigationSource, /router\.back\(\)|scheduleAfterTapVisualFrame/);
  const supportStart = source.indexOf('const openSupportEmail = useCallback', navigateStart);
  assert.notEqual(supportStart, -1);
  const navigateSource = source.slice(navigateStart, supportStart);
  assert.match(
    navigateSource,
    /if \(!shouldNavigate\) \{[\s\S]*?if \(hostedPath === targetPath && resolveSidebarHostDestination\(route\)\) \{\s*showSidebarDestination\(route, 'sidebar'\);/,
  );
  const hostedBranchStart = navigateSource.indexOf('if (resolveSidebarHostDestination(route))');
  const primaryBranchStart = navigateSource.indexOf('if (SIDEBAR_PRIMARY_TAB_ROUTES.has(route))');
  const fallbackBranchStart = navigateSource.indexOf('\n    closeForNavigation();', navigateSource.indexOf('\n      return;', primaryBranchStart));
  assert.notEqual(hostedBranchStart, -1);
  assert.notEqual(primaryBranchStart, -1);
  assert.notEqual(fallbackBranchStart, -1);
  const hostedBranchSource = navigateSource.slice(hostedBranchStart, primaryBranchStart);
  const primaryBranchSource = navigateSource.slice(primaryBranchStart, fallbackBranchStart);
  // Selection commits the target and closes the drawer in the same touch turn.
  assert.match(hostedBranchSource, /showSidebarDestination\(route, 'sidebar'\);\s*closeForNavigation\(\);\s*unlockSidebarNavigation\(\);\s*return;/);
  assert.ok(
    hostedBranchSource.indexOf("showSidebarDestination(route, 'sidebar')")
      < hostedBranchSource.indexOf('closeForNavigation('),
    'hosted destination must become visible before drawer close work starts',
  );
  assert.doesNotMatch(hostedBranchSource, /runSidebarNavigation|navigateMountedSidebarTab|router\.(?:navigate|push|replace|dismissTo)/);
  assert.match(primaryBranchSource, /const revision = showFastTabVisualForSidebar\(route\);\s*hideSidebarDestination\(\);\s*closeForNavigation\(\);\s*unlockSidebarNavigation\(\);/);
  assert.match(primaryBranchSource, /scheduleFastTabNavigation\(revision, \(\) => runSidebarNavigation\(route\), TAB_BAR_NAVIGATION_SETTLE_DELAY_MS\)/);
  assert.ok(
    primaryBranchSource.indexOf('showFastTabVisualForSidebar(route)')
      < primaryBranchSource.indexOf('closeForNavigation('),
    'Trade/Settings must switch the shared visual layer before drawer close starts',
  );
  assert.ok(
    primaryBranchSource.indexOf('closeForNavigation(')
      < primaryBranchSource.indexOf('runSidebarNavigation(route)'),
    'the native close must start before mounted-tab navigation work',
  );
  assert.doesNotMatch(navigateSource, /handleClose\(/);
  assert.doesNotMatch(navigateSource, /scheduleCloseAfterRevealFrame|scheduleAfterTapVisualFrame|runSidebarNavigation\(route\);[\s\S]*showSidebarDestination/);
  assert.match(source, /import \{[\s\S]*showSidebarDestination,[\s\S]*sidebarDestinationController,[\s\S]*\} from '\.\/sidebarDestinationHostController'/);
  assert.match(source, /import \{[\s\S]*scheduleFastTabNavigation,[\s\S]*showFastTabVisualForSidebar,[\s\S]*TAB_BAR_NAVIGATION_SETTLE_DELAY_MS,[\s\S]*\} from '\.\.\/navigation\/fastTabVisualController'/);
  assert.match(hostControllerSource, /export const SIDEBAR_HOST_DESTINATIONS = \[[\s\S]*'journal',[\s\S]*'economic-calendar',[\s\S]*'user-guide',[\s\S]*'help',[\s\S]*'about'/);
  assert.match(hostControllerSource, /export function showSidebarDestination\([\s\S]*const shown = sidebarDestinationController\.show\(destinationOrPath, source\);[\s\S]*if \(shown\) clearFastTabVisual\(\);[\s\S]*return shown/);
  assert.match(fastTabVisualSource, /export function showFastTabVisualForSidebar\(pathOrName: string\)/);
  assert.match(fastTabVisualSource, /export function scheduleFastTabNavigation\(\s*revision: number,\s*action: \(\) => void,\s*settleDelayMs: number = FAST_TAB_NAVIGATION_SETTLE_DELAY_MS,\s*\)/);
  assert.match(source, /import \{ invalidateSidebarOpenVisualWork, navigateMountedSidebarTab, registerSidebarOpenHandler, scheduleAfterSidebarOpenVisual \} from '\.\/sidebarDrawerController'/);
  assert.match(source, /useEffect\(\(\) => registerSidebarOpenHandler\(\(\) => \{\s*if \(animatedVisibleRef\.current\) return;\s*revealDrawerImmediately\(\);\s*showInteractiveAfterVisualFrame\(\);/);
  assert.match(source, /useUIState\.subscribe\(\(state, previousState\) => \{/);
  assert.match(source, /if \(state\.sidebarOpen\) \{\s*if \(!animatedVisibleRef\.current\) \{\s*revealDrawerImmediately\(\);\s*showInteractiveAfterVisualFrame\(\);\s*\}/);
  assert.match(source, /if \(!isClosingRef\.current && animatedVisibleRef\.current\) \{\s*handleClose\(\);/);
  assert.doesNotMatch(source, /useLayoutEffect/);
  assert.match(source, /Animated\.parallel\(\[/);
  assert.match(source, /toValue: DRAWER_CLOSED_TRANSLATE_X,[\s\S]*duration: DRAWER_CLOSE_ANIMATION_MS,[\s\S]*useNativeDriver: true/);
  assert.match(source, /const animationGeneration = drawerAnimationGenerationRef\.current \+ 1;[\s\S]*animationGeneration !== drawerAnimationGenerationRef\.current[\s\S]*\|\| !finished[\s\S]*\|\| animatedVisibleRef\.current[\s\S]*afterClose\?\.\(\);[\s\S]*return;/);
  assert.match(source, /Easing\.out\(Easing\.cubic\)/);
  assert.doesNotMatch(source, /const \[keepDrawerMounted, setKeepDrawerMounted\]/);
  assert.doesNotMatch(source, /const shouldRenderDrawer = visible \|\| keepDrawerMounted/);
  assert.match(source, /Keep the drawer warm offscreen and reveal its final position on touch-down/);
  assert.match(source, /pointerEvents=\{interactive \? 'auto' : 'none'\}/);
  assert.match(source, /ref=\{containerRef\}/);
  assert.match(source, /importantForAccessibility=\{interactive \? 'auto' : 'no-hide-descendants'\}/);
  assert.match(source, /accessibilityElementsHidden=\{!interactive\}/);
  assert.doesNotMatch(source, /containerHidden:/);
  assert.match(source, /style=\{\[ds\.container, \{ opacity: interactive \? 1 : 0 \}\]\}/);
  assert.doesNotMatch(source, /if \(!shouldRenderDrawer\) \{\s*return null;\s*\}/);
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /if \(!animatedVisibleRef\.current\) return false;\s*handleClose\(\);/);
  assert.match(source, /handleClose\(\);\s*return true;/);
  assert.match(source, /pointerEvents="box-none"[\s\S]*style=\{\[[\s\S]*ds\.overlay/);
  const overlaySurfaceStart = source.indexOf('{/* Overlay */}');
  const drawerSurfaceStart = source.indexOf('{/* Drawer */}', overlaySurfaceStart);
  const drawerSurfaceEnd = source.indexOf('{/*', drawerSurfaceStart + '{/* Drawer */}'.length);
  assert.notEqual(overlaySurfaceStart, -1);
  assert.notEqual(drawerSurfaceStart, -1);
  assert.notEqual(drawerSurfaceEnd, -1);
  const overlaySurfaceSource = source.slice(overlaySurfaceStart, drawerSurfaceStart);
  const drawerSurfaceSource = source.slice(drawerSurfaceStart, drawerSurfaceEnd);
  assert.match(overlaySurfaceSource, /renderToHardwareTextureAndroid/);
  assert.match(overlaySurfaceSource, /needsOffscreenAlphaCompositing/);
  assert.doesNotMatch(
    drawerSurfaceSource,
    /renderToHardwareTextureAndroid|shouldRasterizeIOS/,
    'the theme-sensitive drawer must not keep a stale rasterized text and icon texture',
  );
  assert.match(source, /overlay: \{[\s\S]*left: DRAWER_WIDTH,[\s\S]*zIndex: 0,[\s\S]*elevation: 0,/);
  assert.match(
    source,
    /overlay: \{[\s\S]*backgroundColor: isDark \? '#000000' : 'rgba\(0,0,0,0\.3\)'/,
    'the open dark drawer must fully conceal a retained light WebView while the light drawer keeps its normal scrim',
  );
  assert.doesNotMatch(source, /overlay: \{\s*\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(source, /drawer: \{[\s\S]*zIndex: 1,[\s\S]*elevation: 1,/);
  assert.match(source, /Keep the account block compact so the first menu rows sit higher on phone screens/);
  assert.match(source, /profileHeader: \{[\s\S]*paddingBottom: 8,/);
  assert.match(source, /accountDetails: \{[\s\S]*marginBottom: 4,/);
  assert.match(source, /manageBtn: \{[\s\S]*paddingVertical: 2,/);
  assert.match(source, /transform: \[\{ translateX: slideAnim \}\]/);
  assert.doesNotMatch(source, /if \(!visible\) \{\s*return null;\s*\}/);
  assert.doesNotMatch(source, /const PREFETCH_ROUTES = \[/);
  assert.doesNotMatch(source, /SIDEBAR_PREFETCH_DELAY_MS/);
  assert.doesNotMatch(source, /prefetchSidebarRoutes/);
  assert.doesNotMatch(source, /const prefetchSidebarRoute = useCallback/);
  assert.doesNotMatch(source, /const prefetchNextRoute = \(\) => \{/);
  assert.match(source, /try \{\s*prefetch\(route\);/);
  assert.match(source, /if \(isLoggedIn\) \{\s*return;\s*\}/);
  assert.match(source, /for \(const route of LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.doesNotMatch(source, /scheduleNextFrame\(afterClose\)/);
  assert.match(source, /keyboardShouldPersistTaps="always"/);
  assert.match(source, /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/);
  assert.match(source, /const navigateSidebarRoute = useCallback/);
  assert.match(source, /navigationLockedRef\.current = true/);
  assert.doesNotMatch(source, /clearSidebarPrefetchTimer/);
  assert.match(source, /const snapClosedForNavigation = useCallback/);
  assert.doesNotMatch(hostedBranchSource, /snapClosedForNavigation|hideInteractiveNow|onClose\(\)/);
  assert.doesNotMatch(primaryBranchSource, /snapClosedForNavigation|hideInteractiveNow|onClose\(\)/);
  assert.doesNotMatch(source, /scheduleAfterTapVisualFrame/);
  assert.match(source, /const openSupportEmailFromSidebar = useCallback/);
  assert.match(source, /snapClosedForNavigation\(\);[\s\S]*hideInteractiveNow\(\);[\s\S]*onClose\(\);[\s\S]*void openSupportEmail\(\)\.finally\(\(\) => \{[\s\S]*unlockSidebarNavigation\(\);/);
  assert.doesNotMatch(source, /if \(item\.action === 'support-email'\) \{[\s\S]*handleClose\(\(\) => \{[\s\S]*void openSupportEmail\(\)/);
  assert.doesNotMatch(source, /preloadSidebarRouteModule/);
  assert.doesNotMatch(source, /preloadDeferredRouteModule\(JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute\)/);
  assert.doesNotMatch(source, /function scheduleAfterPressPaint/);
  assert.match(source, /normalizeSidebarPath\(route\)/);
  assert.doesNotMatch(source, /scheduleAfterFirstVisualFrame/);
  assert.doesNotMatch(source, /showSidebarRouteTransition/);
  // Detail routes push over (tabs) (keeping the tab navigator + warm chart
  // WebView mounted) so BACK is an instant pop, not a tab re-mount. Detail →
  // detail REPLACES the top screen instead of pushing: stacked details stay
  // mounted (a covered live Journal kept re-rendering 60-360ms JS slices under
  // the new screen), the stack grew without bound, and BACK had to walk every
  // visited detail. Replace keeps the detail stack one level deep while (tabs)
  // stays mounted underneath — replacing INTO a tab route is still forbidden.
  assert.match(source, /SIDEBAR_STACK_ROUTES\.has\(route\) \|\| shouldPushSidebarRoute\(route\)/);
  assert.match(source, /if \(shouldPushSidebarRoute\(currentPath\)\) \{\s*router\.replace\(route as any\);\s*return;\s*\}/);
  assert.match(source, /router\.push\(route as any\)/);
  assert.doesNotMatch(source, /router\.replace\('\/\(tabs\)/);
  assert.match(source, /router\.navigate\(route as any\)/);
  assert.doesNotMatch(source, /prefetchSidebarRoute\(route\);\s*router\.push\(route as any\)/);
  assert.match(source, /unlockSidebarNavigation\(\)/);
  // Menu rows are memoized so drawer-level state flips (interactive, profile
  // data) cannot re-reconcile eight Pressables mid-animation.
  assert.match(source, /const SidebarMenuRow = memo\(function SidebarMenuRow/);
  assert.match(source, /onPress=\{\(\) => onPressItem\(item\)\}/);
  assert.match(source, /onPressItem=\{handleMenuItemPress\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /hitSlop=\{SIDEBAR_MENU_ITEM_HIT_SLOP\}/);
  assert.match(source, /minHeight: 48/);
  assert.match(source, /latencyLabel=\{`sidebar\.menu\.\$\{item\.label\}`\}/);
  assert.doesNotMatch(source, /router\.push\(item\.route as any\)/);
  assert.doesNotMatch(source, /runInstantSidebarAction/);
  assert.doesNotMatch(source, /runSidebarPressFallback/);
  assert.doesNotMatch(source, /handleSidebarPressOut/);
  assert.doesNotMatch(source, /SIDEBAR_PRESS_GUARD_MS/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});


test('trade route keeps its structural body mounted while deferring live work', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');

  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /const TRADE_SCREEN_FETCH_DELAY_MS = 0/);
  assert.match(source, /const TRADE_SCREEN_REFRESH_INTERVAL_MS = 3000/);
  assert.doesNotMatch(source, /TRADE_BODY_PREWARM_DELAY_MS|routeBodyReady|showTradeBody|useDeferredRouteContentReady/);
  assert.match(source, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(source, /requestAnimationFrame\(markReady\)/);
  assert.doesNotMatch(source, /sidebarOpen = useUIState/);
  // Structural ledger content is already mounted before selection. Live quotes
  // and backend refresh work remain deferred until after the route paint.
  assert.match(source, /<AppHeader title=\{t\('Trade'\)\} noBorder \/>[\s\S]*<TradeSummaryHeader[\s\S]*<FlatList/);
  assert.match(source, /positionsSignature: buildOpenPositionsCacheSignature\(state\.positions\)/);
  assert.match(source, /const tradeLiveActive = isLiveScreenFocused/);
  assert.match(source, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady, TRADE_SCREEN_FETCH_DELAY_MS\)/);
  assert.match(source, /if \(!tradeFetchActive \|\| !resolvedLogin\) \{/);
  assert.match(source, /refreshVisibleTradeLedger\(\);[\s\S]*setInterval\(refreshVisibleTradeLedger, TRADE_SCREEN_REFRESH_INTERVAL_MS\)/);
  assert.match(source, /clearInterval\(refreshIntervalId\)/);
  assert.match(source, /const positionRowsActive = tradeLiveActive/);
  assert.match(source, /<TradeSummaryHeader[\s\S]*active=\{tradeLiveActive\}/);
  assert.match(source, /const rowActive = positionRowsActive && \([\s\S]*viewablePositionIds\.has\(String\(item\.id\)\)/);
  assert.match(source, /<TradePositionRow[\s\S]*active=\{rowActive\}/);
  assert.doesNotMatch(source, /if \(isScreenFocused && resolvedLogin\) \{\s*fetchPositions\(\);/);
});

test('settings sidebar route renders its complete page while deferring account-card queries', () => {
  const source = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');

  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /const SETTINGS_SCREEN_DATA_DELAY_MS = 0/);
  assert.doesNotMatch(source, /SETTINGS_BODY_PREWARM_DELAY_MS|routeBodyReady|useDeferredRouteContentReady/);
  assert.match(source, /<ScrollView[\s\S]*style=\{styles\.container\}[\s\S]*contentContainerStyle=\{styles\.content\}/);
  assert.match(source, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(source, /requestAnimationFrame\(markReady\)/);
  assert.doesNotMatch(source, /sidebarOpen = useUIState/);
  assert.match(source, /const settingsDataActive = useDeferredActiveFlag\(\s*isAccountConnected && isScreenFocused && firstPaintReady,\s*SETTINGS_SCREEN_DATA_DELAY_MS,\s*\)/);
  assert.match(source, /useBrokerConfig\(brokerId, settingsDataActive\)/);
  assert.doesNotMatch(source, /useAccounts\(settingsDataActive\)/);
  assert.match(source, /useAccountDetails\(activeLogin, settingsDataActive && !!activeLogin\)/);
  assert.doesNotMatch(source, /const settingsDataActive = isAccountConnected && isScreenFocused/);
});
test('journal sidebar route defers live account queries until after first paint', () => {
  const source = readSource('src/features/settings/JournalScreen/liveJournal.ts');

  assert.match(source, /const JOURNAL_QUERY_ACTIVATION_DELAY_MS = 8000/);
  assert.match(source, /function useDeferredJournalQueries\(active: boolean, cacheKey: number \| undefined\)/);
  assert.doesNotMatch(source, /useUIState|sidebarOpen/);
  assert.match(source, /export function useJournalTrades\(active = true\)/);
  assert.match(source, /const enabled = active && accountLogin !== undefined/);
  assert.match(source, /const queriesActive = useDeferredJournalQueries\(enabled, accountLogin\)/);
  assert.match(source, /if \(!active\) \{\s*return undefined;\s*\}[\s\S]*updateRetentionClock\(\);\s*scheduleMidnightCleanup\(\)/);
  assert.doesNotMatch(source, /setInterval\(updateRetentionClock/);
  assert.match(source, /AppState\.addEventListener\('change'[\s\S]*nextState === 'active'[\s\S]*updateRetentionClock\(\)[\s\S]*scheduleMidnightCleanup\(\)/);
  assert.match(source, /enabled: queriesActive/);
  assert.match(source, /refetchInterval: false/);
  assert.match(source, /refetchOnMount: false/);
  assert.match(source, /subscribed: active/);
  assert.match(source, /from: journalFrom/);
  assert.match(source, /to: journalTo/);
  assert.doesNotMatch(source, /usePositionsQuery/);
  assert.match(source, /usePositionHistoryQuery/);
  assert.match(source, /pageLimit: 1000/);
  assert.match(source, /maxPages: 1/);
  assert.match(source, /mergeClosedPositionSources\(rangedHistoryPositions, derivedClosedPositions\)/);
  assert.match(source, /active \? state\.manualEntries : EMPTY_MANUAL_ENTRIES/);
  assert.doesNotMatch(source, /refetchOnMount: 'always'/);
});


test('journal sidebar destination keeps menu access for repeated MT-style drawer selection', () => {
  const source = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');

  assert.match(source, /const isScreenFocused = useIsFocused\(\)/);
  assert.doesNotMatch(source, /useJournalTrades/);
  assert.match(source, /<ServerJournalPanel[\s\S]*isScreenFocused=\{isScreenFocused\}/);
  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '..\/..\/..\/ui\/components\/sidebarDrawerController'/);
  assert.doesNotMatch(source, /import \{ SidebarDrawer \}|<SidebarDrawer|drawerReady|showDrawer/);
  assert.match(rootLayoutSource, /import \{ SidebarDrawer \} from '..\/src\/ui\/components\/SidebarDrawer'/);
  assert.match(rootLayoutSource, /<SidebarDrawer \/>/);
  // The server journal virtualizes its own rows (fixed-height FlatList).
  assert.match(source, /<ServerJournalPanel/);
  assert.doesNotMatch(source, /groups\.map\(\(group\)/);
  assert.match(source, /const hideActionSheet = useUIState\(\(state\) => state\.hideActionSheet\)/);
  assert.match(source, /const handleOpenMenu = useCallback/);
  assert.match(source, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.match(source, /onPress=\{handleOpenMenu\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="journal\.menu"/);
  assert.doesNotMatch(source, /latencyLabel="journal\.back"/);
  assert.doesNotMatch(source, /safeRouterBack\(router, '\/\(tabs\)\/settings'\)/);
});

test('economic calendar sidebar destination uses hamburger menu access', () => {
  const source = readSource('src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx');

  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '..\/..\/..\/ui\/components\/sidebarDrawerController'/);
  assert.match(source, /const hideActionSheet = useUIState\(\(state\) => state\.hideActionSheet\)/);
  assert.match(source, /const handleOpenMenu = useCallback/);
  assert.match(source, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.match(source, /onPress=\{handleOpenMenu\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="economicCalendar\.menu"/);
  assert.match(source, /<AppMenuIcon color=\{T\.text\}/);
  assert.doesNotMatch(source, /import \{ SidebarDrawer \}|<SidebarDrawer/);
  assert.doesNotMatch(source, /safeRouterBack\(router, '\/\(tabs\)\/settings'\)/);
  assert.doesNotMatch(source, /name="arrow-back"/);
});

test('settings detail back buttons pop instantly instead of re-mounting the tab navigator', () => {
  const directBackFiles = [
    'src/features/settings/AccountsScreen.tsx',
    'src/features/settings/InterfaceScreen.tsx',
  ];

  for (const file of directBackFiles) {
    const source = readSource(file);
    // Back is an instant pop to the already-mounted previous screen. The old
    // router.replace('/(tabs)/settings') re-mounted the entire (tabs) navigator
    // (re-booting the pre-warmed chart WebView) — a ~1.8s freeze on a real
    // device. Forward nav now PUSHES (SettingsScreen.openReadySettingsRoute and
    // SidebarDrawer), so the tab navigator stays mounted underneath and
    // safeRouterBack pops straight to it. No deep history walk: the sidebar only
    // opens from tabs, so the detail stack stays one level deep.
    assert.match(source, /safeRouterBack\(router, '\/\(tabs\)\/settings'\)/, `${file} should pop back, not re-mount`);
    assert.doesNotMatch(source, /router\.replace\('\/\(tabs\)\/settings'\)/, `${file} should not re-mount the tab navigator`);
  }
});

test('chart header menu avoids Android edge gesture interception', () => {
  const source = readSource('src/features/chart/ChartScreen.styles.ts');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');

  assert.match(source, /MENU_BUTTON_VISUAL_LEFT/);
  assert.match(source, /width: MENU_BTN_GUTTER/);
  assert.match(source, /alignItems: 'flex-start'/);
  assert.match(source, /paddingLeft: MENU_BUTTON_VISUAL_LEFT/);
  assert.doesNotMatch(source, /CHART_HEADER_EDGE_GESTURE_SAFE_PAD/);
  assert.doesNotMatch(chartSource, /scheduleAfterFirstVisualFrame/);
  assert.match(chartSource, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.doesNotMatch(chartSource, /setSidebarOpen\(true\)/);
  assert.match(
    chartSource,
    /accessibilityLabel=\{t\('Open menu'\)\}[\s\S]*onPress=\{handleOpenSidebar\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="chartHeader\.menu"/,
  );
});

test('sidebar login prompt opens login from a large first-touch target', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /const SIDEBAR_PROFILE_ACTION_HIT_SLOP = \{/);
  assert.match(source, /onPress=\{\(\) => navigateSidebarRoute\('\/login'\)\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /hitSlop=\{SIDEBAR_PROFILE_ACTION_HIT_SLOP\}/);
  assert.match(source, /latencyLabel="sidebar\.getStarted"/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /<View style=\{ds\.getStartedBtn\}>/);
  assert.match(source, /minHeight: 44/);
  assert.match(source, /justifyContent: 'center'/);
  assert.doesNotMatch(source, /<Pressable[\s\S]*style=\{ds\.getStartedBtn\}[\s\S]*latencyLabel="sidebar\.getStarted"/);
});

test('sidebar profile avatar shows the logged-in broker logo with RTX5 fallback', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /Alert, Animated, BackHandler, Easing, Image, Linking/);
  assert.match(source, /const brokerLogoUrl = useUserPreferences\(\(s\) => s\.brokerLogoUrl\)/);
  assert.match(source, /const activeBrokerLogoUrl = useMemo\(/);
  assert.match(source, /\(\) => \(isLoggedIn \? brokerLogoUrl\.trim\(\) : ''\)/);
  assert.match(source, /const \[brokerLogoFailed, setBrokerLogoFailed\] = useState\(false\)/);
  assert.match(source, /useEffect\(\(\) => \{\s*setBrokerLogoFailed\(false\);\s*\}, \[activeBrokerLogoUrl\]\)/);
  assert.match(source, /activeBrokerLogoUrl && !brokerLogoFailed \? \(/);
  assert.match(source, /<Image[\s\S]*accessibilityLabel="Broker logo"[\s\S]*source=\{\{ uri: activeBrokerLogoUrl \}\}[\s\S]*onError=\{\(\) => setBrokerLogoFailed\(true\)\}/);
  assert.match(source, /\) : \(\s*<AppLogo style=\{ds\.avatarImage\} \/>\s*\)/);
});

test('sidebar hosts detail destinations directly and shares the fast primary-tab visual path', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');
  const sidebarControllerSource = readSource('src/ui/components/sidebarDrawerController.ts');
  const destinationHostSource = readSource('src/ui/components/SidebarDestinationHost.tsx');
  const destinationControllerSource = readSource('src/ui/components/sidebarDestinationHostController.ts');
  const fastTabNavigatorSource = readSource('src/ui/navigation/FastTabNavigator.tsx');
  const fastTabVisualSource = readSource('src/ui/navigation/fastTabVisualController.ts');
  const deferredMountSource = readSource('src/ui/components/DeferredRouteMount.tsx');
  const immediateSidebarRouteFiles = [
    'app/settings/journal.tsx',
    'app/settings/economic-calendar.tsx',
    'app/settings/user-guide.tsx',
    'app/settings/help.tsx',
    'app/settings/about.tsx',
  ];
  const journalRouteSource = readSource('app/settings/journal.tsx');
  const accountsRouteSource = readSource('app/settings/accounts.tsx');
  const actionWarmupSource = readSource('src/utils/actionRouteWarmup.ts');

  assert.match(source, /label: 'Trade'.*route: '\/trade'/);
  assert.doesNotMatch(source, /label: 'News'|label: 'Mailbox'|\/settings\/news|\/settings\/mailbox/);
  assert.match(source, /label: 'Journal'.*route: '\/journal'/);
  assert.match(source, /label: 'Settings'.*route: '\/settings'/);
  assert.match(source, /label: 'Economic Calendar'.*route: '\/economic-calendar'/);
  assert.match(source, /label: 'User Guide'.*route: '\/user-guide'/);
  assert.match(source, /label: 'Support'.*action: 'support-email'/);
  assert.match(source, /label: 'Help'.*route: '\/help'/);
  assert.match(source, /label: 'About'.*route: '\/about'/);
  assert.match(source, /getConfiguredSupportEmail/);
  assert.match(source, /buildHelpMailto/);
  assert.doesNotMatch(source, /warmSidebarRouteModules|router\.prefetch\(route as any\)/);
  assert.doesNotMatch(source, /\/settings\/support/);
  assert.doesNotMatch(source, /MQL5 Algo Trading|\/settings\/mql5-algo-trading|Traders Community|\/settings\/traders-community/);
  assert.match(source, /'\/settings\/accounts'/);
  assert.match(source, /'\/login'/);
  assert.match(rootLayoutSource, /const sidebarDetailScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none'/);
  assert.doesNotMatch(rootLayoutSource, /name='settings\/news'|name='settings\/mailbox'/);
  assert.match(rootLayoutSource, /name='settings\/journal' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/economic-calendar' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/user-guide' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/help' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/about' options=\{sidebarDetailScreenOptions\}/);
  assert.doesNotMatch(rootLayoutSource, /settings\/mql5-algo-trading|settings\/traders-community|settings\/mailbox|settings\/news/);
  assert.match(rootLayoutSource, /import \{ SidebarDrawer \} from '..\/src\/ui\/components\/SidebarDrawer'/);
  assert.match(rootLayoutSource, /import \{ SidebarDestinationHost \} from '..\/src\/ui\/components\/SidebarDestinationHost'/);
  assert.match(rootLayoutSource, /import \{ BrokersLaunchHost \} from '..\/src\/features\/settings\/BrokersLaunchHost'/);
  assert.match(rootLayoutSource, /import \{ BrokerDetailLaunchHost \} from '..\/src\/features\/settings\/BrokerDetailLaunchHost'/);
  assert.match(rootLayoutSource, /<\/Stack>[\s\S]*<SidebarDestinationHost \/>[\s\S]*<AboutDetailDestinationHost \/>[\s\S]*<BrokersLaunchHost \/>[\s\S]*<SidebarDrawer \/>/);
  assert.doesNotMatch(tabsLayoutSource, /import \{ SidebarDrawer \}|<SidebarDrawer \/>/);
  assert.doesNotMatch(tabsLayoutSource, /import \{ (?:SidebarDestinationHost|BrokersLaunchHost|BrokerDetailLaunchHost) \}|<(?:SidebarDestinationHost|BrokersLaunchHost|BrokerDetailLaunchHost) \/>/);
  assert.doesNotMatch(tabsLayoutSource, /warmSidebarRouteModules/);
  assert.doesNotMatch(tabsLayoutSource, /SidebarRouteTransitionOverlay/);
  assert.doesNotMatch(tabsLayoutSource, /const sidebarDetailTabPaths = new Set\(\[/);
  assert.doesNotMatch(tabsLayoutSource, /isSidebarDetailTab/);
  assert.match(tabsLayoutSource, /import \{\s*hideSidebarDestination,\s*sidebarDestinationController,\s*\} from '\.\.\/\.\.\/src\/ui\/components\/sidebarDestinationHostController'/);
  assert.match(tabsLayoutSource, /import \{ FastTabs as Tabs \} from '\.\.\/\.\.\/src\/ui\/navigation\/FastTabNavigator'/);
  assert.match(tabsLayoutSource, /import \{[\s\S]*scheduleFastTabNavigation,[\s\S]*showFastTabVisual,[\s\S]*\} from '\.\.\/\.\.\/src\/ui\/navigation\/fastTabVisualController'/);
  assert.match(tabsLayoutSource, /registerSidebarTabNavigationHandler\(\(path: SidebarMountedTabPath\) => \{/);
  assert.match(tabsLayoutSource, /navigation\.navigate\(path\.slice\(1\)\)/);
  assert.match(tabsLayoutSource, /layout=\{renderTabsLayout\}/);
  assert.match(sidebarControllerSource, /export function navigateMountedSidebarTab\(path: string\)/);
  assert.match(sidebarControllerSource, /handler\(path as SidebarMountedTabPath\)/);
  for (const name of ['quotes', 'chart', 'trade', 'history', 'settings']) {
    assert.match(tabsLayoutSource, new RegExp(`<Tabs\\.Screen[\\s\\S]{0,120}name='${name}'`));
  }
  for (const name of ['journal', 'economic-calendar', 'user-guide', 'help', 'about']) {
    assert.doesNotMatch(tabsLayoutSource, new RegExp(`<Tabs\\.Screen[\\s\\S]{0,80}name='${name}'`));
  }
  const rootStackCloseIndex = rootLayoutSource.indexOf('</Stack>');
  const destinationHostMountIndex = rootLayoutSource.indexOf('<SidebarDestinationHost />');
  assert.notEqual(rootStackCloseIndex, -1);
  assert.notEqual(destinationHostMountIndex, -1);
  assert.ok(rootStackCloseIndex < destinationHostMountIndex, 'detail host must overlay every root-stack broker route');
  assert.match(tabsLayoutSource, /if \(previousPathRef\.current !== pathname\) \{[\s\S]*hideSidebarDestination\(\);/);
  assert.match(tabsLayoutSource, /const isRestoringAccountsFromBrokerFlow =[\s\S]*hostedDestination\.activeDestination === 'accounts'[\s\S]*hostedDestination\.source === 'route-sync'[\s\S]*if \(!isRestoringAccountsFromBrokerFlow\) \{\s*hideSidebarDestination\(\);/);
  assert.doesNotMatch(tabsLayoutSource, /isRestoringAccountsFromBrokerFlow[\s\S]{0,180}previousPath === '\/settings\/brokers'/);
  assert.match(destinationControllerSource, /export const SIDEBAR_HOST_DESTINATIONS = \[[\s\S]*'journal',[\s\S]*'economic-calendar',[\s\S]*'user-guide',[\s\S]*'help',[\s\S]*'about'/);
  assert.match(destinationControllerSource, /const listeners = new Set<\(\) => void>\(\)/);
  assert.match(destinationControllerSource, /listeners\.forEach\(\(listener\) => listener\(\)\)/);
  assert.match(destinationControllerSource, /registerVisualApplier: \(applier\) => \{/);
  assert.match(destinationControllerSource, /visualApplier\?\.\(destination\);[\s\S]*publish\(\{/);
  // Focus work yields past paint without a fixed animation delay.
  assert.doesNotMatch(destinationControllerSource, /FOCUS_NOTIFY_SETTLE_DELAY_MS/);
  assert.match(destinationControllerSource, /const FOCUS_NOTIFY_FAILSAFE_DELAY_MS = 250/);
  assert.match(destinationControllerSource, /scheduleAfterVisualFrame\(notifyIfCurrent, FOCUS_NOTIFY_FAILSAFE_DELAY_MS\)/);
  assert.match(destinationControllerSource, /cancelFocusNotification\?\.\(\)/);
  assert.doesNotMatch(destinationControllerSource, /if \(nextSnapshot\.source === 'settings'\)/);
  assert.match(destinationControllerSource, /show: \(destinationOrPath, source = 'programmatic'\) => \{/);
  assert.match(destinationControllerSource, /export function showSidebarDestination\([\s\S]*sidebarDestinationController\.show\(destinationOrPath, source\)/);
  assert.doesNotMatch(destinationControllerSource, /useRouter|router\.(?:navigate|push|replace|dismissTo)/);
  assert.match(destinationHostSource, /import \{ JournalScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ EconomicCalendarScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ HelpScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ UserGuideScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ AboutScreenInner \} from/);
  assert.match(destinationHostSource, /export function createActiveAwareSidebarDestinationAdapter\(/);
  assert.match(destinationHostSource, /return <ScreenView isScreenFocused=\{active\} \/>/);
  assert.match(destinationHostSource, /supportsInactiveMount: true/);
  assert.match(destinationHostSource, /SIDEBAR_DESTINATION_COMPATIBILITY_REGISTRY/);
  assert.match(destinationHostSource, /journal: createActiveAwareSidebarDestinationAdapter\(JournalScreenInner\)/);
  assert.match(destinationHostSource, /'economic-calendar': createActiveAwareSidebarDestinationAdapter\(EconomicCalendarScreenInner\)/);
  assert.match(destinationHostSource, /'user-guide': createActiveAwareSidebarDestinationAdapter\(UserGuideScreenInner\)/);
  assert.match(destinationHostSource, /help: createActiveAwareSidebarDestinationAdapter\(HelpScreenInner\)/);
  assert.match(destinationHostSource, /about: createActiveAwareSidebarDestinationAdapter\(AboutScreenInner\)/);
  // "Manage accounts" must stay a hosted destination: as a pushed route the
  // navigation commit was measured blocking the tap turn ~1.2s on-device.
  assert.match(destinationHostSource, /import \{ AccountsScreenInner \} from/);
  assert.match(destinationHostSource, /accounts: createActiveAwareSidebarDestinationAdapter\(AccountsScreenInner\)/);
  assert.match(destinationControllerSource, /accounts: '\/settings\/accounts'/);
  const activeAwareDestinationViews = [
    ['src/features/settings/JournalScreen/JournalScreen.tsx', 'JournalScreenInner'],
    ['src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx', 'EconomicCalendarScreenInner'],
    ['src/features/settings/UserGuideScreen.tsx', 'UserGuideScreenInner'],
    ['src/features/settings/HelpScreen.tsx', 'HelpScreenInner'],
    ['src/features/settings/AboutScreen.tsx', 'AboutScreenInner'],
    ['src/features/settings/AccountsScreen.tsx', 'AccountsScreenInner'],
  ] as const;
  for (const [file, innerName] of activeAwareDestinationViews) {
    assert.match(
      readSource(file),
      new RegExp(`export const ${innerName} = (?:React\\.)?memo`),
      `${file} must export its inactive-aware retained host view`,
    );
  }
  assert.match(destinationHostSource, /useSyncExternalStore\(\s*controller\.subscribe,\s*controller\.getFocusSnapshot,\s*controller\.getFocusSnapshot/);
  assert.match(destinationControllerSource, /getFocusSnapshot: \(\) => focusSnapshot/);
  // The touch-turn visual path is native-only. React subscribes once for the
  // intentionally deferred focus/query state; the registered visual applier
  // updates only the previous and next native layers.
  assert.doesNotMatch(destinationHostSource, /controller\.subscribeVisual/);
  assert.match(destinationHostSource, /const nativeVisualDestinationRef = useRef<SidebarHostDestination \| null>\(\s*controller\.getSnapshot\(\)\.activeDestination/);
  assert.match(destinationHostSource, /const visualDestination = controller\.getSnapshot\(\)\.activeDestination/);
  assert.match(destinationHostSource, /const layerRefSetters = useMemo[\s\S]*const visible = controller\.getSnapshot\(\)\.activeDestination === destination;[\s\S]*layer\.setNativeProps\(\{[\s\S]*pointerEvents: visible \? 'auto' : 'none'/);
  assert.match(destinationHostSource, /const sweepVisualDestinationNow = useCallback[\s\S]*for \(const destination of SIDEBAR_HOST_DESTINATIONS\)[\s\S]*layerRefs\.current\[destination\]\?\.setNativeProps/);
  assert.match(destinationHostSource, /const applyVisualDestinationNow = useCallback[\s\S]*const previousDestination = nativeVisualDestinationRef\.current;[\s\S]*layerRefs\.current\[visualDestination\]\?\.setNativeProps[\s\S]*layerRefs\.current\[previousDestination\]\?\.setNativeProps[\s\S]*nativeVisualDestinationRef\.current = visualDestination/);
  assert.match(destinationHostSource, /useLayoutEffect\(\(\) => \{[\s\S]*let firstApplication = true;[\s\S]*controller\.registerVisualApplier\(\(destination\) => \{[\s\S]*if \(firstApplication\)[\s\S]*sweepVisualDestinationNow\(destination\);[\s\S]*applyVisualDestinationNow\(destination\)/);
  assert.match(destinationHostSource, /ref=\{layerRef\}[\s\S]*collapsable=\{false\}/);
  // Keep the controller's compatibility API/version for Fast Refresh even
  // though the Host deliberately avoids its visual-store subscription.
  assert.match(destinationControllerSource, /subscribeVisual: \(listener: \(\) => void\) => \{/);
  assert.match(destinationControllerSource, /SIDEBAR_DESTINATION_CONTROLLER_VERSION = 6/);
  assert.match(destinationControllerSource, /__rtx5SidebarDestinationControllerVersion/);
  assert.match(destinationControllerSource, /requestBack: \(\) => \{[\s\S]*backHandlers\.get\(destination\)\?\.\(\) \?\? false/);
  assert.match(destinationControllerSource, /registerBackHandler: \(destination, handler\) => \{[\s\S]*backHandlers\.set\(destination, handler\)/);
  assert.match(destinationHostSource, /if \(controller\.requestBack\(\)\) \{\s*return true;\s*\}[\s\S]*controller\.hide\(\)/);
  assert.match(destinationControllerSource, /visualListeners\.forEach\(\(listener\) => listener\(\)\);\s*notifyAfterFirstVisualFrame\(snapshot\);/);
  assert.match(destinationHostSource, /visualActive \? styles\.destinationVisible : styles\.destinationHidden/);
  assert.match(destinationHostSource, /pointerEvents=\{visualActive \? 'auto' : 'none'\}/);
  assert.doesNotMatch(destinationHostSource, /from 'react-native-reanimated'/);
  assert.match(destinationHostSource, /pointerEvents="box-none"/);
  assert.doesNotMatch(destinationHostSource, /display: 'none'/);
  assert.match(destinationHostSource, /testID="sidebar-destination-host"/);
  assert.match(destinationHostSource, /SIDEBAR_HOST_DESTINATIONS\.map\(\(destination\) => \{/);
  assert.doesNotMatch(destinationHostSource, /useRouter|router\.(?:navigate|push|replace|dismissTo)/);
  assert.match(fastTabNavigatorSource, /export const FastTabs = Object\.assign/);
  assert.match(fastTabNavigatorSource, /const SceneLayer = memo/);
  assert.match(fastTabVisualSource, /export function showFastTabVisual\(pathOrName: string\)/);
  assert.match(fastTabVisualSource, /export function scheduleFastTabNavigation\(\s*revision: number,\s*action: \(\) => void,\s*settleDelayMs: number = FAST_TAB_NAVIGATION_SETTLE_DELAY_MS,\s*\)/);
  assert.match(deferredMountSource, /return scheduleAfterVisualFrames\(action, frameCount\)/);
  assert.match(deferredMountSource, /export function DeferredRouteModule/);
  assert.match(deferredMountSource, /const ROUTE_MODULE_LOAD_DELAY_MS = 0/);
  assert.match(deferredMountSource, /const ROUTE_HEAVY_CONTENT_DELAY_MS = 1200/);
  assert.match(deferredMountSource, /export function useDeferredRouteContentReady/);
  assert.match(deferredMountSource, /active = true/);
  assert.match(deferredMountSource, /if \(!active \|\| ready\)/);
  assert.match(deferredMountSource, /scheduleDeferredFrameWork\(2/);
  assert.match(deferredMountSource, /const routeModuleCache = new Map<string, CachedRouteModule>\(\)/);
  assert.match(deferredMountSource, /export function preloadDeferredRouteModule/);
  assert.match(deferredMountSource, /preloadDeferredRouteModule\(cacheKey, load\)/);
  assert.match(deferredMountSource, /fallback = null/);
  assert.match(deferredMountSource, /mountDelayMs\?: number/);
  assert.match(deferredMountSource, /function useOptionalDeferredRouteMountReady\(delayMs: number \| undefined\)/);
  assert.match(deferredMountSource, /const mountReady = useOptionalDeferredRouteMountReady\(mountDelayMs\)/);
  assert.match(deferredMountSource, /if \(!RouteComponent \|\| !mountReady\) \{\s*return <>\{fallback\}<\/>;\s*\}/);
  assert.doesNotMatch(deferredMountSource, /DeferredRoutePlaceholder|placeholderTitle|title\?: string/);
  assert.match(journalRouteSource, /import \{ JournalScreen \} from '..\/..\/src\/features\/settings\/JournalScreen'/);
  assert.match(journalRouteSource, /return <JournalScreen \/>/);
  assert.doesNotMatch(journalRouteSource, /DeferredRouteModule|JournalRouteFallback|loadJournalScreenRoute/);
  assert.match(accountsRouteSource, /DeferredRouteModule/);
  // The route and the startup warmup must share the SAME cache key + loader
  // (accountsScreenPreload.ts) so the warmed module is the one the route
  // mounts synchronously — a literal key here could silently drift.
  assert.match(accountsRouteSource, /cacheKey=\{ACCOUNTS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(accountsRouteSource, /load=\{loadAccountsScreenRoute\}/);
  assert.match(accountsRouteSource, /from '\.\.\/\.\.\/src\/features\/settings\/accountsScreenPreload'/);
  assert.match(accountsRouteSource, /mountDelayMs=\{SETTINGS_ROUTE_MOUNT_DELAY_MS\}/);
  assert.match(accountsRouteSource, /SettingsRouteLaunchPreview/);
  assert.match(actionWarmupSource, /ACTION_DEFERRED_MODULE_WARMUPS/);
  assert.match(actionWarmupSource, /preloadDeferredRouteModule\(module\.cacheKey, module\.load\)/);
  // "Manage accounts" (sidebar) and the Settings row both land on
  // /settings/accounts; its heavy module must be in the startup idle warmup
  // so the first open mounts the real screen instead of the launch preview.
  assert.match(actionWarmupSource, /\{ cacheKey: ACCOUNTS_ROUTE_MODULE_CACHE_KEY, load: loadAccountsScreenRoute \}/);
  for (const file of immediateSidebarRouteFiles) {
    const routeSource = readSource(file);
    assert.doesNotMatch(routeSource, /DeferredRouteModule|SettingsRouteLaunchPreview|SETTINGS_ROUTE_MOUNT_DELAY_MS|const load[A-Za-z0-9]+ScreenRoute = \(\) => import\('/);
    assert.match(routeSource, /import \{ [A-Za-z0-9]+Screen \} from '..\/..\/src\/features\/settings\//);
    assert.match(routeSource, /return <[A-Za-z0-9]+Screen \/>/);
  }
});

test('sidebar detail screens prewarm complete retained content before their first reveal', () => {
  const destinationFiles = [
    ['src/features/settings/JournalScreen/JournalScreen.tsx', 'JOURNAL_BODY_PREWARM_DELAY_MS', '0'],
    ['src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx', 'ECON_CALENDAR_BODY_PREWARM_DELAY_MS', '0'],
    ['src/features/settings/UserGuideScreen.tsx', 'USER_GUIDE_BODY_PREWARM_DELAY_MS', '0'],
    ['src/features/settings/HelpScreen.tsx', 'HELP_BODY_PREWARM_DELAY_MS', '0'],
    ['src/features/settings/AboutScreen.tsx', 'ABOUT_BODY_PREWARM_DELAY_MS', '0'],
  ] as const;

  for (const [file, prewarmConstant, prewarmDelay] of destinationFiles) {
    const source = readSource(file);
    const headerIndex = Math.max(
      source.indexOf('accessibilityLabel="Open menu"'),
      source.indexOf("accessibilityLabel={t('Open menu')}"),
    );
    const bodyGateIndex = source.indexOf('routeBodyReady ?');

    assert.match(source, /import \{ useRetainedRouteContentReady \} from/);
    assert.match(source, /const isScreenFocused = useIsFocused\(\)/);
    assert.match(source, new RegExp(`const ${prewarmConstant} = ${prewarmDelay}`));
    assert.match(
      source,
      new RegExp(`const routeBodyReady = useRetainedRouteContentReady\\(\\s*isScreenFocused, ${prewarmConstant},\\s*\\)`),
    );
    assert.doesNotMatch(source, /const focusedBodyReady = isScreenFocused && routeBodyReady;/);
    assert.notEqual(headerIndex, -1, `${file} must render its real menu header`);
    assert.notEqual(bodyGateIndex, -1, `${file} must retain its complete lower body after prewarm`);
    assert.ok(headerIndex < bodyGateIndex, `${file} must paint the header before heavy body content`);
    assert.match(source, /\{routeBodyReady \?/);
  }

  const journalSource = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');
  // Prewarmed while hidden, but journal requests and overlays are focus-only.
  assert.match(journalSource, /<ServerJournalPanel[\s\S]*isScreenFocused=\{isScreenFocused\}/);
  const serverJournalHookSource = readSource('src/features/settings/JournalScreen/serverJournal/useServerJournal.ts');
  assert.match(serverJournalHookSource, /if \(!active\) \{\s*return undefined;\s*\}/);

  const calendarDestinationSource = readSource('src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx');
  assert.match(
    calendarDestinationSource,
    /\{routeBodyReady \? <>[\s\S]*<EconomicEventFiltersSheet[\s\S]*<\/> : <View style=\{styles\.scroll\} \/>\}/,
  );

  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  assert.match(accountsSource, /export function AccountsScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*return <AccountsScreenInner isScreenFocused=\{isScreenFocused\} \/>;\s*\}/);
  assert.match(accountsSource, /useRetainedRouteContentReady\(\s*isScreenFocused, ACCOUNTS_BODY_PREWARM_DELAY_MS,/);
  assert.match(accountsSource, /const showAccountsBody = isScreenFocused \|\| hostBodyReady;/);
  assert.match(accountsSource, /\{showAccountsBody \? \(\s*<FlatList/);
  assert.doesNotMatch(accountsSource, /focusedBodyReady|accountsBodyVisible|accountsBodyReady|SidebarHostedAccountsScreenInner/);
  assert.doesNotMatch(accountsSource, /const focusedBodyReady = isScreenFocused && hostBodyReady/);
  assert.match(accountsSource, /\{isScreenFocused && passwordSheetVisible && \(/);
  assert.match(accountsSource, /\{isScreenFocused && tradeNotificationsSheetVisible && \(/);
  assert.match(accountsSource, /\{isScreenFocused && deleteTarget && \(/);
  assert.match(accountsSource, /\{isScreenFocused \? <AccountsActionSheetHost \/> : null\}/);

  const interfaceSource = readSource('src/features/settings/InterfaceScreen.tsx');
  assert.doesNotMatch(interfaceSource, /void isScreenFocused/);
  assert.match(interfaceSource, /\{isScreenFocused \? \([\s\S]*<ScrollView[\s\S]*SUPPORTED_LANGUAGES\.map/);
  assert.match(interfaceSource, /\) : <View style=\{styles\.inactiveBody\} \/>\}/);
});

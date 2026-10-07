import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createFastTabVisualController,
  clearFastTabVisual,
  fastTabVisualController,
  scheduleFastTabNavigation,
} from '../ui/navigation/fastTabVisualController';
import { hideSidebarDestination, showSidebarDestination, sidebarDestinationController } from '../ui/components/sidebarDestinationHostController';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('bottom tab touch-start paints optimistically before real navigation work', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const visualControllerSource = readSource('src/ui/navigation/fastTabVisualController.ts');

  assert.match(source, /import \{ PlatformPressable \} from '@react-navigation\/elements'/);
  assert.doesNotMatch(source, /TAB_PRESS_DEDUP_WINDOW_MS|recentTabPresses/);
  assert.match(source, /type FastTabBarButtonProps = BottomTabBarButtonProps & \{/);
  assert.match(source, /const FastTabBarButton = memo/);
  assert.match(source, /const pressGateRef = useRef\(createBottomTabPressGate\(interactionLifecycle\.getEpoch\)\)/);
  assert.match(source, /pressCallbacksRef\.current = \{ onPress, onPressIn, onPressOut \}/);
  assert.match(source, /const handleTouchStart = useCallback/);
  assert.match(source, /const handlePressIn = useCallback/);
  assert.match(source, /pressGateRef\.current\.beginGesture\(\)/);
  assert.match(source, /pressCallbacksRef\.current\.onPress && pressGateRef\.current\.claimPressIn\(\)/);
  assert.match(source, /runTabPress\(event as TabPressEvent\)/);
  assert.match(
    source,
    /const visualRevision = showFastTabVisual\(routeName\)[\s\S]*const commitNavigation = \(\) => \{[\s\S]*commitFastTabPress\(navigationRef\.current, \{ name: routeName, key: routeKey \}, visualRevision\)[\s\S]*callbacks\.onPress\?\.\(event\);[\s\S]*if \(routeName === 'chart'\) \{[\s\S]*prefetchChartSelectionHistory\([\s\S]*preferences\.chartSymbol,[\s\S]*preferences\.chartTimeframe/,
    'Chart data work must follow the retained scene reveal and real navigation',
  );
  assert.match(source, /useUIState\.getState\(\)\.hideActionSheet\(\)/);
  assert.match(source, /const visualRevision = showFastTabVisual\(routeName\)/);
  assert.match(source, /if \(visualRevision !== null\) \{[\s\S]*?scheduleFastTabNavigation\(visualRevision, commitNavigation, TAB_BAR_NAVIGATION_SETTLE_DELAY_MS\);\s*\} else \{\s*commitNavigation\(\)/);
  assert.match(source, /onTouchStart=\{handleTouchStart\}/);
  assert.match(source, /onPressIn=\{handlePressIn\}/);
  assert.match(source, /onPress=\{handlePress\}/);
  assert.match(source, /onPressOut=\{handlePressOut\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.match(source, /if \(pressGateRef\.current\.claimPress\(event\)\) runTabPress\(event\)/);
  assert.match(visualControllerSource, /export function scheduleFastTabNavigation\(\s*revision: number,\s*action: \(\) => void,\s*settleDelayMs: number = FAST_TAB_NAVIGATION_SETTLE_DELAY_MS,\s*\)/);
  assert.match(visualControllerSource, /const requestedSnapshot = fastTabVisualController\.getSnapshot\(\)/);
  assert.match(visualControllerSource, /requestedSnapshot\.revision === revision \? requestedSnapshot\.routeName : null/);
  assert.match(visualControllerSource, /requestedRouteName !== null &&[\s\S]*currentSnapshot\.revision === revision &&[\s\S]*currentSnapshot\.routeName === requestedRouteName/);
  // Both entry points yield focus work past paint without an animation wait.
  assert.match(visualControllerSource, /scheduleAfterVisualFrame\(\(\) => \{/);
  assert.match(visualControllerSource, /const FAST_TAB_NAVIGATION_SETTLE_DELAY_MS = 0/);
  assert.match(visualControllerSource, /export const TAB_BAR_NAVIGATION_SETTLE_DELAY_MS = 0/);
  assert.match(visualControllerSource, /cancelPendingFastTabNavigation\?\.\(\)/);
  assert.match(visualControllerSource, /export function showFastTabVisual\(pathOrName: string\) \{[\s\S]*fastTabVisualController\.show\(routeName, false\)/);
});

test('logged-out chart history warms from the lightweight tabs shell', () => {
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');

  assert.match(tabsSource, /const AnonymousChartHistoryStartupPrefetch = memo/);
  assert.match(
    tabsSource,
    /if \(isLoggedIn \|\| !hasHydrated \|\| !normalizedSymbol \|\| !normalizedTimeframe\)/,
  );
  assert.match(
    tabsSource,
    /return scheduleIdleWork\([\s\S]*dispatchedKeyRef\.current = prefetchKey;[\s\S]*prefetchChartSelectionHistory\(normalizedSymbol, normalizedTimeframe\)/,
    'the key must be marked only after the startup callback actually dispatches',
  );
  assert.match(
    tabsSource,
    /<ChartTradeSheetPortalProvider>[\s\S]*<AnonymousChartHistoryStartupPrefetch \/>[\s\S]*<ThemedTabsChrome/,
  );
  assert.match(
    chartSource,
    /return scheduleIdleWork\([\s\S]*startupChartPrefetchKeyRef\.current = startupPrefetchKey;[\s\S]*prefetchChartSelectionHistory\(chartSymbol, normalizedTimeframe\)/,
    'a Chart-tree idle callback cancelled before dispatch must remain retryable',
  );
});

test('delayed tab navigation is cancelled after its optimistic route is cleared', async () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const pendingFrames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  }) as typeof globalThis.requestAnimationFrame;

  try {
    fastTabVisualController.setActualRouteName('quotes');
    const staleRevision = fastTabVisualController.show('chart', false);
    let navigationCount = 0;
    scheduleFastTabNavigation(staleRevision, () => {
      navigationCount += 1;
    }, 0);

    fastTabVisualController.clear(staleRevision);
    pendingFrames.shift()?.(0);
    await new Promise<void>((resolveTimer) => setTimeout(resolveTimer, 0));
    assert.equal(navigationCount, 0, 'a cleared optimistic route must not navigate later');

    const currentRevision = fastTabVisualController.show('trade', false);
    scheduleFastTabNavigation(currentRevision, () => {
      navigationCount += 1;
    }, 0);
    pendingFrames.shift()?.(16);
    await new Promise<void>((resolveTimer) => setTimeout(resolveTimer, 0));
    assert.equal(navigationCount, 1, 'the still-current optimistic route must navigate');
    fastTabVisualController.clear(currentRevision);
  } finally {
    fastTabVisualController.clear();
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    }
  }
});

test('a newer hamburger destination cancels an older tab commit instead of blinking away', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  let navigations = 0;
  try {
    fastTabVisualController.setActualRouteName('quotes');
    const revision = fastTabVisualController.show('trade', false);
    scheduleFastTabNavigation(revision, () => navigations++);
    assert.equal(showSidebarDestination('help', 'sidebar'), true);
    frames.forEach(callback => callback(0));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(navigations, 0);
    assert.equal(sidebarDestinationController.getSnapshot().activeDestination, 'help');
    assert.equal(sidebarDestinationController.getFocusSnapshot().activeDestination, 'help');
    assert.equal(fastTabVisualController.getSnapshot().routeName, null);
  } finally {
    clearFastTabVisual();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    hideSidebarDestination();
  }
});

test('dropped tab frames use a bounded route commit, and cannot dispatch twice later', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  let frame: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  let navigations = 0;
  try {
    fastTabVisualController.setActualRouteName('quotes');
    const revision = fastTabVisualController.show('history', false);
    scheduleFastTabNavigation(revision, () => navigations++);
    assert.equal(navigations, 0);
    await new Promise(resolve => setTimeout(resolve, 280));
    assert.equal(navigations, 1);
    frame?.(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(navigations, 1);
  } finally {
    clearFastTabVisual();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

test('tab layout declares only the five primary cached scenes', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const rootSource = readSource('app/_layout.tsx');
  const declaredScreens = Array.from(
    source.matchAll(/<Tabs\.Screen\s+name='([^']+)'/g),
    (match) => match[1],
  );

  assert.deepEqual(declaredScreens, ['quotes', 'chart', 'trade', 'history', 'settings']);
  assert.equal((source.match(/<Tabs\.Screen\b/g) ?? []).length, 5);
  assert.match(source, /import \{ FastTabs as Tabs \} from '\.\.\/\.\.\/src\/ui\/navigation\/FastTabNavigator'/);
  assert.doesNotMatch(source, /SidebarDestinationHost|BrokersLaunchHost|BrokerDetailLaunchHost|RegisterLaunchHost/);
  assert.match(rootSource, /<SidebarDestinationHost \/>[\s\S]*<BrokersLaunchHost \/>[\s\S]*<SidebarDrawer \/>/);
  assert.match(source, /detachInactiveScreens=\{false\}/);
  assert.match(source, /<Tabs[\s\S]*backBehavior='firstRoute'[\s\S]*detachInactiveScreens=\{false\}/);
  assert.match(source, /lazy: false/);
  assert.doesNotMatch(source, /<Tabs\.Screen name='(?:journal|economic-calendar|user-guide|help|about)'/);
});

test('retained Trade stays complete while its hidden live work remains inactive', () => {
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');

  assert.doesNotMatch(tradeSource, /TRADE_BODY_PREWARM_DELAY_MS|routeBodyReady|showTradeBody|useDeferredRouteContentReady/);
  assert.match(tradeSource, /<AppHeader title=\{t\('Trade'\)\} noBorder \/>[\s\S]*<TradeSummaryHeader[\s\S]*<FlatList/);
  assert.match(tradeSource, /positionsSignature: buildOpenPositionsCacheSignature\(state\.positions\)/);
  assert.match(tradeSource, /const tradeLiveActive = isLiveScreenFocused/);
  assert.match(tradeSource, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady, TRADE_SCREEN_FETCH_DELAY_MS\)/);

  assert.doesNotMatch(settingsSource, /SETTINGS_BODY_PREWARM_DELAY_MS|routeBodyReady|useDeferredRouteContentReady/);
  assert.match(settingsSource, /<ScrollView[\s\S]*style=\{styles\.container\}[\s\S]*contentContainerStyle=\{styles\.content\}/);
  assert.match(settingsSource, /isAccountConnected && isScreenFocused && firstPaintReady/);
});

test('custom fast tabs retain Expo Router and TabRouter navigation contracts', () => {
  const source = readSource('src/ui/navigation/FastTabNavigator.tsx');

  assert.match(source, /function FastTabNavigator\(/);
  assert.match(source, /useNavigationBuilder<[\s\S]*TabNavigationState<ParamListBase>,[\s\S]*TabRouterOptions,[\s\S]*TabActionHelpers<ParamListBase>,[\s\S]*BottomTabNavigationOptions,[\s\S]*BottomTabNavigationEventMap[\s\S]*>\(TabRouter, \{/);
  assert.match(source, /<NavigationContent>[\s\S]*<FastTabView/);
  assert.match(source, /return createNavigatorFactory\(FastTabNavigator\)\(config\)/);
  assert.match(source, /const ExpoFastTabs = withLayoutContext<[\s\S]*FastTabScreenOptions,[\s\S]*typeof FastTabNavigatorFactory\.Navigator,[\s\S]*TabNavigationState<ParamListBase>,[\s\S]*BottomTabNavigationEventMap[\s\S]*>\(FastTabNavigatorFactory\.Navigator/);
  assert.match(source, /UNSTABLE_router=\{expoTabRouterOverride\}/);
});

test('fast tab scenes remain cached in plain absolute view layers', () => {
  const source = readSource('src/ui/navigation/FastTabNavigator.tsx');

  assert.match(source, /const loadedRouteKeysRef = useRef\(new Set<string>\(\[focusedRouteKey\]\)\)/);
  assert.match(source, /loadedRouteKeysRef\.current\.add\(focusedRouteKey\)/);
  assert.match(source, /for \(const routeKey of state\.preloadedRouteKeys\) \{\s*loadedRouteKeysRef\.current\.add\(routeKey\)/);
  assert.match(source, /descriptors\[route\.key\]\.options\.lazy === false[\s\S]*loadedRouteKeysRef\.current\.add\(route\.key\)/);
  assert.match(source, /const loaded = loadedRouteKeysRef\.current\.has\(route\.key\)/);
  assert.match(source, /if \(lazy && !loaded && !navigationFocused\) \{\s*return null;/);
  assert.match(source, /<View style=\{styles\.scenes\}>[\s\S]*<SceneLayer[\s\S]*key=\{route\.key\}/);
  assert.match(source, /sceneLayer: \{\s*\.\.\.StyleSheet\.absoluteFillObject,/);
  assert.doesNotMatch(source, /loadedRouteKeysRef\.current\.(?:delete|clear)\(/);
  assert.doesNotMatch(source, /from 'react-native-screens'/);
  assert.doesNotMatch(source, /<BottomTabView|<MaybeScreen|activityState=/);
});

test('tab bar and retained scenes share one deterministic visible route', () => {
  const navigatorSource = readSource('src/ui/navigation/FastTabNavigator.tsx');
  const controllerSource = readSource('src/ui/navigation/fastTabVisualController.ts');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');

  assert.match(controllerSource, /export const FAST_TAB_ROUTE_NAMES = \['quotes', 'chart', 'trade', 'history', 'settings'\] as const/);
  assert.doesNotMatch(controllerSource, /react-native-reanimated|fastTabVisualIndex|executeOnUIRuntimeSync|makeMutable/);
  assert.match(controllerSource, /const visualAppliers = new Set<FastTabVisualApplier>\(\)/);
  assert.match(controllerSource, /const sidebarChromeAppliers = new Set<FastTabVisualApplier>\(\)/);
  assert.match(controllerSource, /registerVisualApplier: \(applier: FastTabVisualApplier\) => \{[\s\S]*visualAppliers\.add\(applier\)[\s\S]*visualAppliers\.delete\(applier\)/);
  assert.match(controllerSource, /export function showFastTabVisualForSidebar\(pathOrName: string\) \{[\s\S]*fastTabVisualController\.show\(routeName, false\)/);
  assert.match(controllerSource, /const applyVisualRoute = \(routeName: FastTabRouteName\) => \{\s*visualAppliers\.forEach\(\(applier\) => applier\(routeName\)\);/);
  assert.match(controllerSource, /show: \(routeName: FastTabRouteName, notifySubscribers = true\) => \{[\s\S]*applyVisualRoute\(routeName\);[\s\S]*applySidebarChromeRoute\(routeName\);[\s\S]*publish\(routeName, revision, notifySubscribers\)/);
  assert.match(controllerSource, /setActualRouteName: \(routeName: FastTabRouteName\) => \{[\s\S]*applyVisualRoute\(routeName\);[\s\S]*applySidebarChromeRoute\(routeName\);[\s\S]*if \(snapshot\.routeName !== null\) \{[\s\S]*publish\(null, snapshot\.revision\)/);
  assert.doesNotMatch(controllerSource, /sidebarChromeRouteName/);
  assert.match(controllerSource, /existingController\.version === FAST_TAB_VISUAL_CONTROLLER_VERSION/);
  assert.equal(
    (navigatorSource.match(/useFastTabVisualSnapshot\(\)/g) ?? []).length,
    1,
    'visual scene selection must have one snapshot; navigation handlers keep real focus',
  );
  const tabBarHostSource = navigatorSource.slice(
    navigatorSource.indexOf('const FastTabBarHost'),
    navigatorSource.indexOf('export function FastTabView'),
  );
  const sceneLayerSource = navigatorSource.slice(
    navigatorSource.indexOf('const SceneLayer'),
    navigatorSource.indexOf('function resolveInsets'),
  );
  assert.doesNotMatch(tabBarHostSource, /useFastTabVisualSnapshot/);
  assert.match(navigatorSource, /const visibleRouteName = visibleState\.routes\[visibleState\.index\]\?\.name\s*\?\? focusedRoute\.name/);
  assert.match(navigatorSource, /<FastTabBarHost\s*state=\{state\}/);
  assert.match(navigatorSource, /visualFocused=\{route\.name === visibleRouteName\}/);
  assert.match(navigatorSource, /registerFastTabVisualApplier\(applyNativeVisualRouteNow\)/);
  const nativeSceneHandoffSource = navigatorSource.slice(
    navigatorSource.indexOf('const applyNativeVisualRouteNow'),
    navigatorSource.indexOf('const previousFocusedRouteKeyRef'),
  );
  assert.match(nativeSceneHandoffSource, /const nextLayer = layerRefs\.current\[routeName\];[\s\S]*if \(!nextLayer\) \{\s*return;\s*\}/);
  assert.match(nativeSceneHandoffSource, /nextLayer\.setNativeProps\(\{[\s\S]*styles\.sceneLayerVisible,[\s\S]*styles\.sceneLayerOptimistic/);
  assert.ok(
    nativeSceneHandoffSource.indexOf('nextLayer.setNativeProps')
      < nativeSceneHandoffSource.indexOf('layerRefs.current[previousRouteName]?.setNativeProps'),
    'the retained destination must cover the current scene before it is hidden',
  );
  assert.ok(
    nativeSceneHandoffSource.indexOf('nativeVisualRouteRef.current = routeName')
      > nativeSceneHandoffSource.indexOf('layerRefs.current[previousRouteName]?.setNativeProps'),
    'the native route ref must advance only after the no-gap handoff completes',
  );
  assert.match(sceneLayerSource, /ref=\{layerRef\}[\s\S]*collapsable=\{false\}/);
  const visualItemSource = tabsLayoutSource.slice(
    tabsLayoutSource.indexOf('const FastTabVisualItem'),
    tabsLayoutSource.indexOf('const getNow'),
  );
  assert.match(visualItemSource, /const FastTabVisualItem = memo[\s\S]*const active = visualRouteName === routeName/);
  assert.match(visualItemSource, /activeLayerRef\.current\?\.setNativeProps[\s\S]*inactiveLayerRef\.current\?\.setNativeProps/);
  assert.equal(
    (visualItemSource.match(/registerFastTabSidebarChromeApplier\(applyVisualRoute\)/g) ?? []).length,
    1,
    'each tab must register one combined icon-and-label chrome applier',
  );
  assert.match(visualItemSource, /const renderPresentation = \(color: string\) => \([\s\S]*renderTabIcon\(routeName, color\)[\s\S]*<Text[\s\S]*\{label\}/);
  assert.match(visualItemSource, /styles\.tabVisualItemLayer[\s\S]*renderPresentation\(inactiveColor\)[\s\S]*styles\.tabVisualItemLayer[\s\S]*renderPresentation\(activeColor\)/);
  assert.doesNotMatch(tabsLayoutSource, /FastTabVisualIcon|FastTabVisualLabel|labelRef\.current\?\.setNativeProps/);
  assert.match(tabsLayoutSource, /tabBarIcon: \(\) => null/);
  assert.match(tabsLayoutSource, /tabBarLabel: \(\) => null/);
  assert.match(tabsLayoutSource, /<FastTabBarButton[\s\S]*routeName=\{route\.name as FastTabRouteName\}[\s\S]*activeColor=\{bottomTabActiveColor\}[\s\S]*inactiveColor=\{inactiveTabColor\}/);
  assert.match(sceneLayerSource, /<View[\s\S]*visualFocused \? styles\.sceneLayerVisible : styles\.sceneLayerHidden/);
  assert.doesNotMatch(sceneLayerSource, /Animated\.View|useAnimatedStyle|useAnimatedProps|animatedStyle|animatedProps/);
  assert.match(navigatorSource, /pointerEvents=\{visualFocused \? 'auto' : 'none'\}/);
  assert.match(navigatorSource, /sceneLayerVisible: \{\s*opacity: 1,\s*zIndex: 1,\s*\}/);
  assert.match(navigatorSource, /sceneLayerOptimistic: \{\s*zIndex: 2,\s*\}/);
  assert.match(navigatorSource, /sceneLayerHidden: \{\s*opacity: 0,\s*zIndex: 0,\s*\}/);
  assert.doesNotMatch(navigatorSource, /fastTabVisualIndex|getFastTabRouteIndex|from 'react-native-reanimated'/);
  assert.match(navigatorSource, /\|\| previous\.visualFocused !== next\.visualFocused/);
});

test('native-revealable tab scenes keep the settled theme before first navigation', () => {
  const navigatorSource = readSource('src/ui/navigation/FastTabNavigator.tsx');
  const themeModeSource = readSource('src/state/themeMode.ts');

  assert.match(
    navigatorSource,
    /<ThemeModeRenderPriorityContext\.Provider value="retained">[\s\S]*<SceneContent/,
  );
  assert.doesNotMatch(navigatorSource, /value=\{visualFocused \? 'retained' : 'frozen'\}/);
  assert.doesNotMatch(themeModeSource, /frozenThemeModeRef|renderPriority === 'frozen'/);
});

test('fast tab native scene and menu chrome always receive the same route', () => {
  const controller = createFastTabVisualController();
  const sceneRoutes: string[] = [];
  const chromeRoutes: string[] = [];
  const unregisterScene = controller.registerVisualApplier((route) => sceneRoutes.push(route));
  const unregisterChrome = controller.registerSidebarChromeApplier((route) => chromeRoutes.push(route));

  controller.setActualRouteName('trade');
  const chartRevision = controller.show('chart');
  controller.setActualRouteName('chart');
  const historyRevision = controller.show('history', false);
  controller.clear(historyRevision);

  assert.equal(chartRevision > 0, true);
  assert.deepEqual(sceneRoutes, ['trade', 'chart', 'chart', 'history', 'chart']);
  assert.deepEqual(chromeRoutes, sceneRoutes);

  unregisterScene();
  unregisterChrome();
});

test('a stale route commit cannot overwrite a newer rapid tab selection', () => {
  const controller = createFastTabVisualController();
  const sceneRoutes: string[] = [];
  const chromeRoutes: string[] = [];
  controller.registerVisualApplier((route) => sceneRoutes.push(route));
  controller.registerSidebarChromeApplier((route) => chromeRoutes.push(route));

  controller.setActualRouteName('quotes');
  controller.show('chart', false);
  const tradeRevision = controller.show('trade', false);
  controller.setActualRouteName('chart');

  assert.deepEqual(controller.getSnapshot(), {
    routeName: 'trade',
    revision: tradeRevision,
  });
  assert.equal(sceneRoutes.at(-1), 'trade');
  assert.equal(chromeRoutes.at(-1), 'trade');

  controller.setActualRouteName('trade');
  assert.deepEqual(controller.getSnapshot(), {
    routeName: null,
    revision: tradeRevision,
  });
  assert.equal(sceneRoutes.at(-1), 'trade');
  assert.deepEqual(chromeRoutes, sceneRoutes);
});

test('bottom tab bar follows the optimistic visual route before navigation commits', () => {
  const source = readSource('src/ui/navigation/FastTabNavigator.tsx');

  assert.match(source, /const visualSnapshot = useFastTabVisualSnapshot\(\)/);
  assert.match(source, /const visualRouteIndex = visualSnapshot\.routeName === null[\s\S]*state\.routes\.findIndex\(\(route\) => route\.name === visualSnapshot\.routeName\)/);
  assert.match(source, /const visibleState = visualRouteIndex >= 0 && visualRouteIndex !== state\.index\s*\? \{ \.\.\.state, index: visualRouteIndex \}\s*: state/);
  assert.match(source, /<FastTabBarHost\s*state=\{state\}/);
  assert.match(source, /visualFocused=\{route\.name === visibleRouteName\}/);
});

test('bottom tab presses never write timing logs or LogBox warnings', () => {
  const source = readSource('app/(tabs)/_layout.tsx');

  assert.doesNotMatch(source, /scheduleTabSwitchBudgetCheck|TabTiming/);
  assert.doesNotMatch(source, /console\.(log|info|warn)\(/);
  assert.doesNotMatch(source, /InteractionManager/);
  assert.doesNotMatch(source, /transitionSpec/);
});

test('bottom tab navigation fast path preserves light and dark tab bar themes', () => {
  const source = readSource('app/(tabs)/_layout.tsx');

  assert.match(source, /import \{ useThemeMode \} from '\.\.\/\.\.\/src\/state\/themeMode'/);
  assert.match(source, /ThemedTabsChrome/);
  assert.match(source, /const themeMode = useThemeMode\(\)/);
  assert.match(source, /const isDark = themeMode === 'dark'/);
  assert.match(source, /const T = themeMode === 'light' \? GLight : GDark/);
  assert.doesNotMatch(source, /useDeferredThemeMode\(\)/);
  assert.match(source, /backgroundColor: isDark \? T\.bg : '#ffffff'/);
  assert.match(source, /borderTopColor: isDark \? T\.borderSubtle : 'rgba\(0,0,0,0\.05\)'/);
  assert.match(source, /const inactiveTabColor = isDark \? T\.textMuted : T\.textDimmed/);
  assert.match(source, /const bottomTabActiveColor = T\.trading\.buy\.primary/);
  assert.match(source, /tabBarActiveTintColor: bottomTabActiveColor/);
  assert.match(source, /tabBarInactiveTintColor: inactiveTabColor/);
  assert.match(source, /styles\.tabLabel,\s*inlineLabels && styles\.tabLabelLandscape,\s*\{ color \}/);
  assert.match(source, /\[T\.bg, T\.borderSubtle, insets\.left, insets\.right, isDark, paddingBottom, paddingTop, tabBarHeight\]/);
});

test('bottom tab bar compacts in landscape to preserve phone content height', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const bottomTabLayoutSource = readSource('src/ui/layout/bottomTabBar.ts');

  assert.match(source, /useWindowDimensions/);
  assert.match(source, /const \{ width, height, fontScale \} = useWindowDimensions\(\)/);
  assert.match(source, /const isLandscape = width > height/);
  assert.match(source, /resolveBottomTabBarLayout\(\{[\s\S]*isLandscape,[\s\S]*viewportHeight: height,[\s\S]*fontScale,[\s\S]*\}\)/);
  assert.match(source, /availableWidth: Math\.max\(0, width - insets\.left - insets\.right\)/);
  assert.match(source, /inlineLabels=\{useInlineLabels\}/);
  assert.match(source, /styles\.tabLabel,\s*inlineLabels && styles\.tabLabelLandscape,\s*\{ color \}/);
  assert.match(source, /tabLabelLandscape: \{[\s\S]*marginBottom: 0,[\s\S]*\}/);
  assert.match(bottomTabLayoutSource, /MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT = 64/);
  assert.match(bottomTabLayoutSource, /isLandscape\?: boolean/);
  assert.match(bottomTabLayoutSource, /const baseHeight = compact[\s\S]*MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT[\s\S]*MT5_BOTTOM_TAB_BAR_BASE_HEIGHT/);
});

test('primary tab route wrappers do not unmount screens on blur', () => {
  const routeFiles = [
    'app/(tabs)/quotes.tsx',
    'app/(tabs)/chart.tsx',
    'app/(tabs)/trade.tsx',
    'app/(tabs)/history.tsx',
    'app/(tabs)/settings.tsx',
  ];

  for (const file of routeFiles) {
    const source = readSource(file);
    assert.doesNotMatch(source, /useIsFocused/);
    assert.doesNotMatch(source, /return null/);
  }
});

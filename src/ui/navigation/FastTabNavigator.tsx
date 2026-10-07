import {
  BottomTabBar,
  BottomTabBarHeightCallbackContext,
  BottomTabBarHeightContext,
  type BottomTabBarButtonProps,
  type BottomTabBarProps,
  type BottomTabHeaderProps,
  type BottomTabNavigationEventMap,
  type BottomTabNavigationOptions,
  type BottomTabNavigationProp,
  type BottomTabNavigatorProps,
} from '@react-navigation/bottom-tabs';
import {
  getHeaderTitle,
  Header,
  SafeAreaProviderCompat,
  Screen,
} from '@react-navigation/elements';
import {
  createNavigatorFactory,
  StackActions,
  TabRouter,
  type NavigatorTypeBagBase,
  type ParamListBase,
  type StaticConfig,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
  type TypedNavigator,
  useNavigationBuilder,
} from '@react-navigation/native';
import {
  Link,
  withLayoutContext,
  type Href,
  type LinkProps,
} from 'expo-router';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type RefCallback,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaInsetsContext,
  type EdgeInsets,
} from 'react-native-safe-area-context';
import {
  FAST_TAB_ROUTE_NAMES,
  registerFastTabVisualApplier,
  setFastTabActualRoute,
  useFastTabVisualSnapshot,
  type FastTabRouteName,
} from './fastTabVisualController';
import { ThemeModeRenderPriorityContext } from '../../state/themeMode';
import { FastTabPressNavigationContext } from './commitFastTabPress';

type DescriptorMap = BottomTabBarProps['descriptors'];
type TabNavigation = BottomTabBarProps['navigation'];

type FastTabViewProps = Pick<
  BottomTabNavigatorProps,
  'detachInactiveScreens' | 'safeAreaInsets' | 'tabBar'
> & {
  descriptors: DescriptorMap;
  navigation: TabNavigation;
  state: TabNavigationState<ParamListBase>;
};

type SceneLayerProps = {
  descriptor: DescriptorMap[string];
  navigationFocused: boolean;
  /**
   * True for the one screen and menu item that should be visible now.
   */
  visualFocused: boolean;
  layout: { width: number; height: number };
  tabBarHeight: number;
  tabBarPosition: BottomTabNavigationOptions['tabBarPosition'];
  layerRef: RefCallback<View>;
};

type SceneContentProps = Omit<SceneLayerProps, 'visualFocused' | 'layerRef'>;

const renderDefaultTabBar = (props: BottomTabBarProps) => (
  <BottomTabBar {...props} />
);

const renderDefaultHeader = ({
  layout,
  options,
  route,
}: BottomTabHeaderProps) => (
  <Header
    {...options}
    layout={layout}
    title={getHeaderTitle(options, route.name)}
  />
);

/**
 * Keeps an inactive screen unchanged unless its own route or options change.
 */
const SceneContent = memo(function SceneContent({
  descriptor,
  navigationFocused,
  layout,
  tabBarHeight,
  tabBarPosition,
}: SceneContentProps) {
  const {
    header = renderDefaultHeader,
    headerShown,
    headerStatusBarHeight,
    headerTransparent,
    sceneStyle,
  } = descriptor.options;

  return (
    <View style={[styles.sceneLayer, sceneStyle as StyleProp<ViewStyle>]}>
      <BottomTabBarHeightContext.Provider
        value={tabBarPosition === 'bottom' ? tabBarHeight : 0}
      >
        <Screen
          focused={navigationFocused}
          route={descriptor.route}
          navigation={descriptor.navigation}
          headerShown={headerShown}
          headerStatusBarHeight={headerStatusBarHeight}
          headerTransparent={headerTransparent}
          header={header({
            layout,
            route: descriptor.route,
            navigation:
              descriptor.navigation as BottomTabNavigationProp<ParamListBase>,
            options: descriptor.options,
          })}
        >
          {descriptor.render()}
        </Screen>
      </BottomTabBarHeightContext.Provider>
    </View>
  );
});

const SceneLayer = memo(function SceneLayer({
  descriptor,
  navigationFocused,
  visualFocused,
  layout,
  tabBarHeight,
  tabBarPosition,
  layerRef,
}: SceneLayerProps) {
  // Only the chosen screen can be seen or touched. The other main screens stay
  // mounted in the background so the next menu tap does not rebuild them.
  return (
    <View
      ref={layerRef}
      collapsable={false}
      accessibilityElementsHidden={!visualFocused}
      importantForAccessibility={visualFocused ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.sceneLayer,
        visualFocused ? styles.sceneLayerVisible : styles.sceneLayerHidden,
      ]}
      pointerEvents={visualFocused ? 'auto' : 'none'}
    >
      <ThemeModeRenderPriorityContext.Provider value="retained">
        <SceneContent
          descriptor={descriptor}
          navigationFocused={navigationFocused}
          layout={layout}
          tabBarHeight={tabBarHeight}
          tabBarPosition={tabBarPosition}
        />
      </ThemeModeRenderPriorityContext.Provider>
    </View>
  );
}, (previous, next) => {
  if (
    previous.navigationFocused !== next.navigationFocused
    || previous.visualFocused !== next.visualFocused
    || previous.layerRef !== next.layerRef
  ) {
    return false;
  }

  return (
    previous.descriptor.route === next.descriptor.route &&
    previous.descriptor.navigation === next.descriptor.navigation &&
    previous.layout.width === next.layout.width &&
    previous.layout.height === next.layout.height &&
    previous.tabBarHeight === next.tabBarHeight &&
    previous.tabBarPosition === next.tabBarPosition
  );
});

function resolveInsets(
  configuredInsets: BottomTabNavigatorProps['safeAreaInsets'],
  inheritedInsets: EdgeInsets | null,
): EdgeInsets {
  return {
    top: configuredInsets?.top ?? inheritedInsets?.top ?? 0,
    right: configuredInsets?.right ?? inheritedInsets?.right ?? 0,
    bottom: configuredInsets?.bottom ?? inheritedInsets?.bottom ?? 0,
    left: configuredInsets?.left ?? inheritedInsets?.left ?? 0,
  };
}

function resolveExplicitTabBarHeight(
  descriptors: DescriptorMap,
  focusedRouteKey: string,
): number {
  const flattenedStyle = StyleSheet.flatten(
    descriptors[focusedRouteKey]?.options.tabBarStyle,
  ) as { height?: unknown } | undefined;

  return typeof flattenedStyle?.height === 'number' ? flattenedStyle.height : 0;
}

type FastTabBarHostProps = {
  state: TabNavigationState<ParamListBase>;
  descriptors: DescriptorMap;
  navigation: TabNavigation;
  safeAreaInsets: BottomTabNavigatorProps['safeAreaInsets'];
  tabBar: NonNullable<FastTabViewProps['tabBar']>;
  setTabBarHeight: (height: number) => void;
};

const FastTabBarHost = memo(function FastTabBarHost({
  state,
  descriptors,
  navigation,
  safeAreaInsets,
  tabBar,
  setTabBarHeight,
}: FastTabBarHostProps) {
  return (
    <FastTabPressNavigationContext.Provider value={navigation}>
      <SafeAreaInsetsContext.Consumer>
        {(inheritedInsets) => (
          <BottomTabBarHeightCallbackContext.Provider value={setTabBarHeight}>
            {tabBar({
              state,
              descriptors,
              navigation,
              insets: resolveInsets(safeAreaInsets, inheritedInsets),
            })}
          </BottomTabBarHeightCallbackContext.Provider>
        )}
      </SafeAreaInsetsContext.Consumer>
    </FastTabPressNavigationContext.Provider>
  );
});

/**
 * Keeps each main screen mounted and switches which one is visible.
 * Tab changes and Back therefore reuse the screen and its current state.
 */
export function FastTabView({
  state,
  navigation,
  descriptors,
  safeAreaInsets,
  tabBar = renderDefaultTabBar,
}: FastTabViewProps) {
  const focusedRoute = state.routes[state.index];
  const focusedRouteKey = focusedRoute.key;
  // During a tap, use one temporary choice for both the visible screen and the
  // selected menu item. This keeps the menu and page on the same tab.
  const visualSnapshot = useFastTabVisualSnapshot();
  const visualRouteIndex = visualSnapshot.routeName === null
    ? -1
    : state.routes.findIndex((route) => route.name === visualSnapshot.routeName);
  const visibleState = visualRouteIndex >= 0 && visualRouteIndex !== state.index
    ? { ...state, index: visualRouteIndex }
    : state;
  const visibleRouteName = visibleState.routes[visibleState.index]?.name
    ?? focusedRoute.name;
  const layerRefs = useRef<Partial<Record<FastTabRouteName, View | null>>>({});
  const nativeVisualRouteRef = useRef<FastTabRouteName>(focusedRoute.name as FastTabRouteName);
  const layerRefSetters = useMemo(() => Object.fromEntries(
    FAST_TAB_ROUTE_NAMES.map((routeName) => [
      routeName,
      (layer: View | null) => {
        layerRefs.current[routeName] = layer;
      },
    ]),
  ) as Record<FastTabRouteName, RefCallback<View>>, []);
  const applyNativeVisualRouteNow = useCallback((routeName: FastTabRouteName, force = false) => {
    const previousRouteName = nativeVisualRouteRef.current;
    const nextLayer = layerRefs.current[routeName];
    // Never conceal the current scene unless the retained destination is
    // actually mounted and can cover it in this same handoff.
    if (!nextLayer) {
      return;
    }
    // React's route commit adopts the scene already revealed by touch-down.
    // Reapplying the same native layer would repeat the handoff needlessly.
    if (previousRouteName === routeName && !force) return;

    // Reveal the destination before concealing the current scene. Android can
    // composite consecutive setNativeProps calls in separate frames; the old
    // hide-first order exposed the navigator background for one frame during
    // a rapid Chart -> Trade switch. The temporary higher z-index guarantees
    // the destination wins regardless of sibling order until React commits.
    nextLayer.setNativeProps({
      pointerEvents: 'auto',
      accessibilityElementsHidden: false,
      importantForAccessibility: 'auto',
      style: [
        styles.sceneLayer,
        styles.sceneLayerVisible,
        styles.sceneLayerOptimistic,
      ],
    });
    if (!force && previousRouteName !== routeName) {
      layerRefs.current[previousRouteName]?.setNativeProps({
        pointerEvents: 'none',
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        style: [styles.sceneLayer, styles.sceneLayerHidden],
      });
    }
    nativeVisualRouteRef.current = routeName;
    if (force) {
      for (const otherRouteName of FAST_TAB_ROUTE_NAMES) {
        if (otherRouteName === routeName) continue;
        layerRefs.current[otherRouteName]?.setNativeProps({
          pointerEvents: 'none',
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants',
          style: [styles.sceneLayer, styles.sceneLayerHidden],
        });
      }
    }
  }, []);
  const previousFocusedRouteKeyRef = useRef(focusedRouteKey);
  const loadedRouteKeysRef = useRef(new Set<string>([focusedRouteKey]));
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => ({ width, height }), [height, width]);
  const [tabBarHeight, setTabBarHeight] = useState(() =>
    resolveExplicitTabBarHeight(descriptors, focusedRouteKey),
  );

  useLayoutEffect(
    () => registerFastTabVisualApplier(applyNativeVisualRouteNow),
    [applyNativeVisualRouteNow],
  );

  useLayoutEffect(() => {
    // Navigation has now caught up with the tap. Make the real route the source
    // of truth so normal navigation and Android Back show the correct screen.
    setFastTabActualRoute(focusedRoute.name);
  }, [focusedRoute.name]);

  // Once a main screen has loaded, keep it mounted for later taps and Back.
  loadedRouteKeysRef.current.add(focusedRouteKey);
  for (const routeKey of state.preloadedRouteKeys) {
    loadedRouteKeysRef.current.add(routeKey);
  }
  for (const route of state.routes) {
    if (descriptors[route.key].options.lazy === false) {
      loadedRouteKeysRef.current.add(route.key);
    }
  }

  useEffect(() => {
    const previousRouteKey = previousFocusedRouteKeyRef.current;

    if (previousRouteKey !== focusedRouteKey) {
      navigation.emit({ type: 'transitionStart', target: focusedRouteKey });

      if (descriptors[previousRouteKey]?.options.popToTopOnBlur) {
        const previousRoute = state.routes.find(
          (route) => route.key === previousRouteKey,
        );

        if (previousRoute?.state?.type === 'stack' && previousRoute.state.key) {
          navigation.dispatch({
            ...StackActions.popToTop(),
            target: previousRoute.state.key,
          });
        }
      }

      navigation.emit({ type: 'transitionEnd', target: focusedRouteKey });
      previousFocusedRouteKeyRef.current = focusedRouteKey;
    }
  }, [descriptors, focusedRouteKey, navigation, state.routes]);

  const focusedOptions = descriptors[focusedRouteKey].options;
  const { tabBarPosition = 'bottom' } = focusedOptions;

  const tabBarElement = (
    // Press handlers need real focus; an optimistic reveal must not suppress
    // the tab dispatch that will make navigation catch up with those pixels.
    <FastTabBarHost
      state={state}
      descriptors={descriptors}
      navigation={navigation}
      safeAreaInsets={safeAreaInsets}
      tabBar={tabBar}
      setTabBarHeight={setTabBarHeight}
    />
  );

  return (
    <SafeAreaProviderCompat
      style={[
        styles.container,
        (tabBarPosition === 'left' || tabBarPosition === 'right') &&
          styles.horizontalContainer,
      ]}
    >
      {(tabBarPosition === 'top' || tabBarPosition === 'left') &&
        tabBarElement}

      <View style={styles.scenes}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const navigationFocused = index === state.index;
          const lazy = descriptor.options.lazy ?? true;
          const loaded = loadedRouteKeysRef.current.has(route.key);

          if (lazy && !loaded && !navigationFocused) {
            return null;
          }

          return (
            <SceneLayer
              key={route.key}
              descriptor={descriptor}
              navigationFocused={navigationFocused}
              visualFocused={route.name === visibleRouteName}
              layerRef={layerRefSetters[route.name as FastTabRouteName]}
              layout={layout}
              tabBarHeight={tabBarHeight}
              tabBarPosition={tabBarPosition}
            />
          );
        })}
      </View>

      {(tabBarPosition === 'bottom' || tabBarPosition === 'right') &&
        tabBarElement}
    </SafeAreaProviderCompat>
  );
}

function FastTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  UNSTABLE_routeNamesChangeBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
  ...viewProps
}: BottomTabNavigatorProps) {
  const { state, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      TabNavigationState<ParamListBase>,
      TabRouterOptions,
      TabActionHelpers<ParamListBase>,
      BottomTabNavigationOptions,
      BottomTabNavigationEventMap
    >(TabRouter, {
      id,
      initialRouteName,
      backBehavior,
      UNSTABLE_routeNamesChangeBehavior,
      children,
      layout,
      screenListeners,
      screenOptions,
      screenLayout,
      UNSTABLE_router,
    });

  return (
    <NavigationContent>
      <FastTabView
        {...viewProps}
        state={state}
        descriptors={descriptors}
        navigation={navigation}
      />
    </NavigationContent>
  );
}

export function createFastTabNavigator<
  const ParamList extends ParamListBase,
  const NavigatorID extends string | undefined = string | undefined,
  const TypeBag extends NavigatorTypeBagBase = {
    ParamList: ParamList;
    NavigatorID: NavigatorID;
    State: TabNavigationState<ParamList>;
    ScreenOptions: BottomTabNavigationOptions;
    EventMap: BottomTabNavigationEventMap;
    NavigationList: {
      [RouteName in keyof ParamList]: BottomTabNavigationProp<
        ParamList,
        RouteName,
        NavigatorID
      >;
    };
    Navigator: typeof FastTabNavigator;
  },
  const Config extends StaticConfig<TypeBag> = StaticConfig<TypeBag>,
>(config?: Config): TypedNavigator<TypeBag, Config> {
  return createNavigatorFactory(FastTabNavigator)(config);
}

const FastTabNavigatorFactory = createFastTabNavigator();

type FastTabScreenOptions = BottomTabNavigationOptions & {
  href?: Href | null;
};

const ExpoFastTabs = withLayoutContext<
  FastTabScreenOptions,
  typeof FastTabNavigatorFactory.Navigator,
  TabNavigationState<ParamListBase>,
  BottomTabNavigationEventMap
>(FastTabNavigatorFactory.Navigator, (screens) =>
  screens.map((screen) => {
    if (
      typeof screen.options === 'function' ||
      screen.options?.href === undefined
    ) {
      return screen;
    }

    const { href, ...options } = screen.options;

    if (options.tabBarButton) {
      throw new Error('Cannot use `href` and `tabBarButton` together.');
    }

    return {
      ...screen,
      options: {
        ...options,
        tabBarItemStyle:
          href == null ? { display: 'none' as const } : options.tabBarItemStyle,
        tabBarButton: (props: BottomTabBarButtonProps) => {
          if (href == null) {
            return null;
          }

          const linkProps = props as unknown as Omit<LinkProps, 'href'>;
          const children =
            Platform.OS === 'web' ? (
              props.children
            ) : (
              <Pressable>{props.children}</Pressable>
            );

          return (
            <Link
              {...linkProps}
              href={href}
              asChild={Platform.OS !== 'web'}
              style={[{ display: 'flex' }, props.style] as LinkProps['style']}
            >
              {children}
            </Link>
          );
        },
      },
    };
  }),
  true,
);

const expoTabRouterOverride: NonNullable<
  BottomTabNavigatorProps['UNSTABLE_router']
> = (original) => ({
  ...original,
  getStateForAction(state, action, options) {
    if (action.target && action.target !== state.key) {
      return null;
    }

    if (action.type !== 'REPLACE') {
      return original.getStateForAction(state, action, options);
    }

    let nextState = original.getStateForAction(
      state,
      { ...action, type: 'JUMP_TO' },
      options,
    );

    if (
      !nextState ||
      nextState.index === undefined ||
      !Array.isArray(nextState.history)
    ) {
      return null;
    }

    if (nextState.index !== 0) {
      const previousIndex = nextState.index - 1;
      nextState = {
        ...nextState,
        key: `${nextState.key}-replace`,
        history: [
          ...nextState.history.slice(0, previousIndex),
          ...nextState.history.slice(nextState.index),
        ],
      };
    }

    return nextState;
  },
});

const FastTabsComponent = forwardRef<
  unknown,
  ComponentProps<typeof ExpoFastTabs>
>(function FastTabsComponent(props, ref) {
  return (
    <ExpoFastTabs
      {...props}
      ref={ref}
      UNSTABLE_router={expoTabRouterOverride}
    />
  );
});

/** Expo Router-compatible navigator used as a drop-in replacement for Tabs. */
export const FastTabs = Object.assign(FastTabsComponent, {
  Screen: ExpoFastTabs.Screen,
  Protected: ExpoFastTabs.Protected,
});

export default FastTabs;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  horizontalContainer: {
    flexDirection: 'row',
  },
  scenes: {
    flex: 1,
    overflow: 'hidden',
  },
  sceneLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneLayerVisible: {
    opacity: 1,
    zIndex: 1,
  },
  sceneLayerOptimistic: {
    zIndex: 2,
  },
  sceneLayerHidden: {
    opacity: 0,
    zIndex: 0,
  },
});

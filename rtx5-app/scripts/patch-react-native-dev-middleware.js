const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const nodeModulesDir = path.join(projectRoot, 'node_modules');

// 1. Patch React Native DevTools browser launcher if present.
const launcherPath = path.join(
  nodeModulesDir,
  '@react-native',
  'dev-middleware',
  'dist',
  'utils',
  'DefaultBrowserLauncher.js',
);

if (fs.existsSync(launcherPath)) {
  const source = fs.readFileSync(launcherPath, 'utf8');
  const before = `      childProcess.on("data", () => {
        resolve();
      });`;
  const after = `      childProcess.on("spawn", () => {
        childProcess.unref();
        resolve();
      });
      childProcess.on("error", reject);`;
  if (!source.includes('childProcess.on("spawn", () => {') && source.includes(before)) {
    fs.writeFileSync(launcherPath, source.replace(before, after));
    console.log('[postinstall] Patched React Native DevTools browser launcher.');
  }
}

// 2. Bridge @react-navigation/* to expo-router's vendored react-navigation in SDK 58+.
const vendoredReactNavRoot = path.join(nodeModulesDir, 'expo-router', 'build', 'react-navigation');
if (fs.existsSync(vendoredReactNavRoot)) {
  const navPackages = [
    'native',
    'bottom-tabs',
    'elements',
    'routers',
    'core',
    'stack',
    'drawer',
    'native-stack',
    'material-top-tabs',
  ];
  const scopeDir = path.join(nodeModulesDir, '@react-navigation');
  fs.mkdirSync(scopeDir, { recursive: true });
  for (const pkgName of navPackages) {
    const targetDir = path.join(vendoredReactNavRoot, pkgName);
    if (!fs.existsSync(targetDir)) continue;
    const pkgDir = path.join(scopeDir, pkgName);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify(
        {
          name: `@react-navigation/${pkgName}`,
          version: '8.0.0-expo-router',
          main: 'index.js',
          types: 'index.d.ts',
        },
        null,
        2,
      ) + '\n',
    );
    fs.writeFileSync(
      path.join(pkgDir, 'index.js'),
      `module.exports = require('../../expo-router/build/react-navigation/${pkgName}');\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'index.d.ts'),
      `export * from '../../expo-router/build/react-navigation/${pkgName}';\n`,
    );
  }
  console.log('[postinstall] Bridged @react-navigation/* to expo-router vendored navigation.');

  // 2b. Patch expo-router vendored navigation types & runtime for RN v7/v8 compatibility.
  const patchFileOnce = (filePath, marker, replacer) => {
    if (!fs.existsSync(filePath)) return;
    const src = fs.readFileSync(filePath, 'utf8');
    if (marker && src.includes(marker)) return;
    const next = replacer(src);
    if (next !== src) {
      fs.writeFileSync(filePath, next);
    }
  };

  const coreTypesPath = path.join(vendoredReactNavRoot, 'core', 'types.d.ts');
  patchFileOnce(coreTypesPath, 'UNSTABLE_routeNamesChangeBehavior', (src) =>
    src
      .replace(
        '    UNSTABLE_router?: <Action extends NavigationAction>(original: Router<State, Action>) => Partial<Router<State, Action>>;',
        "    UNSTABLE_routeNamesChangeBehavior?: 'lastUnhandled' | 'initialRoute';\n    UNSTABLE_router?: <Action extends NavigationAction>(original: Router<State, Action>) => Partial<Router<State, Action>>;",
      )
      .replace(
        '    removePrevented: {',
        '    beforeRemove: {\n        data: {\n            action: NavigationAction;\n        };\n        canPreventDefault: true;\n    };\n    removePrevented: {',
      )
      .replace(
        'export type DescriptorRoute<Route extends RouteProp<any, any>> = Omit<Route, \'key\'> & Readonly<{\n    key: string | undefined;\n}>;',
        'export type DescriptorRoute<Route extends RouteProp<any, any>> = Route;',
      )
      .replace(
        'export type TypedNavigator<Bag extends NavigatorTypeBagBase> =',
        'export type StaticConfig<Bag extends NavigatorTypeBagBase = NavigatorTypeBagBase> = Record<string, any>;\nexport type TypedNavigator<Bag extends NavigatorTypeBagBase, _Config = unknown> =',
      ),
  );

  const createNavFactoryDtsPath = path.join(vendoredReactNavRoot, 'core', 'createNavigatorFactory.d.ts');
  patchFileOnce(createNavFactoryDtsPath, '(config?: any)', (src) =>
    src.replace(
      'export declare function createNavigatorFactory(Navigator: React.ComponentType<any>): () => any;',
      'export declare function createNavigatorFactory(Navigator: React.ComponentType<any>): (config?: any) => any;',
    ),
  );

  const withLayoutContextDtsPath = path.join(nodeModulesDir, 'expo-router', 'build', 'layouts', 'withLayoutContext.d.ts');
  patchFileOnce(withLayoutContextDtsPath, 'isCustomNavigator?: boolean): ForwardRefExoticComponent', (src) =>
    src.replace(
      'name: string;\n})[]): ForwardRefExoticComponent',
      'name: string;\n})[], isCustomNavigator?: boolean): ForwardRefExoticComponent',
    ),
  );

  const bottomTabsIndexDtsPath = path.join(vendoredReactNavRoot, 'bottom-tabs', 'index.d.ts');
  patchFileOnce(bottomTabsIndexDtsPath, 'BottomTabNavigatorProps', (src) =>
    src.replace(
      'BottomTabNavigationProp,',
      'BottomTabNavigationProp, BottomTabNavigatorProps,',
    ),
  );

  const bottomTabsTypesPath = path.join(vendoredReactNavRoot, 'bottom-tabs', 'types.d.ts');
  patchFileOnce(bottomTabsTypesPath, 'BottomTabNavigatorProps', (src) =>
    src.replace(
      'export type BottomTabBarProps = {\n    state: BottomTabViewState;\n    descriptors: BottomTabDescriptorMap;\n    emitter: BottomTabEmitter;\n    navigateToTab: (routeKey: string) => void;\n    insets: EdgeInsets;\n};',
      `export type BottomTabBarProps = {
    state: TabNavigationState<ParamListBase>;
    descriptors: BottomTabDescriptorMap;
    navigation: import('../native').NavigationHelpers<ParamListBase, BottomTabNavigationEventMap>;
    emitter?: BottomTabEmitter;
    navigateToTab?: (routeKey: string) => void;
    insets: EdgeInsets;
};
export type BottomTabNavigatorProps = import('../native').DefaultNavigatorOptions<
    ParamListBase,
    string | undefined,
    TabNavigationState<ParamListBase>,
    BottomTabNavigationOptions,
    BottomTabNavigationEventMap,
    BottomTabNavigationProp<ParamListBase>
> & import('../native').TabRouterOptions & BottomTabNavigationConfig;`,
    ),
  );

  const bottomTabBarJsPath = path.join(vendoredReactNavRoot, 'bottom-tabs', 'views', 'BottomTabBar.js');
  patchFileOnce(bottomTabBarJsPath, 'emitter = emitter ?? navigation', (src) =>
    src.replace(
      'function BottomTabBar({ state, descriptors, emitter, navigateToTab, insets, style }) {',
      `function BottomTabBar({ state, descriptors, navigation, emitter, navigateToTab, insets, style }) {
    emitter = emitter ?? navigation;
    navigateToTab = navigateToTab ?? ((routeKey) => {
        const route = state.routes.find((r) => r.key === routeKey);
        if (route && navigation) {
            navigation.navigate(route.name, route.params);
        }
    });`,
    ),
  );

  const useDescriptorsJsPath = path.join(vendoredReactNavRoot, 'core', 'useDescriptors.js');
  patchFileOnce(useDescriptorsJsPath, "type: 'beforeRemove'", (src) =>
    src.replace(
      '    const emitRemovalEvent = _react().useCallback((routeKey, type, action)=>emitter.emit({\n            type,\n            target: routeKey,\n            data: {\n                action\n            }\n        }), [\n        emitter\n    ]);',
      `    const emitRemovalEvent = _react().useCallback((routeKey, type, action)=>{
        emitter.emit({
            type: 'beforeRemove',
            target: routeKey,
            canPreventDefault: true,
            data: {
                action
            }
        });
        return emitter.emit({
            type,
            target: routeKey,
            data: {
                action
            }
        });
    }, [
        emitter
    ]);`,
    ),
  );

  const tabRouterDtsPath = path.join(vendoredReactNavRoot, 'routers', 'TabRouter.d.ts');
  patchFileOnce(tabRouterDtsPath, 'preloadedRouteKeys', (src) =>
    src.replace(
      '    type?: \'tab\';',
      "    type?: 'tab';\n    preloadedRouteKeys: string[];",
    ),
  );

  const routerTypesDtsPath = path.join(vendoredReactNavRoot, 'routers', 'types.d.ts');
  patchFileOnce(routerTypesDtsPath, 'getInitialState(', (src) =>
    src
      .replace(
        '    routeNames: string[];\n    routeGetIdList:',
        '    routeNames: string[];\n    routeParamList?: Record<string, object | undefined>;\n    routeGetIdList:',
      )
      .replace(
        '    getStateForAction(state: State, action: Action, options: RouterConfigOptions): RouterActionResult<State> | RouterActionHandling.Unhandled | null;',
        '    getInitialState(options: RouterConfigOptions): State;\n    getRehydratedState(partialState: PartialState<State> | State, options: RouterConfigOptions): State;\n    getStateForAction(state: State, action: Action, options: RouterConfigOptions): (RouterActionResult<State> & State) | null;',
      ),
  );

  const extendRouterDtsPath = path.join(vendoredReactNavRoot, 'routers', 'extendRouter.d.ts');
  patchFileOnce(extendRouterDtsPath, 'getInitialState(', (src) =>
    src.replace(
      'export type ExtendedRouter<State extends NavigationState, Action extends NavigationAction> = Omit<Router<State, Action>, \'getStateForAction\'> & {\n    getStateForAction(state: State, action: Action, options: RouterConfigOptions): RouterActionResult<State> | RouterActionHandling.Unhandled;\n};',
      `export type ExtendedRouter<State extends NavigationState, Action extends NavigationAction> = Omit<Router<State, Action>, 'getStateForAction'> & {
    getInitialState(options: RouterConfigOptions): State;
    getRehydratedState(partialState: any, options: RouterConfigOptions): State;
    getStateForAction(state: State, action: Action, options: RouterConfigOptions): (RouterActionResult<State> & State) | null;
};`,
    ),
  );

  const extendRouterJsPath = path.join(vendoredReactNavRoot, 'routers', 'extendRouter.js');
  patchFileOnce(extendRouterJsPath, 'getInitialState (configOptions)', (src) =>
    src
      .replace(
        '        const finish = (state, stateType)=>{\n            const stamped = stamp(state);\n            const typed = stateType === undefined ? stamped : (0, _ensureStateType.ensureStateType)(stamped, stateType);\n            return normalizeState ? normalizeState(typed) : typed;\n        };',
        `        const finish = (state, stateType)=>{
            const stamped = stamp(state);
            const typed = stateType === undefined ? stamped : (0, _ensureStateType.ensureStateType)(stamped, stateType);
            const normalized = normalizeState ? normalizeState(typed) : typed;
            const preloadedRouteKeys = Array.isArray(normalized.routes)
                ? normalized.routes.filter((r) => r && r.isPreloaded).map((r) => r.key)
                : [];
            return Array.isArray(normalized.preloadedRouteKeys) && normalized.preloadedRouteKeys.length === preloadedRouteKeys.length
                ? normalized
                : { ...normalized, preloadedRouteKeys };
        };`,
      )
      .replace(
        '        return {\n            ...router,\n            getStateForDeclaredRoutes (state, routeNames) {',
        `        return {
            ...router,
            getInitialState (configOptions) {
                const routeNames = configOptions?.routeNames ?? [];
                const initialName = options?.initialRouteName !== undefined && routeNames.includes(options.initialRouteName)
                    ? options.initialRouteName
                    : routeNames[0];
                const isTab = type === 'tab';
                const routes = isTab
                    ? routeNames.map((name, idx) => ({
                        key: \`\${name}:\${idx}\`,
                        name,
                        ...(configOptions?.routeParamList?.[name] !== undefined ? { params: configOptions.routeParamList[name] } : {}),
                    }))
                    : initialName !== undefined
                        ? [{
                            key: \`\${initialName}:0\`,
                            name: initialName,
                            ...(configOptions?.routeParamList?.[initialName] !== undefined ? { params: configOptions.routeParamList[initialName] } : {}),
                        }]
                        : [];
                const seedState = {
                    stale: false,
                    type,
                    key: 'navigator:root',
                    routeKeySeq: routes.length,
                    index: isTab ? Math.max(0, routeNames.indexOf(initialName)) : 0,
                    routeNames,
                    routes,
                    preloadedRouteKeys: [],
                };
                return this.getStateForDeclaredRoutes(seedState, routeNames);
            },
            getRehydratedState (partialState) {
                return partialState && partialState.state ? partialState.state : partialState;
            },
            getStateForDeclaredRoutes (state, routeNames) {`,
      )
      .replace(
        `                return finishedState === resolved.state ? resolved : {
                    ...resolved,
                    state: finishedState
                };`,
        `                const hybridResult = { ...finishedState };
                Object.defineProperties(hybridResult, {
                    state: { value: finishedState, enumerable: false, configurable: true },
                    affectedRouteKey: { value: resolved.affectedRouteKey, enumerable: false, configurable: true },
                    browserHistory: { value: resolved.browserHistory, enumerable: false, configurable: true }
                });
                return hybridResult;`,
      )
      .replace(
        `                    if (browserHistory !== resolved.browserHistory) {
                        return {
                            ...resolved,
                            state: finishedState,
                            browserHistory
                        };
                    }`,
        `                    if (browserHistory !== resolved.browserHistory) {
                        const hybridWithHistory = { ...finishedState };
                        Object.defineProperties(hybridWithHistory, {
                            state: { value: finishedState, enumerable: false, configurable: true },
                            affectedRouteKey: { value: resolved.affectedRouteKey, enumerable: false, configurable: true },
                            browserHistory: { value: browserHistory, enumerable: false, configurable: true }
                        });
                        return hybridWithHistory;
                    }`,
      ),
  );

  const useNavBuilderJsPath = path.join(vendoredReactNavRoot, 'core', 'useNavigationBuilder.js');
  patchFileOnce(useNavBuilderJsPath, 'res && typeof res === \'object\' && !(\'state\' in res)', (src) =>
    src.replace(
      '    const reduce = (0, _useLatestCallback.default)((registryState, action)=>// The registry stores states from different router types; this entry only receives its own state key.\n        router.getStateForAction(registryState, action, {\n            routeNames,\n            routeGetIdList\n        }));',
      `    const reduce = (0, _useLatestCallback.default)((registryState, action)=>{
        const res = router.getStateForAction(registryState, action, {
            routeNames,
            routeGetIdList
        });
        if (res && typeof res === 'object' && !('state' in res) && Array.isArray(res.routes)) {
            return {
                state: res,
                affectedRouteKey: res.routes[res.index]?.key
            };
        }
        return res;
    });`,
    ),
  );
  patchFileOnce(useNavBuilderJsPath, 'hasMissingTabRoutes', (src) =>
    src
      .replace(
        '        const committed = committedState;\n        if ((0, _isArrayEqual.isArrayEqual)(committed.routeNames, routeNames)) {',
        `        const committed = committedState;
        const hasMissingTabRoutes = router.type === 'tab' && (committed.routes.length !== routeNames.length || committed.routes.some((r, idx)=>r.name !== routeNames[idx]));
        if ((0, _isArrayEqual.isArrayEqual)(committed.routeNames, routeNames) && !hasMissingTabRoutes) {`,
      )
      .replace(
        '    const navigation = (0, _useNavigationHelpers.useNavigationHelpers)({\n        id: options.id,\n        handleAction: onAction,\n        state: committedState,\n        emitter,\n        router\n    });',
        `    const navigation = (0, _useNavigationHelpers.useNavigationHelpers)({
        id: options.id,
        handleAction: onAction,
        state: state,
        emitter,
        router
    });`,
      ),
  );

  const tabRouterJsPath = path.join(vendoredReactNavRoot, 'routers', 'TabRouter.js');
  patchFileOnce(tabRouterJsPath, 'ensureAllDeclaredRoutes', (src) =>
    src
      .replace(
        'function tabRouterExtension({ baseRouter, nextKey, options: { initialRouteName, backBehavior = \'firstRoute\' } }) {',
        `function tabRouterExtension({ baseRouter, nextKey, options: { initialRouteName, backBehavior = 'firstRoute' } }) {
    const ensureAllDeclaredRoutes = (routes, routeNames)=>{
        if (!Array.isArray(routeNames) || routeNames.length === 0) {
            return routes;
        }
        const filtered = routes.filter((route)=>routeNames.includes(route.name));
        if (filtered.length === routeNames.length && filtered.every((route, idx)=>route.name === routeNames[idx])) {
            return filtered.length === routes.length ? routes : filtered;
        }
        return routeNames.map((name)=>{
            const existing = filtered.find((route)=>route.name === name);
            return existing ?? {
                name,
                key: nextKey(name)
            };
        });
    };`,
      )
      .replace(
        `        getStateForDeclaredRoutes (state, routeNames) {
            const declared = baseRouter.getStateForDeclaredRoutes(state, routeNames);
            if (declared.history != null && (0, _isArrayEqual.isArrayEqual)(declared.routeNames, routeNames)) {
                return declared;
            }
            return normalizeHistory((0, _isArrayEqual.isArrayEqual)(declared.routeNames, routeNames) ? declared : {
                ...declared,
                routeNames
            });
        },`,
        `        getStateForDeclaredRoutes (state, routeNames) {
            const declared = baseRouter.getStateForDeclaredRoutes(state, routeNames);
            const focusedRoute = state.routes[state.index] ?? declared.routes[declared.index];
            const routes = ensureAllDeclaredRoutes(declared.routes, routeNames);
            const focusedIndex = focusedRoute ? routes.findIndex((route)=>route.key === focusedRoute.key || route.name === focusedRoute.name) : -1;
            const index = routes.length === 0 ? -1 : Math.max(0, focusedIndex);
            const withAllRoutes = routes === declared.routes && index === declared.index && (0, _isArrayEqual.isArrayEqual)(declared.routeNames, routeNames) ? declared : {
                ...declared,
                routeNames,
                routes,
                index
            };
            if (withAllRoutes.history != null && (0, _isArrayEqual.isArrayEqual)(declared.routeNames, routeNames) && routes === declared.routes) {
                return withAllRoutes;
            }
            return normalizeHistory(withAllRoutes);
        },`,
      )
      .replace(
        `                case 'ROUTE_NAMES_CHANGED':
                    {
                        const routeNames = action.payload.routeNames;
                        if ((0, _isArrayEqual.isArrayEqual)(state.routeNames, routeNames)) {
                            return {
                                state: normalizeHistory(state),
                                affectedRouteKey: state.routes[state.index]?.key
                            };
                        }
                        const routes = addFallbackRouteIfEmpty(state.routes.filter((route)=>routeNames.includes(route.name)), routeNames, initialRouteName, nextKey);
                        if (routes.length === 0) {
                            return {
                                state: {
                                    ...state,
                                    routeNames,
                                    routes,
                                    index: -1,
                                    history: []
                                },
                                affectedRouteKey: undefined
                            };
                        }
                        const focusedKey = state.routes[state.index]?.key;
                        const focusedIndex = routes.findIndex((route)=>route.key === focusedKey);`,
        `                case 'ROUTE_NAMES_CHANGED':
                    {
                        const routeNames = action.payload.routeNames;
                        if ((0, _isArrayEqual.isArrayEqual)(state.routeNames, routeNames) && state.routes.length === routeNames.length && state.routes.every((route, idx)=>route.name === routeNames[idx])) {
                            return {
                                state: normalizeHistory(state),
                                affectedRouteKey: state.routes[state.index]?.key
                            };
                        }
                        const routes = ensureAllDeclaredRoutes(addFallbackRouteIfEmpty(state.routes.filter((route)=>routeNames.includes(route.name)), routeNames, initialRouteName, nextKey), routeNames);
                        if (routes.length === 0) {
                            return {
                                state: {
                                    ...state,
                                    routeNames,
                                    routes,
                                    index: -1,
                                    history: []
                                },
                                affectedRouteKey: undefined
                            };
                        }
                        const focusedRoute = state.routes[state.index];
                        const focusedKey = focusedRoute?.key;
                        const focusedIndex = routes.findIndex((route)=>route.key === focusedKey || (focusedRoute && route.name === focusedRoute.name));`,
      )
      .replace(
        '                        const { routes, index } = addRouteIfMissing(state.routes, action.payload.name, ()=>{',
        '                        const { routes, index } = addRouteIfMissing(ensureAllDeclaredRoutes(state.routes, state.routeNames), action.payload.name, ()=>{',
      ),
  );

  const globalStateRoot = path.join(nodeModulesDir, 'expo-router', 'build', 'global-state');
  const resolveNavDestPath = path.join(globalStateRoot, 'resolveNavigationDestination.js');
  patchFileOnce(resolveNavDestPath, 'const state = result.state ??', (src) =>
    src.replace(
      `function getSelection(result) {
    if (result === undefined || !(0, _utils.isActionHandled)(result) || result.state.stale !== false || result.affectedRouteKey === undefined) {
        return undefined;
    }
    const route = result.state.routes.find((route)=>route.key === result.affectedRouteKey);
    return route && {
        state: result.state,
        route
    };
}`,
      `function getSelection(result) {
    if (result === undefined || !(0, _utils.isActionHandled)(result)) {
        return undefined;
    }
    const state = result.state ?? (Array.isArray(result.routes) ? result : undefined);
    const affectedRouteKey = result.affectedRouteKey ?? state?.routes?.[state.index]?.key;
    if (!state || state.stale !== false || affectedRouteKey === undefined) {
        return undefined;
    }
    const route = state.routes.find((route)=>route.key === affectedRouteKey);
    return route && {
        state,
        route
    };
}`,
    ),
  );

  const reduceNavTreePath = path.join(globalStateRoot, 'reduceNavigationTree.js');
  patchFileOnce(reduceNavTreePath, 'resolvedAffectedKey', (src) =>
    src.replace(
      `        const nextSlice = result?.state ?? node.state;
        handler = {
            node,
            nextSlice,
            browserHistory: result?.browserHistory,
            shouldFocus: entry.shouldActionChangeFocus?.(action) ?? false,
            affectedRouteKey: result?.affectedRouteKey
        };`,
      `        const nextSlice = result?.state ?? (Array.isArray(result?.routes) ? result : node.state);
        const resolvedAffectedKey = result?.affectedRouteKey ?? (Array.isArray(result?.routes) ? result.routes[result.index]?.key : undefined);
        handler = {
            node,
            nextSlice,
            browserHistory: result?.browserHistory,
            shouldFocus: entry.shouldActionChangeFocus?.(action) ?? false,
            affectedRouteKey: resolvedAffectedKey
        };`,
    ),
  );
}

// 3. Ensure StyleSheet.absoluteFillObject exists at runtime and in types for RN 0.88+.
const styleSheetJsPath = path.join(
  nodeModulesDir,
  'react-native',
  'Libraries',
  'StyleSheet',
  'StyleSheetExports.js',
);
if (fs.existsSync(styleSheetJsPath)) {
  const jsSource = fs.readFileSync(styleSheetJsPath, 'utf8');
  if (!jsSource.includes('absoluteFillObject')) {
    const patchedJs = jsSource.replace(
      '  absoluteFill,\n',
      '  absoluteFill,\n  absoluteFillObject: absoluteFill,\n',
    );
    if (patchedJs !== jsSource) {
      fs.writeFileSync(styleSheetJsPath, patchedJs);
    }
  }
}

const styleSheetDtsPath = path.join(
  nodeModulesDir,
  'react-native',
  'types_generated',
  'Libraries',
  'StyleSheet',
  'StyleSheetExports.d.ts',
);
if (fs.existsSync(styleSheetDtsPath)) {
  const dtsSource = fs.readFileSync(styleSheetDtsPath, 'utf8');
  if (!dtsSource.includes('absoluteFillObject')) {
    const patchedDts = dtsSource.replace(
      'export declare const absoluteFill: AbsoluteFillStyle;\nexport declare type absoluteFill = typeof absoluteFill;',
      'export declare const absoluteFill: AbsoluteFillStyle;\nexport declare type absoluteFill = typeof absoluteFill;\nexport declare const absoluteFillObject: AbsoluteFillStyle;\nexport declare type absoluteFillObject = typeof absoluteFillObject;',
    );
    if (patchedDts !== dtsSource) {
      fs.writeFileSync(styleSheetDtsPath, patchedDts);
    }
  }
}

const styleSheetDeprecatedDtsPath = path.join(
  nodeModulesDir,
  'react-native',
  'types_DEPRECATED',
  'Libraries',
  'StyleSheet',
  'StyleSheet.d.ts',
);
if (fs.existsSync(styleSheetDeprecatedDtsPath)) {
  const depSource = fs.readFileSync(styleSheetDeprecatedDtsPath, 'utf8');
  if (!depSource.includes('absoluteFillObject')) {
    const patchedDep = depSource.replace(
      '  export const absoluteFill: AbsoluteFillStyle;',
      '  export const absoluteFill: AbsoluteFillStyle;\n  export const absoluteFillObject: AbsoluteFillStyle;',
    );
    if (patchedDep !== depSource) {
      fs.writeFileSync(styleSheetDeprecatedDtsPath, patchedDep);
    }
  }
}

// 4. Fix react-native-webview@14.0.1 default generic P = undefined reducing WebViewProps & P to never.
const webviewDtsPath = path.join(nodeModulesDir, 'react-native-webview', 'index.d.ts');
if (fs.existsSync(webviewDtsPath)) {
  const webviewSource = fs.readFileSync(webviewDtsPath, 'utf8');
  if (webviewSource.includes('declare class WebView<P = undefined>')) {
    fs.writeFileSync(
      webviewDtsPath,
      webviewSource.replace(
        'declare class WebView<P = undefined>',
        'declare class WebView<P = {}>',
      ),
    );
  }
}

// 5. Restore instance type aliases for View, ScrollView, and TextInput in RN 0.88 types_generated.
const patchInstanceType = (relPath, fromDecl, toDecl) => {
  const fullPath = path.join(nodeModulesDir, 'react-native', 'types_generated', relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes(fromDecl)) {
    fs.writeFileSync(fullPath, content.replace(fromDecl, toDecl));
  }
};

patchInstanceType(
  'Libraries/Components/View/View.d.ts',
  'declare type $$View = typeof $$View;',
  'declare type $$View = ViewInstance;',
);
patchInstanceType(
  'Libraries/Components/ScrollView/ScrollView.d.ts',
  'declare type $$ScrollView = typeof $$ScrollView;',
  'declare type $$ScrollView = ScrollViewInstance;',
);
patchInstanceType(
  'Libraries/Components/TextInput/TextInput.d.ts',
  'declare type $$TextInput = typeof $$TextInput;',
  'declare type $$TextInput = TextInputInstance;',
);

// 6. Ensure @expo/ws-tunnel resolves ws@8.x (with named WebSocket constructor) when root ws is 7.x.
const rootWsIndexPath = path.join(nodeModulesDir, 'ws', 'index.js');
if (fs.existsSync(rootWsIndexPath)) {
  const wsSource = fs.readFileSync(rootWsIndexPath, 'utf8');
  if (!wsSource.includes('WebSocket.WebSocket = WebSocket;')) {
    fs.writeFileSync(
      rootWsIndexPath,
      wsSource.replace(
        'module.exports = WebSocket;',
        'WebSocket.WebSocket = WebSocket;\nWebSocket.WebSocketServer = WebSocket.Server;\n\nmodule.exports = WebSocket;',
      ),
    );
  }
}

const expoCliWsDir = path.join(nodeModulesDir, '@expo', 'cli', 'node_modules', 'ws');
const wsTunnelDir = path.join(nodeModulesDir, '@expo', 'ws-tunnel');
if (fs.existsSync(wsTunnelDir) && fs.existsSync(expoCliWsDir)) {
  const wsTunnelWsDir = path.join(wsTunnelDir, 'node_modules', 'ws');
  fs.mkdirSync(wsTunnelWsDir, { recursive: true });
  fs.writeFileSync(
    path.join(wsTunnelWsDir, 'package.json'),
    JSON.stringify(
      {
        name: 'ws',
        version: '8.22.1',
        main: 'index.js',
      },
      null,
      2,
    ) + '\n',
  );
  fs.writeFileSync(
    path.join(wsTunnelWsDir, 'index.js'),
    "module.exports = require('../../../cli/node_modules/ws');\n",
  );
}

const wsTunnelIndexJsPath = path.join(wsTunnelDir, 'build', 'index.js');
if (fs.existsSync(wsTunnelIndexJsPath)) {
  let tunnelSource = fs.readFileSync(wsTunnelIndexJsPath, 'utf8');
  let changed = false;

  if (tunnelSource.includes('new s.WebSocket(')) {
    tunnelSource = tunnelSource.replace('new s.WebSocket(', 'new (s.WebSocket || s)(');
    changed = true;
  }

  const origCreateWsModule = '363:(e,t,r)=>{"use strict";Object.defineProperty(t,"__esModule",{value:true});t.createWebSocket=createWebSocket;const s=r(441);function createWebSocket(e){const t=new (s.WebSocket || s)(e,{skipUTF8Validation:true,maxPayload:1024*1024,perMessageDeflate:!process.versions.webcontainer});t.binaryType="arraybuffer";return t}}';
  const patchedCreateWsModule = '363:(e,t,r)=>{"use strict";Object.defineProperty(t,"__esModule",{value:true});t.createWebSocket=createWebSocket;const s=r(441);const dns=require("node:dns");function rtx5TunnelLookup(hostname,opts,cb){if(typeof opts==="function"){cb=opts;opts={}}else if(typeof opts==="number"){opts={family:opts}}else{opts=opts||{}}const wantAll=Boolean(opts.all);const deliver=ips=>wantAll?cb(null,ips.map(ip=>({address:ip,family:4}))):cb(null,ips[0],4);dns.lookup(hostname,opts,(err,address,family)=>{if(!err&&address&&(!wantAll||Array.isArray(address)&&address.length>0)){return cb(null,address,family)}const resolver=new dns.Resolver();try{resolver.setServers(["1.1.1.1","8.8.8.8","1.0.0.1","8.8.4.4"])}catch{}resolver.resolve4(hostname,(rErr,ips)=>{if(!rErr&&ips&&ips.length>0){return deliver(ips)}if(hostname.endsWith(".on.expo.app")){return resolver.resolve4("on.expo.app",(pErr,pIps)=>{if(!pErr&&pIps&&pIps.length>0)return deliver(pIps);return deliver(["104.18.20.213","104.18.21.213"])})}if(hostname.endsWith(".boltexpo.dev")){return resolver.resolve4("boltexpo.dev",(pErr,pIps)=>{if(!pErr&&pIps&&pIps.length>0)return deliver(pIps);return deliver(["172.67.219.71","104.21.65.231"])})}return cb(err||rErr)})})}function createWebSocket(e){let host="";try{host=new URL(String(e)).hostname}catch{}const isLocal=host==="localhost"||host==="127.0.0.1"||host==="[::1]";const t=new (s.WebSocket || s)(e,{skipUTF8Validation:true,maxPayload:1024*1024,perMessageDeflate:!process.versions.webcontainer,handshakeTimeout:3e4,...(isLocal?{}:{lookup:rtx5TunnelLookup})});t.binaryType="arraybuffer";t.on("error",(()=>{}));return t}}';
  if (!tunnelSource.includes('rtx5TunnelLookup') && tunnelSource.includes(origCreateWsModule)) {
    tunnelSource = tunnelSource.replace(origCreateWsModule, patchedCreateWsModule);
    changed = true;
  }

  const origCreateTunnelFn = 'function createTunnel(){let e=null;let t="created";let r=0;let s=0;let n=null;let a=null;return{async start(c){if(t!=="stopped"){this.stop()}const{maxReconnect:i=10,onStatusChange:g}=c;const h=(0,o.makeContext)(c);if(e&&e.readyState===e.OPEN){return h.proxyUrl}const{promise:b,resolve:m,reject:C}=(0,u.withResolvers)();const onSocketClose=e=>{if(t!=="started")return;if(isIntentionalClose(e.code)||r>i){this.stop();return g?.("disconnected")}const s=Math.min(f*2**r,p);g?.("reconnecting");r+=1;this.stop();n=setTimeout((()=>{n=null;this.start(c)}),s)};const onHeartbeat=()=>{s++};const onMessage=t=>{try{s++;if(e)handleTunnelMessage(e,h,t)}catch(e){d(e)}};try{g?.("connecting");e=(0,l.createWebSocket)(h.apiUrl);t="started";e.once("error",C);e.once("open",m);e.once("close",onSocketClose);e.on("ping",onHeartbeat);e.on("pong",onHeartbeat);e.on("message",onMessage);await b;r=0;s=1;if(a){clearInterval(a)}a=setInterval((()=>{if(!e||e.readyState!==e.OPEN){}else if(s>0){s=0;e.ping()}else{e.terminate()}}),y);g?.("connected");return h.proxyUrl}catch(e){this.stop();throw e}finally{e?.on("error",(()=>{}))}},stop(){t="stopped";if(a){clearInterval(a);a=null}if(n){clearTimeout(n);n=null}e?.close();e=null}}}';
  const patchedCreateTunnelFn = 'function createTunnel(){let e=null;let t="created";let r=0;let s=0;let n=null;let a=null;return{async start(c,isReconnectAttempt=false){if(t!=="stopped"){this.stop()}const{maxReconnect:i=20,onStatusChange:g}=c;const h=(0,o.makeContext)(c);if(e&&e.readyState===e.OPEN){return h.proxyUrl}const scheduleReconnect=()=>{if(r>i){this.stop();g?.("disconnected");return false}const delay=Math.min(f*2**r,5e3);g?.("reconnecting");r+=1;this.stop();n=setTimeout((()=>{n=null;this.start(c,true).catch((err=>{d(err)}))}),delay);return true};const onSocketClose=ev=>{if(t!=="started")return;if(isIntentionalClose(ev?.code)){this.stop();return g?.("disconnected")}scheduleReconnect()};const onHeartbeat=()=>{s++};const onMessage=msg=>{try{s++;if(e)handleTunnelMessage(e,h,msg)}catch(err){d(err)}};const maxInitialAttempts=isReconnectAttempt?1:3;let lastErr;for(let attempt=1;attempt<=maxInitialAttempts;attempt++){const{promise:b,resolve:m,reject:C}=(0,u.withResolvers)();try{g?.("connecting");const sock=(0,l.createWebSocket)(h.apiUrl);e=sock;t="started";sock.once("error",C);sock.once("open",m);sock.once("close",onSocketClose);sock.on("ping",onHeartbeat);sock.on("pong",onHeartbeat);sock.on("message",onMessage);await b;r=0;s=1;if(a){clearInterval(a)}a=setInterval((()=>{if(!e||e.readyState!==e.OPEN){}else if(s>0){s=0;e.ping()}else{e.terminate()}}),y);g?.("connected");return h.proxyUrl}catch(err){lastErr=err;this.stop();if(!isReconnectAttempt&&attempt<maxInitialAttempts){await new Promise((res=>setTimeout(res,400*attempt)));continue}}}if(isReconnectAttempt){scheduleReconnect();return h.proxyUrl}throw lastErr},stop(){t="stopped";if(a){clearInterval(a);a=null}if(n){clearTimeout(n);n=null}const sock=e;e=null;if(sock){try{sock.on("error",(()=>{}));if(sock.readyState===0)sock.terminate();else sock.close()}catch{}}}}}';
  if (!tunnelSource.includes('isReconnectAttempt') && tunnelSource.includes(origCreateTunnelFn)) {
    tunnelSource = tunnelSource.replace(origCreateTunnelFn, patchedCreateTunnelFn);
    changed = true;
  }

  const origProxiedFetch = 'let g;let h=0;while(!g&&!f.aborted&&h++<i){if(h===1){c("Fetching",r.id,r.method,y)}else{c(`Retrying request (attempt ${h}/${i})`,r.id,r.method,y)}try{g=await(0,s.fetch)(y,{signal:d.signal,method:r.method,headers:o,body:p,connectTimeout:3e4});c(`Request completed (attempt ${h})`,r.id,r.method,g.status,y)}catch(e){if(e?.code!=="ECONNREFUSED"){break}else{c("Request failed for request ID",r.id,e);g=undefined;await wait((h+1)*100)}}}if(!g){u.delete(r.id);if(!f.aborted){e.send((0,n.encodeMessage)({type:n.MessageType.ResponseAbort,id:r.id,errored:true}))}return}try{for await(const t of encodeResponse(r.id,g,f)){await new Promise(((r,s)=>e.send(t,(e=>{if(e){s(e)}else{r()}}))))}}catch{e.send((0,n.encodeMessage)({type:n.MessageType.ResponseAbort,id:r.id,errored:true}))}finally{l.delete(r.id);u.delete(r.id)}';
  const prevPatchedProxiedFetch = 'let g;let h=0;while(!g&&!f.aborted&&h++<i){if(h===1){c("Fetching",r.id,r.method,y)}else{c(`Retrying request (attempt ${h}/${i})`,r.id,r.method,y)}try{g=await(0,s.fetch)(y,{signal:d.signal,method:r.method,headers:o,body:p,connectTimeout:3e4,redirect:"manual"});c(`Request completed (attempt ${h})`,r.id,r.method,g.status,y)}catch(e){if(e?.code!=="ECONNREFUSED"){break}else{c("Request failed for request ID",r.id,e);g=undefined;await wait((h+1)*100)}}}if(!g){u.delete(r.id);if(!f.aborted){e.send((0,n.encodeMessage)({type:n.MessageType.ResponseAbort,id:r.id,errored:true}))}return}try{for await(const t of encodeResponse(r.id,g,f)){await new Promise(((r,s)=>e.send(t,(e=>{if(e){s(e)}else{r()}}))))}}catch{e.send((0,n.encodeMessage)({type:n.MessageType.ResponseAbort,id:r.id,errored:true}))}finally{l.delete(r.id);u.delete(r.id)}';
  const prevPatchedProxiedFetch3e5 = prevPatchedProxiedFetch.replace('connectTimeout:3e4', 'connectTimeout:3e5');
  const nextPatchedProxiedFetch = 'const isBundleKeepAlive=r.method==="GET"&&y.pathname.endsWith(".bundle")&&!(o.get("accept")||"").includes("multipart/mixed");let earlySent=false;let keepAliveTimer=null;let earlyHeaderTimer=null;let sendChain=Promise.resolve();const sendRaw=bytes=>{sendChain=sendChain.then((()=>new Promise(((res,rej)=>e.send(bytes,(err=>{if(err)rej(err);else res()}))))));return sendChain};const clearKeepAlive=()=>{if(earlyHeaderTimer){clearTimeout(earlyHeaderTimer);earlyHeaderTimer=null}if(keepAliveTimer){clearInterval(keepAliveTimer);keepAliveTimer=null}};if(isBundleKeepAlive){const spaceChunk=new Uint8Array([32]);earlyHeaderTimer=setTimeout((()=>{earlyHeaderTimer=null;if(f.aborted)return;earlySent=true;const earlyHeaders=new Headers({"content-type":"application/javascript; charset=UTF-8","cache-control":"no-store, no-cache, must-revalidate, proxy-revalidate"});sendRaw((0,n.encodeMessage)({type:n.MessageType.Response,id:r.id,hasContent:true,status:200,headers:earlyHeaders})).catch((()=>{}));sendRaw((0,n.encodeMessage)({type:n.MessageType.ResponseBodyChunk,id:r.id,end:false,data:spaceChunk})).catch((()=>{}));keepAliveTimer=setInterval((()=>{if(f.aborted)return;sendRaw((0,n.encodeMessage)({type:n.MessageType.ResponseBodyChunk,id:r.id,end:false,data:spaceChunk})).catch((()=>{}))}),5e3)}),12e3)}let g;let h=0;while(!g&&!f.aborted&&h++<i){if(h===1){c("Fetching",r.id,r.method,y)}else{c(`Retrying request (attempt ${h}/${i})`,r.id,r.method,y)}try{g=await(0,s.fetch)(y,{signal:d.signal,method:r.method,headers:o,body:p,connectTimeout:3e5,redirect:"manual"});c(`Request completed (attempt ${h})`,r.id,r.method,g.status,y)}catch(e){if(e?.code!=="ECONNREFUSED"){break}else{c("Request failed for request ID",r.id,e);g=undefined;await wait((h+1)*100)}}}clearKeepAlive();await sendChain.catch((()=>{}));if(!g){u.delete(r.id);if(!f.aborted){e.send((0,n.encodeMessage)({type:n.MessageType.ResponseAbort,id:r.id,errored:true}))}return}try{if(earlySent){if(g.status!==200||!g.body){e.send((0,n.encodeMessage)({type:n.MessageType.ResponseAbort,id:r.id,errored:true}))}else{for await(const chunk of(0,n.bodyToChunks)(g.body,{signal:f})){if(f.aborted)break;await sendRaw((0,n.encodeMessage)({type:n.MessageType.ResponseBodyChunk,id:r.id,end:chunk.done,data:chunk.value||null}))}}}else{for await(const t of encodeResponse(r.id,g,f)){await sendRaw(t)}}}catch{e.send((0,n.encodeMessage)({type:n.MessageType.ResponseAbort,id:r.id,errored:true}))}finally{clearKeepAlive();l.delete(r.id);u.delete(r.id)}';
  if (!tunnelSource.includes('isBundleKeepAlive')) {
    for (const candidate of [origProxiedFetch, prevPatchedProxiedFetch, prevPatchedProxiedFetch3e5]) {
      if (tunnelSource.includes(candidate)) {
        tunnelSource = tunnelSource.replace(candidate, nextPatchedProxiedFetch);
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(wsTunnelIndexJsPath, tunnelSource);
    console.log('[postinstall] Patched @expo/ws-tunnel DNS lookup fallback and reconnect stability.');
  }
}

const asyncWsTunnelJsPath = path.join(
  nodeModulesDir,
  '@expo',
  'cli',
  'build',
  'src',
  'start',
  'server',
  'AsyncWsTunnel.js',
);
if (fs.existsSync(asyncWsTunnelJsPath)) {
  const wsTunnelServerSrc = fs.readFileSync(asyncWsTunnelJsPath, 'utf8');
  const beforeStart = `        try {
            this.serverUrl = await _wstunnel().startAsync({
                ...await this.getTunnelOptionsAsync(),
                onStatusChange (status) {
                    if (status === 'disconnected') {
                        _log.error(_chalk().default.red('Tunnel connection has been closed. This is often related to intermittent connection problems with the tunnel service. Restart the dev server to try connecting again.') + _chalk().default.gray('\\nCheck the Expo status page for outages: https://status.expo.dev/'));
                    }
                }
            });
        } catch (error) {`;
  const afterStart = `        const onStatusChange = (status) => {
            if (status === 'disconnected') {
                _log.error(_chalk().default.red('Tunnel connection has been closed. This is often related to intermittent connection problems with the tunnel service. Restart the dev server to try connecting again.') + _chalk().default.gray('\\nCheck the Expo status page for outages: https://status.expo.dev/'));
            }
        };
        try {
            let tunnelOptions;
            try {
                tunnelOptions = await this.getTunnelOptionsAsync();
            } catch (optError) {
                if (this.options.useExpoAccount && this.port === 8081) {
                    tunnelOptions = getLegacyTunnelOptions(this.port);
                } else {
                    throw optError;
                }
            }
            try {
                this.serverUrl = await _wstunnel().startAsync({
                    ...tunnelOptions,
                    onStatusChange
                });
            } catch (primaryError) {
                if (this.options.useExpoAccount && this.port === 8081 && tunnelOptions.apiUrl) {
                    this.serverUrl = await _wstunnel().startAsync({
                        ...getLegacyTunnelOptions(this.port),
                        onStatusChange
                    });
                } else {
                    throw primaryError;
                }
            }
        } catch (error) {`;
  if (!wsTunnelServerSrc.includes('let tunnelOptions;') && wsTunnelServerSrc.includes(beforeStart)) {
    fs.writeFileSync(asyncWsTunnelJsPath, wsTunnelServerSrc.replace(beforeStart, afterStart));
    console.log('[postinstall] Patched @expo/cli AsyncWsTunnel fallback to legacy ws-tunnel.');
  }
}

const expoCliErrorsJsPath = path.join(
  nodeModulesDir,
  '@expo',
  'cli',
  'build',
  'src',
  'utils',
  'errors.js',
);
if (fs.existsSync(expoCliErrorsJsPath)) {
  const errorsSrc = fs.readFileSync(expoCliErrorsJsPath, 'utf8');
  const beforeErrors = `function handleTooManyOpenFileErrors(error) {
    // Only enable special logging when running on macOS and are running into the \`EMFILE\` error`;
  const afterErrors = `function handleTooManyOpenFileErrors(error) {
    if (error && typeof error === 'object' && ('code' in error) && ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code) && typeof error.hostname === 'string' && (error.hostname.endsWith('.on.expo.app') || error.hostname.endsWith('.boltexpo.dev') || error.hostname.endsWith('.exp.direct'))) {
        (0, _log.warn)(\`[tunnel] Transient network error for \${error.hostname} (\${error.code}); keeping dev server alive.\`);
        return;
    }
    // Only enable special logging when running on macOS and are running into the \`EMFILE\` error`;
  if (!errorsSrc.includes('.on.expo.app') && errorsSrc.includes(beforeErrors)) {
    fs.writeFileSync(expoCliErrorsJsPath, errorsSrc.replace(beforeErrors, afterErrors));
    console.log('[postinstall] Patched @expo/cli uncaughtException handler for transient tunnel DNS errors.');
  }
}

// 7. Ensure `expo export:embed` awaits devServerManager.stopAsync() and exits cleanly in Gradle Exec tasks.
const exportEmbedAsyncPath = path.join(
  nodeModulesDir,
  '@expo',
  'cli',
  'build',
  'src',
  'export',
  'embed',
  'exportEmbedAsync.js',
);
if (fs.existsSync(exportEmbedAsyncPath)) {
  let embedSource = fs.readFileSync(exportEmbedAsyncPath, 'utf8');
  const nextEmbedSource = embedSource
    .replace(
      '    } finally{\n        devServerManager.stopAsync();\n    }',
      '    } finally{\n        await devServerManager.stopAsync();\n    }',
    )
    .replace(
      '    await exportEmbedInternalAsync(projectRoot, options);\n    // Ensure the process closes after bundling\n    (0, _exit.ensureProcessExitsAfterDelay)();',
      '    await exportEmbedInternalAsync(projectRoot, options);\n    // Ensure the process closes after bundling\n    await new Promise((resolve) => setTimeout(resolve, 250));\n    process.exit(0);',
    );
  if (nextEmbedSource !== embedSource) {
    fs.writeFileSync(exportEmbedAsyncPath, nextEmbedSource);
    console.log('[postinstall] Patched @expo/cli exportEmbedAsync clean process exit for Gradle.');
  }
}

// 8. Ensure @expo/cli ManifestMiddleware keeps relative manifest URLs when requested and disables
// Metro lazy split-bundle storms (which otherwise re-bundle 1,000–2,500 duplicate modules per dynamic import).
const manifestMiddlewarePath = path.join(
  nodeModulesDir,
  '@expo',
  'cli',
  'build',
  'src',
  'start',
  'server',
  'middleware',
  'ManifestMiddleware.js',
);
if (fs.existsSync(manifestMiddlewarePath)) {
  const manifestSrc = fs.readFileSync(manifestMiddlewarePath, 'utf8');
  const nextManifestSrc = manifestSrc
    .replace(
      'await this.mutateManifestWithAssetsAsync(projectConfig.exp, absoluteBundleUrl, false);',
      'await this.mutateManifestWithAssetsAsync(projectConfig.exp, absoluteBundleUrl, !!shouldUseRelativeManifestUrls);',
    )
    .replace(/lazy:\s*!_env\.env\.EXPO_NO_METRO_LAZY/g, 'lazy: false');
  if (nextManifestSrc !== manifestSrc) {
    fs.writeFileSync(manifestMiddlewarePath, nextManifestSrc);
    console.log('[postinstall] Configured @expo/cli ManifestMiddleware single-bundle mode.');
  }
}

// 9. Patch expo-router renderRootComponent and entry-classic.js so entry.bundle renders
// X5StartupSplash on Frame 0 (hiding the native white splash immediately) and defers
// qualified-entry evaluation to the next tick so only a single X5 splash appears.
const renderRootComponentPath = path.join(
  nodeModulesDir,
  'expo-router',
  'build',
  'renderRootComponent.js',
);
if (fs.existsSync(renderRootComponentPath)) {
  const renderRootSrc = fs.readFileSync(renderRootComponentPath, 'utf8');
  const nextRenderRootSrc = renderRootSrc.replace(
    '        setTimeout(()=>{\n            _splash._internal_preventAutoHideAsync?.();\n        });\n        _react().startTransition(()=>{\n            (0, _expo().registerRootComponent)(Component);\n        });',
    '        _splash.hideAsync?.();\n        (0, _expo().registerRootComponent)(Component);',
  );
  if (nextRenderRootSrc !== renderRootSrc) {
    fs.writeFileSync(renderRootComponentPath, nextRenderRootSrc);
    console.log('[postinstall] Patched expo-router renderRootComponent for immediate X5StartupSplash handoff.');
  }
}

const entryClassicPath = path.join(nodeModulesDir, 'expo-router', 'entry-classic.js');
if (fs.existsSync(entryClassicPath)) {
  const entryClassicSrc = `// \`@expo/metro-runtime\` MUST be the first import to ensure Fast Refresh works
// on web.
import '@expo/metro-runtime';
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import {
  X5_STARTUP_SPLASH_PULSE_CYCLE_DURATION_MS,
  X5StartupSplash,
} from '../../src/components/X5StartupSplash';

try {
  SplashScreen.hide();
} catch {}

const splashStartMs = Date.now();

const DeferredAppHost = memo(function DeferredAppHost() {
  const [AppComp, setAppComp] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const mod = require('expo-router/build/qualified-entry');
      setAppComp(() => mod.App);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return AppComp ? React.createElement(AppComp) : null;
});

function StartupSplashOverlay() {
  const [appReady, setAppReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    try {
      SplashScreen.hide();
    } catch {}
    globalThis.__rtx5BootstrapSplashActive = true;
    globalThis.__rtx5NotifyAppReady = () => {
      setAppReady(true);
    };
    return () => {
      globalThis.__rtx5BootstrapSplashActive = false;
    };
  }, []);

  useEffect(() => {
    if (!appReady) return;
    const elapsed = Date.now() - splashStartMs;
    const remaining = Math.max(0, X5_STARTUP_SPLASH_PULSE_CYCLE_DURATION_MS - elapsed);
    const timer = setTimeout(() => {
      setSplashVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [appReady]);

  if (!splashVisible) {
    return null;
  }

  return React.createElement(
    View,
    { style: styles.overlay, pointerEvents: 'auto' },
    React.createElement(X5StartupSplash, {
      onLayout: () => {
        try {
          SplashScreen.hide();
        } catch {}
      },
    }),
  );
}

function BootstrapApp() {
  return React.createElement(
    View,
    { style: styles.root },
    React.createElement(DeferredAppHost),
    React.createElement(StartupSplashOverlay),
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0c10',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
  },
});

renderRootComponent(BootstrapApp);
`;
  const currentEntryClassic = fs.readFileSync(entryClassicPath, 'utf8');
  if (currentEntryClassic !== entryClassicSrc) {
    fs.writeFileSync(entryClassicPath, entryClassicSrc);
    console.log('[postinstall] Patched expo-router/entry-classic.js for Frame-0 X5StartupSplash and deferred qualified-entry.');
  }
}

const expoRootPath = path.join(nodeModulesDir, 'expo-router', 'build', 'ExpoRoot.js');
if (fs.existsSync(expoRootPath)) {
  const expoRootSrc = fs.readFileSync(expoRootPath, 'utf8');
  const nextExpoRootSrc = expoRootSrc.replace(
    'function ContextNavigator({ context, location: initialLocation = initialUrl, wrapper: WrapperComponent = _react().Fragment, linking = {} }) {',
    'const DEFAULT_LINKING_OPTIONS = {};\nfunction ContextNavigator({ context, location: initialLocation = initialUrl, wrapper: WrapperComponent = _react().Fragment, linking = DEFAULT_LINKING_OPTIONS }) {',
  );
  if (nextExpoRootSrc !== expoRootSrc) {
    fs.writeFileSync(expoRootPath, nextExpoRootSrc);
    console.log('[postinstall] Patched expo-router/build/ExpoRoot.js to stabilize default linking options.');
  }
}

const expoRedirectPath = path.join(nodeModulesDir, 'expo-router', 'build', 'link', 'Redirect.js');
if (fs.existsSync(expoRedirectPath)) {
  const redirectSrc = fs.readFileSync(expoRedirectPath, 'utf8');
  const nextRedirectSrc = redirectSrc.replace(
    `function Redirect({ href, relativeToDirectory, withAnchor }) {
    const router = (0, _useRouter.useRouter)();
    const isPreview = (0, _PreviewRouteContext.useIsPreview)();
    (0, _useFocusEffect.useFocusEffect)(()=>{
        if (!isPreview) {
            try {
                router.replace(href, {
                    relativeToDirectory,
                    withAnchor
                });
            } catch (error) {
                console.error(error);
            }
        }
    });
    return null;
}`,
    `const _react = require("react");
function Redirect({ href, relativeToDirectory, withAnchor }) {
    const router = (0, _useRouter.useRouter)();
    const isPreview = (0, _PreviewRouteContext.useIsPreview)();
    const didRedirectRef = _react.useRef(false);
    (0, _useFocusEffect.useFocusEffect)(_react.useCallback(()=>{
        if (!isPreview && !didRedirectRef.current) {
            didRedirectRef.current = true;
            try {
                router.replace(href, {
                    relativeToDirectory,
                    withAnchor
                });
            } catch (error) {
                console.error(error);
            }
        }
    }, [href, isPreview, relativeToDirectory, router, withAnchor]));
    return null;
}`,
  );
  if (nextRedirectSrc !== redirectSrc) {
    fs.writeFileSync(expoRedirectPath, nextRedirectSrc);
    console.log('[postinstall] Patched expo-router/build/link/Redirect.js to prevent duplicate replace dispatches.');
  }
}

const routerStoreStubPath = path.join(
  nodeModulesDir,
  'expo-router',
  'build',
  'global-state',
  'router-store.js',
);
if (
  fs.existsSync(path.dirname(routerStoreStubPath)) &&
  !fs.existsSync(routerStoreStubPath)
) {
  fs.writeFileSync(routerStoreStubPath, '"use strict";\nmodule.exports = { store: null };\n');
}

// 10. Prevent @expo/metro-config serializer, metro URL option parser, and expo asyncRequireModule
// from enabling lazy split-bundle storms when Expo Go appends lazy=true on Android.
const metroParseBundleOptionsPath = path.join(
  nodeModulesDir,
  'metro',
  'src',
  'lib',
  'parseBundleOptionsFromBundleRequestUrl.js',
);
if (fs.existsSync(metroParseBundleOptionsPath)) {
  const parseSrc = fs.readFileSync(metroParseBundleOptionsPath, 'utf8');
  const nextParseSrc = parseSrc.replace(
    'lazy: getBoolQueryParam(searchParams, "lazy", false),',
    'lazy: false,',
  );
  if (nextParseSrc !== parseSrc) {
    fs.writeFileSync(metroParseBundleOptionsPath, nextParseSrc);
    console.log('[postinstall] Patched metro parseBundleOptionsFromBundleRequestUrl.js to force lazy: false.');
  }
}

const expoMetroOptionsPath = path.join(
  nodeModulesDir,
  '@expo',
  'cli',
  'build',
  'src',
  'start',
  'server',
  'middleware',
  'metroOptions.js',
);
if (fs.existsSync(expoMetroOptionsPath)) {
  const metroOptsSrc = fs.readFileSync(expoMetroOptionsPath, 'utf8');
  const nextMetroOptsSrc = metroOptsSrc.replace(
    "lazy: isTruthy(getStringParam('lazy') ?? 'false'),",
    'lazy: false,',
  );
  if (nextMetroOptsSrc !== metroOptsSrc) {
    fs.writeFileSync(expoMetroOptionsPath, nextMetroOptsSrc);
    console.log('[postinstall] Patched @expo/cli metroOptions.js to force lazy: false.');
  }
}

const expoSerializerJsPath = path.join(
  nodeModulesDir,
  '@expo',
  'metro-config',
  'build',
  'serializer',
  'fork',
  'js.js',
);
if (fs.existsSync(expoSerializerJsPath)) {
  const serializerSrc = fs.readFileSync(expoSerializerJsPath, 'utf8');
  const nextSerializerSrc = serializerSrc
    .replace(
      `            } else if (options.includeAsyncPaths) {
                if (options.sourceUrl) {
                    hasPaths = true;
                    // TODO: Only include path if the target is not in the bundle
                    // Construct a server-relative URL for the split bundle, propagating
                    // most parameters from the main bundle's URL.
                    const { searchParams } = new URL(_jscsafeurl().default.toNormalUrl(options.sourceUrl));`,
      `            } else if (options.includeAsyncPaths) {
                const { searchParams } = options.sourceUrl
                    ? new URL(_jscsafeurl().default.toNormalUrl(options.sourceUrl))
                    : { searchParams: new URLSearchParams() };
                if (options.sourceUrl && dependency.data.data.asyncType === 'worker') {
                    hasPaths = true;`,
    )
    .replace(
      "if (options.sourceUrl && (dependency.data.data.asyncType === 'worker' || searchParams.get('lazy') === 'true')) {",
      "if (options.sourceUrl && dependency.data.data.asyncType === 'worker') {",
    );
  if (nextSerializerSrc !== serializerSrc) {
    fs.writeFileSync(expoSerializerJsPath, nextSerializerSrc);
    console.log('[postinstall] Patched @expo/metro-config serializer/fork/js.js to skip split bundle paths when lazy=false.');
  }
}

const asyncRequireModulePath = path.join(
  nodeModulesDir,
  'expo',
  'build',
  'async-require',
  'asyncRequireModule.js',
);
if (fs.existsSync(asyncRequireModulePath)) {
  const asyncReqSrc = fs.readFileSync(asyncRequireModulePath, 'utf8');
  const targetFn = `function maybeLoadBundle(moduleID, paths) {
    const loadBundle = globalThis[\`\${__METRO_GLOBAL_PREFIX__ ?? ''}__loadBundleAsync\`];`;
  const replacementFn = `function maybeLoadBundle(moduleID, paths) {
    const metroReq = typeof __r === 'function' ? __r : typeof require === 'function' ? require : null;
    const modules = metroReq && typeof metroReq.getModules === 'function' ? metroReq.getModules() : null;
    if (modules && (typeof modules.has === 'function' ? modules.has(moduleID) || modules.has(Number(moduleID)) : modules[moduleID] != null)) {
        return undefined;
    }
    const loadBundle = globalThis[\`\${__METRO_GLOBAL_PREFIX__ ?? ''}__loadBundleAsync\`];`;
  const nextAsyncReqSrc = asyncReqSrc.replace(targetFn, replacementFn);
  if (nextAsyncReqSrc !== asyncReqSrc) {
    fs.writeFileSync(asyncRequireModulePath, nextAsyncReqSrc);
    console.log('[postinstall] Patched expo/build/async-require/asyncRequireModule.js to resolve in-bundle modules synchronously.');
  }
}






import type { BottomTabNavigationEventMap } from '@react-navigation/bottom-tabs';
import type { NavigationHelpers, ParamListBase, Route } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/routers';
import { createContext } from 'react';
import { clearFastTabVisual, fastTabVisualController, setFastTabActualRoute } from './fastTabVisualController';

type TabPressNavigation = Pick<
  NavigationHelpers<ParamListBase, BottomTabNavigationEventMap>,
  'dispatch' | 'emit' | 'getState'
>;

// Screen navigation objects intentionally omit emit(). The tab-bar host
// supplies the navigator helpers that own tabPress events and live tab state.
export const FastTabPressNavigationContext = createContext<TabPressNavigation | null>(null);

/** Commit using live navigator state, including rapid taps back to the current tab. */
export function commitFastTabPress(
  navigation: TabPressNavigation,
  route: Route<string>,
  visualRevision: number | null,
): boolean {
  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
  if (event.defaultPrevented) {
    if (visualRevision !== null) clearFastTabVisual(visualRevision);
    return false;
  }
  if (visualRevision !== null && fastTabVisualController.getSnapshot().revision !== visualRevision) return false;

  // BottomTabBar's standard handler captures `focused` at render time. That
  // value can be obsolete by the time our after-paint callback runs.
  const state = navigation.getState();
  const targetRoute = state.routes.find(candidate => candidate.key === route.key);
  if (!targetRoute) {
    if (visualRevision !== null) clearFastTabVisual(visualRevision);
    return false;
  }
  if (state.routes[state.index]?.key !== route.key) {
    navigation.dispatch({ ...CommonActions.navigate(targetRoute), target: state.key });
  }

  // Already-focused taps do not cause a React route effect. Explicitly adopt
  // the live route so their optimistic selection cannot survive for 5s and
  // override a subsequent Back/programmatic navigation.
  const committedState = navigation.getState();
  if (committedState.routes[committedState.index]?.key === route.key) {
    setFastTabActualRoute(route.name);
  }
  return true;
}

import type { ComponentType } from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefCallback } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { AboutScreenInner } from '../../features/settings/AboutScreen';
import { AccountsScreenInner } from '../../features/settings/AccountsScreen';
import { EconomicCalendarScreenInner } from '../../features/settings/EconomicCalendarScreen/EconomicCalendarScreen';
import { HelpScreenInner } from '../../features/settings/HelpScreen';
import { InterfaceScreenInner } from '../../features/settings/InterfaceScreen';
import { JournalScreenInner } from '../../features/settings/JournalScreen/JournalScreen';
import { UserGuideScreenInner } from '../../features/settings/UserGuideScreen';
import {
  SIDEBAR_HOST_DESTINATIONS,
  sidebarDestinationController,
  type SidebarDestinationController,
  type SidebarHostDestination,
} from './sidebarDestinationHostController';
import { ThemeModeRenderPriorityContext } from '../../state/themeMode';
import { registerInteractionLifecycleHandler } from '../../utils/interactionLifecycle';

export type SidebarDestinationViewProps = Readonly<{
  /**
   * The host keeps active-aware views mounted and changes only this flag. A
   * view must gate focus-only queries, timers, animation and large bodies with
   * it, while leaving its lightweight header mounted.
   */
  active: boolean;
}>;

export type SidebarDestinationAdapter = Readonly<{
  View: ComponentType<SidebarDestinationViewProps>;
  /** True only when View is safe to mount with active=false. */
  supportsInactiveMount: boolean;
}>;

export type SidebarDestinationRegistry = Readonly<
  Record<SidebarHostDestination, SidebarDestinationAdapter>
>;

export type ActiveAwareSidebarFeatureViewProps = Readonly<{
  isScreenFocused: boolean;
}>;

/**
 * Adapts the existing feature-view prop to the host contract. After each
 * private *ScreenInner is exported, this helper is the only adapter boilerplate
 * needed to make its lightweight shell eagerly mountable.
 */
export function createActiveAwareSidebarDestinationAdapter(
  ScreenView: ComponentType<ActiveAwareSidebarFeatureViewProps>,
): SidebarDestinationAdapter {
  const ActiveAwareView = memo(function ActiveAwareView({ active }: SidebarDestinationViewProps) {
    return <ScreenView isScreenFocused={active} />;
  });

  return Object.freeze({
    View: ActiveAwareView,
    supportsInactiveMount: true,
  });
}

/**
 * The sidebar-only destinations stay mounted as lightweight, inactive-aware
 * header shells. Their native bodies are focus-gated and unmount after hide,
 * while readiness remains warm so the next focused reveal can build content
 * without route construction or a loading preview.
 */
export const SIDEBAR_DESTINATION_COMPATIBILITY_REGISTRY: SidebarDestinationRegistry = Object.freeze({
  journal: createActiveAwareSidebarDestinationAdapter(JournalScreenInner),
  'economic-calendar': createActiveAwareSidebarDestinationAdapter(EconomicCalendarScreenInner),
  'user-guide': createActiveAwareSidebarDestinationAdapter(UserGuideScreenInner),
  help: createActiveAwareSidebarDestinationAdapter(HelpScreenInner),
  about: createActiveAwareSidebarDestinationAdapter(AboutScreenInner),
  accounts: createActiveAwareSidebarDestinationAdapter(AccountsScreenInner),
  interface: createActiveAwareSidebarDestinationAdapter(InterfaceScreenInner),
});

export type SidebarDestinationHostProps = Readonly<{
  controller?: SidebarDestinationController;
  registry?: SidebarDestinationRegistry;
  onVisibilityChange?: (visible: boolean, destination: SidebarHostDestination | null) => void;
}>;

type SidebarDestinationLayerProps = Readonly<{
  destination: SidebarHostDestination;
  adapter: SidebarDestinationAdapter;
  active: boolean;
  /**
   * React-committed visibility from the controller's synchronous visual
   * subscription. The Reanimated flip and this plain style drive the same
   * swap through two independent engines; whichever lands first shows or
   * hides the layer (each alone was observed lagging >1s on a congested
   * fresh-boot JS loop).
   */
  visualActive: boolean;
  layerRef: RefCallback<View>;
}>;

const SidebarDestinationLayer = memo(function SidebarDestinationLayer({
  destination,
  adapter,
  active,
  visualActive,
  layerRef,
}: SidebarDestinationLayerProps) {
  const DestinationView = adapter.View;

  return (
    <View
      ref={layerRef}
      collapsable={false}
      style={[
        styles.destination,
        visualActive ? styles.destinationVisible : styles.destinationHidden,
      ]}
      pointerEvents={visualActive ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      testID={`sidebar-destination-${destination}`}
    >
      <ThemeModeRenderPriorityContext.Provider value="retained">
        <DestinationView active={active} />
      </ThemeModeRenderPriorityContext.Provider>
    </View>
  );
});

/**
 * Root-level, navigation-independent host for sidebar-only detail pages.
 *
 * Place it as a sibling immediately above the root Stack and immediately below
 * SidebarDrawer. Trade/Settings remain real bottom tabs; selecting either must
 * hide this host before the normal mounted-tab navigation runs.
 */
export const SidebarDestinationHost = memo(function SidebarDestinationHost({
  controller = sidebarDestinationController,
  registry = SIDEBAR_DESTINATION_COMPATIBILITY_REGISTRY,
  onVisibilityChange,
}: SidebarDestinationHostProps) {
  const layerRefs = useRef<Partial<Record<SidebarHostDestination, View | null>>>({});
  const nativeVisualDestinationRef = useRef<SidebarHostDestination | null>(
    controller.getSnapshot().activeDestination,
  );
  const layerRefSetters = useMemo(() => Object.fromEntries(
    SIDEBAR_HOST_DESTINATIONS.map((destination) => [
      destination,
      (layer: View | null) => {
        layerRefs.current[destination] = layer;
        if (layer) {
          const visible = controller.getSnapshot().activeDestination === destination;
          layer.setNativeProps({
            accessibilityElementsHidden: !visible,
            importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
            pointerEvents: visible ? 'auto' : 'none',
            style: visible ? styles.destinationVisible : styles.destinationHidden,
          });
        }
      },
    ]),
  ) as Record<SidebarHostDestination, RefCallback<View>>, [controller]);
  const sweepVisualDestinationNow = useCallback((visualDestination: SidebarHostDestination | null) => {
    for (const destination of SIDEBAR_HOST_DESTINATIONS) {
      const visible = destination === visualDestination;
      layerRefs.current[destination]?.setNativeProps({
        accessibilityElementsHidden: !visible,
        importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
        pointerEvents: visible ? 'auto' : 'none',
        style: visible ? styles.destinationVisible : styles.destinationHidden,
      });
    }
    nativeVisualDestinationRef.current = visualDestination;
  }, []);
  const applyVisualDestinationNow = useCallback((visualDestination: SidebarHostDestination | null) => {
    const previousDestination = nativeVisualDestinationRef.current;
    // Reveal the replacement before hiding the previous layer, so its cached
    // header never flashes the underlying tab's hamburger during the swap.
    if (visualDestination) {
      layerRefs.current[visualDestination]?.setNativeProps({
        pointerEvents: 'auto',
        style: [styles.destination, styles.destinationVisible],
      });
    }
    if (previousDestination && previousDestination !== visualDestination) {
      layerRefs.current[previousDestination]?.setNativeProps({
        pointerEvents: 'none',
        style: [styles.destination, styles.destinationHidden],
      });
    }
    nativeVisualDestinationRef.current = visualDestination;
  }, []);
  useLayoutEffect(() => registerInteractionLifecycleHandler(phase => {
    if (phase === 'resume') sweepVisualDestinationNow(controller.getSnapshot().activeDestination);
  }), [controller, sweepVisualDestinationNow]);
  // Focus/query state rides the deliberately after-paint subscription
  // so heavy destination work never runs in the tap turn...
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getFocusSnapshot,
    controller.getFocusSnapshot,
  );
  const activeDestination = snapshot.activeDestination;
  // Visibility is applied imperatively in the touch turn. React adopts the
  // same value with the intentionally delayed focus snapshot; subscribing a
  // second time here reconciled all seven retained screens during the tap.
  const visualDestination = controller.getSnapshot().activeDestination;

  useEffect(() => {
    onVisibilityChange?.(activeDestination !== null, activeDestination);
  }, [activeDestination, onVisibilityChange]);

  useLayoutEffect(() => {
    let firstApplication = true;
    return controller.registerVisualApplier((destination) => {
      if (firstApplication) {
        firstApplication = false;
        sweepVisualDestinationNow(destination);
        return;
      }
      applyVisualDestinationNow(destination);
    });
  }, [applyVisualDestinationNow, controller, sweepVisualDestinationNow]);

  useEffect(() => {
    // The retained visual layer switches before focus subscribers are
    // notified. Read the controller directly so hardware Back is intercepted
    // during that intentional focus delay as well as after the
    // React commit.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!controller.isVisible()) {
        return false;
      }
      if (controller.requestBack()) {
        return true;
      }
      controller.hide();
      return true;
    });
    return () => subscription.remove();
  }, [controller]);

  if (!activeDestination && !visualDestination) {
    const hasEagerAdapter = SIDEBAR_HOST_DESTINATIONS.some(
      (destination) => registry[destination].supportsInactiveMount,
    );
    if (!hasEagerAdapter) {
      return null;
    }
  }

  return (
    <View
      style={styles.host}
      pointerEvents="box-none"
      accessibilityElementsHidden={!activeDestination}
      importantForAccessibility={activeDestination ? 'auto' : 'no-hide-descendants'}
      testID="sidebar-destination-host"
    >
      {SIDEBAR_HOST_DESTINATIONS.map((destination) => {
        const adapter = registry[destination];
        const active = activeDestination === destination;
        const visualActive = visualDestination === destination;
        if (!active && !visualActive && !adapter.supportsInactiveMount) {
          return null;
        }

        return (
          <SidebarDestinationLayer
            key={destination}
            destination={destination}
            adapter={adapter}
            active={active}
            visualActive={visualActive}
            layerRef={layerRefSetters[destination]}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  destination: {
    ...StyleSheet.absoluteFillObject,
  },
  destinationVisible: {
    opacity: 1,
    zIndex: 1,
  },
  destinationHidden: {
    opacity: 0,
    zIndex: 0,
  },
});

import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  createChartTradeSheetPortalController,
  type ChartTradeSheetPortalController,
} from './chartTradeSheetPortalController';

const ChartTradeSheetPortalContext = createContext<ChartTradeSheetPortalController | null>(null);
// Trade execution feedback (receipt bar / result dialog) must stack ABOVE the
// sheet entry, so it gets its own single-slot controller and host.
const ChartTradeFeedbackPortalContext = createContext<ChartTradeSheetPortalController | null>(null);

export function ChartTradeSheetPortalProvider({ children }: PropsWithChildren) {
  const controllerRef = useRef<ChartTradeSheetPortalController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createChartTradeSheetPortalController();
  }
  const feedbackControllerRef = useRef<ChartTradeSheetPortalController | null>(null);
  if (feedbackControllerRef.current === null) {
    feedbackControllerRef.current = createChartTradeSheetPortalController();
  }

  return (
    <ChartTradeSheetPortalContext.Provider value={controllerRef.current}>
      <ChartTradeFeedbackPortalContext.Provider value={feedbackControllerRef.current}>
        {children}
      </ChartTradeFeedbackPortalContext.Provider>
    </ChartTradeSheetPortalContext.Provider>
  );
}

type ChartTradeSheetPortalProps = PropsWithChildren<{
  enabled: boolean;
  keepMounted: boolean;
  visible: boolean;
  top: number;
  bottom: number;
}>;

/** Moves one live sheet branch above tab chrome without a native Modal/window. */
export function ChartTradeSheetPortal({
  bottom,
  children,
  enabled,
  keepMounted,
  top,
  visible,
}: ChartTradeSheetPortalProps) {
  const controller = useContext(ChartTradeSheetPortalContext);
  const ownerRef = useRef<symbol | null>(null);
  const latestChildrenRef = useRef<ReactNode>(children);
  latestChildrenRef.current = children;
  if (ownerRef.current === null) {
    ownerRef.current = Symbol('chart-trade-sheet-portal-owner');
  }
  const owner = ownerRef.current;
  const renderCurrent = useCallback(() => latestChildrenRef.current, []);

  useLayoutEffect(() => {
    if (!controller || !enabled) {
      return undefined;
    }
    return controller.register(owner, renderCurrent);
  }, [controller, enabled, owner, renderCurrent]);

  useLayoutEffect(() => {
    if (!controller || !enabled) {
      return;
    }

    const presentationChanged = controller.setPresentation(owner, {
      keepMounted,
      visible,
      top,
      bottom,
    });
    if (!presentationChanged && visible) {
      controller.invalidate(owner);
    }
  }, [bottom, children, controller, enabled, keepMounted, owner, top, visible]);

  return controller && enabled ? null : <>{children}</>;
}

const SubscribedChartTradeSheetPortalHost = memo(function SubscribedChartTradeSheetPortalHost({
  controller,
}: {
  controller: ChartTradeSheetPortalController;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  if (!snapshot.keepMounted || !snapshot.renderCurrent) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={styles.host}
      testID="chart-trade-sheet-portal-host"
    >
      <View
        pointerEvents={snapshot.visible ? 'box-none' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.entry,
          {
            top: snapshot.top,
            bottom: snapshot.bottom,
            opacity: snapshot.visible ? 1 : 0,
          },
          snapshot.visible && styles.entryVisible,
        ]}
      >
        {snapshot.renderCurrent()}
      </View>
    </View>
  );
});

export function ChartTradeSheetPortalHost() {
  const controller = useContext(ChartTradeSheetPortalContext);
  return controller
    ? <SubscribedChartTradeSheetPortalHost controller={controller} />
    : null;
}

type ChartTradeFeedbackPortalProps = PropsWithChildren<{
  /**
   * When true, the children render through the elevated feedback host (above
   * the trade sheet). When false they render inline, exactly where declared —
   * the normal chart flow is untouched.
   */
  enabled: boolean;
}>;

/**
 * Lifts trade execution feedback (receipt bar, success/error dialog) above the
 * SL/TP trade sheet. The sheet portals over the whole tab scene, so feedback
 * declared inside ChartScreen would otherwise be buried underneath it.
 */
export function ChartTradeFeedbackPortal({ children, enabled }: ChartTradeFeedbackPortalProps) {
  const controller = useContext(ChartTradeFeedbackPortalContext);
  const ownerRef = useRef<symbol | null>(null);
  const latestChildrenRef = useRef<ReactNode>(children);
  latestChildrenRef.current = children;
  if (ownerRef.current === null) {
    ownerRef.current = Symbol('chart-trade-feedback-portal-owner');
  }
  const owner = ownerRef.current;
  const renderCurrent = useCallback(() => latestChildrenRef.current, []);

  useLayoutEffect(() => {
    if (!controller || !enabled) {
      return undefined;
    }
    return controller.register(owner, renderCurrent);
  }, [controller, enabled, owner, renderCurrent]);

  useLayoutEffect(() => {
    if (!controller || !enabled) {
      return;
    }
    // Full-screen entry; visibility is managed by the children themselves.
    const presentationChanged = controller.setPresentation(owner, {
      keepMounted: true,
      visible: true,
      top: 0,
      bottom: 0,
    });
    if (!presentationChanged) {
      controller.invalidate(owner);
    }
  }, [children, controller, enabled, owner]);

  return controller && enabled ? null : <>{children}</>;
}

const SubscribedChartTradeFeedbackPortalHost = memo(function SubscribedChartTradeFeedbackPortalHost({
  controller,
}: {
  controller: ChartTradeSheetPortalController;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  if (!snapshot.keepMounted || !snapshot.renderCurrent) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={styles.feedbackHost}
      testID="chart-trade-feedback-portal-host"
    >
      {snapshot.renderCurrent()}
    </View>
  );
});

export function ChartTradeFeedbackPortalHost() {
  const controller = useContext(ChartTradeFeedbackPortalContext);
  return controller
    ? <SubscribedChartTradeFeedbackPortalHost controller={controller} />
    : null;
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    elevation: 37,
    pointerEvents: 'box-none',
    zIndex: 37,
  },
  entry: {
    position: 'absolute',
    left: 0,
    right: 0,
    elevation: 0,
    zIndex: 0,
  },
  entryVisible: {
    // Above bottom tab chrome; below OrderTicketLaunchHost (38/39).
    elevation: 37,
    zIndex: 37,
  },
  feedbackHost: {
    ...StyleSheet.absoluteFillObject,
    // Above the trade sheet entry (37); declared before OrderTicketLaunchHost
    // so the launch shell still wins ties.
    elevation: 38,
    pointerEvents: 'box-none',
    zIndex: 38,
  },
});

import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { HistoryFilterScreen } from './HistoryFilterScreen';
import {
  historyFilterHostController,
  hideHistoryFilterHost,
} from './historyFilterHostController';

/**
 * Chart-options-class retained host for History date filter (clock icon).
 * The native layer stays retained, while the interactive calendar only exists
 * for the visible lifetime of the host.
 */
export const HistoryFilterHost = memo(function HistoryFilterHost() {
  const layerRef = useRef<View | null>(null);
  const snapshot = useSyncExternalStore(
    historyFilterHostController.subscribe,
    historyFilterHostController.getSnapshot,
    historyFilterHostController.getSnapshot,
  );

  const writeVisibilityNow = useCallback((visible: boolean) => {
    layerRef.current?.setNativeProps({
      accessibilityElementsHidden: !visible,
      importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
      pointerEvents: visible ? 'auto' : 'none',
      style: visible ? styles.layerVisible : styles.layerHidden,
    });
  }, []);

  useEffect(
    () => historyFilterHostController.registerVisualApplier(writeVisibilityNow),
    [writeVisibilityNow],
  );

  const closeHost = useCallback(() => {
    hideHistoryFilterHost();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!historyFilterHostController.isVisible()) {
        return false;
      }
      closeHost();
      return true;
    });
    return () => subscription.remove();
  }, [closeHost]);

  const active = snapshot.visible;

  return (
    <View
      pointerEvents="box-none"
      style={styles.hostRoot}
      testID="history-filter-host"
    >
      <View
        ref={layerRef}
        collapsable={false}
        pointerEvents={active ? 'auto' : 'none'}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, active ? styles.layerVisible : styles.layerHidden]}
        testID="history-filter-host-layer"
      >
        {active ? (
          <HistoryFilterScreen
            hosted
            hostedActive
            onHostedBack={closeHost}
          />
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    // Above History tab chrome; below ActionSheet (9999) and RegisterLaunch (50).
    elevation: 42,
    zIndex: 42,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  layerHidden: {
    elevation: 0,
    opacity: 0,
    zIndex: 0,
  },
  layerVisible: {
    elevation: 43,
    opacity: 1,
    zIndex: 43,
  },
});

import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { ChartSettingsScreen } from './ChartSettingsScreen';
import {
  chartSettingsHostController,
  hideChartSettingsHost,
} from './chartSettingsHostController';
import { hideChartConfigDestination } from './chartConfigDestinationController';

/**
 * Sidebar-style retained host for Chart Preferences (toolbar options icon).
 * The native layer stays retained, while the interactive settings tree only
 * exists for the visible lifetime of the host.
 */
export const ChartSettingsHost = memo(function ChartSettingsHost() {
  const layerRef = useRef<View | null>(null);
  const snapshot = useSyncExternalStore(
    chartSettingsHostController.subscribe,
    chartSettingsHostController.getSnapshot,
    chartSettingsHostController.getSnapshot,
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
    () => chartSettingsHostController.registerVisualApplier(writeVisibilityNow),
    [writeVisibilityNow],
  );

  const closeHost = useCallback(() => {
    // Close nested config layers first so they never flash over the chart.
    hideChartConfigDestination();
    hideChartSettingsHost();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!chartSettingsHostController.isVisible()) {
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
      testID="chart-settings-host"
    >
      <View
        ref={layerRef}
        collapsable={false}
        pointerEvents={active ? 'auto' : 'none'}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, active ? styles.layerVisible : styles.layerHidden]}
        testID="chart-settings-host-layer"
      >
        {active ? (
          <ChartSettingsScreen
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
    // Above chart chrome / tabs; below ChartConfigDestinationHost (40) and ActionSheet (9999).
    elevation: 35,
    zIndex: 35,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    // ChartSettingsScreen paints its own opaque T.bg; keep this neutral so light
    // mode does not flash a dark plate when the retained layer appears.
    backgroundColor: 'transparent',
  },
  layerHidden: {
    elevation: 0,
    opacity: 0,
    zIndex: 0,
  },
  layerVisible: {
    elevation: 36,
    opacity: 1,
    zIndex: 36,
  },
});

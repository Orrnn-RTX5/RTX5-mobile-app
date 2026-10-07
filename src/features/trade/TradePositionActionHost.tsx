import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { CloseByScreen } from './CloseByScreen';
import { ClosePositionScreen } from './ClosePositionScreen';
import { ModifyPositionScreen } from './ModifyPositionScreen';
import {
  hideTradePositionActionHost,
  tradePositionActionHostController,
} from './tradePositionActionHostController';

/**
 * Chart-options-class retained host for Close / Close By / Modify.
 * The native cover stays retained, while only the visible position-action
 * screen is mounted.
 */
export const TradePositionActionHost = memo(function TradePositionActionHost() {
  const layerRef = useRef<View | null>(null);
  const snapshot = useSyncExternalStore(
    tradePositionActionHostController.subscribe,
    tradePositionActionHostController.getSnapshot,
    tradePositionActionHostController.getSnapshot,
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
    () => tradePositionActionHostController.registerVisualApplier(writeVisibilityNow),
    [writeVisibilityNow],
  );

  const closeHost = useCallback(() => {
    hideTradePositionActionHost();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!tradePositionActionHostController.isVisible()) {
        return false;
      }
      closeHost();
      return true;
    });
    return () => subscription.remove();
  }, [closeHost]);

  const active = snapshot.visible;
  const destination = snapshot.destination;
  const positionId = snapshot.positionId;

  return (
    <View
      pointerEvents="box-none"
      style={styles.hostRoot}
      testID="trade-position-action-host"
    >
      <View
        ref={layerRef}
        collapsable={false}
        pointerEvents={active ? 'auto' : 'none'}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, active ? styles.layerVisible : styles.layerHidden]}
        testID="trade-position-action-host-layer"
      >
        {active && destination === 'close' ? (
          <View
            pointerEvents="auto"
            style={styles.panelVisible}
          >
            <ClosePositionScreen
              hosted
              hostedActive
              hostedPositionId={positionId}
              onHostedBack={closeHost}
            />
          </View>
        ) : null}

        {active && destination === 'close-by' ? (
          <View
            pointerEvents="auto"
            style={styles.panelVisible}
          >
            <CloseByScreen
              hosted
              hostedActive
              hostedPositionId={positionId}
              onHostedBack={closeHost}
            />
          </View>
        ) : null}

        {active && destination === 'modify' ? (
          <View
            pointerEvents="auto"
            style={styles.panelVisible}
          >
            <ModifyPositionScreen
              hosted
              hostedActive
              hostedPositionId={positionId}
              onHostedBack={closeHost}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    // Above Trade tab chrome; below ActionSheet (9999).
    elevation: 44,
    zIndex: 44,
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
    elevation: 45,
    opacity: 1,
    zIndex: 45,
  },
  panelVisible: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
    zIndex: 1,
  },
});

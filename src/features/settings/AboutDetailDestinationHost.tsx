import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { DeveloperContactRequestScreen } from './AboutScreen';
import { LegalDocumentScreen } from './LegalDocumentScreen';
import { requestBugReportClose } from './bugReportRuntime';
import {
  ABOUT_DETAIL_DESTINATIONS,
  aboutDetailDestinationController,
  type AboutDetailDestination,
} from './aboutDetailDestinationController';

/**
 * Sidebar-style retained host for About action rows that are not already
 * sidebar destinations (User Guide is). Native layers stay retained, while
 * only the active detail screen is mounted.
 */
export const AboutDetailDestinationHost = memo(function AboutDetailDestinationHost() {
  const layerRefs = useRef<Partial<Record<AboutDetailDestination, View | null>>>({});
  const snapshot = useSyncExternalStore(
    aboutDetailDestinationController.subscribe,
    aboutDetailDestinationController.getSnapshot,
    aboutDetailDestinationController.getSnapshot,
  );

  const writeVisibilityNow = useCallback((destination: AboutDetailDestination | null) => {
    for (const key of ABOUT_DETAIL_DESTINATIONS) {
      const layer = layerRefs.current[key];
      const visible = destination === key;
      layer?.setNativeProps({
        accessibilityElementsHidden: !visible,
        importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
        pointerEvents: visible ? 'auto' : 'none',
        style: visible ? styles.layerVisible : styles.layerHidden,
      });
    }
  }, []);

  useEffect(
    () => aboutDetailDestinationController.registerVisualApplier(writeVisibilityNow),
    [writeVisibilityNow],
  );

  const closeHost = useCallback(() => {
    aboutDetailDestinationController.hide();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!aboutDetailDestinationController.isVisible()) {
        return false;
      }
      if (aboutDetailDestinationController.getSnapshot().destination === 'contact-developer') requestBugReportClose(closeHost);
      else closeHost();
      return true;
    });
    return () => subscription.remove();
  }, [closeHost]);

  return (
    <View
      pointerEvents="box-none"
      style={styles.hostRoot}
      testID="about-detail-destination-host"
    >
      {ABOUT_DETAIL_DESTINATIONS.map((destination) => {
        const active = snapshot.visible && snapshot.destination === destination;
        return (
          <View
            key={destination}
            ref={(layer) => {
              layerRefs.current[destination] = layer;
            }}
            collapsable={false}
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            style={[styles.layer, active ? styles.layerVisible : styles.layerHidden]}
            testID={`about-detail-destination-${destination}`}
          >
            {active && destination === 'privacy-policy' ? (
              <LegalDocumentScreen
                document="privacy"
                hosted
                hostedActive
                onHostedBack={closeHost}
              />
            ) : null}
            {active && destination === 'account-deletion' ? (
              <DeveloperContactRequestScreen
                mode="account-deletion"
                hosted
                hostedActive
                onHostedBack={closeHost}
              />
            ) : null}
            {active && destination === 'contact-developer' ? (
              <DeveloperContactRequestScreen
                mode="contact-developer"
                hosted
                hostedActive
                onHostedBack={closeHost}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    // Above SidebarDestinationHost (20); below ChartSettingsHost (35) / ActionSheet.
    elevation: 28,
    zIndex: 28,
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
    elevation: 29,
    opacity: 1,
    zIndex: 29,
  },
});

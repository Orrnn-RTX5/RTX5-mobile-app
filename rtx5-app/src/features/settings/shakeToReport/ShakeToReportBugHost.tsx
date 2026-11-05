import { usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Keyboard, Modal, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useTheme } from '../../../ui/theme/useTheme';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import { BugReportScreen } from '../BugReportScreen';
import { primeBugReportContext, requestBugReportClose } from '../bugReportRuntime';
import { aboutDetailDestinationController } from '../aboutDetailDestinationController';
import { subscribeToShake } from './shakeSubscription';
import { createReanimatedShakeSensorBridge } from './reanimatedShakeSensorBridge';
import { ReanimatedShakeMotionSensor } from './ReanimatedShakeMotionSensor';

export function ShakeToReportBugHost() {
  const T = useTheme();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const openRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const sensorBridge = useMemo(createReanimatedShakeSensorBridge, []);
  const sensorGeneration = useSyncExternalStore(
    sensorBridge.subscribeActivity, sensorBridge.getSnapshot, sensorBridge.getSnapshot,
  );

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    return subscribeToShake({
      loadSensor: async () => sensorBridge.sensor,
      lifecycle: AppState,
      canOpen: () => {
        const detail = aboutDetailDestinationController.getSnapshot();
        return !openRef.current
          && pathnameRef.current !== '/settings/contact-developer'
          && !(detail.visible && detail.destination === 'contact-developer');
      },
      onShake: () => {
        primeBugReportContext(pathnameRef.current);
        openRef.current = true;
        Keyboard.dismiss();
        setVisible(true);
      },
    });
  }, [sensorBridge]);

  const close = useCallback(() => {
    setVisible(false);
    openRef.current = false;
  }, []);

  return (
    <>
      {sensorGeneration > 0 && (Platform.OS === 'android' || Platform.OS === 'ios') ? (
        <ReanimatedShakeMotionSensor
          key={sensorGeneration}
          generation={sensorGeneration}
          onSample={sensorBridge.emit}
        />
      ) : null}
      <Modal
        {...OVERLAY_MODAL_PROPS}
        visible={visible}
        animationType="none"
        onRequestClose={() => requestBugReportClose(close)}
      >
        <SafeAreaProvider style={{ flex: 1, backgroundColor: T.bg }}>
          {visible ? <ShakeBugReportPage onClose={close} /> : null}
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

function ShakeBugReportPage({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const dark = useIsDarkTheme();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <BugReportScreen insetsTop={insets.top} insetsBottom={insets.bottom} onClose={onClose} />
    </>
  );
}

import { usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Modal, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../../state/themeMode';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import { BugReportScreen } from '../BugReportScreen';
import { primeBugReportContext, requestBugReportClose } from '../bugReportRuntime';
import { aboutDetailDestinationController } from '../aboutDetailDestinationController';
import { subscribeToShake } from './shakeSubscription';

export function ShakeToReportBugHost() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const openRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    return subscribeToShake({
      // Load inside the guarded service so missing native modules in an older
      // installed build do not crash startup. New builds autolink expo-sensors.
      loadSensor: async () => (await import('expo-sensors')).Accelerometer,
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
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    openRef.current = false;
  }, []);

  return (
    <Modal
      {...OVERLAY_MODAL_PROPS}
      visible={visible}
      animationType="none"
      onRequestClose={() => requestBugReportClose(close)}
    >
      {visible ? (
        <SafeAreaProvider>
          <ShakeBugReportPage onClose={close} />
        </SafeAreaProvider>
      ) : null}
    </Modal>
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

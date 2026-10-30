import { useLayoutEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Dimensions, Modal, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../../i18n/useTranslation';
import { FastPressable } from '../../../ui/components/FastPressable';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import type { ThemeColors } from '../../../ui/theme/glass';
import { getLogoutDialogLayout } from './logoutDialogLayout';

export function LogoutConfirmation({ visible, T, onCancel, onConfirm }: {
  visible: boolean;
  T: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const screen = Dimensions.get('screen');
  return <PresentedLogoutConfirmation
    key={`${screen.width}:${screen.height}:${fontScale}`}
    layout={getLogoutDialogLayout(width, height, fontScale, insets)}
    T={T} onCancel={onCancel} onConfirm={onConfirm}
  />;
}

function PresentedLogoutConfirmation({ layout, T, onCancel, onConfirm }: {
  layout: ReturnType<typeof getLogoutDialogLayout>;
  T: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  // Keep this opening's viewport bounds through native window/inset changes.
  // Rotation or font-scale changes remount with fresh bounds.
  const [frame] = useState(layout);
  const [nativeVisible, setNativeVisible] = useState(true);
  const confirmPhase = useRef<'open' | 'dismissing' | 'complete'>('open');
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const handleConfirm = () => {
    if (!mounted.current || confirmPhase.current !== 'open') return;
    if (Platform.OS === 'ios') {
      // Login presents another native Modal. Keep this component mounted until
      // UIKit acknowledges its dismissal, then let the session guard log out.
      confirmPhase.current = 'dismissing';
      setNativeVisible(false);
      return;
    }
    confirmPhase.current = 'complete';
    onConfirm();
  };
  const handleDismiss = () => {
    if (!mounted.current || confirmPhase.current !== 'dismissing') return;
    confirmPhase.current = 'complete';
    onConfirm();
  };
  const handleCancel = () => {
    if (!mounted.current || confirmPhase.current === 'complete') return;
    confirmPhase.current = 'complete';
    onCancel();
  };
  return (
    <Modal {...OVERLAY_MODAL_PROPS} visible={nativeVisible} transparent animationType="none" onRequestClose={handleCancel} onDismiss={handleDismiss}>
      <View style={[styles.overlay, {
        width: frame.viewportWidth,
        height: frame.viewportHeight,
        paddingTop: frame.paddingTop,
        paddingBottom: frame.paddingBottom,
        paddingLeft: frame.paddingLeft,
        paddingRight: frame.paddingRight,
      }]}>
        <FastPressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleCancel}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          testID="logout-confirmation-dialog"
          accessibilityViewIsModal
          onAccessibilityEscape={handleCancel}
          style={[styles.dialog, { width: frame.width, maxHeight: frame.maxHeight, backgroundColor: T.glass2, borderColor: T.border }]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, {
              paddingHorizontal: frame.contentPaddingHorizontal,
              paddingVertical: frame.contentPaddingVertical,
            }]}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
          >
            <View accessible={false} style={[styles.iconBadge, { backgroundColor: T.downGlow }]}>
              <Ionicons name="log-out-outline" size={24} color={T.trading.loss} accessible={false} />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { color: T.text }]}>{t('Logout')}</Text>
            <Text style={[styles.message, { color: T.textSub }]}>
              {t('Are you sure you want to logout? You will need to sign in again.')}
            </Text>
            <View style={[styles.actions, frame.stackActions && styles.actionsStacked]}>
              <FastPressable
                onPress={handleCancel}
                accessibilityRole="button"
                testID="logout-confirmation-cancel"
                latencyLabel="settings.logout.cancel"
                style={({ pressed }) => [
                  styles.button,
                  !frame.stackActions && styles.buttonInline,
                  { borderColor: T.border, backgroundColor: pressed ? T.inputBg : T.glass3 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.buttonText, { color: T.text }]}>{t('Cancel')}</Text>
              </FastPressable>
              <FastPressable
                onPress={handleConfirm}
                accessibilityRole="button"
                testID="logout-confirmation-confirm"
                latencyLabel="settings.logout.confirm"
                style={({ pressed }) => [
                  styles.button,
                  !frame.stackActions && styles.buttonInline,
                  { borderColor: T.trading.sell.primary, backgroundColor: pressed ? T.trading.sell.active : T.trading.sell.primary },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>{t('Logout')}</Text>
              </FastPressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.60)', justifyContent: 'center', alignItems: 'center' },
  dialog: {
    flexGrow: 0, flexShrink: 0, borderRadius: 28, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24, shadowRadius: 24, elevation: 12,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { alignItems: 'center' },
  iconBadge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { alignSelf: 'stretch', minWidth: 0, fontSize: 23, fontWeight: '700', textAlign: 'center' },
  message: { alignSelf: 'stretch', marginTop: 10, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  actions: { alignSelf: 'stretch', flexDirection: 'row', gap: 12, marginTop: 20 },
  actionsStacked: { flexDirection: 'column' },
  button: { minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buttonInline: { flex: 1, minWidth: 0 },
  buttonText: { maxWidth: '100%', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  pressed: { transform: [{ scale: 0.98 }] },
});

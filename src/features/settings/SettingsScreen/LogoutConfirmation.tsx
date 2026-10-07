import { useState } from 'react';
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
  // Keep this opening's frame through native window/inset changes. Actual
  // screen rotation or font-scale changes remount with a fresh fitting frame.
  const [frame] = useState(layout);
  return (
    <Modal {...OVERLAY_MODAL_PROPS} visible transparent animationType="none" onRequestClose={onCancel}>
      <View style={[styles.overlay, { width: frame.viewportWidth, height: frame.viewportHeight, paddingTop: frame.paddingTop, paddingBottom: frame.paddingBottom }]}>
        <FastPressable
          style={StyleSheet.absoluteFillObject}
          onPress={onCancel}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          testID="logout-confirmation-dialog"
          accessibilityViewIsModal
          onAccessibilityEscape={onCancel}
          style={[styles.dialog, { width: frame.width, height: frame.height, backgroundColor: T.glass2, borderColor: T.border }]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
          >
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={[styles.title, { color: T.text }]}>{t('Logout')}</Text>
            </View>
            <Text style={[styles.message, { color: T.textSub }]}>
              {t('Are you sure you want to logout? You will need to sign in again.')}
            </Text>
            <View style={styles.actions}>
              <FastPressable
                onPress={onCancel}
                accessibilityRole="button"
                latencyLabel="settings.logout.cancel"
                style={({ pressed }) => [styles.button, { borderColor: T.border, backgroundColor: T.inputBg }, pressed && styles.pressed]}
              >
                <Text style={[styles.buttonText, { color: T.text }]}>{t('Cancel')}</Text>
              </FastPressable>
              <FastPressable
                onPress={onConfirm}
                activateOnPressIn
                accessibilityRole="button"
                latencyLabel="settings.logout.confirm"
                style={({ pressed }) => [styles.button, { borderColor: T.trading.loss, backgroundColor: T.trading.loss }, pressed && styles.pressed]}
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
  overlay: { backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { flexGrow: 0, flexShrink: 0, borderRadius: 20, borderWidth: 1, padding: 22, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { gap: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '600' },
  message: { fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  button: { flexGrow: 1, flexBasis: 100, minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { maxWidth: '100%', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.8 },
});

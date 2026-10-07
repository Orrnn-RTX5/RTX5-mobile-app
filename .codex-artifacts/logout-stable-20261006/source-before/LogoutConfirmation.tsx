import { Modal, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../../i18n/useTranslation';
import { FastPressable } from '../../../ui/components/FastPressable';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import type { ThemeColors } from '../../../ui/theme/glass';

export function LogoutConfirmation({ visible, T, onCancel, onConfirm }: {
  visible: boolean;
  T: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Resolve both bounds before presenting the native window. A percentage
  // maxHeight around an intrinsically-sized ScrollView can collapse/reflow
  // while the modal measures its content or hands over to Login.
  const dialogWidth = Math.max(0, Math.min(360, width - insets.left - insets.right - 40));
  const dialogMaxHeight = Math.max(0, height - insets.top - insets.bottom - 40);
  // Remove the native dialog before the Login modal is presented. Retaining a
  // fading Modal across logout can leave its native layer above the new page.
  if (!visible) return null;
  return (
    <Modal {...OVERLAY_MODAL_PROPS} visible transparent animationType="none" onRequestClose={onCancel}>
      <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <FastPressable
          style={StyleSheet.absoluteFillObject}
          onPress={onCancel}
          accessible={false}
          importantForAccessibility="no"
        />
        <ScrollView
          testID="logout-confirmation-dialog"
          accessibilityViewIsModal
          onAccessibilityEscape={onCancel}
          style={[styles.dialog, { width: dialogWidth, maxHeight: dialogMaxHeight, backgroundColor: T.glass2, borderColor: T.border }]}
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
              accessibilityRole="button"
              latencyLabel="settings.logout.confirm"
              style={({ pressed }) => [styles.button, { borderColor: T.trading.loss, backgroundColor: T.trading.loss }, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>{t('Logout')}</Text>
            </FastPressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { flexGrow: 0, flexShrink: 0, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  content: { padding: 22, gap: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '600' },
  message: { fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  button: { flexGrow: 1, flexBasis: 100, minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { maxWidth: '100%', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.8 },
});

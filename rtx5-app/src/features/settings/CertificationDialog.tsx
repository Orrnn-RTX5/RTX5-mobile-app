import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n/useTranslation';
import { FastPressable } from '../../ui/components/FastPressable';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import { useTheme } from '../../ui/theme/useTheme';

export function CertificationDialog({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal {...OVERLAY_MODAL_PROPS} visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, {
        paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24,
        paddingLeft: insets.left + 24, paddingRight: insets.right + 24,
      }]}>
        <FastPressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          testID="certification-dialog"
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.dialog, { backgroundColor: T.glass2, borderColor: T.border }]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            bounces={false}
          >
            <Text accessibilityRole="header" style={[styles.title, { color: T.text }]}>
              {t('Certification')}
            </Text>
            <Text style={[styles.message, { color: T.textSub }]}>
              {t('Certification info will be displayed here.')}
            </Text>
          </ScrollView>
          <FastPressable
            testID="certification-dialog-close"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.button, {
              borderTopColor: T.border, backgroundColor: pressed ? T.inputBg : T.glass2,
            }]}
          >
            <Text style={[styles.buttonText, { color: T.accent }]}>{t('OK')}</Text>
          </FastPressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '100%', flexShrink: 1, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 24 },
  title: { fontSize: 20, fontWeight: '600' },
  message: { marginTop: 12, fontSize: 15, lineHeight: 22 },
  button: { minHeight: 48, flexShrink: 0, paddingHorizontal: 24, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
});

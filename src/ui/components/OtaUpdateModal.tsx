import { useMemo } from 'react';
import { useTheme, type ThemeColors } from '../theme/useTheme';
import { useTranslation } from '../../i18n/useTranslation';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { OtaUpdatePromptController } from '../../utils/otaUpdates';

type OtaUpdateModalProps = OtaUpdatePromptController;

/**
 * OTA install prompt with safe deferral before installation. Uses RN Pressable (not FastPressable) so install
 * remains tappable even when the trading tree is unhealthy or gesture systems
 * are wedged after a crash recovery.
 */
export function OtaUpdateModal({
  visible,
  status,
  progressPercent,
  errorMessage,
  onInstall,
  onRetry,
  onDismiss,
}: OtaUpdateModalProps) {
  const T = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(T), [T]);
  const isInstalling = status === 'downloading' || status === 'restarting';
  const showProgress = isInstalling;
  const buttonText = t(status === 'error' ? 'Retry install' : 'Install latest version');
  const handlePress = status === 'error' ? onRetry : onInstall;

  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={() => { if (!isInstalling) onDismiss(); }}
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      // Keep above any crashed error UI / absolute overlays.
      hardwareAccelerated
    >
      <SafeAreaProvider>
      <SafeAreaView style={styles.backdrop}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'}>
        <View style={styles.panel} accessibilityViewIsModal importantForAccessibility="yes">
          <Text style={styles.title}>
            {t(status === 'error' ? 'Update failed' : 'Update available')}
          </Text>
          <Text style={styles.message}>
            {status === 'error'
              ? t(errorMessage ?? 'Please check your internet connection and try again.')
              : t('Install the latest version to get the newest app update.')}
          </Text>

          {showProgress ? (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  {t(status === 'restarting' ? 'Finishing update' : 'Installing update')}
                </Text>
                <Text style={styles.progressValue}>{progressPercent}%</Text>
              </View>
              <View style={styles.progressTrack} accessible accessibilityRole="progressbar" accessibilityLabel={t('Installing update')} accessibilityValue={{ min: 0, max: 100, now: progressPercent }}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <ActivityIndicator color={T.accent} />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isInstalling, busy: isInstalling }}
            disabled={isInstalling}
            onPress={handlePress}
            hitSlop={16}
            // Large min hit target — users reported the install control was untappable.
            style={({ pressed }) => [
              styles.button,
              isInstalling ? styles.buttonDisabled : null,
              pressed && !isInstalling ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.buttonText}>
              {isInstalling ? t('Installing...') : buttonText}
            </Text>
          </Pressable>
          {!isInstalling ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('Later')} onPress={onDismiss} style={styles.laterButton}>
              <Text style={styles.laterText}>{t('Later')}</Text>
            </Pressable>
          ) : null}
        </View>
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  scroll: { flex: 1, minHeight: 0 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 20,
    backgroundColor: T.glass2,
    elevation: 24,
    zIndex: 100000,
  },
  title: {
    color: T.text,
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    marginTop: 10,
    color: T.textSub,
    fontSize: 14,
    lineHeight: 20,
  },
  progressSection: {
    gap: 12,
    marginTop: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    flexShrink: 1,
    color: T.text,
    fontSize: 13,
    fontWeight: '600',
  },
  progressValue: {
    color: T.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: T.glass3,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: T.accent,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 22,
    borderRadius: 8,
    backgroundColor: T.accent,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  buttonPressed: {
    backgroundColor: T.accent,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  laterButton: { minHeight: 48, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  laterText: { color: T.textSub, fontSize: 15 },
  buttonText: {
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

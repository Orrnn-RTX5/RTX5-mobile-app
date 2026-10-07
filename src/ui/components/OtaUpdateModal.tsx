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
 * Blocking OTA install prompt. Uses RN Pressable (not FastPressable) so install
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
}: OtaUpdateModalProps) {
  const isInstalling = status === 'downloading' || status === 'restarting';
  const showProgress = isInstalling;
  const buttonText = status === 'error' ? 'Retry install' : 'Install latest version';
  const handlePress = status === 'error' ? onRetry : onInstall;

  return (
    <Modal
      visible={visible}
      transparent
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
            {status === 'error' ? 'Update failed' : 'Update available'}
          </Text>
          <Text style={styles.message}>
            {status === 'error'
              ? errorMessage ?? 'Please check your internet connection and try again.'
              : 'Install the latest version to continue with the newest app update.'}
          </Text>

          {showProgress ? (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  {status === 'restarting' ? 'Finishing update' : 'Installing update'}
                </Text>
                <Text style={styles.progressValue}>{progressPercent}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <ActivityIndicator color="#38bdf8" />
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
              {isInstalling ? 'Installing...' : buttonText}
            </Text>
          </Pressable>
        </View>
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    borderColor: 'rgba(148, 163, 184, 0.22)',
    padding: 20,
    backgroundColor: '#1E1E1E',
    elevation: 24,
    zIndex: 100000,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    marginTop: 10,
    color: '#cbd5e1',
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
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  progressValue: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#38bdf8',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 22,
    borderRadius: 8,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  buttonPressed: {
    backgroundColor: '#0284c7',
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  buttonText: {
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

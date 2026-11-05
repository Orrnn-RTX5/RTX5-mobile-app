import { FastPressable as Pressable } from './FastPressable';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { logStartupError } from '../../utils/startupDiagnostics';
import { captureErrorBoundaryException } from '../../services/sentry';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  resetKey: number;
  installStatus: 'idle' | 'working' | 'error';
  installError: string | null;
}

const canInstallOtaFromBoundary = () =>
  Platform.OS !== 'web' &&
  (typeof __DEV__ === 'undefined' || !__DEV__) &&
  Updates.isEnabled;

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    resetKey: 0,
    installStatus: 'idle',
    installError: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, installStatus: 'idle', installError: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logStartupError('error-boundary.caught', error, {
      componentStack: errorInfo.componentStack,
    });
    captureErrorBoundaryException(error, errorInfo);
  }

  private handleRestart = () => {
    this.setState((state) => ({
      hasError: false,
      error: null,
      resetKey: state.resetKey + 1,
      installStatus: 'idle',
      installError: null,
    }));
  };

  /**
   * Stuck on a crashed OTA build (e.g. 1.1.28): the error UI used to replace the
   * whole tree — including the OTA install modal — so users could not recover.
   * This path fetches + reloads without needing the modal or a clean remount.
   */
  private handleInstallUpdate = () => {
    if (!canInstallOtaFromBoundary() || this.state.installStatus === 'working') {
      return;
    }

    this.setState({ installStatus: 'working', installError: null });
    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable || check.isRollBackToEmbedded) {
          const fetchResult = await Updates.fetchUpdateAsync();
          if (fetchResult.isNew || fetchResult.isRollBackToEmbedded) {
            await Updates.reloadAsync();
            return;
          }
        }
        // Already pending from a previous download.
        if (Updates.latestContext.isUpdatePending || !Updates.isEmbeddedLaunch) {
          try {
            await Updates.reloadAsync();
            return;
          } catch {
            // fall through
          }
        }
        this.setState({
          installStatus: 'error',
          installError: 'No newer update was found. Try Reload, or reinstall from the store.',
        });
      } catch (error) {
        logStartupError('error-boundary.ota-install.failed', error);
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Could not download the update. Check your connection and try again.';
        this.setState({ installStatus: 'error', installError: message });
      }
    })();
  };

  public render() {
    if (this.state.hasError) {
      const installing = this.state.installStatus === 'working';
      const showOtaInstall = canInstallOtaFromBoundary();

      return (
        <SafeAreaProvider>
        <SafeAreaView style={styles.surface}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'}>
          <Ionicons name="warning-outline" size={64} color="#F87171" style={styles.icon} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            An unexpected error occurred in the trading UI. Your positions are safe on the server.
          </Text>
          {this.state.installError ? (
            <Text style={styles.installError}>{this.state.installError}</Text>
          ) : null}

          {showOtaInstall ? (
            <Pressable
              style={[styles.buttonPrimary, installing && styles.buttonDisabled]}
              onPress={this.handleInstallUpdate}
              disabled={installing}
              hitSlop={16}
              latencyLabel="errorBoundary.installUpdate"
              accessibilityRole="button"
              activateOnPressIn
              unstable_pressDelay={0}
            >
              {installing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Ionicons name="cloud-download-outline" size={18} color="#FFF" />
              )}
              <Text style={styles.buttonText}>
                {installing ? 'Installing update…' : 'Install latest update'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={styles.buttonSecondary}
            onPress={this.handleRestart}
            hitSlop={16}
            latencyLabel="errorBoundary.restart"
            accessibilityRole="button"
            activateOnPressIn
            unstable_pressDelay={0}
            disabled={installing}
          >
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.buttonText}>Tap to Reload</Text>
          </Pressable>
        </ScrollView>
        </SafeAreaView>
        </SafeAreaProvider>
      );
    }

    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: '#121212' },
  container: {
    flexGrow: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 99999,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  installError: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  buttonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    gap: 8,
    width: '100%',
    maxWidth: 400,
    minHeight: 48,
    marginBottom: 12,
  },
  buttonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    gap: 8,
    width: '100%',
    maxWidth: 400,
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    flexShrink: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

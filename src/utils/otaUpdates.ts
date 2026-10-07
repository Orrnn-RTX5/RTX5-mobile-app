import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { APP_DISPLAY_VERSION } from '../config/appDisplayVersion';
import { logStartupDiagnostic, serializeStartupError } from './startupDiagnostics';

const OTA_CHECK_DELAY_MS = 1500;
const OTA_ACTIVE_RETRY_MS = 1000;
const OTA_ACTIVE_RETRY_LIMIT = 10;
const EAS_UPDATE_CHANNELS = new Set(['preview', 'staging', 'production']);
const DISABLE_OTA_UPDATES = process.env.EXPO_PUBLIC_DISABLE_OTA_UPDATES === 'true';

const getActiveUpdateChannel = () => Updates.channel ?? process.env.EXPO_PUBLIC_APP_ENV ?? null;

const canUseOtaUpdates = () =>
  Platform.OS !== 'web' &&
  (typeof __DEV__ === 'undefined' || !__DEV__) &&
  !DISABLE_OTA_UPDATES &&
  Updates.isEnabled &&
  Boolean(Updates.runtimeVersion) &&
  EAS_UPDATE_CHANNELS.has(getActiveUpdateChannel() ?? '');

export type OtaUpdateStatus = 'idle' | 'available' | 'downloading' | 'restarting' | 'error';

export type OtaUpdatePromptController = {
  visible: boolean;
  targetVersion: string;
  status: OtaUpdateStatus;
  progressPercent: number;
  errorMessage: string | null;
  onInstall: () => void;
  onRetry: () => void;
};

const getUpdateManifestId = (
  result: Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>,
): string | null => {
  if (!result.isAvailable) return null;
  return result.manifest?.id ?? null;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Please check your internet connection and try again.';
};

export function useOtaUpdateOnLaunch(): OtaUpdatePromptController {
  const updateState = Updates.useUpdates();
  const canCheckForUpdates = canUseOtaUpdates();
  const isCheckingRef = useRef(false);
  const isInstallingRef = useRef(false);
  const isMountedRef = useRef(true);
  const [status, setStatus] = useState<OtaUpdateStatus>('idle');
  const [visible, setVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nativeProgress = updateState.downloadProgress ?? 0;
  const progressPercent =
    status === 'restarting' || updateState.isUpdatePending
      ? 100
      : status === 'downloading'
        ? Math.max(1, Math.min(99, Math.round(nativeProgress * 100)))
        : 0;

  const checkForAvailableUpdate = useCallback(async (reason: 'launch' | 'foreground' | 'retry') => {
    if (!canCheckForUpdates || isCheckingRef.current || isInstallingRef.current) {
      return;
    }

    isCheckingRef.current = true;
    logStartupDiagnostic('updates.check.started', { reason });
    try {
      const checkResult = await Updates.checkForUpdateAsync();
      const manifestId = getUpdateManifestId(checkResult);
      logStartupDiagnostic('updates.check.finished', {
        reason,
        isAvailable: checkResult.isAvailable,
        isRollBackToEmbedded: checkResult.isRollBackToEmbedded,
        manifest: manifestId,
      });

      if (!isMountedRef.current) return;
      if (checkResult.isAvailable || checkResult.isRollBackToEmbedded) {
        setErrorMessage(null);
        setStatus('available');
        setVisible(true);
      }
    } catch (error) {
      // Expected when offline: informational, not a console.error.
      logStartupDiagnostic('updates.check.failed', { reason, error: serializeStartupError(error) });
    } finally {
      isCheckingRef.current = false;
    }
  }, [canCheckForUpdates]);

  const installLatestUpdate = useCallback(async () => {
    if (!canCheckForUpdates || isInstallingRef.current) {
      return;
    }

    isInstallingRef.current = true;
    setVisible(true);
    setStatus('downloading');
    setErrorMessage(null);
    logStartupDiagnostic('updates.fetch.started', {
      targetVersion: APP_DISPLAY_VERSION,
    });

    try {
      if (updateState.isUpdatePending) {
        logStartupDiagnostic('updates.reload.pending', {
          targetVersion: APP_DISPLAY_VERSION,
        });
        setStatus('restarting');
        await Updates.reloadAsync();
        return;
      }

      const fetchResult = await Updates.fetchUpdateAsync();
      logStartupDiagnostic('updates.fetch.finished', {
        isNew: fetchResult.isNew,
        isRollBackToEmbedded: fetchResult.isRollBackToEmbedded,
        manifest: fetchResult.manifest?.id ?? null,
      });

      if (!isMountedRef.current) return;
      if (fetchResult.isNew || fetchResult.isRollBackToEmbedded || updateState.isUpdatePending) {
        setStatus('restarting');
        await Updates.reloadAsync();
        return;
      }

      isInstallingRef.current = false;
      setStatus('error');
      setErrorMessage('The update was not downloaded. Please try again.');
    } catch (error) {
      // Expected when offline; the prompt shows the failure to the user.
      logStartupDiagnostic('updates.fetch.failed', { error: serializeStartupError(error) });
      if (!isMountedRef.current) return;
      isInstallingRef.current = false;
      setStatus('error');
      setErrorMessage(getErrorMessage(error));
    }
  }, [canCheckForUpdates, updateState.isUpdatePending]);

  useEffect(() => {
    logStartupDiagnostic('updates.launch', {
      canCheckForUpdates,
      disabledByEnv: DISABLE_OTA_UPDATES,
      activeChannel: getActiveUpdateChannel(),
    });
  }, [canCheckForUpdates]);

  useEffect(() => {
    if (!canCheckForUpdates) return;

    let retryCount = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const runLaunchCheck = () => {
      if (AppState.currentState !== 'active') {
        logStartupDiagnostic('updates.check.skipped', {
          appState: AppState.currentState,
          reason: 'launch',
          retryCount,
        });

        if (retryCount < OTA_ACTIVE_RETRY_LIMIT) {
          retryCount += 1;
          timeout = setTimeout(runLaunchCheck, OTA_ACTIVE_RETRY_MS);
        }
        return;
      }

      void checkForAvailableUpdate('launch');
    };

    timeout = setTimeout(runLaunchCheck, OTA_CHECK_DELAY_MS);

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [canCheckForUpdates, checkForAvailableUpdate]);

  useEffect(() => {
    if (!canCheckForUpdates) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && !visible) {
        void checkForAvailableUpdate('foreground');
      }
    });

    return () => subscription.remove();
  }, [canCheckForUpdates, checkForAvailableUpdate, visible]);

  useEffect(() => {
    if (
      (updateState.isUpdateAvailable || updateState.isUpdatePending) &&
      !isInstallingRef.current
    ) {
      setStatus('available');
      setVisible(true);
    }
  }, [updateState.isUpdateAvailable, updateState.isUpdatePending]);

  useEffect(() => {
    if (updateState.isUpdatePending && isInstallingRef.current) {
      setStatus('restarting');
      void Updates.reloadAsync();
    }
  }, [updateState.isUpdatePending]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    visible,
    targetVersion: APP_DISPLAY_VERSION,
    status,
    progressPercent,
    errorMessage,
    onInstall: installLatestUpdate,
    onRetry: installLatestUpdate,
  };
}

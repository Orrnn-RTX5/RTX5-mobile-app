import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { DEFAULT_API_BASE_URL, PUBLIC_BROKER_DIRECTORY_BASE_URL } from '../api/brokerRouting';
import { APP_DISPLAY_VERSION } from '../config/appDisplayVersion';
import { serializeStartupError } from './errorSerialization';
import { redactDiagnosticValue, redactSensitiveString } from './securityRedaction';

export { serializeStartupError } from './errorSerialization';

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

type GlobalWithReactNativeHandlers = typeof globalThis & {
  ErrorUtils?: ErrorUtilsLike;
  onunhandledrejection?: ((event: unknown) => void) | null;
};

let globalHandlersInstalled = false;

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const extra = (): Record<string, any> =>
  (Constants.expoConfig?.extra && typeof Constants.expoConfig.extra === 'object'
    ? Constants.expoConfig.extra
    : {}) as Record<string, any>;

export const getStartupDiagnostics = () => ({
  platform: Platform.OS,
  environment: extra().appEnv ?? process.env.EXPO_PUBLIC_APP_ENV ?? null,
  appDisplayVersion: APP_DISPLAY_VERSION,
  appVersion:
    Application.nativeApplicationVersion ??
    Constants.nativeAppVersion ??
    Constants.expoConfig?.version ??
    null,
  nativeBuildVersion:
    Application.nativeBuildVersion ??
    Constants.nativeBuildVersion ??
    null,
  runtimeVersion: Updates.runtimeVersion ?? null,
  channel: Updates.channel ?? null,
  updatesUrl: Constants.expoConfig?.updates?.url ?? null,
  updateId: Updates.updateId ?? null,
  isEnabled: Updates.isEnabled,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  createdAt: toIsoString(Updates.createdAt),
  emergencyLaunchReason: Updates.emergencyLaunchReason ?? null,
  apiBaseUrl: extra().apiBaseUrl ?? DEFAULT_API_BASE_URL,
  brokerDirectoryBaseUrl: extra().brokerDirectoryBaseUrl ?? PUBLIC_BROKER_DIRECTORY_BASE_URL,
  easProjectId: extra().eas?.projectId ?? (Constants as any).easConfig?.projectId ?? null,
  easBuildProfile: extra().easBuildProfile ?? null,
  gitCommitSha: extra().gitCommitSha ?? null,
  gitDirty: extra().gitDirty ?? null,
});

// The full build/runtime context is identical for every startup event, so it
// is printed once per launch; later events carry only their own details.
// Errors always include the full context.
let startupContextLogged = false;

export function logStartupDiagnostic(event: string, details: Record<string, unknown> = {}) {
  const includeContext = !startupContextLogged;
  startupContextLogged = true;
  console.info(`[Startup] ${redactSensitiveString(event)}`, redactDiagnosticValue(
    includeContext ? { ...getStartupDiagnostics(), ...details } : details,
  ));
}

export function logStartupError(
  event: string,
  error: unknown,
  details: Record<string, unknown> = {},
) {
  console.error(`[Startup] ${redactSensitiveString(event)}`, redactDiagnosticValue({
    ...getStartupDiagnostics(),
    ...details,
    error: serializeStartupError(error),
  }));
}

export function installGlobalStartupErrorHandlers() {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  const globalRef = globalThis as GlobalWithReactNativeHandlers;
  const previousGlobalHandler = globalRef.ErrorUtils?.getGlobalHandler?.();
  globalRef.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    logStartupError('global-js-error', error, { isFatal: Boolean(isFatal) });
    previousGlobalHandler?.(error, isFatal);
  });

  const previousUnhandledRejection = globalRef.onunhandledrejection;
  globalRef.onunhandledrejection = (event: unknown) => {
    const reason = event && typeof event === 'object' && 'reason' in event
      ? (event as { reason?: unknown }).reason
      : event;
    logStartupError('unhandled-promise-rejection', reason);
    previousUnhandledRejection?.(event);
  };
}

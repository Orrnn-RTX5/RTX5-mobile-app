import Constants from 'expo-constants';
import type { ErrorInfo } from 'react';
import * as Sentry from '@sentry/react-native';
import {
  redactDiagnosticValue,
  redactSensitiveString,
} from '../utils/securityRedaction';

type SentryExpoExtra = {
  sentryDsn?: unknown;
};

const expoExtra = Constants.expoConfig?.extra as SentryExpoExtra | undefined;

const resolveSentryDsn = () => {
  const value = process.env.EXPO_PUBLIC_SENTRY_DSN ?? expoExtra?.sentryDsn;
  return typeof value === 'string' ? value.trim() : '';
};

const sentryDsn = resolveSentryDsn();

export const isSentryEnabled = sentryDsn.length > 0;

Sentry.init({
  dsn: sentryDsn || undefined,
  enabled: isSentryEnabled,
  enableLogs: false,
  maxBreadcrumbs: 0,
  sendDefaultPii: false,
  beforeSend: (event) => redactDiagnosticValue(event) as typeof event,
});

export const wrapWithSentry = Sentry.wrap;

const createRedactedError = (error: Error): Error => {
  const redacted = new Error(redactSensitiveString(error.message));
  redacted.name = redactSensitiveString(error.name);
  redacted.stack = error.stack ? redactSensitiveString(error.stack) : undefined;
  return redacted;
};

export const captureErrorBoundaryException = (error: Error, errorInfo: ErrorInfo) => {
  if (!isSentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setContext('react', {
      componentStack: errorInfo.componentStack
        ? redactSensitiveString(errorInfo.componentStack)
        : null,
    });
    Sentry.captureException(createRedactedError(error));
  });
};

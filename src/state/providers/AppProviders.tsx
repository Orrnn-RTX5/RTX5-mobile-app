/**
 * Global Context Providers
 * 
 * Wraps the entire Expo application in mandatory providers including
 * React Query, SafeArea context, and GestureHandler support.
 */

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { bindNativeQueryFocus } from './nativeQueryFocus';
import { bindNativeInteractionLifecycle } from '../../utils/interactionLifecycle';

function getQueryErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  if (typeof record.status === 'number') {
    return record.status;
  }
  if (typeof record.statusCode === 'number') {
    return record.statusCode;
  }

  const response = record.response;
  if (response && typeof response === 'object') {
    const responseStatus = (response as Record<string, unknown>).status;
    return typeof responseStatus === 'number' ? responseStatus : undefined;
  }

  return undefined;
}

function shouldRetryQuery(failureCount: number, error: unknown) {
  const status = getQueryErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }

  return failureCount < 1;
}

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      gcTime: 10 * 60_000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    // Restore touch ownership before query polling/reconnects resume. UI
    // recovery also runs for guests and never waits for token validation.
    const unbindInteractions = bindNativeInteractionLifecycle(Platform.OS, AppState);
    const unbindQueryFocus = bindNativeQueryFocus(Platform.OS, AppState, focusManager);
    return () => { unbindInteractions(); unbindQueryFocus(); };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

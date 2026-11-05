import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { StaleBrokerSessionError } from '../api/brokerApi';
import {
  captureActiveBrokerSessionProvenance,
  getActiveBrokerSession,
  isActiveBrokerSessionProvenanceCurrent,
  subscribeActiveBrokerSession,
  type ActiveBrokerSession,
} from '../state/activeBrokerSession';

/**
 * A stable sentinel keeps disabled authenticated queries out of an empty/global
 * cache bucket. No request is allowed to execute with this namespace.
 */
export const NO_ACTIVE_BROKER_CACHE_NAMESPACE = '__no_active_broker_session__';

const subscribeSessionSnapshot = (onStoreChange: () => void) =>
  subscribeActiveBrokerSession(() => onStoreChange());

/** Reactively follows the immutable broker/account/epoch session snapshot. */
export function useActiveBrokerQuerySession(): ActiveBrokerSession | null {
  return useSyncExternalStore(
    subscribeSessionSnapshot,
    getActiveBrokerSession,
    getActiveBrokerSession,
  );
}

export const getActiveBrokerCredentialScopeKey = (): string => {
  const provenance = captureActiveBrokerSessionProvenance();
  if (!provenance) return NO_ACTIVE_BROKER_CACHE_NAMESPACE;
  return [
    provenance.cacheNamespace,
    provenance.credentialGeneration,
    provenance.credentialIdentity,
  ].join(':');
};

/**
 * Market-data reads must rotate with credentials even when the authenticated
 * account/session cache namespace stays the same across token refresh.
 */
export function useActiveBrokerCredentialScopeKey(): string {
  return useSyncExternalStore(
    subscribeSessionSnapshot,
    getActiveBrokerCredentialScopeKey,
    () => NO_ACTIVE_BROKER_CACHE_NAMESPACE,
  );
}

export const getSessionQueryCacheNamespace = (
  session: ActiveBrokerSession | null,
): string => session?.cacheNamespace ?? NO_ACTIVE_BROKER_CACHE_NAMESPACE;

export const getCurrentSessionQueryCacheNamespace = (): string | null =>
  captureActiveBrokerSessionProvenance()?.cacheNamespace ?? null;

export const isSessionQueryCacheNamespaceCurrent = (
  cacheNamespace: string,
): boolean => {
  const provenance = captureActiveBrokerSessionProvenance();
  return Boolean(
    provenance &&
    provenance.cacheNamespace === cacheNamespace &&
    isActiveBrokerSessionProvenanceCurrent(provenance),
  );
};

/**
 * Runs an authenticated query against one captured broker/account/epoch and
 * rejects the result if the session changes while any response body is parsed.
 */
export async function runSessionBoundQuery<T>(
  expectedCacheNamespace: string,
  request: () => Promise<T>,
): Promise<T> {
  const provenance = captureActiveBrokerSessionProvenance();
  if (
    !provenance ||
    provenance.cacheNamespace !== expectedCacheNamespace ||
    !isActiveBrokerSessionProvenanceCurrent(provenance)
  ) {
    throw new StaleBrokerSessionError();
  }

  const value = await request();
  if (!isActiveBrokerSessionProvenanceCurrent(provenance)) {
    throw new StaleBrokerSessionError();
  }
  return value;
}

/**
 * Invalidates only query prefixes owned by the still-current session. The
 * namespace occupies the second key slot across authenticated query modules.
 */
export async function invalidateSessionQueryRoots(
  queryClient: QueryClient,
  cacheNamespace: string,
  roots: readonly string[],
): Promise<void> {
  if (!isSessionQueryCacheNamespaceCurrent(cacheNamespace)) return;

  await Promise.all(
    [...new Set(roots)].map((root) =>
      queryClient.invalidateQueries({ queryKey: [root, cacheNamespace] }),
    ),
  );
}

/** Invalidates roots for the active session without ever using a global prefix. */
export async function invalidateCurrentSessionQueryRoots(
  queryClient: QueryClient,
  roots: readonly string[],
): Promise<void> {
  const cacheNamespace = getCurrentSessionQueryCacheNamespace();
  if (!cacheNamespace) return;
  await invalidateSessionQueryRoots(queryClient, cacheNamespace, roots);
}

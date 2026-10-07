import { InteractionManager } from 'react-native';
import { brokerApi } from '../api/brokerApi';
import { getBrokerDirectory, getBrokerDirectoryForBroker } from '../api/broker';
import { createPublicBrokerContext } from '../state/publicBrokerContext';
import { dismissAuthFlow } from '../features/trade/authFlowState';
import { accountWsService } from '../api/ws/accountSocket';
import { brokerRealtimeService } from '../api/ws/BrokerRealtimeService';
import { quotesWsService } from '../api/ws/quotesSocket';
import { wsService } from '../api/ws/socket';
import { candleMemoryCache } from '../domain/candles/stream/candleMemoryCache';
import { liveCandleStream } from '../domain/candles/stream/liveCandleStream';
import { candlesWsService } from '../domain/candles/ws/candlesSocket';
import { resetPersistedCandleCacheSession } from '../domain/candles/state/persistedCandleCache';
import { resetQuoteRuntimeState } from '../features/quotes/resetQuoteRuntimeState';
import { resetBrokerSymbolResolverCache } from '../api/orders/symbolResolver';
import { resetAcceptedMarketOrderSymbolCache } from '../api/orders/placeMarketOrder';
import { resetAcceptedPendingOrderSymbolCache } from '../api/orders/placePendingOrder';
import { BROKER_SERVERS_KEY } from '../query/broker';
import { ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE } from '../config/orrnnDemoPublicMarket';
import {
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  getActiveBrokerSessionEpoch,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  type ActivateBrokerSessionInput,
  type ActiveBrokerCredentials,
  type ActiveBrokerSessionCapture,
} from '../state/activeBrokerSession';
import {
  cancelBrokerSessionCommitAuthorization as cancelCommitAuthorization,
  consumeBrokerSessionCommitAuthorization,
  issueBrokerSessionCommitAuthorization,
  type BrokerSessionCommitAuthorization,
} from './brokerSessionCommitAuthorization';
import {
  clearActiveBrokerSessionManifest,
  createActiveBrokerSessionManifest,
  readActiveBrokerSessionManifest,
  writeActiveBrokerSessionManifest,
  type ActiveBrokerSessionManifest,
} from '../state/activeBrokerSessionStorage';
import {
  clearAuthSessionTokens,
  clearLegacySelectedBrokerSession,
  getStoredAuthSessionCredentials,
  replaceAuthSessionCredentials,
} from '../state/brokerSessionStorage';
import { useLiveAccountState } from '../state/liveAccountState';
import { resetPositionsSessionState } from '../state/positionsState';
import { appQueryClient } from '../state/providers/AppProviders';
import { useSavedAccounts } from '../state/savedAccounts';
import { pruneObsoleteSessionCaches } from '../state/sessionCacheStorage';
import { resetSessionMarketData } from '../state/tradingState';
import {
  flushUserPreferencesPersistence,
  useUserPreferences,
} from '../state/userPreferences';
import {
  bindFeedHealthSession,
  unbindFeedHealthSession,
} from '../market/feedHealthRuntime';
import {
  normalizeBrokerHttpsUrl,
  normalizeBrokerWssUrl,
} from '../api/brokerRouting';
import {
  buildAccountEnvironmentKey,
  type AccountEnvironment,
  type AccountEnvironmentSource,
} from '../domain/accountType';

export type BrokerSessionAccountProfile = Readonly<{
  name: string;
  serverName: string;
  logoUrl?: string;
  accountType: AccountEnvironment;
  accountEnvironmentSource: AccountEnvironmentSource;
}>;

export type CommitBrokerSessionInput = Readonly<{
  isCurrent?: () => boolean;
  /** Starts session-owned reads after secure activation, alongside preference persistence. */
  onActivated?: (capture: ActiveBrokerSessionCapture) => void;
  session: ActivateBrokerSessionInput;
  credentials: ActiveBrokerCredentials;
  account: BrokerSessionAccountProfile;
}>;

export type BrokerSessionRestoreResult =
  | { status: 'restored'; capture: ActiveBrokerSessionCapture }
  | { status: 'logged_out' }
  | { status: 'invalidated'; reason: string };

let mutationQueue: Promise<void> = Promise.resolve();

export type { BrokerSessionCommitAuthorization } from './brokerSessionCommitAuthorization';
export { isStaleBrokerSessionCommitError } from './brokerSessionCommitAuthorization';

/**
 * Called when a user starts an unauthenticated login/switch request. This does
 * not disturb the active session, but only the newest issued attempt may later
 * enter the atomic coordinator commit.
 */
export const authorizeBrokerSessionCommit = (): BrokerSessionCommitAuthorization =>
  issueBrokerSessionCommitAuthorization(getActiveBrokerSessionEpoch());

export const cancelBrokerSessionCommitAuthorization = (
  authorization: BrokerSessionCommitAuthorization | null | undefined,
): void => cancelCommitAuthorization(authorization);

const enqueueMutation = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const validateCommitInput = (
  input: CommitBrokerSessionInput,
): CommitBrokerSessionInput => {
  // Manifest validation covers identity and endpoint provenance. Transport
  // normalization rejects cleartext, credentials in URLs, and malformed URLs.
  // Contract v3: there is no feed token, so none is required or stored.
  const manifest = createActiveBrokerSessionManifest(input.session);
  const apiBase = normalizeBrokerHttpsUrl(manifest.apiBase);
  const feedWsBase = normalizeBrokerWssUrl(manifest.feedWsBase);
  const tradeWsBase = manifest.tradeWsBase
    ? normalizeBrokerWssUrl(manifest.tradeWsBase)
    : '';
  const feedStatusUrl = normalizeBrokerHttpsUrl(manifest.feedStatusUrl);
  const accessToken = cleanString(input.credentials.accessToken);

  if (
    !apiBase ||
    !feedWsBase ||
    !feedStatusUrl ||
    (manifest.tradeWsBase && !tradeWsBase) ||
    !accessToken
  ) {
    throw new Error('Broker session handoff is missing a validated endpoint or access token.');
  }

  return Object.freeze({
    session: Object.freeze({
      brokerId: manifest.brokerId,
      accountLogin: manifest.accountLogin,
      apiBase,
      feedWsBase,
      ...(tradeWsBase ? { tradeWsBase } : {}),
      feedStatusUrl,
      servicesDomain: manifest.servicesDomain,
      configVersion: manifest.configVersion,
      investor: manifest.investor === true,
    }),
    credentials: Object.freeze({
      accessToken,
      refreshToken: cleanString(input.credentials.refreshToken),
      expiresAt: cleanString(input.credentials.expiresAt),
    }),
    account: Object.freeze({
      name: cleanString(input.account.name) || 'Trader',
      serverName: cleanString(input.account.serverName) || manifest.brokerId,
      ...(cleanString(input.account.logoUrl)
        ? { logoUrl: cleanString(input.account.logoUrl) }
        : {}),
      accountType: input.account.accountType,
      accountEnvironmentSource: input.account.accountEnvironmentSource,
    }),
  });
};

const bindCommittedFeedHealthSession = (
  capture: ActiveBrokerSessionCapture,
): void => {
  const { session } = capture;
  const identity = getActiveBrokerSessionIdentity(session);
  bindFeedHealthSession({
    identity,
    transportConfigured: Boolean(session.feedWsBase && session.feedStatusUrl),
    // The quote feed takes no credential (contract v3), so it is always approved.
    credentialApproved: true,
    // The bound session starts fail-closed. Its authenticated status probe
    // installs the broker-approved health_policy for this exact identity.
  });
};

/**
 * Synchronous teardown portion of every handoff. The epoch has already moved
 * before this runs, so any late async completion is stale before caches clear.
 */
export const teardownBrokerSessionRuntime = async (): Promise<void> => {
  brokerApi.abortInFlightRequests();
  quotesWsService.disconnect();
  accountWsService.disconnect();
  candlesWsService.disconnect();
  brokerRealtimeService.disconnect();
  wsService.disconnect();
  unbindFeedHealthSession();
  liveCandleStream.dispose();
  candleMemoryCache.clear();
  resetQuoteRuntimeState();
  resetSessionMarketData();
  resetPositionsSessionState();
  resetBrokerSymbolResolverCache();
  resetAcceptedMarketOrderSymbolCache();
  resetAcceptedPendingOrderSymbolCache();
  resetPersistedCandleCacheSession();
  useLiveAccountState.getState().resetMetrics();
  const isSessionIndependentQuery = (queryKey: readonly unknown[]) =>
    queryKey[0] === BROKER_SERVERS_KEY
    || queryKey.includes(ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE);
  await appQueryClient.cancelQueries({
    predicate: (query) => !isSessionIndependentQuery(query.queryKey),
  });
  // The broker directory and tokenless public-market data are not account-
  // scoped. Preserve them across startup's fail-closed session teardown so a
  // logged-out Quotes/Chart warm-up cannot be cancelled or erased after its
  // request has already started. Every authenticated query is still wiped.
  appQueryClient.removeQueries({
    predicate: (query) => !isSessionIndependentQuery(query.queryKey),
  });
  appQueryClient.getMutationCache().clear();
};

const erasePersistedSession = async (): Promise<void> => {
  const results = await Promise.allSettled([
    clearAuthSessionTokens(),
    clearActiveBrokerSessionManifest(),
    clearLegacySelectedBrokerSession(),
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    throw failure.reason;
  }
};

const pruneDisposableSessionStorage = async (): Promise<void> => {
  try {
    await pruneObsoleteSessionCaches();
  } catch (error) {
    // Cache cleanup is recovery/housekeeping. Secure session validation remains
    // authoritative even if the device temporarily refuses this deletion.
    console.error('[Session] Failed to prune obsolete session caches', error);
  }
};

const persistSessionPreferences = async (): Promise<void> => {
  try {
    await flushUserPreferencesPersistence();
  } catch (error) {
    // Preferences contain profile/UI metadata, never the secure session
    // authority. Keep the validated SecureStore session usable and retry on
    // later writes instead of forcing the user through another broker login.
    console.error('[Session] Secure session is active but preferences were not persisted', error);
  }
};

const resolveRestoredAccountProfile = (
  manifest: ActiveBrokerSessionManifest,
): BrokerSessionAccountProfile => {
  const preferences = useUserPreferences.getState();
  const preferenceIdentityMatches =
    cleanString(preferences.brokerId).toLowerCase() === manifest.brokerId &&
    cleanString(preferences.accountDetails?.id) === manifest.accountLogin;
  const savedAccount = useSavedAccounts.getState().accounts.find((account) =>
    cleanString(account.brokerId).toLowerCase() === manifest.brokerId &&
    cleanString(account.login) === manifest.accountLogin,
  );
  const expectedAccountEnvironmentKey = buildAccountEnvironmentKey(
    manifest.brokerId,
    manifest.accountLogin,
  );
  const preferenceEnvironmentMatches =
    preferenceIdentityMatches &&
    preferences.accountEnvironmentKey === expectedAccountEnvironmentKey;

  return {
    name: preferenceIdentityMatches
      ? cleanString(preferences.accountDetails?.name) || `Account ${manifest.accountLogin}`
      : cleanString(savedAccount?.name) || `Account ${manifest.accountLogin}`,
    serverName: preferenceIdentityMatches
      ? cleanString(preferences.accountDetails?.server) || manifest.brokerId
      : cleanString(savedAccount?.server) || manifest.brokerId,
    logoUrl: preferenceIdentityMatches
      ? cleanString(preferences.brokerLogoUrl)
      : cleanString(savedAccount?.logoUrl),
    accountType: preferenceEnvironmentMatches
      ? preferences.accountType
      : savedAccount?.accountType ?? 'unknown',
    accountEnvironmentSource: preferenceEnvironmentMatches
      ? preferences.accountEnvironmentSource
      : savedAccount?.accountEnvironmentSource ?? 'unknown',
  };
};

const failClosed = async (reason: string): Promise<BrokerSessionRestoreResult> => {
  beginActiveBrokerSessionTransition();
  await teardownBrokerSessionRuntime();
  await pruneDisposableSessionStorage();
  useUserPreferences.getState().logout();
  // Storage can itself be the failure source. The epoch and memory state are
  // already invalidated; cleanup remains best-effort without re-enabling UI.
  await Promise.allSettled([
    clearAuthSessionTokens(),
    clearActiveBrokerSessionManifest(),
    clearLegacySelectedBrokerSession(),
  ]);
  await persistSessionPreferences();
  return { status: 'invalidated', reason };
};

const commitBrokerSessionInternal = async (
  rawInput: CommitBrokerSessionInput,
): Promise<ActiveBrokerSessionCapture> => {
  const input = validateCommitInput(rawInput);
  const startingEpoch = getActiveBrokerSessionEpoch();
  const directory = await getBrokerDirectoryForBroker(input.session.brokerId);
  const supported = directory.selectableServers.find(row => row.broker_id === input.session.brokerId && row.market_api_url === input.session.apiBase);
  if (!supported) throw new Error('This trading session is not supported by the current broker directory.');
  const verified = createPublicBrokerContext(supported);
  if (verified.configVersion !== input.session.configVersion) throw new Error('Broker configuration changed. Select the broker again before signing in.');
  if (verified.apiBase !== input.session.apiBase || verified.feedWsBase !== input.session.feedWsBase || verified.feedStatusUrl !== input.session.feedStatusUrl || (verified.endpoints.tradeWsBase ?? '') !== (input.session.tradeWsBase ?? '')) throw new Error('Trading session endpoints do not match the broker directory.');
  if (rawInput.isCurrent && !rawInput.isCurrent()) throw new Error('Authentication was cancelled.');
  if (getActiveBrokerSessionEpoch() !== startingEpoch) throw new Error('Trading session changed during broker validation.');
  const transition = beginActiveBrokerSessionTransition();
  // Clear the old runtime before persisting the new secure session authority.
  await teardownBrokerSessionRuntime();
  await pruneDisposableSessionStorage();
  useUserPreferences.getState().logout();

  try {
    const [credentials] = await Promise.all([
      replaceAuthSessionCredentials({
        brokerId: input.session.brokerId,
        accountLogin: input.session.accountLogin,
        accessToken: input.credentials.accessToken,
        refreshToken: input.credentials.refreshToken,
        expiresAt: input.credentials.expiresAt,
      }),
      clearLegacySelectedBrokerSession(),
    ]);
    await writeActiveBrokerSessionManifest(input.session);

    if (rawInput.isCurrent && !rawInput.isCurrent()) throw new Error('Authentication was cancelled before session activation.');

    const capture = activateBrokerSession(transition, input.session, {
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt,
    });
    bindCommittedFeedHealthSession(capture);

    useUserPreferences.getState().login(
      String(input.session.accountLogin),
      input.account.name,
      input.account.serverName,
      {
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
        expires_at: credentials.expiresAt,
      },
      input.session.brokerId,
      {
        serverUrl: input.session.apiBase,
        logoUrl: input.account.logoUrl,
        accountType: input.account.accountType,
        accountEnvironmentSource: input.account.accountEnvironmentSource,
      },
    );
    rawInput.onActivated?.(capture);
    await persistSessionPreferences();
    return capture;
  } catch (error) {
    if (captureActiveBrokerSession()) {
      beginActiveBrokerSessionTransition();
    }
    await teardownBrokerSessionRuntime();
    await pruneDisposableSessionStorage();
    useUserPreferences.getState().logout();
    await Promise.allSettled([
      clearAuthSessionTokens(),
      clearActiveBrokerSessionManifest(),
      clearLegacySelectedBrokerSession(),
    ]);
    await persistSessionPreferences();
    throw error;
  }
};

/** Commits credentials + the exact endpoint set before authenticated UI starts. */
export const commitBrokerSession = (
  input: CommitBrokerSessionInput,
  authorization: BrokerSessionCommitAuthorization,
): Promise<ActiveBrokerSessionCapture> =>
  enqueueMutation(() => {
    // This check deliberately runs inside the mutation queue. A logout,
    // completed switch, or newer login that wins while auth is in flight has
    // already changed either the epoch or the active attempt by this point.
    consumeBrokerSessionCommitAuthorization(
      authorization,
      getActiveBrokerSessionEpoch(),
    );
    return commitBrokerSessionInternal(input);
  });

export const restoreBrokerSession = (): Promise<BrokerSessionRestoreResult> =>
  enqueueMutation(async () => {
    let manifest;
    try {
      manifest = await readActiveBrokerSessionManifest();
    } catch {
      return failClosed('Stored broker session manifest could not be read securely.');
    }
    if (!manifest) {
      // An explicit logout removes this secure manifest. Plain AsyncStorage may
      // still contain an older `isLoggedIn` snapshot, but it cannot resurrect a
      // session without the matching secure authority record.
      beginActiveBrokerSessionTransition();
      await teardownBrokerSessionRuntime();
      await pruneDisposableSessionStorage();
      useUserPreferences.getState().logout();
      await Promise.allSettled([
        clearAuthSessionTokens(),
        clearLegacySelectedBrokerSession(),
      ]);
      await persistSessionPreferences();
      return { status: 'logged_out' };
    }

    let credentials;
    try {
      credentials = await getStoredAuthSessionCredentials({
        brokerId: manifest.brokerId,
        accountLogin: manifest.accountLogin,
      });
    } catch {
      return failClosed('Stored broker credentials could not be read securely.');
    }
    if (!credentials) {
      return failClosed('Stored broker credentials are missing or belong to another identity.');
    }
    // Legacy versions lowercased IDs. Migrate only a unique directory identity
    // whose endpoints still match; stored addresses cannot authorize routing.
    try {
      const directory = await getBrokerDirectory();
      const matches = directory.selectableServers.filter(row => {
        if (row.broker_id.toLowerCase() !== manifest!.brokerId.toLowerCase()) return false;
        try { const verified = createPublicBrokerContext(row); return verified.apiBase === manifest!.apiBase && verified.feedWsBase === manifest!.feedWsBase && verified.feedStatusUrl === manifest!.feedStatusUrl; } catch { return false; }
      });
      if (matches.length !== 1) return failClosed('Stored broker is not uniquely supported by the directory.');
      const verified = createPublicBrokerContext(matches[0]);
      if (verified.apiBase !== manifest.apiBase || verified.feedWsBase !== manifest.feedWsBase || verified.feedStatusUrl !== manifest.feedStatusUrl || (verified.endpoints.tradeWsBase ?? '') !== (manifest.tradeWsBase ?? '')) return failClosed('Stored broker endpoints no longer match the directory.');
      manifest = createActiveBrokerSessionManifest({ ...manifest, brokerId: verified.brokerId, configVersion: verified.configVersion });
      credentials = await replaceAuthSessionCredentials({ ...credentials, brokerId: verified.brokerId });
      await writeActiveBrokerSessionManifest(manifest);
    } catch { return failClosed('Broker directory could not revalidate the stored session.'); }

    // Preferences and saved accounts supply display metadata only. A stale GTA
    // snapshot cannot reject a valid Achiever manifest/credential pair.
    const profile = resolveRestoredAccountProfile(manifest);
    const transition = beginActiveBrokerSessionTransition();
    await teardownBrokerSessionRuntime();
    await pruneDisposableSessionStorage();
    useUserPreferences.getState().logout();

    try {
      // Pre-v3 bundles/manifests may still hold feed-token fields; the
      // storage parsers already dropped them, so this restore needs no re-login.
      const capture = activateBrokerSession(transition, manifest, {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      });
      bindCommittedFeedHealthSession(capture);
      useUserPreferences.getState().login(
        manifest.accountLogin,
        profile.name,
        profile.serverName,
        {
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expires_at: credentials.expiresAt,
        },
        manifest.brokerId,
        {
          serverUrl: manifest.apiBase,
          logoUrl: profile.logoUrl,
          accountType: profile.accountType,
          accountEnvironmentSource: profile.accountEnvironmentSource,
        },
      );
      await persistSessionPreferences();
      return { status: 'restored', capture };
    } catch {
      return failClosed('Stored broker session failed endpoint validation.');
    }
  });

/**
 * Logs out the active broker session.
 *
 * The session is invalidated SYNCHRONOUSLY (epoch bump + preference logout)
 * before this returns, so callers can reveal the login screen in the same
 * frame as the tap. The expensive parts — socket teardown, query-cache
 * clear, SecureStore erase — run afterwards inside the serialized mutation
 * queue. Safety is unchanged: a login commit that races the fast-path
 * fail-closes on its stale transition epoch, a follow-up login queues
 * behind this cleanup, and the queued body re-asserts the logged-out state
 * in case a commit was already past activation when the fast-path ran.
 */
export const logoutBrokerSession = (): Promise<void> => {
  dismissAuthFlow();
  beginActiveBrokerSessionTransition();
  useUserPreferences.getState().logout();
  return enqueueMutation(async () => {
    // Let the login screen commit its first frame before the teardown
    // competes for the JS thread (bounded so cleanup can never stall).
    await new Promise<void>((resolve) => {
      const failsafe = setTimeout(resolve, 250);
      InteractionManager.runAfterInteractions(() => {
        clearTimeout(failsafe);
        resolve();
      });
    });
    beginActiveBrokerSessionTransition();
    await teardownBrokerSessionRuntime();
    await pruneDisposableSessionStorage();
    useUserPreferences.getState().logout();
    await erasePersistedSession();
    await persistSessionPreferences();
  });
};

/** Used after refresh/auth integrity failure; never changes to another broker. */
export const invalidateBrokerSession = (
  brokerId: string,
  accountLogin: string,
  sessionEpoch: number,
): Promise<void> =>
  enqueueMutation(async () => {
    if (!isActiveBrokerSessionCurrent({ brokerId, accountLogin, sessionEpoch })) {
      return;
    }
    dismissAuthFlow();
    beginActiveBrokerSessionTransition();
    await teardownBrokerSessionRuntime();
    await pruneDisposableSessionStorage();
    useUserPreferences.getState().logout();
    await erasePersistedSession();
    await persistSessionPreferences();
  });

export const isCommittedBrokerSessionCurrent = (
  capture: ActiveBrokerSessionCapture,
): boolean => isActiveBrokerSessionCurrent(
  getActiveBrokerSessionIdentity(capture.session),
);

/** Recomputes fail-closed feed readiness after an atomic credential rotation. */
export const rebindActiveBrokerFeedHealthSession = (
  capture: ActiveBrokerSessionCapture,
): void => {
  if (isCommittedBrokerSessionCurrent(capture)) {
    bindCommittedFeedHealthSession(capture);
  }
};

brokerApi.setSessionInvalidationHandler((identity) =>
  invalidateBrokerSession(
    identity.brokerId,
    identity.accountLogin,
    identity.sessionEpoch,
  ),
);

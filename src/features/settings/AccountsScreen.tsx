import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: AccountsScreen
 * 
 * Central hub for managing multiple trading accounts. Displays the active 
 * connection status (live ping/health), balances across connected accounts,
 * and handles credential management (passwords).
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { FastPressable } from '../../ui/components/FastPressable';


import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import {
  getSavedAccountPassword,
  removeSavedAccountPassword,
  useSavedAccounts,
  type SavedAccountSnapshot,
  type SavedAccountType,
} from '../../state/savedAccounts';
import { recordAccountJournalEvent } from '../../state/terminalJournalState';
import {
  buildTradeNotificationKey,
  useTradeNotifications,
} from '../../state/tradeNotifications';
import { signInWithCredentials } from '../../api/authSession';
import { dismissAuthFlow } from '../trade/authFlowState';
import { enrichSignedInAccountProfile } from '../../api/authSessionProfile';
import { isLoginRequestAbortedError } from '../../api/auth';
import { redactAuthPayload, redactSensitiveString } from '../../api/authRedaction';
import { removeSecureItemAsync } from '../../utils/secureStorage';
import { fmt } from '../../utils/format';
import { ChangePasswordSheet } from './ChangePasswordSheet';
import { ActionSheet } from '../../ui/components/ActionSheet';


// ── API Integration: fetches live account + broker data for active card ──
import { useAccountDetails } from '../../query/accounts';
import { useBrokerConfig, useBrokerServers } from '../../query/broker';
import { useHealth } from '../../query/health';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import { useTradingState } from '../../state/tradingState';
import { useMarketData } from '../../query/websocket';
import { useWatchlistLiveQuotes } from '../quotes/useLiveQuotes';
import {
  buildTradeAccountSummary,
  resolveRenderableTradeAccountSummary,
  resolveTradeFloatingPnl,
} from '../trade/accountSummary';
import { useTranslation } from '../../i18n/useTranslation';
import { translateAccountCardName } from '../../i18n/translations';
import { useDeferredActiveFlag } from '../../hooks/useDeferredActiveFlag';
import { runImmediateAction } from '../../utils/actionLatency';
import { bootstrapApp } from '../../services/bootstrapApp';
import {
  buildAccountEnvironmentKey,
  mergeAccountEnvironment,
  type AccountEnvironmentState,
  type AccountEnvironmentSource,
} from '../../domain/accountType';
import type { TradingAccount } from '../../api/accounts';
import { checkBrokerServerHealth, type BrokerServer } from '../../api/broker';
import {
  isBrokerServerUrlForApiBase,
  normalizeBrokerServerUrl,
  resolveBrokerEndpointSet,
  toBrokerServiceRoot,
} from '../../api/brokerRouting';
import { createSavedAccountSwitchHealthCache } from './savedAccountSwitchHealthCache';
import { hasAuthenticatedAccountSession } from './accountConnectionStatus';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';
import {
  hideSidebarDestination,
  sidebarDestinationController,
} from '../../ui/components/sidebarDestinationHostController';
import { useRetainedRouteContentReady } from '../../ui/components/DeferredRouteMount';
import {
  hideBrokersLaunch,
  scheduleBrokersLaunchNavigation,
  showBrokersLaunch,
} from './brokersLaunchController';
import {
  authorizeBrokerSessionCommit,
  cancelBrokerSessionCommitAuthorization,
  commitBrokerSession,
  isStaleBrokerSessionCommitError,
  logoutBrokerSession,
  type BrokerSessionCommitAuthorization,
} from '../../services/brokerSessionCoordinator';
import { getActiveBrokerSessionProvenance } from '../../state/activeBrokerSession';
import { resolveAccountBrokerLabels } from './accountBrokerLabels';
import {
  resolveSavedAccountEnvironmentForDisplay,
  resolveSettingsAccountEnvironment,
  SETTINGS_ACCOUNT_ENVIRONMENT_BADGES,
} from './SettingsScreen/accountEnvironmentBadge';

const ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE =
  'Account does not exist on this broker anymore. It was removed from this device.';
const ACCOUNTS_BROKER_RETURN_FALLBACK_MS = 700;

const isBrokerFlowRoute = (pathname: string) => (
  pathname === '/settings/brokers'
  || pathname === '/settings/broker-detail'
  || pathname === '/register-entry'
  || pathname === '/register'
);

/**
 * Accounts can render outside the tabs stack, so its sheet stays local. Keep
 * the scoped-store subscription inside this tiny host: opening or closing the
 * menu must not reconcile the account cards and their FlatList.
 */
const AccountsActionSheetHost = React.memo(function AccountsActionSheetHost() {
  const actionSheet = useUIState((state) => state.scopedActionSheets.settingsAccounts);
  const hideAccountsActionSheet = useUIState((state) => state.hideAccountsActionSheet);

  return (
    <ActionSheet
      visible={actionSheet !== null}
      title={actionSheet?.title}
      titleAlign={actionSheet?.titleAlign}
      compactText={actionSheet?.compactText}
      presentation={actionSheet?.presentation}
      showActionIcons={actionSheet?.showActionIcons}
      actions={actionSheet?.actions ?? []}
      onClose={hideAccountsActionSheet}
      searchable={actionSheet?.searchable}
      searchPlaceholder={actionSheet?.searchPlaceholder}
      detent={actionSheet?.detent}
      minimumTopInset={actionSheet?.minimumTopInset}
      instantOpen={actionSheet?.instantOpen}
      entryMotion={actionSheet?.entryMotion}
      visualKey={actionSheet?.visualKey}
      runActionAfterClose={actionSheet?.runActionAfterClose}
      androidKeyboardAvoidance={actionSheet?.androidKeyboardAvoidance}
      keepFullHeightOnKeyboard={actionSheet?.keepFullHeightOnKeyboard}
    />
  );
});

const ACCOUNTS_SCREEN_DATA_DELAY_MS = 0;
// The sidebar host keeps this screen mounted from boot. Prewarm its visual
// body and run the account queries once while it is still hidden, so the
// first "Manage accounts" open shows real content instead of loading UI.
// Hosted sidebar destination: body mounts immediately; data still prewarms early.
const ACCOUNTS_BODY_PREWARM_DELAY_MS = 0;
const ACCOUNTS_DATA_PREWARM_DELAY_MS = 800;
const ACCOUNTS_DATA_PREWARM_WINDOW_MS = 15000;
const ACCOUNT_SWITCH_BROKER_WARM_TTL_MS = 30_000;

type RetainedAccountsLiveMetrics = Pick<
  ReturnType<typeof useLiveAccountState.getState>,
  'login' | 'balance' | 'equity' | 'margin_free' | 'floating' | 'metricFlags' | 'margin' | 'margin_level'
>;

type RetainedAccountsPositions = Pick<
  ReturnType<typeof usePositionsState.getState>,
  'positions' | 'hydratedLogin'
>;

const schedulePostAccountSwitchWork = (work: () => void) => {
  const runAfterFrame = () => setTimeout(work, 0);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }
  setTimeout(work, 0);
};

const normalizeSwitchLogin = (login: string) => login.trim();

const formatBrokerInitials = (name: string) => {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'BR';
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'BR';
};

type BrokerLogoIndex = {
  byBrokerId: Map<string, string>;
  byServerUrl: Map<string, string>;
  byBrokerName: Map<string, string>;
  byServerName: Map<string, string>;
};

type BrokerLogoIdentity = {
  brokerId?: string | null;
  serverUrl?: string | null;
  brokerName?: string | null;
  serverName?: string | null;
};

const normalizeBrokerLogoUrl = (logoUrl?: string | null) => String(logoUrl ?? '').trim();

const normalizeBrokerLogoBrokerId = (brokerId?: string | null) =>
  String(brokerId ?? '').trim().toLowerCase();

const normalizeBrokerLogoLookupText = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const addBrokerLogoLookup = (
  map: Map<string, string>,
  candidate: string | null | undefined,
  logoUrl: string,
) => {
  const key = normalizeBrokerLogoLookupText(candidate);
  if (key && !map.has(key)) {
    map.set(key, logoUrl);
  }
};

const findBrokerLogoLookup = (
  map: Map<string, string>,
  ...candidates: Array<string | null | undefined>
) => {
  for (const candidate of candidates) {
    const key = normalizeBrokerLogoLookupText(candidate);
    const logoUrl = key ? map.get(key) : undefined;
    if (logoUrl) return logoUrl;
  }
  return '';
};

const buildBrokerLogoIndex = (brokerServers?: readonly BrokerServer[]): BrokerLogoIndex => {
  const byBrokerId = new Map<string, string>();
  const byServerUrl = new Map<string, string>();
  const byBrokerName = new Map<string, string>();
  const byServerName = new Map<string, string>();

  for (const broker of brokerServers ?? []) {
    if (broker.enabled === false) continue;
    const logoUrl = normalizeBrokerLogoUrl(broker.logo_url);
    if (!logoUrl) continue;

    const brokerId = normalizeBrokerLogoBrokerId(broker.broker_id);
    if (brokerId && !byBrokerId.has(brokerId)) {
      byBrokerId.set(brokerId, logoUrl);
    }
    addBrokerLogoLookup(byBrokerName, broker.broker_id, logoUrl);
    addBrokerLogoLookup(byBrokerName, broker.broker_name, logoUrl);
    addBrokerLogoLookup(byServerName, broker.server, logoUrl);
    addBrokerLogoLookup(byServerName, broker.server_domain, logoUrl);
    addBrokerLogoLookup(byServerName, broker.services_domain, logoUrl);
    addBrokerLogoLookup(byServerName, broker.domain_name, logoUrl);

    const serverCandidates = [
      (() => {
        const resolution = resolveBrokerEndpointSet(broker);
        return resolution.ok ? resolution.endpoints.apiBase : '';
      })(),
      broker.server_url,
      broker.market_api_url,
      broker.domains?.services,
      broker.services_domain,
      broker.domains?.server,
      broker.server_domain,
      broker.domains?.domain_name,
      broker.domain_name,
    ];

    for (const candidate of serverCandidates) {
      const normalizedServerUrl = normalizeBrokerServerUrl(candidate);
      if (normalizedServerUrl && !byServerUrl.has(normalizedServerUrl)) {
        byServerUrl.set(normalizedServerUrl, logoUrl);
      }
      // Index both service root and REST base so saved accounts match either form.
      const serviceRoot = toBrokerServiceRoot(normalizedServerUrl || candidate);
      if (serviceRoot && !byServerUrl.has(serviceRoot)) {
        byServerUrl.set(serviceRoot, logoUrl);
      }
    }
  }

  return { byBrokerId, byServerUrl, byBrokerName, byServerName };
};

const resolveAccountBrokerLogoUrl = (
  logoIndex: BrokerLogoIndex,
  identity: BrokerLogoIdentity,
  ...preferredLogoUrls: Array<string | null | undefined>
) => {
  for (const preferredLogoUrl of preferredLogoUrls) {
    const logoUrl = normalizeBrokerLogoUrl(preferredLogoUrl);
    if (logoUrl) return logoUrl;
  }

  const brokerLogo = logoIndex.byBrokerId.get(normalizeBrokerLogoBrokerId(identity.brokerId));
  if (brokerLogo) return brokerLogo;

  const normalizedServerUrl = normalizeBrokerServerUrl(identity.serverUrl);
  const serverLogo = normalizedServerUrl ? logoIndex.byServerUrl.get(normalizedServerUrl) : '';
  if (serverLogo) return serverLogo;

  const brokerNameLogo = findBrokerLogoLookup(
    logoIndex.byBrokerName,
    identity.brokerName,
    identity.brokerId,
  );
  if (brokerNameLogo) return brokerNameLogo;

  return findBrokerLogoLookup(
    logoIndex.byServerName,
    identity.serverName,
    identity.serverUrl,
  );
};

const isMissingSavedAccountSwitchError = (error: unknown) => {
  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalizedMessage = message.toLowerCase();

  return (
    statusCode === 404 ||
    normalizedMessage.includes('account not found') ||
    normalizedMessage.includes('account does not exist') ||
    normalizedMessage.includes('account no longer exists') ||
    normalizedMessage.includes('login not found') ||
    normalizedMessage.includes('user not found')
  );
};

type OtherAccountRow = {
  key: string;
  login: string;
  name: string;
  brokerId: string;
  server: string;
  serverUrl: string;
  logoUrl: string;
  accountType: SavedAccountType;
  accountEnvironmentSource: AccountEnvironmentSource;
  rawGroup?: string;
  hasSavedCredentials: boolean;
  snapshot: SavedAccountSnapshot | null;
  liveAccount: TradingAccount | null;
};

type DeleteAccountTarget =
  | { type: 'current' }
  | { type: 'saved'; row: OtherAccountRow };

const buildSavedAccountSnapshot = (
  account: TradingAccount,
  openPositionsCount?: number,
): SavedAccountSnapshot => ({
  balance: account.balance,
  equity: account.equity,
  freeMargin: account.freeMargin,
  leverage: account.leverage,
  floatingPnl: account.floatingPnl,
  openPositions: openPositionsCount ?? account.openPositions,
  currency: account.currency,
  updatedAt: account.updatedAt,
});

const areSavedAccountSnapshotsEqual = (
  left: SavedAccountSnapshot | undefined,
  right: SavedAccountSnapshot,
) => {
  if (!left) return false;
  return left.balance === right.balance
    && left.equity === right.equity
    && left.freeMargin === right.freeMargin
    && left.leverage === right.leverage
    && left.floatingPnl === right.floatingPnl
    && left.openPositions === right.openPositions
    && left.currency === right.currency
    && left.updatedAt === right.updatedAt;
};

/**
 * Allows the user to manage their trading accounts, switch between them, and add new ones.
 * Route entry point — the body lives in AccountsScreenInner so the sidebar
 * destination host can retain the same view with an externally driven focus flag.
 */
export function AccountsScreen() {
  const isScreenFocused = useIsFocused();
  return <AccountsScreenInner isScreenFocused={isScreenFocused} />;
}

export const AccountsScreenInner = React.memo(function AccountsScreenInner({
  isScreenFocused,
}: {
  isScreenFocused: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = React.useRef(pathname);
  const pendingBrokerReturnCloseRef = React.useRef(false);
  const pendingBrokerReturnTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountsMountedRef = React.useRef(true);
  const accountSwitchInFlightRef = React.useRef(false);
  const activeAccountSwitchAttemptRef = React.useRef<{
    authorization: BrokerSessionCommitAuthorization;
    controller: AbortController;
  } | null>(null);
  pathnameRef.current = pathname;
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const showAccountsActionSheet = useUIState((s) => s.showAccountsActionSheet);
  const isDark = useIsDarkTheme();
  const activeAccountType = useUserPreferences((s) => s.accountType);
  const activeAccountEnvironmentSource = useUserPreferences((s) => s.accountEnvironmentSource);
  const savedAccounts = useSavedAccounts((s) => s.accounts);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  const removeSavedAccount = useSavedAccounts((s) => s.removeAccount);
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const [firstPaintReady, setFirstPaintReady] = React.useState(false);
  // Match the mounted Trade tab: prepare the complete native body before the
  // drawer tap, then reveal an already-built layer. Queries, sockets, broker
  // warmups, and overlays remain gated by isScreenFocused below.
  const hostBodyReady = useRetainedRouteContentReady(
    isScreenFocused, ACCOUNTS_BODY_PREWARM_DELAY_MS,
  );
  const showAccountsBody = isScreenFocused || hostBodyReady;

  React.useEffect(() => {
    let cancelled = false;
    let frameId: number | null = null;
    const markReady = () => {
      if (!cancelled) {
        setFirstPaintReady(true);
      }
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(markReady);
    } else {
      const timerId = setTimeout(markReady, 16);
      return () => {
        cancelled = true;
        clearTimeout(timerId);
      };
    }

    return () => {
      cancelled = true;
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, []);

  // ── GET /account/{login} — the session's trading account ──
  // (`GET /accounts` returns 403 for traders under contract v3 and is not called.)
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const focusDataActive = useDeferredActiveFlag(
    isLoggedIn && isScreenFocused && firstPaintReady,
    ACCOUNTS_SCREEN_DATA_DELAY_MS,
  );
  // Bounded boot prewarm: fill the react-query caches once while hidden so
  // the first open paints real account data. After the window closes, focus
  // is the only thing that can activate these queries again.
  const [dataPrewarmWindowActive, setDataPrewarmWindowActive] = React.useState(false);
  React.useEffect(() => {
    const startTimer = setTimeout(
      () => setDataPrewarmWindowActive(true),
      ACCOUNTS_DATA_PREWARM_DELAY_MS,
    );
    const stopTimer = setTimeout(
      () => setDataPrewarmWindowActive(false),
      ACCOUNTS_DATA_PREWARM_DELAY_MS + ACCOUNTS_DATA_PREWARM_WINDOW_MS,
    );
    return () => {
      clearTimeout(startTimer);
      clearTimeout(stopTimer);
    };
  }, []);
  const screenDataActive = focusDataActive || (isLoggedIn && dataPrewarmWindowActive);

  // ── GET /broker/config — broker name and server name ──
  const brokerId = useUserPreferences((s) => s.brokerId);
  const brokerServerUrl = useUserPreferences((s) => s.brokerServerUrl);
  const brokerLogoUrl = useUserPreferences((s) => s.brokerLogoUrl);
  const { data: brokerConfig } = useBrokerConfig(brokerId, screenDataActive);
  const { data: brokerServers } = useBrokerServers(screenDataActive);
  const brokerLogoIndex = useMemo(() => buildBrokerLogoIndex(brokerServers), [brokerServers]);
  const activeBrokerLogoUrl = resolveAccountBrokerLogoUrl(
    brokerLogoIndex,
    {
      brokerId,
      serverUrl: brokerServerUrl,
      brokerName: brokerConfig?.broker_name,
      serverName: brokerConfig?.server_name,
    },
    brokerLogoUrl,
    brokerConfig?.logo_url,
  );

  // Find the active account by matching the login from Zustand state
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const activeLogin = currentLogin;
  const { data: activeAccountDetails } = useAccountDetails(activeLogin, screenDataActive && !!activeLogin);
  const activeAccount = activeAccountDetails;
  const activeEnvironment = resolveSettingsAccountEnvironment(activeAccount, {
    accountType: activeAccountType,
    source: activeAccountEnvironmentSource,
  });
  const activeEnvironmentBadge = SETTINGS_ACCOUNT_ENVIRONMENT_BADGES[activeEnvironment];
  const activeRibbonLabel = t(activeEnvironmentBadge.label);
  const hasConnectedAccount = hasAuthenticatedAccountSession(isLoggedIn, accountDetails);

  // Build the "Other Connected Accounts" list from the persistent
  // saved-accounts directory — accounts the user logged into in prior
  // sessions, even on different brokers. Entries are deduped by
  // `${brokerId}:${login}`. (Contract v3 has no per-user account list:
  // `GET /accounts` is 403 for traders.)
  const activeBrokerId = brokerId;
  const activeLoginStr = activeAccount
    ? String(activeAccount.login)
    : accountDetails?.id ?? '';
  const activeKey = buildAccountEnvironmentKey(activeBrokerId, activeLoginStr);
  const savedActiveAccount = savedAccounts.find(
    (account) => buildAccountEnvironmentKey(account.brokerId, account.login) === activeKey,
  );
  const activeBrokerLabels = resolveAccountBrokerLabels({
    brokerId: activeBrokerId,
    serverUrl: brokerServerUrl || savedActiveAccount?.serverUrl,
    config: brokerConfig,
    directory: brokerServers,
    sessionServerName: accountDetails?.server,
    savedServerName: savedActiveAccount?.server,
  });
  const displayBrokerName = activeBrokerLabels.brokerName || t('Broker unavailable');
  const displayServerName = activeBrokerLabels.serverName || t('Server unavailable');

  const otherRows: OtherAccountRow[] = useMemo(() => {
    const map = new Map<string, OtherAccountRow>();

    for (const sa of savedAccounts) {
      const key = buildAccountEnvironmentKey(sa.brokerId, sa.login);
      if (key === activeKey) continue;
      const savedLogoUrl = sa.brokerId === activeBrokerId
        ? resolveAccountBrokerLogoUrl(
            brokerLogoIndex,
            {
              brokerId: sa.brokerId,
              serverUrl: sa.serverUrl,
              brokerName: sa.server,
              serverName: sa.server,
            },
            sa.logoUrl,
            activeBrokerLogoUrl,
          )
        : resolveAccountBrokerLogoUrl(
            brokerLogoIndex,
            {
              brokerId: sa.brokerId,
              serverUrl: sa.serverUrl,
              brokerName: sa.server,
              serverName: sa.server,
            },
            sa.logoUrl,
          );
      map.set(key, {
        key,
        login: sa.login,
        name: sa.name,
        brokerId: sa.brokerId,
        server: sa.server,
        serverUrl: sa.serverUrl ?? '',
        logoUrl: savedLogoUrl,
        accountType: sa.accountType,
        accountEnvironmentSource: sa.accountEnvironmentSource,
        ...(sa.rawGroup ? { rawGroup: sa.rawGroup } : {}),
        hasSavedCredentials: sa.hasCredentials,
        snapshot: sa.snapshot ?? null,
        liveAccount: null,
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      // Live entries first (they have actionable balances), then saved-only.
      if (!!a.liveAccount !== !!b.liveAccount) return a.liveAccount ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [activeBrokerId, activeKey, activeBrokerLogoUrl, brokerLogoIndex, savedAccounts]);

  // Backfill the active session into the directory so accounts that were
  // logged in before this feature shipped (or pre-existing sessions on first
  // open) show up once the user signs into another account. The entry has
  // hasCredentials=false until the user signs in via the form again.
  React.useEffect(() => {
    if (!isScreenFocused || !isLoggedIn || !activeAccount) return;
    if (!activeBrokerId || !activeLoginStr) return;
    const existing = savedAccounts.find(
      (sa) => sa.brokerId === activeBrokerId && sa.login === activeLoginStr,
    );
    // open_positions is not sent by `GET /account/{login}`: use the hydrated
    // positions list length for this login when available.
    const positionsSnapshot = usePositionsState.getState();
    const snapshot = buildSavedAccountSnapshot(
      activeAccount,
      positionsSnapshot.hydratedLogin === activeLoginStr
        ? positionsSnapshot.positions.length
        : undefined,
    );
    const nextName = activeAccount.name || `Account ${activeLoginStr}`;
    const nextServer = activeBrokerLabels.serverName || existing?.server || '';
    const nextServerUrl = brokerServerUrl || existing?.serverUrl || '';
    const nextLogoUrl = activeBrokerLogoUrl || existing?.logoUrl || '';
    // The polled list/detail query is display data, not a canonical session
    // refresh. Reuse the already provenance-guarded active environment so a
    // delayed list response cannot overwrite a newer singular-route result.
    const nextEnvironment: AccountEnvironmentState = activeAccountType === 'unknown'
      ? mergeAccountEnvironment(null, {
          accountKey: activeKey,
          resolved: 'unknown',
          source: 'unknown',
          allowInitialFallback: true,
        })!
      : {
          accountKey: activeKey,
          accountType: activeAccountType,
          accountEnvironmentSource: activeAccountEnvironmentSource,
          isDemoAccount: activeAccountType === 'demo',
        };
    if (
      existing
      && existing.name === nextName
      && existing.server === nextServer
      && (existing.serverUrl ?? '') === nextServerUrl
      && (existing.logoUrl ?? '') === nextLogoUrl
      && existing.accountType === nextEnvironment.accountType
      && existing.accountEnvironmentSource === nextEnvironment.accountEnvironmentSource
      && (existing.rawGroup ?? '') === activeAccount.group
      && areSavedAccountSnapshotsEqual(existing.snapshot, snapshot)
    ) {
      return;
    }
    upsertSavedAccount({
      login: activeLoginStr,
      name: nextName,
      brokerId: activeBrokerId,
      server: nextServer,
      serverUrl: nextServerUrl || undefined,
      logoUrl: nextLogoUrl,
      accountType: nextEnvironment.accountType,
      accountEnvironmentSource: nextEnvironment.accountEnvironmentSource,
      rawGroup: activeAccount.group,
      lastUsedAt: existing?.lastUsedAt ?? Date.now(),
      hasCredentials: existing?.hasCredentials ?? false,
      snapshot,
    });
  }, [
    activeAccount,
    activeAccountEnvironmentSource,
    activeAccountType,
    activeBrokerId,
    activeKey,
    activeLoginStr,
    activeBrokerLabels.serverName,
    activeBrokerLogoUrl,
    brokerServerUrl,
    isScreenFocused,
    isLoggedIn,
    savedAccounts,
    upsertSavedAccount,
  ]);

  // ── Live WebSocket account metrics (real-time balance/equity from accountSocket) ──
  const retainedLiveMetricsRef = React.useRef<RetainedAccountsLiveMetrics | null>(null);
  if (retainedLiveMetricsRef.current === null) {
    const initialMetrics = useLiveAccountState.getState();
    retainedLiveMetricsRef.current = {
      login: initialMetrics.login,
      balance: initialMetrics.balance,
      equity: initialMetrics.equity,
      margin_free: initialMetrics.margin_free,
      floating: initialMetrics.floating,
      metricFlags: initialMetrics.metricFlags,
      margin: initialMetrics.margin,
      margin_level: initialMetrics.margin_level,
    };
  }
  const liveMetrics = useLiveAccountState(
    useShallow((state): RetainedAccountsLiveMetrics => (
      isScreenFocused
        ? {
          login: state.login,
          balance: state.balance,
          equity: state.equity,
          margin_free: state.margin_free,
          floating: state.floating,
          metricFlags: state.metricFlags,
          margin: state.margin,
          margin_level: state.margin_level,
        }
        : retainedLiveMetricsRef.current as RetainedAccountsLiveMetrics
    )),
  );
  if (isScreenFocused) {
    retainedLiveMetricsRef.current = liveMetrics;
  }
  const {
    login: liveLogin,
    balance: liveBalance,
    equity: liveEquity,
    margin_free: liveMarginFree,
    floating: liveFloating,
    metricFlags: liveMetricFlags,
    margin: liveMargin,
    margin_level: liveMarginLevel,
  } = liveMetrics;
  // The account WS only sends a one-time metrics snapshot, so equity/free-margin/
  // floating from it are frozen. Recompute them live from open positions x live
  // quotes (the same source the Trade screen uses) so the connected account's
  // card updates on every tick. Falls back to the snapshot when positions are
  // not hydrated for this login.
  const retainedPositionsRef = React.useRef<RetainedAccountsPositions | null>(null);
  if (retainedPositionsRef.current === null) {
    const initialPositions = usePositionsState.getState();
    retainedPositionsRef.current = {
      positions: initialPositions.positions,
      hydratedLogin: initialPositions.hydratedLogin,
    };
  }
  const livePositionState = usePositionsState(
    useShallow((state): RetainedAccountsPositions => (
      isScreenFocused
        ? { positions: state.positions, hydratedLogin: state.hydratedLogin }
        : retainedPositionsRef.current as RetainedAccountsPositions
    )),
  );
  if (isScreenFocused) {
    retainedPositionsRef.current = livePositionState;
  }
  const { positions: livePositions, hydratedLogin: liveHydratedLogin } = livePositionState;
  const retainedTradingAccountRef = React.useRef(useTradingState.getState().account);
  const liveTradingAccount = useTradingState((state) => (
    isScreenFocused ? state.account : retainedTradingAccountRef.current
  ));
  if (isScreenFocused) {
    retainedTradingAccountRef.current = liveTradingAccount;
  }

  // Extract the essential display values — prefer live WS data, fall back to REST API
  const displayLogin = activeAccount ? String(activeAccount.login) : (accountDetails?.id ?? '---');
  const rawDisplayName = activeAccount?.name?.trim() || (displayLogin !== '---' ? `Account ${displayLogin}` : '---');
  const displayName = rawDisplayName === '---' ? rawDisplayName : translateAccountCardName(rawDisplayName, t);
  const displayCurrency = activeAccount?.currency ?? 'USD';
  const liveMatchesActiveAccount = liveLogin !== 0 && (!activeAccount || liveLogin === activeAccount.login);
  const resolvedAccountLogin = activeAccount?.login ?? (accountDetails?.id ? Number(accountDetails.id) : undefined);
  const livePositionSymbols = useMemo(
    () => Array.from(new Set(livePositions.map((p) => p.symbol))),
    [livePositions],
  );
  // Keep the open positions' symbols fresh (REST poll + WS) while viewing this
  // account so the floating below reflects current prices and updates as the
  // market moves — same source/cadence as the Trade summary header. Without this,
  // useTradingState.quotes (what useMarketData reads) goes stale off the Quotes
  // screen and the calc falls back to the frozen position-snapshot price.
  const liveQuoteDataActive = isScreenFocused && screenDataActive && liveMatchesActiveAccount;
  useWatchlistLiveQuotes(livePositionSymbols, liveQuoteDataActive);
  const liveQuotes = useMarketData(livePositionSymbols, liveQuoteDataActive);
  // Live equity = balance + credit + (live floating); free margin = equity - margin.
  const liveAccountSummary = useMemo(() => {
    const summary = buildTradeAccountSummary(
      {
        login: liveLogin,
        balance: liveBalance,
        equity: liveEquity,
        margin: liveMargin,
        margin_free: liveMarginFree,
        margin_level: liveMarginLevel,
        floating: liveFloating,
        metricFlags: liveMetricFlags,
      },
      liveTradingAccount,
    );
    const floating = resolveTradeFloatingPnl(
      summary.floating,
      livePositions,
      liveHydratedLogin,
      resolvedAccountLogin,
      liveQuotes,
    );
    return resolveRenderableTradeAccountSummary(summary, floating);
  }, [liveLogin, liveBalance, liveEquity, liveMargin, liveMarginFree, liveMarginLevel, liveFloating, liveMetricFlags, liveTradingAccount, livePositions, liveHydratedLogin, resolvedAccountLogin, liveQuotes]);
  const displayBalance = liveMetricFlags.balance && liveMatchesActiveAccount ? fmt.price(liveBalance) : activeAccount ? fmt.price(activeAccount.balance) : '---';
  const displayEquity = liveMatchesActiveAccount ? fmt.price(liveAccountSummary.equity) : activeAccount ? fmt.price(activeAccount.equity) : '---';
  const displayLeverage = activeAccount ? `1:${activeAccount.leverage}` : '---';
  const displayFreeMargin = liveMatchesActiveAccount ? fmt.price(liveAccountSummary.freeMargin) : activeAccount ? fmt.price(activeAccount.freeMargin) : '---';
  const displayFloatingPnl = liveMatchesActiveAccount ? liveAccountSummary.floating : (activeAccount?.floatingPnl ?? 0);
  // `GET /account/{login}` does not send open_positions (contract v3), so the
  // count is the hydrated open-positions list length for the connected account
  // (same source the Trade screen uses); fall back to the saved snapshot when
  // positions aren't hydrated for this login.
  const livePositionsMatchActive =
    liveHydratedLogin != null &&
    resolvedAccountLogin != null &&
    liveHydratedLogin === String(resolvedAccountLogin);
  const displayOpenPositions = livePositionsMatchActive
    ? livePositions.length
    : (activeAccount?.openPositions ?? 0);
  // Hydrate + refresh the connected account's positions while this screen is
  // focused so the "N open" chip shows that account's live open-trade count and
  // stays dynamic as trades open/close (same source/pattern as the Trade screen).
  React.useEffect(() => {
    if (resolvedAccountLogin == null) return;
    void usePositionsState.getState().hydrateCachedPositions(String(resolvedAccountLogin));
  }, [resolvedAccountLogin]);
  React.useEffect(() => {
    if (!screenDataActive || resolvedAccountLogin == null) return;
    void usePositionsState.getState().refreshPositions(String(resolvedAccountLogin));
  }, [screenDataActive, resolvedAccountLogin]);

  const { data: health } = useHealth(screenDataActive);

  /**
   * Leaves the screen: when hosted by the sidebar destination host, hiding the
   * host reveals the retained tab underneath instantly; as a pushed route it
   * pops back to the Settings tab.
   */
  const clearPendingBrokerReturnTimer = React.useCallback(() => {
    if (!pendingBrokerReturnTimerRef.current) return;
    clearTimeout(pendingBrokerReturnTimerRef.current);
    pendingBrokerReturnTimerRef.current = null;
  }, []);

  const finishPendingBrokerReturnClose = React.useCallback((settledPathname: string) => {
    if (!pendingBrokerReturnCloseRef.current) return;
    pendingBrokerReturnCloseRef.current = false;
    clearPendingBrokerReturnTimer();
    hideSidebarDestination();

    // A fallback/deep-link can land on a real Accounts route instead of the
    // retained tab underneath. Remove that route too so this Back still ends
    // at the original tab rather than revealing Accounts a second time.
    if (settledPathname === '/settings/accounts') {
      scheduleBackNavigationAfterVisualFrame(() => {
        safeRouterBack(router, '/(tabs)/quotes');
      });
    }
  }, [clearPendingBrokerReturnTimer, router]);

  React.useEffect(() => {
    if (
      pendingBrokerReturnCloseRef.current
      && !isBrokerFlowRoute(pathname)
    ) {
      finishPendingBrokerReturnClose(pathname);
    }
  }, [finishPendingBrokerReturnClose, pathname]);

  React.useEffect(() => () => {
    clearPendingBrokerReturnTimer();
  }, [clearPendingBrokerReturnTimer]);

  const closeAccountsScreen = React.useCallback(() => {
    const hostedSnapshot = sidebarDestinationController.getSnapshot();
    const isBrokerReturnHost = hostedSnapshot.activeDestination === 'accounts'
      && hostedSnapshot.source === 'route-sync';

    if (isBrokerReturnHost && isBrokerFlowRoute(pathnameRef.current)) {
      // Brokers Back has revealed this retained screen before its owned native
      // pop. A rapid Accounts Back must wait for that pop; hiding now exposes
      // the stale Brokers route and breaks the reverse chain.
      if (pendingBrokerReturnCloseRef.current) return;
      pendingBrokerReturnCloseRef.current = true;
      pendingBrokerReturnTimerRef.current = setTimeout(() => {
        if (!pendingBrokerReturnCloseRef.current) return;
        pendingBrokerReturnTimerRef.current = null;
        router.replace('/(tabs)/quotes');
        finishPendingBrokerReturnClose('/(tabs)/quotes');
      }, ACCOUNTS_BROKER_RETURN_FALLBACK_MS);
      return;
    }

    if (hideSidebarDestination()) {
      if (isBrokerReturnHost && pathnameRef.current === '/settings/accounts') {
        scheduleBackNavigationAfterVisualFrame(() => {
          safeRouterBack(router, '/(tabs)/quotes');
        });
      }
      return;
    }
    safeRouterBack(router, '/(tabs)/settings');
  }, [finishPendingBrokerReturnClose, router]);

  React.useEffect(
    () => sidebarDestinationController.registerBackHandler('accounts', () => {
      if (sidebarDestinationController.getSnapshot().activeDestination !== 'accounts') {
        return false;
      }
      closeAccountsScreen();
      return true;
    }),
    [closeAccountsScreen],
  );

  /**
   * Navigates the user to the Brokers screen to search for and connect a new trading account.
   */
  const handleConnectAccount = React.useCallback(() => {
    // The root-level Brokers shell covers Accounts synchronously. Deactivate
    // Accounts only after the retained Brokers frame has had two paints. It
    // stays safely underneath the opaque cover, and its focus reconciliation
    // no longer competes with the accepted touch frame.
    const launchRevision = showBrokersLaunch();
    scheduleBrokersLaunchNavigation(launchRevision, () => {
      try {
        router.push('/settings/brokers');
        hideSidebarDestination();
      } catch (error) {
        hideBrokersLaunch(launchRevision);
        throw error;
      }
    });
  }, [router]);

  const [connectingKey, setConnectingKey] = React.useState<string | null>(null);
  const savedAccountSwitchHealthRef = React.useRef<
    ReturnType<typeof createSavedAccountSwitchHealthCache> | null
  >(null);
  if (!savedAccountSwitchHealthRef.current) {
    savedAccountSwitchHealthRef.current = createSavedAccountSwitchHealthCache({
      checkHealth: checkBrokerServerHealth,
      ttlMs: ACCOUNT_SWITCH_BROKER_WARM_TTL_MS,
    });
  }
  const [expandedAccountKey, setExpandedAccountKey] = React.useState<string | null>(null);
  const [passwordSheetVisible, setPasswordSheetVisible] = React.useState(false);
  const [passwordType, setPasswordType] = React.useState<'master' | 'investor'>('master');
  const [successMessage, setSuccessMessage] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteAccountTarget | null>(null);
  const [tradeNotificationsSheetVisible, setTradeNotificationsSheetVisible] = React.useState(false);
  const [brokerLogoFailed, setBrokerLogoFailed] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    accountsMountedRef.current = true;
    return () => {
      accountsMountedRef.current = false;
      const activeAttempt = activeAccountSwitchAttemptRef.current;
      activeAttempt?.controller.abort();
      cancelBrokerSessionCommitAuthorization(activeAttempt?.authorization);
      activeAccountSwitchAttemptRef.current = null;
      accountSwitchInFlightRef.current = false;
      savedAccountSwitchHealthRef.current?.clear();
    };
  }, []);

  React.useEffect(() => {
    if (isScreenFocused) return;
    const activeAttempt = activeAccountSwitchAttemptRef.current;
    activeAttempt?.controller.abort();
    cancelBrokerSessionCommitAuthorization(activeAttempt?.authorization);
    activeAccountSwitchAttemptRef.current = null;
    accountSwitchInFlightRef.current = false;
    setConnectingKey(null);
    setExpandedAccountKey(null);
    setPasswordSheetVisible(false);
    setTradeNotificationsSheetVisible(false);
    setDeleteTarget(null);
    setSuccessMessage('');
    useUIState.getState().hideAccountsActionSheet();
  }, [isScreenFocused]);

  /**
   * Callback triggered when a remote broker logo URL fails to load, gracefully falling back to a placeholder icon.
   */
  const handleBrokerLogoError = React.useCallback((logoUri: string) => {
    setBrokerLogoFailed((current) => (
      current[logoUri] ? current : { ...current, [logoUri]: true }
    ));
  }, []);

  const tradeNotificationKey = brokerId && displayLogin !== '---'
    ? buildTradeNotificationKey(brokerId, displayLogin)
    : '';
  const tradeNotificationsEnabled = useTradeNotifications(
    (s) => (tradeNotificationKey ? !!s.enabledKeys[tradeNotificationKey] : false),
  );
  const setTradeNotificationsEnabled = useTradeNotifications((s) => s.setEnabled);

  const ensureSavedAccountBrokerHealth = React.useCallback((serverUrl: string) => (
    savedAccountSwitchHealthRef.current!.ensureHealthy(serverUrl)
  ), []);

  const warmSavedAccountBroker = React.useCallback((row: OtherAccountRow) => {
    if (!isScreenFocused || !row.hasSavedCredentials) {
      return;
    }

    const savedServerUrl = normalizeBrokerServerUrl(row.serverUrl);
    if (!savedServerUrl) {
      return;
    }
    const endpointSet = (brokerServers ?? [])
      .filter((broker) => broker.broker_id.trim().toLowerCase() === row.brokerId.trim().toLowerCase())
      .map(resolveBrokerEndpointSet)
      .find((resolution) => (
        resolution.ok
        && isBrokerServerUrlForApiBase(savedServerUrl, resolution.endpoints.apiBase)
      ));
    if (!endpointSet?.ok) {
      return;
    }
    // Handoff: health is {server_url}/health on the service root.
    const serverUrl = toBrokerServiceRoot(endpointSet.endpoints.apiBase) || savedServerUrl;
    void ensureSavedAccountBrokerHealth(serverUrl).catch(() => undefined);
  }, [brokerServers, ensureSavedAccountBrokerHealth, isScreenFocused]);

  /**
   * Logs the user into the selected saved account.
   */
  const handleConnectSavedAccount = async (row: OtherAccountRow) => {
    if (accountSwitchInFlightRef.current) return;
    dismissAuthFlow();
    accountSwitchInFlightRef.current = true;
    setConnectingKey(row.key);
    const commitAuthorization = authorizeBrokerSessionCommit();
    const loginAbortController = new AbortController();
    activeAccountSwitchAttemptRef.current = {
      authorization: commitAuthorization,
      controller: loginAbortController,
    };
    recordAccountJournalEvent(`account switch requested for broker ${row.brokerId}`, {
      accountLogin: row.login,
    });
    try {
      if (!row.hasSavedCredentials) {
        recordAccountJournalEvent('account switch blocked: password not saved', {
          level: 'error',
          accountLogin: row.login,
        });
        Alert.alert(
          t('Password not saved'),
          t('Sign in to this account once so it can be reconnected with one tap next time.'),
        );
        hideSidebarDestination();
        router.push('/login');
        return;
      }

      const handleMissingSavedPassword = () => {
        // Saved entry exists but secure-store lost the credential — clear the
        // stale flag so the directory matches reality and prompt re-login.
        removeSavedAccount(row.login, row.brokerId);
        removeSavedAccountPassword(row.brokerId, row.login).catch(() => undefined);
        recordAccountJournalEvent('account switch failed: saved password missing', {
          level: 'error',
          accountLogin: row.login,
        });
        Alert.alert(
          t('Password not saved'),
          t('Sign in to this account once so it can be reconnected with one tap next time.'),
        );
        hideSidebarDestination();
        router.push('/login');
      };
      const passwordPromise = getSavedAccountPassword(row.brokerId, row.login);
      const approvedRoutes = (brokerServers ?? [])
        .filter((broker) => broker.broker_id.trim().toLowerCase() === row.brokerId.trim().toLowerCase())
        .map((broker) => ({ broker, resolution: resolveBrokerEndpointSet(broker) }))
        .filter((candidate) => candidate.resolution.ok);
      const savedServerUrl = normalizeBrokerServerUrl(row.serverUrl);
      const exactSavedRoute = approvedRoutes.find((candidate) => (
        candidate.resolution.ok
        && isBrokerServerUrlForApiBase(savedServerUrl, candidate.resolution.endpoints.apiBase)
      ));
      const approvedRoute = exactSavedRoute;
      if (!approvedRoute?.resolution.ok) {
        if (!await passwordPromise) {
          handleMissingSavedPassword();
          return;
        }
        throw new Error(t('The saved broker server no longer matches the broker directory. Select the broker again.'));
      }
      const endpoints = approvedRoute.resolution.endpoints;
      const approvedLogoUrl = approvedRoute.broker.logo_url?.trim() || row.logoUrl;
      const exactServerUrl = toBrokerServiceRoot(endpoints.apiBase) || savedServerUrl;

      // SecureStore and exact-host health are independent. Run them together,
      // reusing any expansion/touch-down preflight instead of issuing a second
      // health request. Login still waits for a successful exact-host check.
      const brokerHealthResultPromise = ensureSavedAccountBrokerHealth(exactServerUrl).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const password = await passwordPromise;
      if (!password) {
        handleMissingSavedPassword();
        return;
      }
      const brokerHealthResult = await brokerHealthResultPromise;
      if (!brokerHealthResult.ok) {
        throw brokerHealthResult.error;
      }

      const result = await signInWithCredentials({
        username: row.login,
        password,
        brokerId: endpoints.brokerId,
        // Directory broker_name: the server label until /broker/config answers.
        brokerName: approvedRoute.broker.broker_name?.trim() || undefined,
        serverUrl: exactServerUrl,
        logoUrl: approvedLogoUrl,
        signal: loginAbortController.signal,
      });

      if (normalizeSwitchLogin(result.accountLogin) !== normalizeSwitchLogin(row.login)) {
        throw new Error(ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE);
      }
      const switchedAccountKey = buildAccountEnvironmentKey(
        endpoints.brokerId,
        result.accountLogin,
      );
      const previousSwitchedEnvironment: AccountEnvironmentState | null =
        row.accountType !== 'unknown'
          ? {
              accountKey: switchedAccountKey,
              accountType: row.accountType,
              accountEnvironmentSource: row.accountEnvironmentSource,
              isDemoAccount: row.accountType === 'demo',
            }
          : null;
      const switchedAccountEnvironment = mergeAccountEnvironment(
        previousSwitchedEnvironment,
        {
          accountKey: switchedAccountKey,
          resolved: result.accountType,
          source: result.accountEnvironmentSource,
          allowInitialFallback: true,
        },
      )!;

      const committedSession = await commitBrokerSession({
        isCurrent: () => !loginAbortController.signal.aborted && activeAccountSwitchAttemptRef.current?.authorization === commitAuthorization,
        session: {
          brokerId: endpoints.brokerId,
          accountLogin: result.accountLogin,
          apiBase: endpoints.apiBase,
          feedWsBase: endpoints.feedWsBase,
          tradeWsBase: endpoints.tradeWsBase,
          feedStatusUrl: endpoints.feedStatusUrl,
          servicesDomain: endpoints.servicesDomain,
          investor: result.investor,
          configVersion: endpoints.configVersion,
        },
        credentials: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAtIso,
        },
        account: {
          name: result.accountName,
          serverName: result.serverName || row.server || result.brokerId,
          logoUrl: approvedLogoUrl,
          accountType: switchedAccountEnvironment.accountType,
          accountEnvironmentSource: switchedAccountEnvironment.accountEnvironmentSource,
        },
      }, commitAuthorization);
      const committedProvenance = getActiveBrokerSessionProvenance(committedSession.session);

      setSuccessMessage(t('Account switched successfully'));
      recordAccountJournalEvent(`account switched successfully on ${result.brokerId}`, {
        level: 'success',
        accountLogin: result.accountLogin,
      });

      // Let the new active-account state and success feedback paint before
      // persistence and dashboard hydration fan out in the background.
      schedulePostAccountSwitchWork(() => {
        upsertSavedAccount({
          login: result.accountLogin,
          name: result.accountName || row.name,
          brokerId: result.brokerId,
          server: result.serverName || row.server,
          serverUrl: exactServerUrl,
          logoUrl: approvedLogoUrl,
          accountType: switchedAccountEnvironment.accountType,
          accountEnvironmentSource: switchedAccountEnvironment.accountEnvironmentSource,
          ...(result.accountGroup ? { rawGroup: result.accountGroup } : {}),
          lastUsedAt: Date.now(),
          hasCredentials: true,
        });

        const bootstrapPromise = bootstrapApp({
          accountLogin: result.accountLogin,
          expectedProvenance: committedProvenance,
        });
        bootstrapPromise.catch((err) => {
          console.error('[Accounts] Failed to bootstrap switched account', redactAuthPayload(err));
        });
        // Name from /account/{login} (reusing bootstrap's fetch) and server
        // from /broker/config. Never blocks or fails the switch.
        void enrichSignedInAccountProfile({
          provenance: committedProvenance,
          brokerId: result.brokerId,
          accountLogin: result.accountLogin,
          accountDetail: bootstrapPromise.then((bootstrap) => bootstrap?.accounts ?? undefined),
        }).catch(() => undefined);
      });
    } catch (error: any) {
      if (
        !accountsMountedRef.current ||
        isLoginRequestAbortedError(error) ||
        isStaleBrokerSessionCommitError(error)
      ) {
        return;
      }
      if (isMissingSavedAccountSwitchError(error)) {
        removeSavedAccount(row.login, row.brokerId);
        removeSavedAccountPassword(row.brokerId, row.login).catch(() => undefined);
        recordAccountJournalEvent('account switch failed: account does not exist', {
          level: 'error',
          accountLogin: row.login,
        });
        Alert.alert(
          t('Account does not exist'),
          t(ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE),
        );
        return;
      }
      const safeErrorMessage = redactSensitiveString(
        typeof error?.message === 'string' && error.message.trim()
          ? error.message
          : t('Unable to switch account.'),
      );
      recordAccountJournalEvent(`account switch failed: ${safeErrorMessage}`, {
        level: 'error',
        accountLogin: row.login,
      });
      Alert.alert(t('Switch failed'), safeErrorMessage);
    } finally {
      cancelBrokerSessionCommitAuthorization(commitAuthorization);
      if (activeAccountSwitchAttemptRef.current?.authorization === commitAuthorization) {
        activeAccountSwitchAttemptRef.current = null;
      }
      accountSwitchInFlightRef.current = false;
      if (accountsMountedRef.current) {
        setConnectingKey(null);
      }
    }
  };

  /**
   * Prompts the user with a confirmation dialog before deleting the saved credentials for an account.
   */
  const handleRemoveSavedAccount = (row: OtherAccountRow) => {
    setDeleteTarget({ type: 'saved', row });
  };

  const openOtherAccountOptions = (row: OtherAccountRow) => {
    const title = translateAccountCardName(row.name || `Account ${row.login}`, t);
    runImmediateAction('accounts.saved.optionsSheet.open', () =>
      showAccountsActionSheet({
        title,
        presentation: 'mt5Plain',
        detent: 'auto',
        instantOpen: true,
        entryMotion: 'mt5Slide',
        runActionAfterClose: false,
        actions: [
          { label: t('Delete account'), danger: true, onPress: () => handleRemoveSavedAccount(row) },
        ],
      }),
    );
  };

  const openPasswordSheet = React.useCallback((type: 'master' | 'investor') => {
    setPasswordType(type);
    setPasswordSheetVisible(true);
  }, []);

  /**
   * Cancels the account deletion process and closes the confirmation modal.
   */
  const handleDismissDeleteAccount = () => {
    setDeleteTarget(null);
  };

  /**
   * Permanently removes the selected account from local device storage and state.
   */
  const handleConfirmDeleteAccount = () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (target?.type === 'saved') {
      removeSavedAccount(target.row.login, target.row.brokerId);
      removeSavedAccountPassword(target.row.brokerId, target.row.login).catch(() => undefined);
      return;
    }
    if (target?.type !== 'current') return;
    if (displayLogin && displayLogin !== '---' && brokerId) {
      removeSavedAccount(displayLogin, brokerId);
      removeSavedAccountPassword(brokerId, displayLogin).catch(() => undefined);
    }
    // Wipe the login screen's auto-fill credentials so the deleted account's
    // broker id / login id / password do NOT pre-populate on next visit.
    removeSecureItemAsync('rtx5_saved_login').catch(() => undefined);
    recordAccountJournalEvent('current account deleted and local session logged out', {
      level: 'success',
      accountLogin: displayLogin,
    });
    // Delete must NOT redirect to /login (that's the logout flow). Go back
    // to the settings tab so the user sees the app in a logged-out state
    // without their old credentials pre-filled anywhere.
    // logoutBrokerSession invalidates the session synchronously; close the
    // screen immediately while the secure cleanup finishes in the background.
    const cleanup = logoutBrokerSession();
    closeAccountsScreen();
    void cleanup.catch((error) => {
      console.error('[Accounts] Secure logout cleanup failed', redactAuthPayload(error));
    });
  };

  const accountsOptionsSheetConfig = React.useMemo<Parameters<typeof showAccountsActionSheet>[0]>(() => ({
    presentation: 'mt5Plain',
    detent: 'auto',
    instantOpen: true,
    entryMotion: 'mt5Slide',
    runActionAfterClose: false,
    visualKey: `accounts.options|${t('Change master password')}|${t('Delete account')}`,
    actions: [
      { label: t('Change master password'), onPress: () => openPasswordSheet('master') },
      { label: t('Change investor password'), onPress: () => openPasswordSheet('investor') },
      { label: t('Clear saved password') },
      { label: t('Delete account'), danger: true, onPress: () => setDeleteTarget({ type: 'current' }) },
    ],
  }), [openPasswordSheet, showAccountsActionSheet, t]);

  const preloadAccountsActionSheet = useUIState((s) => s.preloadScopedActionSheet);
  React.useEffect(() => {
    if (!isScreenFocused) {
      return;
    }
    preloadAccountsActionSheet('settingsAccounts', accountsOptionsSheetConfig);
  }, [accountsOptionsSheetConfig, isScreenFocused, preloadAccountsActionSheet]);

  const openOptions = React.useCallback(() => {
    runImmediateAction('accounts.optionsSheet.open', () =>
      showAccountsActionSheet(accountsOptionsSheetConfig),
    );
  }, [accountsOptionsSheetConfig, showAccountsActionSheet]);

  const deleteAccountName = deleteTarget?.type === 'saved'
    ? translateAccountCardName(deleteTarget.row.name || `Account ${deleteTarget.row.login}`, t)
    : displayName;
  const deleteAccountLogin = deleteTarget?.type === 'saved'
    ? deleteTarget.row.login
    : displayLogin;
  const deleteAccountServer = deleteTarget?.type === 'saved'
    ? deleteTarget.row.server || deleteTarget.row.brokerId
    : displayServerName;
  const deleteAccountLogoUri = deleteTarget?.type === 'saved'
    ? deleteTarget.row.logoUrl
    : activeBrokerLogoUrl;
  const deleteAccountIsCurrent = deleteTarget?.type === 'current';

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}>
          <FastPressable
            style={styles.iconBtn}
            hitSlop={15}
            onPress={closeAccountsScreen}
            activateOnPressIn
            activateOnTouchStart
            latencyLabel="accounts.back"
            latencyBudgetMs={50}
            unstable_pressDelay={0}
          >
            <Ionicons name="arrow-back" size={28} color={T.text} />
          </FastPressable>
          <Text style={styles.headerTitle}>{t('Accounts')}</Text>
          <View style={styles.headerRight}>
            <FastPressable
              style={styles.iconBtn}
              hitSlop={10}
              onPress={() => Alert.alert(t('Certification'), t('Certification info will be displayed here.'))}
              activateOnPressIn
              latencyLabel="accounts.certification.open"
              unstable_pressDelay={0}
            >
              <Ionicons name="ribbon-outline" size={24} color={T.text} />
            </FastPressable>
            <FastPressable
              style={styles.iconBtn}
              hitSlop={10}
              onPress={handleConnectAccount}
              activateOnPressIn
              activateOnTouchStart
              latencyLabel="accounts.connect.open"
              latencyBudgetMs={50}
              unstable_pressDelay={0}
            >
              <Ionicons name="add" size={30} color={T.text} />
            </FastPressable>
            <FastPressable
              style={styles.iconBtn}
              hitSlop={10}
              onPress={openOptions}
              activateOnPressIn
              activateOnTouchStart
              latencyLabel="accounts.options.open"
              unstable_pressDelay={0}
            >
              <Ionicons name="ellipsis-vertical" size={24} color={T.text} />
            </FastPressable>
          </View>
        </View>

        {showAccountsBody ? (
        <FlatList
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          data={otherRows}
          keyExtractor={(row) => row.key}
          // Virtualize the other-accounts list: render only what fills the screen
          // plus a small buffer, then render the rest lazily as the user scrolls.
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={9}
          removeClippedSubviews={false}
          ListHeaderComponent={(
            <>
          {/* ── Active Account Card ── */}
          <View style={styles.activeCard}>
            {/* Corner ribbons */}
            <View style={[styles.ribbonRight, { backgroundColor: activeEnvironmentBadge.backgroundColor }]}>
              <Text style={[styles.ribbonRightText, { color: activeEnvironmentBadge.color }]}>{activeRibbonLabel}</Text>
            </View>
            {/* Top: Avatar + Name + Connected badge */}
            <View style={styles.activeTopRow}>
              <View style={styles.avatarWrap}>
                <BrokerLogoAvatar
                  logoUri={activeBrokerLogoUrl}
                  label={displayBrokerName}
                  failed={activeBrokerLogoUrl ? !!brokerLogoFailed[activeBrokerLogoUrl] : false}
                  onError={handleBrokerLogoError}
                  variant="active"
                  styles={styles}
                />
              </View>
              <View style={styles.activeInfoCol}>
                <View style={styles.nameAndBadges}>
                  <Text style={styles.activeName} numberOfLines={1}>{displayName}</Text>
                  <View style={styles.badgesRow}>
                    {hasConnectedAccount ? (
                      <View style={styles.connectedBadge}>
                        <View style={styles.connectedDot} />
                        <Text style={styles.connectedLabel}>{t('Connected')}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.activeCompany} numberOfLines={2}>{displayBrokerName}</Text>
              </View>
            </View>

            {/* Balance — hero section */}
            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>{t('Balance')}</Text>
              <Text style={styles.balanceValue}>{displayBalance} <Text style={styles.balanceCurrency}>{displayCurrency}</Text></Text>
            </View>

            {/* Metrics grid */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Equity')}</Text>
                <Text style={styles.metricValue}>{displayEquity}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Free Margin')}</Text>
                <Text style={styles.metricValue}>{displayFreeMargin}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Leverage')}</Text>
                <Text style={styles.metricValue}>{displayLeverage}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Floating Profit/Loss')}</Text>
                <Text style={[styles.metricValue, { color: displayFloatingPnl >= 0 ? T.trading.profit : '#EF4444' }]} numberOfLines={1}>{displayFloatingPnl >= 0 ? '+' : ''}{fmt.price(displayFloatingPnl)}</Text>
              </View>
            </View>

            {/* Detail chips row */}
            <View style={styles.detailChipsRow}>
              <View style={styles.detailChip}>
                <Ionicons name="key-outline" size={13} color={T.textMuted} />
                <Text style={styles.detailChipText}>{displayLogin}</Text>
              </View>
              <View style={styles.detailChip}>
                <Ionicons name="server-outline" size={13} color={T.textMuted} />
                <Text style={styles.detailChipText} numberOfLines={2}>{displayServerName}</Text>
              </View>
              <View style={styles.detailChip}>
                <Ionicons name="briefcase-outline" size={13} color={T.textMuted} />
                <Text style={styles.detailChipText}>{displayOpenPositions} {t('open')}</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.activeDivider} />

            {/* Status + Actions row */}
            <View style={styles.activeFooter}>
              <View style={styles.statusRow}>
                {/* The /api/mt5/status indicator was removed: that API does not exist (contract v3). */}
                <View style={[styles.statusDot, { backgroundColor: health?.status === 'healthy' ? T.trading.profit : '#94A3B8' }]} />
                <Text style={styles.statusText}>{t('Gateway')}</Text>
              </View>
              <View style={styles.activeActions}>
                <Pressable
                  style={styles.actionIcon}
                  onPress={() => setTradeNotificationsSheetVisible(true)}
                  hitSlop={12}
                >
                  <Ionicons
                    name={tradeNotificationsEnabled ? 'notifications' : 'notifications-outline'}
                    size={16}
                    color={tradeNotificationsEnabled ? T.accent : T.textMuted}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Other Accounts ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>{t('Other Accounts')}</Text>
            {otherRows.length > 0 && (
              <Text style={styles.sectionCount}>{otherRows.length}</Text>
            )}
          </View>
            </>
          )}
          ListEmptyComponent={(
            <View style={styles.emptyOtherCard}>
              <Ionicons name="people-outline" size={20} color={T.textDimmed} />
              <Text style={styles.emptyOtherTitle}>{t('No other accounts yet')}</Text>
              <Text style={styles.emptyOtherText}>
                {t('Sign in to another real, demo or contest account to switch between them with one tap.')}
              </Text>
              <FastPressable
                style={styles.emptyOtherButton}
                onPress={handleConnectAccount}
                latencyLabel="accounts.empty.connect.open"
              >
                <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
                <Text style={styles.emptyOtherButtonText}>{t('Add account')}</Text>
              </FastPressable>
            </View>
          )}
          renderItem={({ item: row }) => {
            const environment = resolveSavedAccountEnvironmentForDisplay(row);
            const environmentBadge = SETTINGS_ACCOUNT_ENVIRONMENT_BADGES[environment];
            const ribbonLabel = t(environmentBadge.label);
            const accountDisplayName = translateAccountCardName(row.name || `Account ${row.login}`, t);
            const isSwitching = connectingKey === row.key;
            const live = row.liveAccount;
            const metrics = live ? buildSavedAccountSnapshot(live) : row.snapshot;
            const isExpanded = expandedAccountKey === row.key;
            const ribbonStyle = [styles.ribbonRight, { backgroundColor: environmentBadge.backgroundColor }];
            const serverLabel = resolveAccountBrokerLabels({
              brokerId: row.brokerId,
              serverUrl: row.serverUrl,
              directory: brokerServers,
              savedServerName: row.server,
            }).serverName || t('Server unavailable');
            const balanceText = metrics ? fmt.price(metrics.balance) : '---';
            const equityText = metrics ? fmt.price(metrics.equity) : '---';
            const freeMarginText = metrics ? fmt.price(metrics.freeMargin) : '---';
            const leverageText = metrics ? `1:${metrics.leverage}` : '---';
            const floatingPnl = metrics?.floatingPnl ?? 0;
            const floatingPnlText = metrics ? `${floatingPnl >= 0 ? '+' : ''}${fmt.price(floatingPnl)}` : '---';
            const openPositionsText = metrics ? String(metrics.openPositions) : '---';
            const switchButton = (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Switch to this account')}
                accessibilityState={{ disabled: isSwitching || !!connectingKey, busy: isSwitching }}
                style={[styles.connectButton, isSwitching && styles.connectButtonBusy]}
                onPressIn={() => warmSavedAccountBroker(row)}
                onPress={() => handleConnectSavedAccount(row)}
                disabled={isSwitching || !!connectingKey}
                latencyLabel="accounts.saved.switch"
                unstable_pressDelay={0}
                hitSlop={6}
              >
                {isSwitching ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
                    <Text style={styles.connectButtonText}>{t('Switch')}</Text>
                  </>
                )}
              </Pressable>
            );

            return (
              <Pressable
                key={row.key}
                style={[
                  styles.secondaryCard,
                  !isExpanded && styles.secondaryCardCollapsed,
                  isExpanded && styles.secondaryCardExpanded,
                ]}
                onPress={() => {
                  if (!isExpanded) {
                    warmSavedAccountBroker(row);
                  }
                  setExpandedAccountKey(isExpanded ? null : row.key);
                }}
                onLongPress={() => openOtherAccountOptions(row)}
                delayLongPress={400}
              >
                {/* Diagonal ribbon */}
                {!!ribbonLabel && (
                  <View style={ribbonStyle}>
                    <Text style={[styles.ribbonRightText, { color: environmentBadge.color }]}>{ribbonLabel}</Text>
                  </View>
                )}

                {/* Top row: avatar + name + type pill — mirrors active card */}
                <View style={styles.secondaryTopRow}>
                  <View style={styles.secondaryLeft}>
                    <View style={styles.secondaryAvatar}>
                      <BrokerLogoAvatar
                        logoUri={row.logoUrl}
                        label={serverLabel || row.brokerId}
                        failed={row.logoUrl ? !!brokerLogoFailed[row.logoUrl] : false}
                        onError={handleBrokerLogoError}
                        variant="secondary"
                        styles={styles}
                      />
                    </View>
                    <View style={styles.secondaryInfo}>
                      <View style={styles.nameAndBadges}>
                        <Text style={styles.secondaryName} numberOfLines={1}>{accountDisplayName}</Text>
                      </View>
                      <Text style={styles.secondaryMeta} numberOfLines={1}>
                        {row.login} · {serverLabel || row.brokerId}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.secondaryActions}>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={T.textDimmed}
                    />
                  </View>
                </View>

                {isExpanded && (
                  <>
                    {/* Balance hero — mirrors active card */}
                    <View style={styles.balanceSection}>
                      <Text style={styles.balanceLabel}>{t('Balance')}</Text>
                      <Text style={styles.balanceValue}>
                        {balanceText}{' '}
                        {metrics ? <Text style={styles.balanceCurrency}>{metrics.currency}</Text> : null}
                      </Text>
                    </View>

                    {/* Metrics grid — same fields as active card */}
                    <View style={styles.metricsGrid}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Equity')}</Text>
                        <Text style={styles.metricValue}>{equityText}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Free Margin')}</Text>
                        <Text style={styles.metricValue}>{freeMarginText}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Leverage')}</Text>
                        <Text style={styles.metricValue}>{leverageText}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Floating Profit/Loss')}</Text>
                        <Text
                          style={[styles.metricValue, metrics && { color: floatingPnl >= 0 ? T.trading.profit : '#EF4444' }]}
                          numberOfLines={1}
                        >
                          {floatingPnlText}
                        </Text>
                      </View>
                    </View>

                    {/* Detail chips */}
                    <View style={styles.detailChipsRow}>
                      <View style={styles.detailChip}>
                        <Ionicons name="key-outline" size={13} color={T.textMuted} />
                        <Text style={styles.detailChipText}>{row.login}</Text>
                      </View>
                      <View style={styles.detailChip}>
                        <Ionicons name="server-outline" size={13} color={T.textMuted} />
                        <Text style={styles.detailChipText}>{serverLabel || row.brokerId}</Text>
                      </View>
                      <View style={styles.detailChip}>
                        <Ionicons name="briefcase-outline" size={13} color={T.textMuted} />
                        <Text style={styles.detailChipText}>{openPositionsText} {t('open')}</Text>
                      </View>
                    </View>

                    <View style={styles.activeDivider} />

                    {/* Footer: status + Switch button */}
                    <View style={styles.activeFooter}>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: health?.status === 'healthy' ? T.trading.profit : '#94A3B8' }]} />
                        <Text style={styles.statusText}>{t('Gateway')}</Text>
                      </View>
                      {switchButton}
                    </View>
                  </>
                )}
              </Pressable>
            );
          }}
        />
        ) : null}
      </View>

      {isScreenFocused && passwordSheetVisible && (
        <View style={styles.modalOverlay} pointerEvents="box-none">
          {/* Background tap to close */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPasswordSheetVisible(false)} />

          <View style={styles.modalContent}>
            <ChangePasswordSheet
              loginId={displayLogin}
              type={passwordType}
              onClose={() => setPasswordSheetVisible(false)}
              onSuccess={() => {
                setPasswordSheetVisible(false);
                setSuccessMessage(`${t(passwordType === 'master' ? 'Master' : 'Investor')} ${t('password change successfully')}`);
              }}
            />
          </View>
        </View>
      )}

      {/* Trade Notifications Modal */}
      {isScreenFocused && tradeNotificationsSheetVisible && (
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setTradeNotificationsSheetVisible(false)} />
          <View style={styles.tradeNotifModal}>
            <Text style={styles.tradeNotifTitle}>{t('Trade notifications')}</Text>
            <Text style={styles.tradeNotifMessage}>
              {t('Receive notifications about trading operations performed on this account. These may include information about orders, deals, deposits and withdrawals, depending on your broker\'s settings.')}
            </Text>
            <View style={styles.tradeNotifActions}>
              <Pressable
                style={styles.tradeNotifTextBtn}
                onPress={() => setTradeNotificationsSheetVisible(false)}
                hitSlop={8}
              >
                <Text style={styles.tradeNotifTextBtnLabel}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.tradeNotifTextBtn}
                onPress={() => {
                  if (tradeNotificationKey) {
                    setTradeNotificationsEnabled(tradeNotificationKey, !tradeNotificationsEnabled);
                  }
                  setTradeNotificationsSheetVisible(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.tradeNotifTextBtnLabel}>
                  {tradeNotificationsEnabled ? t('Disable') : t('Enable')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Delete Account Confirmation Modal */}
      {isScreenFocused && deleteTarget && (
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleDismissDeleteAccount} />
          <View style={styles.deleteModal}>
            <View style={styles.deleteModalBody}>
              <View style={styles.deleteHeaderRow}>
                <View style={styles.deleteHeaderLeft}>
                  <View style={styles.deleteIconWrap}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </View>
                  <Text style={styles.deleteEyebrow}>
                    {deleteAccountIsCurrent ? t('Current account') : t('Saved account')}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Cancel')}
                  style={styles.deleteCloseButton}
                  onPress={handleDismissDeleteAccount}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color={T.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.deleteTitle}>
                {deleteAccountIsCurrent ? t('Delete current account?') : t('Delete saved account?')}
              </Text>
              <Text style={styles.deleteMessage}>
                {deleteAccountIsCurrent
                  ? t('This signs out the active session and clears saved credentials from this device.')
                  : t('This removes the saved account and password from this device.')}
              </Text>
              <View style={styles.deleteAccountCard}>
                <View style={styles.deleteAccountAvatar}>
                  <BrokerLogoAvatar
                    logoUri={deleteAccountLogoUri}
                    label={deleteAccountServer}
                    failed={deleteAccountLogoUri ? !!brokerLogoFailed[deleteAccountLogoUri] : false}
                    onError={handleBrokerLogoError}
                    variant="secondary"
                    styles={styles}
                  />
                </View>
                <View style={styles.deleteAccountInfo}>
                  <Text style={styles.deleteAccountName} numberOfLines={1}>{deleteAccountName}</Text>
                  <Text style={styles.deleteAccountMeta} numberOfLines={1}>
                    {deleteAccountLogin} · {deleteAccountServer}
                  </Text>
                </View>
              </View>
              <View style={styles.deleteActions}>
                <Pressable
                  style={[styles.deleteBtn, styles.deleteBtnSecondary]}
                  onPress={handleDismissDeleteAccount}
                >
                  <Text style={styles.deleteBtnSecondaryText}>{t('Cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.deleteBtn, styles.deleteBtnPrimary]}
                  onPress={handleConfirmDeleteAccount}
                >
                  <Text style={styles.deleteBtnPrimaryText}>{t('Delete account')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Success Modal */}
      {isScreenFocused && !!successMessage && (
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSuccessMessage('')} />
          <View style={styles.successModal}>
            <View style={styles.successIconBox}>
              <Ionicons name="checkmark" size={32} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{t('Success')}</Text>
            <Text style={styles.successDesc}>{successMessage}</Text>
            <Pressable style={styles.successBtn} onPress={() => setSuccessMessage('')}>
              <Text style={styles.successBtnText}>{t('OK')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isScreenFocused ? <AccountsActionSheetHost /> : null}
    </Screen>
  );
});

/**
 * Renders a circular avatar displaying the broker's logo, falling back to a generic icon if the image fails to load.
 */
function BrokerLogoAvatar({
  logoUri,
  label,
  failed,
  onError,
  variant,
  styles,
}: {
  logoUri: string;
  label: string;
  failed: boolean;
  onError: (logoUri: string) => void;
  variant: 'active' | 'secondary';
  styles: ReturnType<typeof makeStyles>;
}) {
  const imageStyle = variant === 'active' ? styles.avatarImage : styles.secondaryAvatarImage;
  const initialsStyle = variant === 'active' ? styles.avatarText : styles.secondaryAvatarText;

  if (!logoUri || failed) {
    return (
      <Text style={initialsStyle}>{formatBrokerInitials(label)}</Text>
    );
  }

  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={`${label} broker logo`}
      source={{ uri: logoUri }}
      style={imageStyle}
      resizeMode="contain"
      onError={() => onError(logoUri)}
    />
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => {
  const cardBg = isDark ? T.glass2 : '#FFFFFF';
  const raisedBg = isDark ? T.glass1 : 'rgba(0,0,0,0.03)';
  const cardBorder = isDark ? T.border : 'rgba(0,0,0,0.06)';
  const divider = isDark ? T.borderSubtle : 'rgba(0,0,0,0.05)';

  return StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: T.bgRoot,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 999,
  },
  modalContent: {
    width: '100%',
  },
  successModal: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: T.glass2,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.borderMedium,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
  },
  successIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    color: T.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  successDesc: {
    color: T.textSub,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  successBtn: {
    backgroundColor: T.accent,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  successBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteModal: {
    width: '88%',
    maxWidth: 360,
    backgroundColor: cardBg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: isDark ? cardBorder : 'rgba(15,23,42,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 16,
    overflow: 'hidden',
  },
  deleteModalBody: {
    padding: 18,
  },
  deleteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  deleteHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  deleteEyebrow: {
    flexShrink: 1,
    color: T.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  deleteTitle: {
    color: T.text,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 8,
  },
  deleteCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? raisedBg : '#F1F5F9',
    marginLeft: 10,
  },
  deleteMessage: {
    color: T.textSub,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  deleteAccountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? raisedBg : '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: isDark ? cardBorder : 'rgba(15,23,42,0.08)',
    marginBottom: 10,
  },
  deleteAccountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? cardBg : '#FFFFFF',
    overflow: 'hidden',
    marginRight: 12,
  },
  deleteAccountInfo: {
    flex: 1,
    minWidth: 0,
  },
  deleteAccountName: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  deleteAccountMeta: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteBtn: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnSecondary: {
    borderWidth: 1,
    borderColor: isDark ? cardBorder : 'rgba(15,23,42,0.16)',
    backgroundColor: isDark ? raisedBg : '#FFFFFF',
  },
  deleteBtnSecondaryText: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteBtnPrimary: {
    backgroundColor: '#EF4444',
  },
  deleteBtnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tradeNotifModal: {
    width: '85%',
    maxWidth: 360,
    backgroundColor: cardBg,
    borderRadius: 16,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: T.borderMedium,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  tradeNotifTitle: {
    color: T.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  tradeNotifMessage: {
    color: T.textSub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  tradeNotifActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  tradeNotifTextBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  tradeNotifTextBtnLabel: {
    color: T.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: safeTop + 8,
    paddingBottom: 16,
    backgroundColor: T.bgRoot,
  },
  headerTitle: {
    color: T.text,
    fontSize: 20,
    fontWeight: '500',
    flex: 1,
    marginLeft: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // ── Active Card ──
  activeCard: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    padding: 10,
    shadowColor: isDark ? '#000000' : '#64748B',
    shadowOffset: { width: 0, height: isDark ? 4 : 2 },
    shadowOpacity: isDark ? 0.08 : 0.06,
    shadowRadius: isDark ? 16 : 8,
    elevation: isDark ? 4 : 1,
    overflow: 'hidden',
  },
  ribbonRight: {
    position: 'absolute',
    top: -3,
    right: -55,
    width: 140,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 6,
    transform: [{ rotate: '45deg' }],
    zIndex: 10,
  },
  ribbonRightText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  ribbonLeft: {
    position: 'absolute',
    top: 14,
    left: -30,
    backgroundColor: T.trading.profit,
    paddingVertical: 4,
    paddingHorizontal: 32,
    transform: [{ rotate: '-45deg' }],
    zIndex: 10,
  },
  ribbonLeftText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  activeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: isDark ? raisedBg : T.accentGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarText: {
    color: T.accent,
    fontSize: 17,
    fontWeight: '700',
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 14,
  },
  activeInfoCol: {
    flex: 1,
  },
  activeName: {
    color: T.text,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0,
  },
  activeCompany: {
    color: T.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.upGlow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: T.trading.profit,
  },
  connectedLabel: {
    color: T.trading.profit,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  nameAndBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  demoBadgeActive: {
    backgroundColor: T.upGlow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  demoBadgeActiveText: {
    color: T.trading.profit,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  // Balance hero
  balanceSection: {
    marginBottom: 8,
  },
  balanceLabel: {
    color: T.textDimmed,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  balanceValue: {
    color: T.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'] as any,
  },

  balanceCurrency: {
    color: T.textDimmed,
    fontSize: 18,
    fontWeight: '600',
  },

  // Metrics grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  metricItem: {
    width: '47%' as any,
    backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.02)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 48,
  },
  metricLabel: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metricValue: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
  },

  // Detail chips
  detailChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  detailChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.03)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  detailChipText: {
    flexShrink: 1,
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },

  activeDivider: {
    height: 1,
    backgroundColor: divider,
    marginBottom: 12,
  },

  // Footer
  activeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
  },
  statusSep: {
    width: 1,
    height: 10,
    backgroundColor: isDark ? divider : 'rgba(0,0,0,0.08)',
    marginHorizontal: 4,
  },
  activeActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionLabel: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionCount: {
    color: T.textDimmed,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // ── Secondary cards ──
  secondaryCard: {
    backgroundColor: cardBg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: cardBorder,
    padding: 10,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 20,
    elevation: isDark ? 0 : 4,
  },
  secondaryCardCollapsed: {
    borderRadius: 16,
    borderColor: T.border,
    shadowColor: isDark ? '#000000' : '#64748B',
    shadowOffset: { width: 0, height: isDark ? 4 : 2 },
    shadowOpacity: isDark ? 0.08 : 0.06,
    shadowRadius: isDark ? 16 : 8,
    elevation: isDark ? 4 : 1,
  },
  secondaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  secondaryAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  secondaryAvatarText: {
    color: T.textMuted,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  secondaryInfo: {
    flex: 1,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryName: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  tagDemo: {
    backgroundColor: T.upGlow,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tagDemoText: {
    color: T.trading.profit,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
  },
  tagContest: {
    backgroundColor: T.accentGlow,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tagContestText: {
    color: T.accent,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
  },
  tagReadonly: {
    backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.05)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tagReadonlyText: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
  },
  secondaryMeta: {
    color: T.textDimmed,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  secondaryBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 10,
    paddingLeft: 50,
  },
  secondaryRight: {
    alignItems: 'flex-end',
  },
  secondaryBalance: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
  },
  secondaryCurrency: {
    color: T.textDimmed,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  secondaryCardExpanded: {
    borderRadius: 16,
    borderColor: T.border,
    shadowColor: isDark ? '#000000' : '#64748B',
    shadowOffset: { width: 0, height: isDark ? 4 : 2 },
    shadowOpacity: isDark ? 0.08 : 0.06,
    shadowRadius: isDark ? 16 : 8,
    elevation: isDark ? 4 : 1,
  },
  secondaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  expandedSection: {
    marginTop: 0,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: isDark ? divider : 'rgba(0,0,0,0.04)',
    marginVertical: 6,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  expandedItem: {
    width: '47%' as any,
    backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.02)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  expandedLabel: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  expandedValue: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
  },
  expandedChips: {
    flexDirection: 'row',
    gap: 8,
  },
  cornerBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: T.accent,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomLeftRadius: 10,
    borderTopRightRadius: 15,
    zIndex: 10,
  },
  cornerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
  },
  ribbonLeftSmall: {
    position: 'absolute',
    top: 10,
    left: -32,
    backgroundColor: T.trading.profit,
    paddingVertical: 3,
    paddingHorizontal: 32,
    transform: [{ rotate: '-45deg' }],
    zIndex: 10,
  },
  secondaryRightCol: {
    alignItems: 'flex-end',
  },
  expandedBalanceSection: {
    marginBottom: 6,
  },
  expandedBalanceLabel: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  expandedBalanceValue: {
    color: T.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'] as any,
  },
  expandedBalanceCurrency: {
    color: T.textDimmed,
    fontSize: 14,
    fontWeight: '600',
  },
  expandedFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  secondaryConnectRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  connectButton: {
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: T.accent,
    shadowColor: T.accent,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  connectButtonBusy: {
    opacity: 0.7,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyOtherCard: {
    marginTop: 4,
    padding: 16,
    borderRadius: 16,
    backgroundColor: cardBg,
    borderWidth: 1,
    borderColor: isDark ? cardBorder : 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    gap: 8,
  },
  emptyOtherTitle: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyOtherText: {
    color: T.textDimmed,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 17,
  },
  emptyOtherButton: {
    marginTop: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.accent,
  },
  emptyOtherButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  savedPlaceholderText: {
    color: T.textDimmed,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  savedFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  });
};

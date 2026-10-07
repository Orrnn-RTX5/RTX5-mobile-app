import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('saved account switch promotes the selected account and refreshes account-scoped state', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');
  const coordinatorSource = readSource('src/services/brokerSessionCoordinator.ts');

  assert.match(source, /const ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE =\s*'Account does not exist/);
  assert.match(source, /const normalizeSwitchLogin = \(login: string\) => login\.trim\(\)/);
  assert.match(source, /const accountSwitchInFlightRef = React\.useRef\(false\)/);
  assert.match(source, /createSavedAccountSwitchHealthCache\(\{[\s\S]*checkHealth: checkBrokerServerHealth,[\s\S]*ttlMs: ACCOUNT_SWITCH_BROKER_WARM_TTL_MS/);
  assert.match(source, /const ensureSavedAccountBrokerHealth = React\.useCallback/);
  assert.match(source, /const warmSavedAccountBroker = React\.useCallback/);
  assert.match(source, /const savedServerUrl = normalizeBrokerServerUrl\(row\.serverUrl\)/);
  assert.match(source, /\.map\(resolveBrokerEndpointSet\)[\s\S]*\.find\(\(resolution\) => \([\s\S]*resolution\.ok[\s\S]*isBrokerServerUrlForApiBase\(savedServerUrl, resolution\.endpoints\.apiBase\)/);
  assert.match(source, /const serverUrl = toBrokerServiceRoot\(endpointSet\.endpoints\.apiBase\) \|\| savedServerUrl/);
  assert.match(source, /ensureSavedAccountBrokerHealth\(serverUrl\)\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(source, /checkBrokerServerHealth\(endpointSet\.endpoints\.feedStatusUrl\)/);
  assert.match(source, /if \(!isExpanded\) \{[\s\S]*warmSavedAccountBroker\(row\);[\s\S]*setExpandedAccountKey/);
  assert.match(source, /onPressIn=\{\(\) => warmSavedAccountBroker\(row\)\}/);

  const switchStart = source.indexOf('const handleConnectSavedAccount = async (row: OtherAccountRow) => {');
  const switchEnd = source.indexOf('const handleRemoveSavedAccount = (row: OtherAccountRow) => {', switchStart);
  assert.notEqual(switchStart, -1);
  assert.notEqual(switchEnd, -1);
  const switchBody = source.slice(switchStart, switchEnd);

  assert.match(switchBody, /const passwordPromise = getSavedAccountPassword\(row\.brokerId, row\.login\)/);
  assert.match(switchBody, /const brokerHealthResultPromise = ensureSavedAccountBrokerHealth\(exactServerUrl\)\.then/);
  assert.match(switchBody, /const password = await passwordPromise/);
  assert.match(switchBody, /const brokerHealthResult = await brokerHealthResultPromise/);
  assert.match(switchBody, /if \(!brokerHealthResult\.ok\) \{[\s\S]*throw brokerHealthResult\.error/);
  assert.match(switchBody, /const result = await signInWithCredentials\(\{/);
  assert.match(switchBody, /normalizeSwitchLogin\(result\.accountLogin\) !== normalizeSwitchLogin\(row\.login\)/);
  assert.match(switchBody, /throw new Error\(ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE\)/);
  assert.match(switchBody, /if \(accountSwitchInFlightRef\.current\) return;/);
  assert.match(switchBody, /accountSwitchInFlightRef\.current = true/);
  assert.match(switchBody, /const approvedRoutes = \(brokerServers \?\? \[\]\)[\s\S]*\.map\(\(broker\) => \(\{ broker, resolution: resolveBrokerEndpointSet\(broker\) \}\)\)[\s\S]*\.filter\(\(candidate\) => candidate\.resolution\.ok\)/);
  assert.match(switchBody, /const exactSavedRoute = approvedRoutes\.find\([\s\S]*isBrokerServerUrlForApiBase\(savedServerUrl, candidate\.resolution\.endpoints\.apiBase\)/);
  assert.match(switchBody, /const approvedRoute = exactSavedRoute/);
  assert.doesNotMatch(switchBody, /approvedRoutes\.length === 1 \? approvedRoutes\[0\] : null/);
  assert.match(switchBody, /The saved broker server no longer matches the broker directory/);
  assert.doesNotMatch(switchBody, /checkBrokerServerHealth\(exactServerUrl\)/);
  assert.ok(
    switchBody.indexOf('ensureSavedAccountBrokerHealth(exactServerUrl)')
    < switchBody.indexOf('const result = await signInWithCredentials'),
    'exact-server health verification must finish before saved-account login',
  );
  assert.ok(
    switchBody.indexOf('const brokerHealthResultPromise = ensureSavedAccountBrokerHealth(exactServerUrl)')
    < switchBody.indexOf('const password = await passwordPromise'),
    'password retrieval and exact-server health must overlap on the valid route',
  );
  assert.ok(
    switchBody.indexOf('if (!password)')
    < switchBody.indexOf('const brokerHealthResult = await brokerHealthResultPromise'),
    'a missing saved password must redirect without waiting for broker health',
  );
  assert.match(switchBody, /serverUrl: exactServerUrl/);
  assert.match(switchBody, /setSuccessMessage\(t\('Account switched successfully'\)\)/);
  assert.match(switchBody, /schedulePostAccountSwitchWork\(\(\) => \{[\s\S]*upsertSavedAccount\(\{/);
  assert.match(switchBody, /serverUrl: exactServerUrl,/);
  assert.match(switchBody, /await commitBrokerSession\(\{[\s\S]*brokerId: endpoints\.brokerId,[\s\S]*apiBase: endpoints\.apiBase,[\s\S]*feedWsBase: endpoints\.feedWsBase,[\s\S]*feedStatusUrl: endpoints\.feedStatusUrl,[\s\S]*servicesDomain: endpoints\.servicesDomain,[\s\S]*configVersion: endpoints\.configVersion/);
  assert.match(switchBody, /credentials: \{[\s\S]*accessToken: result\.accessToken,[\s\S]*refreshToken: result\.refreshToken,[\s\S]*expiresAt: result\.expiresAtIso/);
  assert.match(
    switchBody,
    /const switchedAccountEnvironment = mergeAccountEnvironment\([\s\S]*account: \{[\s\S]*accountType: switchedAccountEnvironment\.accountType,[\s\S]*accountEnvironmentSource: switchedAccountEnvironment\.accountEnvironmentSource/,
  );
  assert.doesNotMatch(switchBody, /persistSelectedBrokerSession|persistAuthSessionTokens|userLogin\(/);
  assert.match(switchBody, /const commitAuthorization = authorizeBrokerSessionCommit\(\)/);
  assert.match(switchBody, /signal: loginAbortController\.signal/);
  assert.match(switchBody, /\}, commitAuthorization\)/);
  assert.match(switchBody, /const committedProvenance = getActiveBrokerSessionProvenance\(committedSession\.session\)/);
  assert.match(switchBody, /bootstrapApp\(\{[\s\S]*accountLogin: result\.accountLogin,[\s\S]*expectedProvenance: committedProvenance/);
  assert.match(switchBody, /isLoginRequestAbortedError\(error\)/);
  assert.match(switchBody, /isStaleBrokerSessionCommitError\(error\)/);
  assert.match(switchBody, /finally \{[\s\S]*accountSwitchInFlightRef\.current = false;[\s\S]*setConnectingKey\(null\)/);
  assert.ok(
    switchBody.indexOf('setConnectingKey(row.key)') < switchBody.indexOf('await '),
    'the saved-account busy state must be visible before asynchronous work starts',
  );

  const switchButtonStart = source.indexOf('const switchButton = (');
  const switchButtonEnd = source.indexOf(');', switchButtonStart);
  const switchButton = source.slice(switchButtonStart, switchButtonEnd);
  assert.match(switchButton, /accessibilityState=\{\{ disabled: isSwitching \|\| !!connectingKey, busy: isSwitching \}\}/);
  assert.match(switchButton, /latencyLabel="accounts\.saved\.switch"/);
  assert.match(switchButton, /unstable_pressDelay=\{0\}/);

  // The coordinator owns the epoch-first teardown and cache/query reset; the
  // screen must not partially mutate the old account before the handoff commits.
  // The reset stays targeted: the public broker directory and tokenless market
  // cache survive, while every account-scoped query is still removed.
  assert.match(coordinatorSource, /const transition = beginActiveBrokerSessionTransition\(\);[\s\S]*await teardownBrokerSessionRuntime\(\)/);
  assert.match(coordinatorSource, /resetQuoteRuntimeState\(\)/);
  assert.match(coordinatorSource, /resetSessionMarketData\(\)/);
  assert.match(coordinatorSource, /resetPositionsSessionState\(\)/);
  assert.match(coordinatorSource, /resetPersistedCandleCacheSession\(\)/);
  assert.match(
    coordinatorSource,
    /const isSessionIndependentQuery[\s\S]*BROKER_SERVERS_KEY[\s\S]*ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE[\s\S]*appQueryClient\.removeQueries\(\{[\s\S]*!isSessionIndependentQuery\(query\.queryKey\)/,
  );
  assert.match(coordinatorSource, /appQueryClient\.getMutationCache\(\)\.clear\(\)/);
  assert.doesNotMatch(coordinatorSource, /appQueryClient\.clear\(\)/);
});

test('saved account switch removes stale entries when the broker reports a missing account', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');

  assert.match(source, /const isMissingSavedAccountSwitchError = \(error: unknown\) => \{/);
  assert.match(source, /statusCode === 404/);
  assert.match(source, /normalizedMessage\.includes\('account not found'\)/);
  assert.match(source, /normalizedMessage\.includes\('account does not exist'\)/);
  assert.match(source, /normalizedMessage\.includes\('login not found'\)/);
  assert.match(source, /normalizedMessage\.includes\('user not found'\)/);
  assert.doesNotMatch(source, /normalizedMessage\.includes\('not found'\)/);

  const switchStart = source.indexOf('const handleConnectSavedAccount = async (row: OtherAccountRow) => {');
  const switchEnd = source.indexOf('const handleRemoveSavedAccount = (row: OtherAccountRow) => {', switchStart);
  const switchBody = source.slice(switchStart, switchEnd);

  assert.match(switchBody, /if \(isMissingSavedAccountSwitchError\(error\)\) \{/);
  assert.match(switchBody, /removeSavedAccount\(row\.login, row\.brokerId\)/);
  assert.match(switchBody, /removeSavedAccountPassword\(row\.brokerId, row\.login\)\.catch\(\(\) => undefined\)/);
  assert.match(switchBody, /Alert\.alert\(\s*t\('Account does not exist'\),\s*t\(ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE\),\s*\)/);
  assert.match(switchBody, /const handleMissingSavedPassword = \(\) => \{[\s\S]*removeSavedAccount\(row\.login, row\.brokerId\);[\s\S]*removeSavedAccountPassword\(row\.brokerId, row\.login\)\.catch\(\(\) => undefined\);/);
  assert.match(switchBody, /if \(!password\) \{\s*handleMissingSavedPassword\(\);\s*return;/);
});

test('accounts screen uses broker branding and opens long-press delete for other accounts', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');
  const savedAccountsSource = readSource('src/state/savedAccounts.ts');
  const userPreferencesSource = readSource('src/state/userPreferences/store.ts');
  const activeSessionStorageSource = readSource('src/state/activeBrokerSessionStorage.ts');

  assert.doesNotMatch(source, /AppLogo/);
  assert.match(source, /import \{ ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet, Text, View \} from 'react-native'/);
  // Other-accounts list is virtualized: render the on-screen rows, lazy-render the rest on scroll.
  assert.match(source, /<FlatList[\s\S]*data=\{otherRows\}[\s\S]*initialNumToRender=/);
  assert.match(source, /import \{ useBrokerConfig, useBrokerServers \} from '\.\.\/\.\.\/query\/broker'/);
  assert.match(source, /const buildBrokerLogoIndex = \(brokerServers\?: readonly BrokerServer\[\]\): BrokerLogoIndex => \{/);
  assert.match(source, /byBrokerName: Map<string, string>/);
  assert.match(source, /byServerName: Map<string, string>/);
  assert.match(source, /addBrokerLogoLookup\(byBrokerName, broker\.broker_name, logoUrl\)/);
  assert.match(source, /addBrokerLogoLookup\(byServerName, broker\.server, logoUrl\)/);
  assert.match(source, /const findBrokerLogoLookup = \(/);
  assert.match(source, /const focusDataActive = useDeferredActiveFlag\([\s\S]*isLoggedIn && isScreenFocused && firstPaintReady[\s\S]*ACCOUNTS_SCREEN_DATA_DELAY_MS/);
  assert.match(source, /const screenDataActive = focusDataActive \|\| \(isLoggedIn && dataPrewarmWindowActive\)/);
  assert.match(source, /const \{ data: brokerServers \} = useBrokerServers\(screenDataActive\)/);
  assert.match(source, /const brokerLogoIndex = useMemo\(\(\) => buildBrokerLogoIndex\(brokerServers\), \[brokerServers\]\)/);
  assert.match(source, /const activeBrokerLogoUrl = resolveAccountBrokerLogoUrl\([\s\S]*brokerLogoIndex,[\s\S]*brokerId,[\s\S]*serverUrl: brokerServerUrl,[\s\S]*brokerName: brokerConfig\?\.broker_name,[\s\S]*serverName: brokerConfig\?\.server_name,[\s\S]*brokerLogoUrl,[\s\S]*brokerConfig\?\.logo_url,[\s\S]*\)/);
  assert.match(source, /const savedLogoUrl = sa\.brokerId === activeBrokerId[\s\S]*brokerId: sa\.brokerId,[\s\S]*serverUrl: sa\.serverUrl,[\s\S]*brokerName: sa\.server,[\s\S]*serverName: sa\.server,[\s\S]*sa\.logoUrl,[\s\S]*activeBrokerLogoUrl/);
  assert.match(source, /const nextLogoUrl = activeBrokerLogoUrl \|\| existing\?\.logoUrl \|\| ''/);
  assert.match(savedAccountsSource, /logoUrl: account\.logoUrl \|\| existing\?\.logoUrl/);
  assert.match(userPreferencesSource, /brokerLogoUrl: logoUrl \|\| \(sameBroker \? state\.brokerLogoUrl : ''\) \|\| ''/);
  assert.match(activeSessionStorageSource, /createActiveBrokerSessionManifest\([\s\S]*servicesDomain[\s\S]*configVersion/);
  assert.match(source, /function BrokerLogoAvatar\(/);
  assert.match(source, /source=\{\{ uri: logoUri \}\}/);

  const activeCardStart = source.indexOf('{/* Top: Avatar + Name + Connected badge */}');
  const activeCardEnd = source.indexOf('{/* Balance', activeCardStart);
  const activeCard = source.slice(activeCardStart, activeCardEnd);
  assert.match(activeCard, /<BrokerLogoAvatar[\s\S]*logoUri=\{activeBrokerLogoUrl\}/);

  const otherRowStart = source.indexOf('renderItem={({ item: row }) => {');
  const otherRowEnd = source.indexOf('{isExpanded && (', otherRowStart);
  const otherRow = source.slice(otherRowStart, otherRowEnd);
  assert.match(otherRow, /<BrokerLogoAvatar[\s\S]*logoUri=\{row\.logoUrl\}/);
  assert.match(otherRow, /const environment = resolveSavedAccountEnvironmentForDisplay\(row\)/);
  assert.match(otherRow, /SETTINGS_ACCOUNT_ENVIRONMENT_BADGES\[environment\]/);
  assert.match(otherRow, /\{!!ribbonLabel && \(/);
  assert.match(otherRow, /const ribbonLabel = t\(environmentBadge\.label\)/);
  assert.match(otherRow, /color: environmentBadge\.color/);
  assert.match(otherRow, /onLongPress=\{\(\) => openOtherAccountOptions\(row\)\}/);
  assert.doesNotMatch(otherRow, /secondaryDeleteButton/);

  const optionsStart = source.indexOf('const openOtherAccountOptions = (row: OtherAccountRow) => {');
  const optionsEnd = source.indexOf('const openQRSheet = (loginId: string) => {', optionsStart);
  const optionsBody = source.slice(optionsStart, optionsEnd);
  assert.match(optionsBody, /showAccountsActionSheet\(\{/);
  assert.match(optionsBody, /title,/);
  assert.match(optionsBody, /\{ label: t\('Delete account'\), danger: true, onPress: \(\) => handleRemoveSavedAccount\(row\) \}/);

  assert.match(source, /const handleRemoveSavedAccount = \(row: OtherAccountRow\) => \{\s*setDeleteTarget\(\{ type: 'saved', row \}\);/);
  assert.match(source, /deleteTarget && \(/);
  assert.match(source, /styles\.deleteHeaderRow/);
  assert.match(source, /styles\.deleteHeaderLeft/);
  assert.match(source, /styles\.deleteCloseButton/);
  assert.match(source, /styles\.deleteAccountCard/);
  assert.doesNotMatch(source, /styles\.deleteDeviceNote/);
  assert.doesNotMatch(source, /Only this device is changed/);
});

test('expanded other account cards reuse the live account card shell', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');
  const expandedStart = source.indexOf('secondaryCardExpanded: {');
  const expandedEnd = source.indexOf('secondaryTopRow:', expandedStart);
  const expandedStyle = source.slice(expandedStart, expandedEnd);

  assert.notEqual(expandedStart, -1);
  assert.notEqual(expandedEnd, -1);
  assert.match(expandedStyle, /borderRadius: 16/);
  assert.match(expandedStyle, /borderColor: T\.border/);
  assert.match(expandedStyle, /shadowColor: isDark \? '#000000' : '#64748B'/);
  assert.match(expandedStyle, /shadowOffset: \{ width: 0, height: isDark \? 4 : 2 \}/);
  assert.match(expandedStyle, /shadowOpacity: isDark \? 0\.08 : 0\.06/);
  assert.match(expandedStyle, /shadowRadius: isDark \? 16 : 8/);
  assert.match(expandedStyle, /elevation: isDark \? 4 : 1/);
  assert.doesNotMatch(expandedStyle, /T\.accentGlow|T\.borderHi/);
});

test('accounts screen backfill normalizes optional metadata before saved-account upsert', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');
  const effectStart = source.indexOf('React.useEffect(() => {');
  const effectEnd = source.indexOf('// ── Live WebSocket account metrics', effectStart);
  assert.notEqual(effectStart, -1);
  assert.notEqual(effectEnd, -1);
  const effectBody = source.slice(effectStart, effectEnd);

  assert.match(effectBody, /const nextServerUrl = brokerServerUrl \|\| existing\?\.serverUrl \|\| ''/);
  assert.match(effectBody, /const nextLogoUrl = activeBrokerLogoUrl \|\| existing\?\.logoUrl \|\| ''/);
  assert.match(effectBody, /\(existing\.serverUrl \?\? ''\) === nextServerUrl/);
  assert.match(effectBody, /\(existing\.logoUrl \?\? ''\) === nextLogoUrl/);
  assert.match(effectBody, /serverUrl: nextServerUrl \|\| undefined/);
  assert.match(
    effectBody,
    /const nextEnvironment: AccountEnvironmentState = activeAccountType === 'unknown'[\s\S]*accountType: activeAccountType,[\s\S]*accountEnvironmentSource: activeAccountEnvironmentSource/,
  );
  assert.doesNotMatch(effectBody, /mergeAccountEnvironmentForAccount\(/);
  assert.doesNotMatch(effectBody, /existing\.serverUrl === brokerServerUrl/);
  assert.doesNotMatch(effectBody, /existing\.logoUrl === nextLogoUrl/);
});

test('auth login errors preserve HTTP status for account switch decisions', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /export const extractBackendErrorMessage = \(payload: any, fallback: string\): string => \{/);
  assert.match(source, /const error = createBackendAuthError\(errorBody, response\.status, 'Login failed'\)/);
  assert.match(source, /statusCode\?: number/);
  assert.match(source, /error\.statusCode = status/);
  // Contract v3: the gateway {"error":"<CODE>"} code is kept on the error.
  assert.match(source, /if \(code\) error\.code = code/);
  assert.match(source, /throw error/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('login submit uses the shared stable fast press path', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /import \{ FastPressable as Pressable \} from '\.\.\/src\/ui\/components\/FastPressable'/);
  assert.match(source, /import \{ runImmediateAction \} from '\.\.\/src\/utils\/actionLatency'/);
  assert.match(source, /Keyboard/);
  assert.doesNotMatch(source, /import\s*\{[^}]*\bPressable\b[^}]*\}\s*from 'react-native'/);
  assert.match(source, /keyboardShouldPersistTaps="always"/);
  assert.match(source, /canCancelContentTouches=\{Platform\.OS === 'ios'\}/);
  assert.match(source, /const handleLoginPress = \(\) => \{/);
  assert.match(source, /if \(loginRequestInFlightRef\.current \|\| loginSubmitPressGuardRef\.current\) \{/);
  assert.match(source, /loginSubmitPressGuardRef\.current = true/);
  assert.match(source, /releaseLoginSubmitPressGuard\(\)/);
  assert.match(source, /runImmediateAction\('login\.submit\.touch'/);
  assert.match(source, /const scheduleLoginKeyboardDismiss = \(\) => \{/);
  assert.match(source, /const dismissKeyboard = \(\) => Keyboard\.dismiss\(\)/);
  assert.match(source, /globalThis\.requestAnimationFrame\(dismissKeyboard\)/);
  assert.match(source, /runImmediateAction\('login\.submit\.touch'[\s\S]*const snapshot = getLoginCredentialsSnapshot\(\);[\s\S]*void handleLogin\(snapshot\);[\s\S]*scheduleLoginKeyboardDismiss\(\)/);
  assert.match(source, /Keyboard\.dismiss\(\)/);
  assert.doesNotMatch(source, /setIsLoading\(true\);\s*Keyboard\.dismiss\(\);/);
  assert.match(source, /const snapshot = getLoginCredentialsSnapshot\(\)/);
  assert.match(source, /void handleLogin\(snapshot\)/);
  assert.match(source, /onPress=\{handleLoginPress\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/);
  assert.doesNotMatch(source, /onPressIn=\{handleLoginPress\}/);
  assert.match(
    source,
    /const isLoginSubmitDisabled = isLoading\s*\|\|\s*Boolean\(brokerSelectionError\)\s*\|\|\s*!isSelectedBrokerHealthVerified;/,
  );
  assert.doesNotMatch(
    source,
    /const isLoginSubmitDisabled = isLoading[\s\S]{0,120}isBrokerHealthChecking/,
  );
  assert.match(source, /disabled=\{isLoginSubmitDisabled\}/);
  assert.match(source, /hitSlop=\{LOGIN_BUTTON_HIT_SLOP\}/);
  assert.match(source, /pressRetentionOffset=\{LOGIN_BUTTON_PRESS_RETENTION_OFFSET\}/);
  assert.match(source, /latencyLabel="login\.submit"/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /accessibilityState=\{\{ disabled: isLoginSubmitDisabled, busy: isLoading \}\}/);
  assert.match(source, /testID="login-submit-button"/);
  assert.match(source, /minHeight: 56/);
  assert.doesNotMatch(source, /loginBtnPressed: \{[\s\S]*transform:/);
});

test('login screen pre-warms health from only the selected broker server URL', () => {
  const source = readSource('app/login.tsx');

  // checkBrokerServerHealth owns construction of `{server_url}/health`, so the
  // caller must pass the exact selected API base rather than a feed-status URL.
  assert.match(source, /const warmedBrokerServerUrlRef = useRef\(''\)/);
  assert.match(
    source,
    /const serverUrl = normalizeBrokerServerUrl\(selectedBrokerOption\?\.serverUrl \|\| ''\);[\s\S]*warmedBrokerServerUrlRef\.current = serverUrl;[\s\S]*void probeBrokerHealth\(serverUrl\)/,
  );
  assert.match(
    source,
    /warmedBrokerServerUrlRef\.current = option\.serverUrl;\s*void probeBrokerHealth\(option\.serverUrl\);/,
  );
  assert.doesNotMatch(source, /probeBrokerHealth\(option\.endpoints\.feedStatusUrl\)/);
  assert.match(source, /const exactServerUrl = normalizeBrokerServerUrl\(broker\.server_url\)/);
  assert.match(source, /!isBrokerServerUrlForApiBase\(exactServerUrl, resolution\.endpoints\.apiBase\)/);
  assert.match(source, /serverUrl: exactServerUrl/);
});

test('login submit requires health success for the exact selected broker server URL', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /const \[healthVerifiedBrokerServerUrl, setHealthVerifiedBrokerServerUrl\] = useState\(''\)/);
  assert.match(source, /const healthVerifiedBrokerServerUrlRef = useRef\(''\)/);
  assert.match(
    source,
    /await checkBrokerServerHealth\(normalizedServerUrl\);[\s\S]*healthVerifiedBrokerServerUrlRef\.current = normalizedServerUrl;[\s\S]*setHealthVerifiedBrokerServerUrl\(normalizedServerUrl\)/,
  );
  assert.match(
    source,
    /const clearBrokerHealthVerification = useCallback\(\(\) => \{[\s\S]*healthVerifiedBrokerServerUrlRef\.current = '';[\s\S]*setHealthVerifiedBrokerServerUrl\(''\)/,
  );
  assert.match(
    source,
    /const selectBrokerOption = useCallback\(\(option: LoginBrokerOption\) => \{[\s\S]*clearBrokerHealthVerification\(\);[\s\S]*void probeBrokerHealth\(option\.serverUrl\)/,
  );
  assert.match(source, /setBrokerHealthWarning\(t\('Selected broker is unavailable'\)\)/);
  assert.match(
    source,
    /const isSelectedBrokerHealthVerified = Boolean\([\s\S]*healthVerifiedBrokerServerUrl === exactSelectedBrokerServerUrl/,
  );
  assert.match(
    source,
    /if \(healthVerifiedBrokerServerUrlRef\.current !== normalizedServerUrl\) \{[\s\S]*const unavailableMessage = t\('Selected broker is unavailable'\);[\s\S]*return;[\s\S]*if \(!normalizedAccountId \|\| !currentPassword\)/,
  );
});

test('a healthy broker is never reported unavailable just because health is not verified yet', () => {
  const source = readSource('app/login.tsx');
  const pressable = readSource('src/ui/components/FastPressable.tsx');

  // A disabled LOGIN must not submit through touch-start activation: RN's
  // Pressable withholds press callbacks while disabled, but onTouchStart does not.
  assert.match(
    pressable,
    /const handleTouchStart = useCallback\([\s\S]*if \(disabledRef\.current\) \{[\s\S]*return;\s*\}[\s\S]*if \(activateOnTouchStart && onPress && !pressAlreadyHandled\) \{/,
  );
  assert.match(pressable, /disabledRef\.current = disabled;/);

  // Submit joins (or runs) the probe for the exact host before failing closed.
  assert.match(
    source,
    /if \(healthVerifiedBrokerServerUrlRef\.current !== normalizedServerUrl\) \{[\s\S]*await probeBrokerHealth\(normalizedServerUrl\);[\s\S]*\}\s*if \(healthVerifiedBrokerServerUrlRef\.current !== normalizedServerUrl\) \{\s*const unavailableMessage = t\('Selected broker is unavailable'\);/,
  );
  assert.match(source, /inFlight\.url === normalizedServerUrl[\s\S]*return inFlight\.promise;/);

  // A failed probe re-checks the same selected host with backoff.
  assert.match(source, /const BROKER_HEALTH_REPROBE_DELAYS_MS = \[2000, 4000, 8000, 15000\] as const;/);
  assert.match(
    source,
    /setBrokerHealthWarning\(t\('Selected broker is unavailable'\)\);\s*scheduleBrokerHealthReprobe\(normalizedServerUrl\);/,
  );
  assert.match(source, /selectedBrokerServerUrlRef\.current !== serverUrl/);

  // Pre-warm only clears a verification that belongs to a different host, and
  // blurring the broker field with the same broker keeps the verified result.
  assert.match(
    source,
    /healthVerifiedBrokerServerUrlRef\.current\s*&& healthVerifiedBrokerServerUrlRef\.current !== serverUrl\s*\) \{\s*clearBrokerHealthVerification\(\);/,
  );
  assert.match(
    source,
    /if \(normalizeBrokerKey\(value\) === normalizeBrokerKey\(brokerIdValueRef\.current \?\? brokerId\)\) \{[\s\S]*return;\s*\}/,
  );
});

test('login screen exposes register account navigation to the demo registration screen', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /const handleRegisterAccountPress = \(\) => \{/);
  assert.match(source, /runImmediateAction\('login\.register\.open'/);
  assert.match(source, /Keyboard\.dismiss\(\)/);
  assert.match(source, /import \{ preloadRegisterScreen \} from '\.\.\/src\/features\/settings\/registerScreenPreload'/);
  assert.match(source, /void preloadRegisterScreen\(\)\.catch\(\(\) => undefined\)/);
  assert.match(source, /router\.push\('\/register-entry'\)/);
  assert.match(source, /onPress=\{handleRegisterAccountPress\}/);
  assert.match(source, /accessibilityLabel=\{t\('Register account'\)\}/);
  assert.match(source, /testID="login-register-account-button"/);
});

test('login broker id can be selected from the broker directory dropdown', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /from '\.\.\/src\/features\/settings\/loginBrokerPicker'/);
  assert.match(source, /import \{ useBrokerServers \} from '\.\.\/src\/query\/broker'/);
  // Open state must not live in the login screen's own state: toggling it
  // re-rendered the whole form inside the touch event (267ms first frame).
  assert.match(source, /const \[brokerPickerStore\] = useState\(createLoginBrokerPickerStore\)/);
  assert.doesNotMatch(source, /brokerPickerOpen|setBrokerPickerOpen/);
  assert.match(source, /useBrokerServers\(true\)/);
  assert.match(source, /const brokerOptions = useMemo<LoginBrokerOption\[\]>\(\(\) => \{/);
  assert.match(source, /const selectedBrokerOption = useMemo\(\(\) => \{/);
  assert.match(source, /const brokerPickerActions = useMemo\(\(\) => \{/);
  assert.match(source, /error: brokerServersError/);
  assert.match(source, /const brokerDirectoryFailureMessage = useMemo\(\(\) => \{/);
  assert.match(source, /const selectBrokerOption = useCallback\(\(option: LoginBrokerOption\) => \{/);
  assert.match(source, /const resolution = resolveBrokerEndpointSet\(broker\)/);
  assert.match(source, /if \(!resolution\.ok\) continue/);
  assert.match(source, /const exactServerUrl = normalizeBrokerServerUrl\(broker\.server_url\)/);
  assert.match(source, /!isBrokerServerUrlForApiBase\(exactServerUrl, resolution\.endpoints\.apiBase\)/);
  assert.match(source, /serverUrl: exactServerUrl/);
  assert.match(source, /endpoints: resolution\.endpoints/);
  assert.match(source, /const resolveBrokerSelectionError = useCallback\(\(candidateBrokerId: string, candidateServerUrl = ''\) => \{/);
  assert.match(source, /const matchedBrokerOption = brokerOptions\.find\(\(option\) => option\.key === candidateKey\)/);
  assert.match(source, /Unable to reach the broker directory\. Check this device\\'s internet connection and retry\./);
  assert.match(source, /No available brokers were returned\. Retry the broker list before login\./);
  assert.match(source, /Please select your broker from the broker list before login\./);
  assert.doesNotMatch(source, /You can still type the Broker ID manually\./);
  assert.match(source, /brokerServerUrlValueRef\.current = option\.serverUrl/);
  assert.match(source, /setBrokerServerUrl\(option\.serverUrl\)/);
  assert.match(source, /onPress: \(\) => selectBrokerOptionFromPicker\(option\)/);
  assert.doesNotMatch(source, /setBrokerConnection|persistSelectedBrokerSession|resolveBrokerServiceBaseUrl/);
  assert.doesNotMatch(source, /proxyServer: resolveBrokerProxyServerAddress\(broker\)/);
  assert.match(source, /const handleBrokerPickerPress = \(\) => \{/);
  assert.match(source, /runImmediateAction\('login\.brokerPicker\.open'/);
  assert.match(source, /Keyboard\.dismiss\(\)/);
  assert.match(source, /testID="login-broker-picker-button"/);
  assert.match(source, /<Text style=\{styles\.inputLabel\}>\{t\('Broker Server'\)\}<\/Text>/);
  assert.doesNotMatch(source, /\{t\('Trading Server'\)\}/);
  assert.match(
    source,
    /<View style=\{styles\.fieldValueColumn\}>[\s\S]*?<View style=\{styles\.brokerHealthStatusSlot\}>[\s\S]*?isBrokerHealthChecking[\s\S]*?brokerHealthWarning[\s\S]*?<\/View>\s*<\/View>\s*<LoginBrokerPickerExpandedState store=\{brokerPickerStore\}>\s*\{\(brokerPickerExpanded\) => \(\s*<Pressable/,
  );
  assert.match(source, /searchPlaceholder="Search brokers\.\.\."/);
  assert.match(
    source,
    /<LoginBrokerPickerSheet[\s\S]*store=\{brokerPickerStore\}[\s\S]*actions=\{brokerPickerActions\}[\s\S]*searchable=\{brokerOptions\.length > 0\}[\s\S]*detent="large"[\s\S]*instantOpen[\s\S]*entryMotion="instant"[\s\S]*immediateHostHideOnClose[\s\S]*runActionAfterClose=\{false\}/,
  );
  assert.match(
    source,
    /brokerInputRow:\s*\{[\s\S]*minHeight: Math\.max\(80, Math\.ceil\(80 \* fontScale\)\),[\s\S]*paddingVertical: 12,/,
  );
  assert.match(source, /inputRow:\s*\{\s*width: '100%',[\s\S]*minHeight: 58,/);
  assert.match(source, /brokerHealthStatusSlot:\s*\{[\s\S]*minHeight: 0,/);
  assert.match(source, /inputLeadingIcon:\s*\{[\s\S]*width: 32,[\s\S]*textAlign: 'center',[\s\S]*marginRight: 10,/);
  assert.match(source, /input:\s*\{[\s\S]*textAlignVertical: 'center',/);
});

test('logged-out demo broker is only an initial default and cannot overwrite a user selection', () => {
  const source = readSource('app/login.tsx');
  const defaultEffectStart = source.indexOf(
    'hasResolvedLoggedOutBrokerDefaultRef.current ||',
  );
  const defaultEffectEnd = source.indexOf(
    'const selectedBrokerServerUrl',
    defaultEffectStart,
  );
  const defaultEffectSource = source.slice(defaultEffectStart, defaultEffectEnd);

  assert.match(
    source,
    /const hasResolvedLoggedOutBrokerDefaultRef = useRef\(false\)/,
  );
  assert.notEqual(defaultEffectStart, -1);
  assert.notEqual(defaultEffectEnd, -1);
  assert.match(
    defaultEffectSource,
    /hasResolvedLoggedOutBrokerDefaultRef\.current = true;[\s\S]*selectBrokerOption\(publicDemoOption\)/,
  );
  assert.match(defaultEffectSource, /option\.brokerId === ORRNN_PUBLIC_DEMO_LOGIN_BROKER_ID/);
  assert.match(defaultEffectSource, /option\.serverUrl === ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL/);
  assert.match(
    source,
    /const selectBrokerOptionFromPicker = useCallback\(\(option: LoginBrokerOption\) => \{\s*hasResolvedLoggedOutBrokerDefaultRef\.current = true;\s*selectBrokerOption\(option\);/,
  );
  assert.match(source, /onPress: \(\) => selectBrokerOptionFromPicker\(option\)/);
  assert.match(
    source,
    /const updateBrokerId = \(value: string\) => \{\s*hasResolvedLoggedOutBrokerDefaultRef\.current = true;/,
  );
});

test('login validation snapshots the latest committed native field values', () => {
  const source = readSource('app/login.tsx');
  const normalizedAccountIdIndex = source.indexOf('const normalizedAccountId = snapshot.accountId;');
  const demoLoginValidationIndex = source.indexOf(
    'const isOrrnnDemoLogin = normalizedBrokerId === ORRNN_DEMO_PUBLIC_BROKER_ID;',
    normalizedAccountIdIndex,
  );
  const loginRequestIndex = source.indexOf('const loginRequestPromise = loginAPI(', demoLoginValidationIndex);
  const loadingIndex = source.indexOf('setIsLoading(true);', loginRequestIndex);
  const awaitLoginIndex = source.indexOf('const response: any = await loginRequestPromise;', loadingIndex);

  assert.match(source, /type LoginCredentialsSnapshot = \{/);
  assert.match(source, /type NativeSyntheticEvent/);
  assert.match(source, /type TextInputEndEditingEventData/);
  assert.doesNotMatch(source, /const scheduleLoginSubmitAfterInputCommit/);
  assert.doesNotMatch(source, /globalThis\.requestAnimationFrame\(task\)/);
  assert.doesNotMatch(source, /globalThis\.requestAnimationFrame\(\(\) => \{\s*setTimeout\(task, 0\);/);
  assert.match(source, /runImmediateAction\('login\.submit\.touch'[\s\S]*const snapshot = getLoginCredentialsSnapshot\(\);[\s\S]*void handleLogin\(snapshot\);/);
  assert.notEqual(normalizedAccountIdIndex, -1);
  assert.notEqual(demoLoginValidationIndex, -1);
  assert.notEqual(loginRequestIndex, -1);
  assert.notEqual(loadingIndex, -1);
  assert.notEqual(awaitLoginIndex, -1);
  assert.ok(
    normalizedAccountIdIndex < demoLoginValidationIndex
      && demoLoginValidationIndex < loginRequestIndex
      && loginRequestIndex < loadingIndex
      && loadingIndex < awaitLoginIndex,
    'latest snapshotted account ID must be validated before the request, which starts before loading-state work',
  );
  const demoLoginRequestSource = source.slice(demoLoginValidationIndex, loadingIndex);
  assert.match(demoLoginRequestSource, /const numericDemoLogin = isOrrnnDemoLogin \? Number\(normalizedAccountId\) : null/);
  assert.match(
    demoLoginRequestSource,
    /if \(\s*isOrrnnDemoLogin &&\s*\(!Number\.isSafeInteger\(numericDemoLogin\) \|\| Number\(numericDemoLogin\) <= 0\)\s*\) \{[\s\S]*return;/,
  );
  assert.match(
    demoLoginRequestSource,
    /const loginRequestPromise = loginAPI\(\s*isOrrnnDemoLogin\s*\? \{[\s\S]*?login: Number\(numericDemoLogin\),[\s\S]*?password: currentPassword,[\s\S]*?broker_id: ORRNN_DEMO_PUBLIC_BROKER_ID,[\s\S]*?\}\s*: \{[\s\S]*?username: normalizedAccountId,[\s\S]*?password: currentPassword,[\s\S]*?broker_id: selectedEndpoints\.brokerId,[\s\S]*?\},\s*\{ serverUrl: normalizedServerUrl, signal: loginAbortController\.signal \},\s*\);/,
  );
  assert.match(source, /const brokerIdValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const brokerServerUrlValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const brokerLogoUrlValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const accountIdValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const passwordValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const updateBrokerId = \(value: string\) => \{[\s\S]*brokerIdValueRef\.current = value;[\s\S]*setBrokerId\(value\);[\s\S]*\}/);
  assert.match(source, /const updateAccountId = \(value: string\) => \{[\s\S]*accountIdValueRef\.current = value;[\s\S]*setAccountId\(value\);[\s\S]*\}/);
  assert.match(source, /const updatePassword = \(value: string\) => \{[\s\S]*passwordValueRef\.current = value;[\s\S]*setPassword\(value\);[\s\S]*\}/);
  assert.match(source, /const getLoginCredentialsSnapshot = \(\): LoginCredentialsSnapshot => \{/);
  assert.match(source, /const candidateServerUrl = normalizeBrokerServerUrl\(/);
  assert.match(source, /const candidateBrokerId = \(brokerIdValueRef\.current \?\? brokerId\)\.trim\(\)/);
  assert.match(source, /brokerId: candidateBrokerId/);
  assert.match(source, /serverUrl: isBrokerServerUrlForApiBase\(candidateServerUrl, matchedOption\?\.endpoints\.apiBase\)[\s\S]*\? candidateServerUrl[\s\S]*: ''/);
  assert.match(source, /endpoints: matchedOption\?\.endpoints \?\? null/);
  assert.doesNotMatch(source, /proxyServer: selectedProxyServer/);
  assert.match(source, /logoUrl: brokerLogoUrlValueRef\.current \?\? selectedBrokerLogoUrl/);
  assert.match(source, /accountId: \(accountIdValueRef\.current \?\? accountId\)\.trim\(\)/);
  assert.match(source, /password: passwordValueRef\.current \?\? password/);
  assert.match(source, /const handleLogin = async \(snapshot: LoginCredentialsSnapshot = getLoginCredentialsSnapshot\(\)\) => \{/);
  assert.match(source, /const normalizedBrokerId = snapshot\.brokerId/);
  assert.match(source, /const normalizedServerUrl = snapshot\.serverUrl/);
  assert.doesNotMatch(source, /const proxyServer = snapshot\.proxyServer/);
  assert.match(source, /if \(!normalizedBrokerId\) \{\s*setIsLoading\(false\);/);
  assert.match(source, /const brokerSelectionMessage = resolveBrokerSelectionError\(normalizedBrokerId, normalizedServerUrl\)/);
  assert.match(source, /if \(brokerSelectionMessage\) \{\s*setIsLoading\(false\);/);
  assert.match(source, /if \(\s*!normalizedServerUrl\s*\|\|\s*!selectedEndpoints\s*\|\|\s*!isBrokerServerUrlForApiBase\(normalizedServerUrl, selectedEndpoints\.apiBase\)\s*\) \{/);
  assert.match(source, /if \(!normalizedAccountId \|\| !currentPassword\) \{\s*setIsLoading\(false\);/);
  assert.match(source, /onChangeText=\{updateBrokerId\}/);
  assert.match(source, /onEndEditing=\{updateBrokerIdFromEndEditing\}/);
  assert.match(source, /onChangeText=\{updateAccountId\}/);
  assert.match(source, /onEndEditing=\{updateAccountIdFromEndEditing\}/);
  assert.match(source, /onChangeText=\{updatePassword\}/);
  assert.match(source, /onEndEditing=\{updatePasswordFromEndEditing\}/);
});

test('login failure modal keeps the real backend error visible', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /const safeErrorMessage = redactSensitiveString\([\s\S]*error\?\.message[\s\S]*t\('Invalid credentials'\)[\s\S]*\)/);
  assert.match(source, /setModalState\(\{ visible: true, type: 'error', title: t\('Login Failed'\), message: safeErrorMessage \}\)/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => \{\s*setModalState\(prev => \(\{ \.\.\.prev, visible: false \}\)\);[\s\S]*\}, 2000\)/);
});

test('login submit has a synchronous duplicate request guard', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /const loginRequestInFlightRef = useRef\(false\)/);
  assert.match(source, /const loginSubmitPressGuardRef = useRef\(false\)/);
  assert.match(source, /const LOGIN_SUBMIT_PRESS_GUARD_MS = 120/);
  assert.match(source, /loginSubmitPressGuardTimerRef\.current = setTimeout\(\(\) => \{/);
  assert.match(source, /loginSubmitPressGuardRef\.current = false/);
  assert.match(source, /if \(loginRequestInFlightRef\.current\) \{\s*return;\s*\}/);
  assert.match(source, /loginRequestInFlightRef\.current = true/);
  assert.match(source, /finally \{\s*loginRequestInFlightRef\.current = false;/);
});

test('login atomically commits the validated secure session before navigation', () => {
  const source = readSource('app/login.tsx');
  const loginRequestIndex = source.indexOf('const loginRequestPromise = loginAPI');
  const sessionCommitIndex = source.indexOf('await commitBrokerSession({', loginRequestIndex);
  const pendingTradeIntentIndex = source.indexOf('const pendingTradeIntent = consumePendingTradeAuthIntent();', sessionCommitIndex);
  const orderTicketRouterReplaceIndex = source.indexOf('router.replace({', pendingTradeIntentIndex);
  const tradeRouterReplaceIndex = source.indexOf("router.replace('/(tabs)/trade');", pendingTradeIntentIndex);
  const quotesRouterReplaceIndex = source.indexOf("router.replace('/(tabs)/quotes');", pendingTradeIntentIndex);
  const successNavigationIndices = [
    orderTicketRouterReplaceIndex,
    tradeRouterReplaceIndex,
    quotesRouterReplaceIndex,
  ];
  const firstSuccessNavigationIndex = Math.min(...successNavigationIndices);
  const lastSuccessNavigationIndex = Math.max(...successNavigationIndices);
  const postLoginWorkIndex = source.indexOf('schedulePostLoginWork(() => {', lastSuccessNavigationIndex);
  // Contract v3: /broker/config server_name + /account/{login} name are
  // applied by the post-login profile enrichment.
  const brokerConfigRefreshIndex = source.indexOf('void enrichSignedInAccountProfile({', postLoginWorkIndex);
  const handleLoginEndIndex = source.indexOf('const releaseLoginSubmitPressGuard', postLoginWorkIndex);

  assert.notEqual(loginRequestIndex, -1);
  assert.notEqual(sessionCommitIndex, -1);
  assert.notEqual(pendingTradeIntentIndex, -1);
  for (const navigationIndex of successNavigationIndices) {
    assert.notEqual(navigationIndex, -1);
  }
  assert.notEqual(postLoginWorkIndex, -1);
  assert.notEqual(brokerConfigRefreshIndex, -1);
  assert.notEqual(handleLoginEndIndex, -1);
  const loginCriticalPath = source.slice(loginRequestIndex, firstSuccessNavigationIndex);
  const handleLoginSuccessSource = source.slice(loginRequestIndex, handleLoginEndIndex);
  assert.doesNotMatch(
    loginCriticalPath,
    /checkBrokerServerHealth/,
    'login should not run a serial health probe after the user presses submit',
  );
  assert.match(loginCriticalPath, /if \(!isSameBrokerId\(responseBrokerId, selectedEndpoints\.brokerId\)\)/);
  assert.match(loginCriticalPath, /await commitBrokerSession\(\{/);
  assert.match(loginCriticalPath, /brokerId: selectedEndpoints\.brokerId/);
  assert.match(loginCriticalPath, /apiBase: selectedEndpoints\.apiBase/);
  assert.match(loginCriticalPath, /feedWsBase: selectedEndpoints\.feedWsBase/);
  assert.match(loginCriticalPath, /feedStatusUrl: selectedEndpoints\.feedStatusUrl/);
  assert.match(loginCriticalPath, /accessToken,[\s\S]*refreshToken: refreshToken \?\? ''/);
  assert.match(loginCriticalPath, /accountType,[\s\S]*accountEnvironmentSource,/);
  assert.doesNotMatch(loginCriticalPath, /persistSelectedBrokerSession|persistAuthSessionTokens|setBrokerConnection/);
  assert.match(source, /let didStartSuccessNavigation = false/);
  assert.match(source, /didStartSuccessNavigation = true/);
  assert.match(source, /if \(!didStartSuccessNavigation\) \{\s*if \(loginMountedRef\.current\) \{\s*setIsLoading\(false\);/);
  assert.equal(
    (handleLoginSuccessSource.match(/await commitBrokerSession\(\{/g) ?? []).length,
    1,
    'login must use one atomic broker-session commit',
  );
  assert.ok(
    brokerConfigRefreshIndex > loginRequestIndex,
    'broker config refresh should run after auth has already completed',
  );
  assert.ok(
    sessionCommitIndex > loginRequestIndex
      && pendingTradeIntentIndex > sessionCommitIndex
      && successNavigationIndices.every((navigationIndex) => navigationIndex > pendingTradeIntentIndex),
    'login must finish its atomic secure session commit before consuming and routing a pending trade intent',
  );
  assert.ok(
    postLoginWorkIndex > lastSuccessNavigationIndex,
    'non-critical login bookkeeping should be scheduled after navigation starts',
  );
  assert.ok(
    brokerConfigRefreshIndex > postLoginWorkIndex,
    'broker config refresh should stay in the post-navigation work queue',
  );
  assert.doesNotMatch(source, /await getBrokerConfig/);
  assert.doesNotMatch(source, /brokerConfig\s*=\s*await getBrokerConfig/);
  assert.doesNotMatch(source, /Login successful/);
  assert.doesNotMatch(
    source,
    /setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*router\.replace\('\/\(tabs\)\/quotes'\)[\s\S]*\},\s*1200\s*\)/,
  );
  assert.match(source, /const schedulePostLoginWork = \(task: \(\) => void\) => \{[\s\S]*requestAnimationFrame/);
  assert.match(
    source.slice(sessionCommitIndex, postLoginWorkIndex),
    /await commitBrokerSession\(\{[\s\S]*\}, commitAuthorization\);[\s\S]*const pendingTradeIntent = consumePendingTradeAuthIntent\(\);[\s\S]*pathname: '\/trade\/order-ticket'[\s\S]*router\.replace\('\/\(tabs\)\/trade'\);[\s\S]*router\.replace\('\/\(tabs\)\/quotes'\);[\s\S]*didStartSuccessNavigation = true;/,
  );
  assert.match(source, /authorizeBrokerSessionCommit\(\)[\s\S]*signal: loginAbortController\.signal/);
  assert.match(source, /bootstrapApp\(\{[\s\S]*expectedProvenance: committedProvenance/);
  // Contract v3: server_name/name arrive through the post-login enrichment;
  // the broker config cache root is invalidated instead of hand-seeded.
  assert.match(source, /void enrichSignedInAccountProfile\(\{[\s\S]*provenance: committedProvenance/);
  assert.match(source, /invalidateSessionQueryRoots\([\s\S]*'brokerConfig'\]/);
});

test('broker detail login atomically commits the selected directory session before navigation', () => {
  const source = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const submitIndex = source.indexOf('const submitLogin = async () => {');
  const loginRequestIndex = source.indexOf('const response: any = await loginAPI', submitIndex);
  const sessionCommitIndex = source.indexOf('await commitBrokerSession({', loginRequestIndex);
  const routerReplaceIndex = source.indexOf("router.replace('/(tabs)/quotes');", loginRequestIndex);
  const postLoginWorkIndex = source.indexOf('scheduleBrokerDetailPostLoginWork(() => {', routerReplaceIndex);

  assert.notEqual(submitIndex, -1);
  assert.notEqual(loginRequestIndex, -1);
  assert.notEqual(sessionCommitIndex, -1);
  assert.notEqual(routerReplaceIndex, -1);
  assert.notEqual(postLoginWorkIndex, -1);
  assert.match(source, /const scheduleBrokerDetailKeyboardDismiss = \(\) => \{/);
  assert.match(source, /scheduleBrokerDetailKeyboardDismiss\(\);/);
  assert.doesNotMatch(source, /checkBrokerServerHealth/);
  const brokerDetailCriticalPath = source.slice(submitIndex, routerReplaceIndex);
  assert.match(brokerDetailCriticalPath, /if \(!isSameBrokerId\(responseBrokerId, selectedEndpoints\.brokerId\)\)/);
  assert.match(brokerDetailCriticalPath, /await commitBrokerSession\(\{/);
  assert.match(brokerDetailCriticalPath, /brokerId: selectedEndpoints\.brokerId/);
  assert.match(brokerDetailCriticalPath, /apiBase: selectedEndpoints\.apiBase/);
  assert.match(brokerDetailCriticalPath, /feedWsBase: selectedEndpoints\.feedWsBase/);
  assert.match(brokerDetailCriticalPath, /feedStatusUrl: selectedEndpoints\.feedStatusUrl/);
  assert.match(brokerDetailCriticalPath, /accountType,[\s\S]*accountEnvironmentSource,/);
  assert.doesNotMatch(brokerDetailCriticalPath, /persistSelectedBrokerSession|persistAuthSessionTokens|setBrokerConnection/);
  assert.match(source, /let didStartSuccessNavigation = false/);
  assert.match(source, /didStartSuccessNavigation = true/);
  assert.match(source, /if \(!didStartSuccessNavigation\) \{\s*if \(brokerLoginMountedRef\.current\) \{\s*setIsLoading\(false\);/);
  assert.ok(
    sessionCommitIndex > loginRequestIndex && routerReplaceIndex > sessionCommitIndex,
    'broker detail must finish the atomic secure session commit before navigation',
  );
  assert.ok(postLoginWorkIndex > routerReplaceIndex, 'optional bookkeeping stays after navigation');
  assert.match(source, /await commitBrokerSession\(\{[\s\S]*\}, commitAuthorization\);[\s\S]*router\.replace\('\/\(tabs\)\/quotes'\);\s*didStartSuccessNavigation = true;\s*scheduleBrokerDetailPostLoginWork\(\(\) => \{/);
  assert.match(source, /authorizeBrokerSessionCommit\(\)[\s\S]*signal: loginAbortController\.signal/);
});

test('broker detail preserves only the exact selected broker ID and server URL', () => {
  const source = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const reconcileStart = source.search(/useEffect\(\(\) => \{\r?\n\s*setSelectedServer\(\(current\) => \{/);
  const reconcileEnd = source.indexOf('  }, [serverOptions]);', reconcileStart);
  const submitStart = source.indexOf('const submitLogin = async () => {');
  const submitEnd = source.indexOf('const openExistingAccount', submitStart);
  const reconcileSource = source.slice(reconcileStart, reconcileEnd);
  const submitSource = source.slice(submitStart, submitEnd);

  assert.notEqual(reconcileStart, -1);
  assert.notEqual(reconcileEnd, -1);
  assert.notEqual(submitStart, -1);
  assert.match(source, /const isExactBrokerServerSelection = \(/);
  assert.match(source, /leftBrokerId === rightBrokerId[\s\S]*leftServerUrl === rightServerUrl/);
  assert.match(source, /serverOptions\.find\(\(option\) => \([\s\S]*isExactBrokerServerSelection\(option, initialServerOption\)[\s\S]*\)\) \?\? initialServerOption/);
  // The Server dropdown lists the FULL validated directory (broker switcher),
  // launch broker first; every option's endpoints come from
  // buildServerOptionFromBrokerServer, never from route params.
  assert.match(
    source,
    /\.map\(buildServerOptionFromBrokerServer\)[\s\S]*isExactBrokerServerSelection\(b, initialServerOption\)[\s\S]*isExactBrokerServerSelection\(a, initialServerOption\)/,
  );
  assert.match(
    source,
    /const hasInitialOption = out\.some\(\(option\) => \([\s\S]*isExactBrokerServerSelection\(option, initialServerOption\)[\s\S]*if \(!hasInitialOption && \(initialServerOption\.label \|\| initialServerOption\.brokerId\)\)/,
  );
  assert.doesNotMatch(source, /serverOptions\[0\] \?\? initialServerOption/);
  assert.match(reconcileSource, /option\.endpoints !== null[\s\S]*isExactBrokerServerSelection\(option, current\)/);
  assert.doesNotMatch(reconcileSource, /option\.brokerId\.trim\(\)\.toLowerCase\(\) === current\.brokerId\.trim\(\)\.toLowerCase\(\)/);
  assert.match(submitSource, /const effectiveBrokerId = selectedServer\.brokerId\.trim\(\)/);
  assert.match(submitSource, /const effectiveServerUrl = normalizeBrokerServerUrl\(selectedServer\.serverUrl\)/);
  assert.doesNotMatch(submitSource, /selectedServer\.serverUrl \|\| initialServerUrl/);
  assert.match(submitSource, /selectedEndpoints\.brokerId\.trim\(\)\.toLowerCase\(\) !== effectiveBrokerId\.toLowerCase\(\)/);
  assert.match(submitSource, /!isBrokerServerUrlForApiBase\(effectiveServerUrl, selectedEndpoints\.apiBase\)/);
});

test('broker detail login button shows text without a trailing arrow icon', () => {
  const source = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const loginButtonStart = source.indexOf('latencyLabel="brokerDetail.login.submit"');
  const loginButtonEnd = source.indexOf('</Pressable>', loginButtonStart);
  assert.notEqual(loginButtonStart, -1);
  assert.notEqual(loginButtonEnd, -1);

  const loginButtonSource = source.slice(loginButtonStart, loginButtonEnd);
  assert.match(loginButtonSource, /<Text style=\{styles\.loginBtnText\}>\{t\('Login'\)\}<\/Text>/);
  assert.doesNotMatch(loginButtonSource, /arrow-forward|chevron-forward|<Ionicons/);
});

test('login auth request has a bounded frontend timeout', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /const AUTH_LOGIN_TIMEOUT_MS = 8000/);
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /Login request timed out\. Please check your connection and try again\./);
  assert.match(source, /clearTimeout\(timeout\)/);
});

test('saved account credentials use native-safe SecureStore keys', () => {
  const source = readSource('src/state/savedAccounts.ts');

  assert.match(source, /const encodeCredentialKeyPart = \(value: string\) =>/);
  assert.match(source, /codePointAt\(0\)\?\.toString\(16\)\.padStart\(4, '0'\)/);
  assert.match(source, /export const makeSavedAccountCredentialKey = \(brokerId: string, login: string\) =>/);
  assert.match(source, /`rtx5_saved_account_pass\.\$\{encodeCredentialKeyPart\(brokerId\)\}\.\$\{encodeCredentialKeyPart\(login\)\}`/);
  assert.match(source, /setSecureItemAsync\(makeSavedAccountCredentialKey\(brokerId, login\), password\)/);
  assert.match(source, /getSecureItemAsync\(makeSavedAccountCredentialKey\(brokerId, login\)\)/);
  assert.match(source, /removeSecureItemAsync\(makeSavedAccountCredentialKey\(brokerId, login\)\)/);
  assert.doesNotMatch(source, /rtx5_saved_account_pass:/);
});

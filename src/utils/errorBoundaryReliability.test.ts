import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { serializeStartupError } from './errorSerialization';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('root layout is protected by the app error boundary', () => {
  const source = readSource('app/_layout.tsx');

  assert.match(source, /import \{ ErrorBoundary \} from '\.\.\/src\/ui\/components\/ErrorBoundary'/);
  assert.match(source, /<Stack\.Screen name='index' options=\{\{ headerShown: false \}\} \/>/);
  assert.match(source, /<ErrorBoundary>[\s\S]*<InnerLayout \/>[\s\S]*<\/ErrorBoundary>/);
  // OTA install modal must survive a trading-tree crash (was nested inside ErrorBoundary).
  assert.match(
    source,
    /<\/ErrorBoundary>\s*<OtaUpdateModal \{\.\.\.otaUpdatePrompt\} \/>/,
  );
  assert.match(source, /OtaUpdateModal MUST sit outside ErrorBoundary/);
});

test('error boundary reload remounts the crashed subtree through the fast press path', () => {
  const source = readSource('src/ui/components/ErrorBoundary.tsx');

  assert.match(source, /resetKey: number/);
  assert.match(source, /resetKey: 0/);
  assert.match(source, /getDerivedStateFromError\(error: Error\): Partial<State>/);
  assert.match(source, /logStartupError\('error-boundary\.caught'/);
  assert.match(source, /this\.setState\(\(state\) => \(\{[\s\S]*resetKey: state\.resetKey \+ 1/);
  assert.match(source, /<React\.Fragment key=\{this\.state\.resetKey\}>/);
  assert.match(source, /latencyLabel="errorBoundary\.restart"/);
  assert.match(source, /accessibilityRole="button"/);
  // Recovery path for users stuck on a crashed OTA build (e.g. 1.1.28).
  assert.match(source, /latencyLabel="errorBoundary\.installUpdate"/);
  assert.match(source, /Install latest update/);
  assert.match(source, /Updates\.fetchUpdateAsync/);
  assert.match(source, /Updates\.reloadAsync/);
  assert.match(source, /Updates\.latestContext\.isUpdatePending/);
  assert.doesNotMatch(source, /Updates\.isUpdatePending/);
});

test('persisted auth restore requires a broker-bound secure credential bundle', () => {
  const source = readSource('src/state/userPreferences/store.ts');

  assert.match(source, /sanitizePreferenceAuthStorageValue\(parsed\)/);
  assert.match(source, /migrateLegacyAuthSessionCredentials\(\{/);
  assert.match(source, /failClosedPersistedAuthState\(persistedStorageValue\)/);
  assert.match(source, /Boolean\(accountDetails\?\.credentials\?\.accessToken\)/);
});

test('secure storage reads fail closed during startup restore', () => {
  const source = readSource('src/utils/secureStorage.ts');

  assert.match(source, /keychainAccessible: SecureStore\.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/);
  assert.match(source, /Platform\.OS === 'ios' \? IOS_SECURE_STORE_WRITE_OPTIONS : undefined/);
  assert.match(source, /try \{[\s\S]*SecureStore\.getItemAsync\(key\)/);
  // Native read failures are genuine errors; web has no secure store by design.
  assert.match(
    source,
    /if \(Platform\.OS !== 'web'\) \{\s*console\.error\('\[SecureStorage\] Failed to read secure item'/,
  );
  assert.doesNotMatch(source, /console\.warn\(/);
  assert.match(source, /return null;/);
  assert.doesNotMatch(source, /import AsyncStorage|from '@react-native-async-storage\/async-storage'/);
  assert.match(source, /Secure credential storage is unavailable on web/);
});

test('secondary persisted stores normalize valid-but-invalid shapes before hydration', () => {
  const savedAccountsSource = readSource('src/state/savedAccounts.ts');
  const tradeNotificationsSource = readSource('src/state/tradeNotifications.ts');

  assert.match(savedAccountsSource, /normalizeSavedAccountsPersistedState/);
  assert.match(savedAccountsSource, /accounts: Array\.isArray\(accounts\)/);
  assert.match(savedAccountsSource, /filter\(\(account\): account is SavedAccount => account !== null\)/);
  assert.match(savedAccountsSource, /merge: \(persistedState, currentState\) => \(\{/);
  assert.match(savedAccountsSource, /hasHydrated: true/);

  assert.match(tradeNotificationsSource, /normalizeTradeNotificationsPersistedState/);
  assert.match(tradeNotificationsSource, /normalizeEnabledKeys\(asRecord\(state\)\.enabledKeys\)/);
  assert.match(tradeNotificationsSource, /partialize: \(state\) => \(\{ enabledKeys: state\.enabledKeys \}\)/);
  assert.match(tradeNotificationsSource, /merge: \(persistedState, currentState\) => \(\{/);
});

test('startup diagnostics stringify non-error throws without throwing again', () => {
  const source = readSource('src/utils/errorSerialization.ts');

  assert.match(source, /const stringifyFallback = \(value: unknown\): string => \{/);
  assert.match(source, /const serialized = JSON\.stringify\(value\)/);
  assert.match(source, /return '\[Unserializable value\]'/);
  assert.match(source, /message: redactSensitiveString\([\s\S]*safeStringify\(error\)/);

  const circular: { self?: unknown; toString: () => string } = {
    toString: () => {
      throw new Error('toString exploded');
    },
  };
  circular.self = circular;

  assert.deepEqual(serializeStartupError(circular), {
    name: 'NonError',
    message: '[Unserializable value]',
    stack: null,
  });
});

test('startup diagnostics redact credential-bearing error text and stacks', () => {
  const error = new Error('request failed Authorization: Bearer secret-token?token=query-secret');
  error.stack = 'Error: feed?sig=stack-secret';

  const serialized = serializeStartupError(error);
  assert.doesNotMatch(serialized.message, /secret-token|query-secret/);
  assert.doesNotMatch(serialized.stack ?? '', /stack-secret/);
  assert.match(serialized.message, /\[redacted\]/);

  const diagnosticsSource = readSource('src/utils/startupDiagnostics.ts');
  assert.match(diagnosticsSource, /redactDiagnosticValue\(\{/);
  assert.match(diagnosticsSource, /redactSensitiveString\(event\)/);
});

test('transient account hydration failures stay stack-free in Expo diagnostics', () => {
  const source = readSource('src/services/bootstrapApp.ts');
  const requestStart = source.indexOf('const requestJson = async');
  const requestEnd = source.indexOf('const mapBootstrapAccountRow', requestStart);
  assert.ok(requestStart >= 0 && requestEnd > requestStart);
  const request = source.slice(requestStart, requestEnd);
  assert.match(request, /readBootstrapSnapshot\(/);
  assert.match(request, /if \(typeof __DEV__ !== 'undefined' && __DEV__\)/);
  assert.match(request, /console\.log\('\[Bootstrap\] Request failed'/);
  assert.match(request, /endpoint: sanitizeApiLatencyEndpoint\(endpoint\)/);
  assert.match(request, /errorName: error instanceof Error \? error.name/);
  assert.match(request, /return null/);
  assert.doesNotMatch(request, /console\.(?:warn|error)|error\.stack|redactDiagnosticValue\(error\)/);
  const root = readSource('app/_layout.tsx');
  assert.doesNotMatch(root, /getAccountByIdResult|Initial account metrics temporarily unavailable/);
});

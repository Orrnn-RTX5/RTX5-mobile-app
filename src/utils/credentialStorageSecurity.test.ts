import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('no feed credential is tracked in env or read by the OTA env check (contract v3)', () => {
  const envSource = readSource('.env');
  const otaCheckSource = readSource('scripts/ota/check-eas-env.js');

  assert.doesNotMatch(envSource, /^EXPO_PUBLIC_[A-Z_]*FEED_(?:BROKER_)?(?:TOKEN|ID)=/m);
  assert.doesNotMatch(otaCheckSource, /EXPO_PUBLIC_FEED_BROKER_TOKEN/);
});

test('no broker (Achiever included) can select a static EXPO_PUBLIC feed credential', () => {
  // The env-token resolver module was deleted with backend contract v3.
  assert.equal(existsSync(resolve(process.cwd(), 'src/api/feedAuth.ts')), false);
  assert.doesNotMatch(readSource('app.config.js'), /EXPO_PUBLIC_[A-Z_]*FEED_TOKEN/);
});

test('secure storage refuses a plaintext AsyncStorage fallback on web', () => {
  const source = readSource('src/utils/secureStorage.ts');

  assert.doesNotMatch(source, /@react-native-async-storage\/async-storage/);
  assert.match(source, /Platform\.OS === 'web'/);
  assert.match(source, /throw new Error\('Secure credential storage is unavailable on web\.'\)/);
});

test('broker auth persistence uses the bound versioned bundle, not individual token writes', () => {
  const source = readSource('src/state/brokerSessionStorage.ts');
  const bundleSource = readSource('src/state/secureCredentialBundle.ts');

  assert.match(source, /secureCredentialBundleStore\.replace\(input\)/);
  assert.match(bundleSource, /const bundle = createBundle\(input\)/);
  assert.match(bundleSource, /const brokerId = normalizeBrokerId\(input\.brokerId\)/);
  assert.match(bundleSource, /const accountLogin = cleanString\(input\.accountLogin\)/);
  assert.doesNotMatch(bundleSource, /feedAuthContext:/);
  assert.match(source, /secureCredentialBundleStore\.clear\(\)/);
  assert.doesNotMatch(source, /setSecureItemAsync\(ACCESS_TOKEN_KEY/);
  assert.doesNotMatch(source, /setSecureItemAsync\(FEED_BROKER_TOKEN_KEY/);
});

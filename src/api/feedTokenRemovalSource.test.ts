import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

/**
 * Replaces the old feed-token tests (feedAuth.test.ts, feedAuthContract.test.ts
 * and the Achiever feed-handoff source test). Backend contract v3: "There is
 * no feed token anywhere." No env value, login, account-switch, registration
 * or refresh path may configure, require, read, store or forward one.
 */

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('the feed-token modules are deleted', () => {
  assert.equal(existsSync(resolve(process.cwd(), 'src/api/feedAuth.ts')), false);
  assert.equal(existsSync(resolve(process.cwd(), 'src/api/feedAuthContract.ts')), false);
});

test('no EXPO_PUBLIC feed-token or feed-broker-id env var exists in config', () => {
  for (const path of ['.env', '.env.example', 'app.config.js', 'eas.json']) {
    assert.doesNotMatch(
      source(path),
      /EXPO_PUBLIC_[A-Z_]*FEED_TOKEN|EXPO_PUBLIC_FEED_BROKER_(?:TOKEN|ID)|EXPO_PUBLIC_BROKER_FEED_(?:TOKEN|ID)/,
      `${path} must not define a feed-token env var`,
    );
  }
});

test('directory and platform API point at superadmin-prod (contract v3)', () => {
  const env = source('.env');
  assert.match(env, /^EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL=https:\/\/superadmin-prod\.orrnn\.com\/api\/v2\r?$/m);
  assert.match(env, /^EXPO_PUBLIC_ADDITIONAL_BROKER_DIRECTORY_BASE_URL=https:\/\/nexa-terminal\.orrnn\.com\/discovery-api\/api\/v2\r?$/m);
  assert.match(env, /^EXPO_PUBLIC_ADDITIONAL_BROKER_IDS=Nexa\r?$/m);
  assert.match(env, /^EXPO_PUBLIC_API_BASE_URL=https:\/\/superadmin-prod\.orrnn\.com\/api\/v2\r?$/m);
  const appConfig = source('app.config.js');
  assert.doesNotMatch(appConfig, /superbackend\.orrnn\.com|fxtrustsuperbackned\.orrnn\.com/);
  assert.equal(appConfig.match(/'https:\/\/superadmin-prod\.orrnn\.com\/api\/v2'/g)?.length, 2);
});

test('the quote feed URL is the plain feedWsBase: no token, no env lookup', () => {
  const brokerApi = source('src/api/brokerApi.ts');
  const quoteUrlBody = brokerApi.slice(
    brokerApi.indexOf('async getQuoteWebSocketUrl()'),
    brokerApi.indexOf('private async executeRequest('),
  );
  assert.match(quoteUrlBody, /return capture\.session\.feedWsBase;/);
  assert.doesNotMatch(quoteUrlBody, /token|feedAuth|process\.env/i);
});

const FEED_TOKEN_PATTERN =
  /feed_token|feedToken|feed_auth_context|resolveSessionFeedAuth|extractFeedBrokerToken|feed_generation_reused|ACHIEVER_BROKER_ID/;

test('login, account switch, broker detail and registration never touch a feed token', () => {
  for (const path of [
    'app/login.tsx',
    'app/register.tsx',
    'src/features/settings/BrokerDetailScreen.tsx',
    'src/api/auth.ts',
  ]) {
    assert.doesNotMatch(source(path), FEED_TOKEN_PATTERN, path);
  }
  // authSession and the session store no longer carry any feed-auth member.
  for (const path of ['src/api/authSession.ts', 'src/state/activeBrokerSession.ts']) {
    assert.doesNotMatch(source(path), /feedToken|feedAuthContext|FeedAuthContext|FEED_AUTH_NONE/, path);
  }
});

test('refresh stores rotated credentials only and emits no feed contract outcome', () => {
  const brokerApi = source('src/api/brokerApi.ts');
  assert.doesNotMatch(brokerApi, FEED_TOKEN_PATTERN);
  assert.doesNotMatch(brokerApi, /feedAuthContext|feedContractAccepted|disabled_unconfigured/);
  assert.match(brokerApi, /replaceAuthSessionCredentials\(\{[\s\S]*?refreshToken: normalized\.refreshToken,[\s\S]*?expiresAt: normalized\.expiresAt,\s*\}\)/);
  assert.match(brokerApi, /timeoutMs: AUTH_REFRESH_TIMEOUT_MS/);
});

test('secure storage and the session manifest keep no feed credential', () => {
  const bundle = source('src/state/secureCredentialBundle.ts');
  const manifest = source('src/state/activeBrokerSessionStorage.ts');
  const storage = source('src/state/brokerSessionStorage.ts');
  assert.doesNotMatch(bundle, /feedAuthContext:|normalizeFeedAuthContext|preserveNonBlankFeedToken/);
  assert.doesNotMatch(manifest, /feedAuthContext:|parseFeedAuthContext|achiever/i);
  assert.doesNotMatch(storage, /getStoredFeedBrokerToken|FEED_BROKER_TOKEN_KEY/);
});

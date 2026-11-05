import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('startup diagnostics expose OTA/build/environment identifiers', () => {
  const source = readSource('src/utils/startupDiagnostics.ts');
  const appConfig = readSource('app.config.js');
  const fingerprintConfig = readSource('fingerprint.config.js');

  assert.match(source, /environment:/);
  assert.match(source, /appDisplayVersion:/);
  assert.match(source, /runtimeVersion:/);
  assert.match(source, /channel:/);
  assert.match(source, /updatesUrl:/);
  assert.match(source, /updateId:/);
  assert.match(source, /isEmbeddedLaunch:/);
  assert.match(source, /apiBaseUrl:/);
  assert.match(source, /brokerDirectoryBaseUrl:/);
  assert.match(source, /gitCommitSha:/);
  assert.match(source, /gitDirty:/);
  assert.match(appConfig, /gitCommitSha: resolveGitCommitSha\(\)/);
  assert.match(appConfig, /\.slice\(0, 12\)/);
  assert.match(appConfig, /if \(process\.env\.EAS_BUILD_GIT_COMMIT_HASH\) \{[\s\S]*return 'false'/);
  assert.match(appConfig, /process\.env\.EXPO_PUBLIC_APP_ENV/);
  assert.match(appConfig, /apiBaseUrl:/);
  assert.match(fingerprintConfig, /PackageJsonAndroidAndIosScriptsIfNotContainRun/);
  assert.match(fingerprintConfig, /ExpoConfigExtraSection/);
  assert.doesNotMatch(source, /FEED_BROKER_TOKEN|SENTRY_AUTH_TOKEN/);
});

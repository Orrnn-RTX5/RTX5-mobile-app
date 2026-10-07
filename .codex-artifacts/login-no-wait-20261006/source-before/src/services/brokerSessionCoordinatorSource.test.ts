import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/services/brokerSessionCoordinator.ts'),
  'utf8',
);

test('session coordinator carries approved services-domain provenance through commit and restore', () => {
  assert.match(source, /const manifest = createActiveBrokerSessionManifest\(input\.session\)/);
  assert.match(source, /servicesDomain: manifest\.servicesDomain/);
  assert.match(source, /writeManifest: \(\) => writeActiveBrokerSessionManifest\(input\.session\)/);
  assert.match(source, /manifest = await readActiveBrokerSessionManifest\(\)/);
  assert.match(source, /activateBrokerSession\(transition, manifest, \{/);
});

test('session coordinator neither requires nor stores a feed token (contract v3)', () => {
  assert.doesNotMatch(source, /feedToken|feedAuthContext|resolveEffectiveFeedAuthForSession/);
  assert.match(source, /credentialApproved: true/);
});

test('secure restore failures advance the epoch and stay logged out', () => {
  const failClosedBody = source.slice(
    source.indexOf('const failClosed = async'),
    source.indexOf('const commitBrokerSessionInternal'),
  );
  assert.match(failClosedBody, /beginActiveBrokerSessionTransition\(\)/);
  assert.match(failClosedBody, /await teardownBrokerSessionRuntime\(\)/);
  assert.match(failClosedBody, /useUserPreferences\.getState\(\)\.logout\(\)/);
  assert.match(failClosedBody, /Promise\.allSettled/);
  assert.match(source, /catch \{\s*return failClosed\('Stored broker session manifest could not be read securely\.'/);
  assert.match(source, /catch \{\s*return failClosed\('Stored broker credentials could not be read securely\.'/);
});

test('cold restore trusts the matching secure manifest and bundle instead of stale preferences', () => {
  const restoreStart = source.indexOf('export const restoreBrokerSession =');
  const restoreEnd = source.indexOf('/**\n * Logs out the active broker session.', restoreStart);
  const restoreBody = source.slice(restoreStart, restoreEnd);
  const manifestRead = restoreBody.indexOf('manifest = await readActiveBrokerSessionManifest()');
  const credentialRead = restoreBody.indexOf('credentials = await getStoredAuthSessionCredentials({');

  assert.ok(manifestRead >= 0);
  assert.ok(credentialRead > manifestRead);
  assert.doesNotMatch(restoreBody, /!preferences\.isLoggedIn|!preferences\.accountDetails/);
  assert.doesNotMatch(restoreBody, /manifest\.brokerId !== expectedBrokerId/);
  assert.match(restoreBody, /const profile = resolveRestoredAccountProfile\(manifest\)/);
  assert.match(restoreBody, /await persistSessionPreferences\(\);[\s\S]*status: 'restored'/);
});

test('session transitions prune disposable caches without deleting user data keys', () => {
  assert.match(source, /const pruneDisposableSessionStorage = async/);
  assert.match(source, /await pruneObsoleteSessionCaches\(\)/);
  const commitBody = source.slice(
    source.indexOf('const commitBrokerSessionInternal'),
    source.indexOf('/** Commits credentials', source.indexOf('const commitBrokerSessionInternal')),
  );
  assert.match(commitBody, /const credentials = await persistBrokerSessionAuthority\(\{[\s\S]*pruneCaches: pruneDisposableSessionStorage/);
  assert.ok(commitBody.indexOf('await persistBrokerSessionAuthority') < commitBody.indexOf('activateBrokerSession('));
});

test('interactive session commits are authorized at queued coordinator execution time', () => {
  assert.match(source, /export const authorizeBrokerSessionCommit = \(\): BrokerSessionCommitAuthorization =>[\s\S]*getActiveBrokerSessionEpoch\(\)/);
  const commitStart = source.indexOf('export const commitBrokerSession =');
  const restoreStart = source.indexOf('export const restoreBrokerSession =', commitStart);
  const commitBody = source.slice(commitStart, restoreStart);

  assert.match(commitBody, /authorization: BrokerSessionCommitAuthorization/);
  assert.match(commitBody, /enqueueMutation\(\(\) => \{/);
  assert.match(commitBody, /consumeBrokerSessionCommitAuthorization\([\s\S]*authorization,[\s\S]*getActiveBrokerSessionEpoch\(\),[\s\S]*\)/);
  assert.ok(
    commitBody.indexOf('consumeBrokerSessionCommitAuthorization') < commitBody.indexOf('commitBrokerSessionInternal'),
    'authorization must be consumed before the queued session mutation starts',
  );
});

test('session coordinator commits and restores account-scoped environment state', () => {
  assert.match(
    source,
    /BrokerSessionAccountProfile = Readonly<\{[\s\S]*accountType: AccountEnvironment;[\s\S]*accountEnvironmentSource: AccountEnvironmentSource;/,
  );
  assert.match(
    source,
    /accountType: input\.account\.accountType,[\s\S]*accountEnvironmentSource: input\.account\.accountEnvironmentSource/,
  );
  assert.match(
    source,
    /const expectedAccountEnvironmentKey = buildAccountEnvironmentKey\([\s\S]*manifest\.brokerId,[\s\S]*manifest\.accountLogin,[\s\S]*\)/,
  );
  assert.match(
    source,
    /preferences\.accountEnvironmentKey === expectedAccountEnvironmentKey/,
  );
  assert.match(
    source,
    /accountType: preferenceEnvironmentMatches[\s\S]*preferences\.accountType[\s\S]*savedAccount\?\.accountType \?\? 'unknown'/,
  );
  assert.doesNotMatch(source, /isDemoAccount: input\.account|isDemoAccount: profile/);
});


test('interactive commit validates the selected broker without awaiting unrelated directory sources', () => {
  const commitBody = source.slice(source.indexOf('const commitBrokerSessionInternal'), source.indexOf('/** Commits credentials'));
  assert.match(commitBody, /await getBrokerDirectoryForBroker\(input\.session\.brokerId\)/);
  assert.match(commitBody, /row\.broker_id === input\.session\.brokerId && row\.market_api_url === input\.session\.apiBase/);
  assert.match(commitBody, /verified\.feedWsBase !== input\.session\.feedWsBase/);
  assert.match(commitBody, /verified\.configVersion !== input\.session\.configVersion/);
  assert.match(commitBody, /rawInput\.isCurrent && !rawInput\.isCurrent\(\)/);
  assert.ok(commitBody.indexOf('await getBrokerDirectoryForBroker') < commitBody.indexOf('activateBrokerSession('));
  assert.match(commitBody, /if \(rawInput\.verifiedContext\) \{\s*verified = validateLoginBrokerContext\(rawInput\.verifiedContext, input\.session\);\s*\} else \{\s*const directory = await getBrokerDirectoryForBroker/);
  const persisted = commitBody.indexOf('const persistedAt');
  assert.ok(commitBody.indexOf('validateLoginBrokerContext(rawInput.verifiedContext, input.session)', persisted) < commitBody.indexOf('activateBrokerSession('));
});


test('secure activation starts hydration while UI preference persistence does not block commit', () => {
  const commitBody = source.slice(source.indexOf('const commitBrokerSessionInternal'), source.indexOf('/** Commits credentials'));
  const notification = commitBody.indexOf('rawInput.onActivated?.(capture)');
  assert.ok(notification > commitBody.indexOf('await persistBrokerSessionAuthority('));
  assert.ok(notification > commitBody.indexOf('activateBrokerSession('));
  assert.ok(notification > commitBody.indexOf('useUserPreferences.getState().login('));
  const successfulCommit = commitBody.slice(0, commitBody.indexOf('return capture'));
  assert.ok(notification < successfulCommit.indexOf('void persistSessionPreferences()'));
  assert.doesNotMatch(successfulCommit, /await persistSessionPreferences\(\)/);
});

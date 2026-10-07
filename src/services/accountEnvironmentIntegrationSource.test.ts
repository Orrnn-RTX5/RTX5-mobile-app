import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const collectRuntimeTypeScript = (relativeRoot: string): string[] => {
  const absoluteRoot = resolve(process.cwd(), relativeRoot);
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        ['.ts', '.tsx'].includes(extname(entry.name))
        && !entry.name.endsWith('.test.ts')
        && !entry.name.endsWith('.test.tsx')
      ) {
        result.push(path);
      }
    }
  };
  visit(absoluteRoot);
  return result;
};

test('normal and proxy login share the resolver and hydrate after persisting the scoped seed', () => {
  const login = readSource('app/login.tsx');
  const normalizedAuth = readSource('src/api/authSession.ts');

  assert.match(login, /resolveAccountEnvironment\(response, true\)/);
  assert.match(login, /source: accountEnvironmentEvidence\.source/);
  assert.match(login, /allowInitialFallback: true/);
  assert.match(login, /readRawAccountGroup\(response\)/);
  assert.match(
    login,
    /upsertSavedAccount\(\{[\s\S]*accountEnvironmentSource,[\s\S]*\}\);[\s\S]*const bootstrapPromise = bootstrapApp\(\{/,
  );
  assert.match(login, /expectedProvenance: committedProvenance/);
  // Contract v3: name/server enrichment never rewrites the account type; the
  // type comes only from /account/{login} group via the environment refresh.
  assert.match(login, /enrichSignedInAccountProfile\(\{[\s\S]*accountDetail: bootstrapPromise/);

  assert.match(normalizedAuth, /resolveAccountEnvironment\(response, true\)/);
  assert.match(
    normalizedAuth,
    /accountEnvironmentSource: accountEnvironmentEvidence\.source/,
  );
  assert.match(normalizedAuth, /readRawAccountGroup\(response\)/);
});

test('Demo registration preserves exact backend group casing and seeds canonical Demo', () => {
  const register = readSource('app/register.tsx');

  assert.match(register, /group: selectedDemoGroup\.name/);
  assert.match(register, /const createdAccountGroup = response\.group/);
  assert.doesNotMatch(register, /response\.Group/);
  assert.match(
    register,
    /resolved: 'demo',[\s\S]*source: demoRegistrationSource,[\s\S]*allowInitialFallback: true/,
  );
  assert.match(register, /const demoRegistrationSource: AccountEnvironmentSource = 'demo-registration'/);
  assert.match(
    register,
    /if \(authenticatedAccountLogin !== createdAccountLogin\) \{[\s\S]*Demo account login did not match/,
  );
  assert.match(
    register,
    /accountType: initialAccountEnvironment\.accountType,[\s\S]*accountEnvironmentSource: initialAccountEnvironment\.accountEnvironmentSource/,
  );
  assert.match(register, /rawGroup: createdAccountGroup/);
  assert.doesNotMatch(register, /group:\s*['"](?:orrnn\/demo-std|demo\\\\RTX5-Demo)['"]/);
});

test('account hydration classifies raw payloads once and layout reuses bootstrap', () => {
  const accountsApi = readSource('src/api/accounts.ts');
  const session = readSource('src/services/accountEnvironmentSession.ts');
  const layout = readSource('app/_layout.tsx');
  const bootstrap = readSource('src/services/bootstrapApp.ts');

  assert.match(accountsApi, /fetchAccountSnapshotResponse\(login\)/);
  assert.match(accountsApi, /commitApiJson\(response, response.cacheNamespace/);
  assert.match(accountsApi, /raw: typedRaw,[\s\S]*account: mapRawAccount\(typedRaw, previous\)/);
  assert.match(session, /await getAccountByIdResult\(provenance\.identity\.accountLogin\)/);
  assert.match(session, /commitActiveAccountEnvironmentPayload\(raw, provenance, refreshToken\)/);
  assert.match(session, /resolveAccountEnvironment\(record, true\)/);
  assert.match(session, /readRawAccountLogin\(record\)/);
  assert.match(session, /accountEnvironmentRefreshOrder\.isCurrent\(/);
  assert.match(session, /isActiveBrokerSessionProvenanceCurrent\(expectedProvenance\)/);
  assert.match(layout, /const mt5Login = capture\.session\.accountLogin/);
  assert.match(layout, /bootstrapApp\(\{\s*accountLogin: mt5Login,\s*expectedProvenance: getActiveBrokerSessionProvenance\(capture\.session\)/);
  assert.match(layout, /if \(!accountLogin \|\| !isActiveBrokerSessionCurrent\(identity\)\) return/);
  assert.doesNotMatch(layout, /getAccountByIdResult|prefetchAccountSummary|refreshPositions\(mt5Login\)/);
  assert.match(
    bootstrap,
    /requestJson\(buildAccountDetailPath\(accountLogin\), \(\) => fetchAccountSnapshotResponse\(accountLogin\)\)[\s\S]*commitActiveAccountEnvironmentPayload/,
  );
  assert.match(
    bootstrap,
    /const snapshots = mapBootstrapAccountRow\([\s\S]*setQueryData<TradingAccount>\(detailKey, snapshots.detail\)/,
  );
});

test('account switch initializes only from the selected account and refreshes under new provenance', () => {
  const accounts = readSource('src/features/settings/AccountsScreen.tsx');

  assert.match(accounts, /const normalizeSwitchLogin = \(login: string\) => login\.trim\(\)/);
  assert.doesNotMatch(accounts, /const normalizeSwitchLogin[\s\S]{0,120}Number\(/);
  assert.match(
    accounts,
    /const previousSwitchedEnvironment[\s\S]*row\.accountType !== 'unknown'[\s\S]*accountKey: switchedAccountKey/,
  );
  assert.match(
    accounts,
    /resolved: result\.accountType,[\s\S]*source: result\.accountEnvironmentSource,[\s\S]*allowInitialFallback: true/,
  );
  assert.match(
    accounts,
    /accountType: switchedAccountEnvironment\.accountType,[\s\S]*accountEnvironmentSource: switchedAccountEnvironment\.accountEnvironmentSource/,
  );
  assert.match(
    accounts,
    /bootstrapApp\(\{[\s\S]*accountLogin: result\.accountLogin,[\s\S]*expectedProvenance: committedProvenance/,
  );
});

test('logout and failed secure restore clear canonical and derived classification together', () => {
  const store = readSource('src/state/userPreferences/store.ts');
  const authPersistence = readSource('src/state/userPreferences/authPersistence.ts');

  assert.match(
    store,
    /logout: \(\) => \{[\s\S]*accountType: 'unknown',[\s\S]*accountEnvironmentSource: 'unknown',[\s\S]*accountEnvironmentKey: '',[\s\S]*isDemoAccount: false/,
  );
  assert.match(
    authPersistence,
    /state\.accountType = 'unknown';[\s\S]*state\.accountEnvironmentSource = 'unknown';[\s\S]*state\.accountEnvironmentKey = '';[\s\S]*state\.isDemoAccount = false/,
  );
});

test('saved-account persistence delegates environment reconciliation to the domain reducer', () => {
  const savedAccounts = readSource('src/state/savedAccounts.ts');

  assert.match(savedAccounts, /mergeAccountEnvironment\(previousEnvironment, \{/);
  assert.match(savedAccounts, /resolved: account\.accountType/);
  assert.match(savedAccounts, /source: account\.accountEnvironmentSource/);
  assert.doesNotMatch(savedAccounts, /shouldPreserveExistingEnvironment/);
});

test('repository has no runtime duplicate binary Demo classifier or independent Demo setter', () => {
  const runtimeFiles = [
    ...collectRuntimeTypeScript('app'),
    ...collectRuntimeTypeScript('src'),
  ];
  const violations: string[] = [];

  for (const path of runtimeFiles) {
    const source = readFileSync(path, 'utf8');
    if (/setIsDemoAccount\s*\(/.test(source)) {
      violations.push(`${path}: independent Demo setter`);
    }
    if (
      /includes\(\s*['"]demo['"]\s*\)\s*\?\s*['"]demo['"]\s*:\s*['"]real['"]/.test(source)
      || /includes\(\s*['"]demo['"]\s*\)\s*\?\s*true\s*:\s*false/.test(source)
    ) {
      violations.push(`${path}: group-only binary classifier`);
    }
  }

  assert.deepEqual(violations, []);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mapRawAccount } from '../../../api/accountsMapper';
import { resolveSavedAccountEnvironmentForDisplay, resolveSettingsAccountEnvironment, SETTINGS_ACCOUNT_ENVIRONMENT_BADGES } from './accountEnvironmentBadge';

const rawAccount = { login: 1001, leverage: 100, balance: 10000, credit: 0, equity: 10000 };

test('unrecognized backend groups show Undefined instead of a cached Real, Demo or Contest', () => {
  for (const group of ['standard', 'VIP-2026', 'CUSTOM\\Premium', 'cent', 'micro']) {
    const account = mapRawAccount({ ...rawAccount, group });
    for (const accountType of ['real', 'demo', 'contest'] as const) {
      const environment = resolveSettingsAccountEnvironment(account, {
        accountType,
        source: 'backend-group',
      });
      assert.equal(environment, 'unknown', group);
      assert.equal(SETTINGS_ACCOUNT_ENVIRONMENT_BADGES[environment].label, 'Undefined');
    }
  }
});

test('recognized backend types and groups still identify the Settings account', () => {
  const cases = [
    { payload: { group: 'DeMo\\STD' }, expected: 'demo' },
    { payload: { group: 'live/STD' }, expected: 'real' },
    { payload: { group: 'contest/STD' }, expected: 'contest' },
    { payload: { group: 'competition/STD' }, expected: 'contest' },
    { payload: { group: 'tournament/STD' }, expected: 'contest' },
    { payload: { group: 'VIP', account_type: 'real' }, expected: 'real' },
    { payload: { group: 'VIP', is_demo: true }, expected: 'demo' },
    { payload: { group: 'VIP', is_contest: true }, expected: 'contest' },
  ] as const;
  for (const { payload, expected } of cases) {
    const account = mapRawAccount({ ...rawAccount, ...payload });
    assert.equal(resolveSettingsAccountEnvironment(account, {
      accountType: 'unknown',
      source: 'unknown',
    }), expected);
  }
});

test('missing account details retain verified evidence but never a default Real guess', () => {
  for (const account of [undefined, mapRawAccount(rawAccount)]) {
    assert.equal(resolveSettingsAccountEnvironment(account, {
      accountType: 'demo', source: 'backend-group',
    }), 'demo');
    for (const source of ['unknown', 'initial-fallback', 'legacy-persisted'] as const) {
      assert.equal(resolveSettingsAccountEnvironment(account, {
        accountType: 'real', source,
      }), 'unknown');
    }
  }
});

test('saved account display reclassifies old group guesses without inheriting the active account type', () => {
  for (const accountType of ['demo', 'real', 'contest'] as const) {
    assert.equal(resolveSavedAccountEnvironmentForDisplay({
      accountType, accountEnvironmentSource: 'backend-group', rawGroup: 'VIP-2026',
    }), 'unknown');
    assert.equal(resolveSavedAccountEnvironmentForDisplay({
      accountType, accountEnvironmentSource: 'legacy-persisted', rawGroup: 'demo/STD',
    }), 'demo');
    assert.equal(resolveSavedAccountEnvironmentForDisplay({
      accountType, accountEnvironmentSource: 'backend-group', rawGroup: 'live/STD',
    }), 'real');
    assert.equal(resolveSavedAccountEnvironmentForDisplay({
      accountType, accountEnvironmentSource: 'backend-group', rawGroup: 'competition/STD',
    }), 'contest');
    assert.equal(resolveSavedAccountEnvironmentForDisplay({
      accountType, accountEnvironmentSource: 'backend-explicit', rawGroup: 'VIP-2026',
    }), accountType);
  }
});

test('saved accounts without identifying evidence show Undefined', () => {
  for (const source of ['initial-fallback', 'legacy-persisted', 'unknown'] as const) {
    const environment = resolveSavedAccountEnvironmentForDisplay({
      accountType: 'real', accountEnvironmentSource: source,
    });
    assert.equal(SETTINGS_ACCOUNT_ENVIRONMENT_BADGES[environment].label, 'Undefined');
  }
});

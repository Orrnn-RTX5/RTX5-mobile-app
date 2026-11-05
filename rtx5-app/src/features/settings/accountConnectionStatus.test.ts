import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { hasAuthenticatedAccountSession } from './accountConnectionStatus';

const authenticatedAccount = {
  id: '900001',
  name: 'Account 900001',
  server: 'Orrnn',
  credentials: {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: '2026-06-18T00:00:00.000Z',
  },
};

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('connected account status requires a completed authenticated session', () => {
  assert.equal(hasAuthenticatedAccountSession(true, authenticatedAccount), true);
  assert.equal(hasAuthenticatedAccountSession(false, authenticatedAccount), false);
  assert.equal(hasAuthenticatedAccountSession(true, null), false);
  assert.equal(
    hasAuthenticatedAccountSession(true, {
      ...authenticatedAccount,
      id: '',
    }),
    false,
  );
  assert.equal(
    hasAuthenticatedAccountSession(true, {
      ...authenticatedAccount,
      credentials: {
        ...authenticatedAccount.credentials,
        accessToken: '',
      },
    }),
    false,
  );
});

test('settings screens gate connected account UI behind authenticated session state', () => {
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');

  assert.match(settingsSource, /hasAuthenticatedAccountSession\(isLoggedIn, accountDetails\)/);
  assert.match(accountsSource, /hasAuthenticatedAccountSession\(isLoggedIn, accountDetails\)/);

  const settingsCardStart = settingsSource.indexOf('{isAccountConnected ? (');
  const settingsCardEnd = settingsSource.indexOf('<View style={styles.metricsRow}', settingsCardStart);
  const settingsCardBlock = settingsSource.slice(settingsCardStart, settingsCardEnd);

  assert.notEqual(settingsCardStart, -1);
  assert.match(settingsCardBlock, /latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsCardBlock, /styles\.accountCard/);
  assert.doesNotMatch(settingsCardBlock, /styles\.connectedPill|styles\.greenDot|styles\.accServerDot/);
  assert.doesNotMatch(settingsCardBlock, /accessibilityLabel=\{t\('Connected'\)\}/);
  assert.doesNotMatch(settingsCardBlock, /styles\.connectedText|<Text[^>]*>\{t\('Connected'\)\}<\/Text>/);
  assert.match(settingsCardBlock, /\) : null\}/);

  const accountsBadgeStart = accountsSource.indexOf('{hasConnectedAccount ? (');
  const accountsBadgeEnd = accountsSource.indexOf('</View>', accountsBadgeStart);
  const accountsBadgeBlock = accountsSource.slice(accountsBadgeStart, accountsBadgeEnd + '</View>'.length);

  assert.notEqual(accountsBadgeStart, -1);
  assert.match(accountsBadgeBlock, /styles\.connectedBadge/);
  assert.match(accountsBadgeBlock, /styles\.connectedDot/);
  assert.match(accountsBadgeBlock, /t\('Connected'\)/);
});

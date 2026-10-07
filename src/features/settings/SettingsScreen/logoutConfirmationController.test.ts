import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createLogoutConfirmationController } from './logoutConfirmationController';

test('guests cannot open logout and a confirmed dialog disappears before callbacks run', () => {
  const dialog = createLogoutConfirmationController();
  assert.equal(dialog.open(null), false);
  assert.equal(dialog.getSnapshot(), null);
  assert.equal(dialog.open('broker:account:session-1'), true);
  assert.equal(dialog.consume('broker:account:session-1'), true);
  assert.equal(dialog.getSnapshot(), null);
  assert.equal(dialog.consume('broker:account:session-1'), false, 'duplicate confirm cannot log out twice');
});

test('external logout closes the prompt and returning to Settings cannot reopen it', () => {
  const dialog = createLogoutConfirmationController();
  const changes: Array<string | null> = [];
  dialog.subscribe(() => changes.push(dialog.getSnapshot()));
  dialog.open('session-1');
  dialog.reconcileSession(null);
  dialog.reconcileSession('session-2');
  assert.equal(dialog.getSnapshot(), null);
  assert.equal(dialog.consume('session-2'), false);
  assert.deepEqual(changes, ['session-1', null]);
});

test('an old prompt cannot log out a replacement account or a new login of the same account', () => {
  for (const replacement of ['other-broker:account:2', 'broker:account:2']) {
    const dialog = createLogoutConfirmationController();
    dialog.open('broker:account:1');
    assert.equal(dialog.consume(replacement), false);
    assert.equal(dialog.getSnapshot(), null);
  }
});

test('cancel or losing focus consumes the old prompt without authorizing logout', () => {
  const dialog = createLogoutConfirmationController();
  dialog.open('session-1');
  dialog.dismiss();
  assert.equal(dialog.consume('session-1'), false);
  dialog.open('session-1');
  dialog.reconcileSession('session-1');
  assert.equal(dialog.consume('session-1'), true, 'credential rotation retains the same session prompt');
});

test('Settings invalidates the session and opens Login without waiting for cleanup', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/settings/SettingsScreen/SettingsScreen.tsx'), 'utf8');
  const confirm = source.slice(source.indexOf('const confirmLogout ='), source.indexOf('const searchInputRef'));
  assert.ok(confirm.indexOf('logoutConfirmation.consume(') < confirm.indexOf('logoutBrokerSession()'));
  assert.ok(confirm.indexOf('logoutBrokerSession()') < confirm.indexOf("router.replace('/login')"));
  assert.ok(confirm.indexOf('logoutBrokerSession()') < confirm.indexOf("openAuthFlow(undefined, 'login', '/login')"));
  assert.ok(confirm.indexOf("openAuthFlow(undefined, 'login', '/login')") < confirm.indexOf("router.replace('/login')"));
  assert.ok(confirm.indexOf("router.replace('/login')") < confirm.indexOf('void cleanup'));
  assert.doesNotMatch(confirm, /await|replace\('\/\(tabs\)\/quotes'\)/);
  assert.match(source, /\{isAccountConnected \? <View style=\{styles\.logoutContainer\}/);
  assert.match(source, /visible=\{Boolean\(logoutConfirmationSession\) && isAccountConnected && isScreenFocused\}/);
});

test('old auth completions cannot clear a new login lock or log out another namespace', () => {
  const host = readFileSync(resolve(process.cwd(), 'src/features/auth/GuestFlowHost.tsx'), 'utf8');
  assert.match(host, /finally \{ if \(submitting\.current === attempt\) submitting\.current = null;/);
  assert.match(host, /captureActiveBrokerSession\(\)\?\.session\.cacheNamespace === capture\.session\.cacheNamespace\) await logoutBrokerSession/);
  const cleanup = host.slice(host.indexOf('useEffect(() => subscribeAuthFlow'), host.indexOf('useEffect(() => () =>'));
  assert.match(cleanup, /screen !== 'guest'\) return/);
  assert.match(cleanup, /setPassword\(''\); setConfirmation\(''\)/);
  assert.match(cleanup, /committedNamespace\.current = null/);
});

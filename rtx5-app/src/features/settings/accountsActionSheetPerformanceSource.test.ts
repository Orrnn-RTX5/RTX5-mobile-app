import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/settings/AccountsScreen.tsx'),
  'utf8',
);

test('Accounts options sheet is isolated from the heavy account screen', () => {
  const hostStart = source.indexOf('const AccountsActionSheetHost = React.memo');
  const screenStart = source.indexOf('export const AccountsScreenInner = React.memo');
  const screenBody = source.slice(screenStart);

  assert.notEqual(hostStart, -1);
  assert.notEqual(screenStart, -1);
  assert.match(
    source.slice(hostStart, screenStart),
    /scopedActionSheets\.settingsAccounts[\s\S]*hideAccountsActionSheet[\s\S]*<ActionSheet/,
  );
  assert.doesNotMatch(screenBody, /const actionSheet = useUIState/);
  assert.doesNotMatch(screenBody, /const hideAccountsActionSheet = useUIState/);
  assert.match(screenBody, /<AccountsActionSheetHost \/>/);
  assert.match(source, /entryMotion=\{actionSheet\?\.entryMotion\}/);
});

test('Accounts three-dot menu reuses a prepared MT5 slide config on touch start', () => {
  const configStart = source.indexOf('const accountsOptionsSheetConfig = React.useMemo');
  const openerStart = source.indexOf('const openOptions = React.useCallback', configStart);
  const triggerStart = source.indexOf('onPress={openOptions}', openerStart);
  const triggerEnd = source.indexOf('</FastPressable>', triggerStart);
  const configSource = source.slice(configStart, openerStart);
  const triggerSource = source.slice(triggerStart, triggerEnd);

  assert.notEqual(configStart, -1);
  assert.notEqual(openerStart, -1);
  assert.match(configSource, /presentation: 'mt5Plain'/);
  assert.match(configSource, /entryMotion: 'mt5Slide'/);
  assert.match(configSource, /runActionAfterClose: false/);
  assert.match(
    source.slice(openerStart, triggerStart),
    /runImmediateAction\('accounts\.optionsSheet\.open'[\s\S]*showAccountsActionSheet\(accountsOptionsSheetConfig\)/,
  );
  assert.match(triggerSource, /activateOnPressIn/);
  assert.match(triggerSource, /activateOnTouchStart/);
  assert.match(triggerSource, /unstable_pressDelay=\{0\}/);
});


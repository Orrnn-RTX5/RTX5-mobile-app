import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ONE_CLICK_DISABLE_MESSAGE,
  ONE_CLICK_DISABLE_TITLE,
  requestOneClickPreferenceChange,
  type OneClickDisableAlertButton,
} from './oneClickDisableConfirmation.ts';

const translate = (value: string) => value;

test('enabling One-Click Trading commits immediately without a warning', () => {
  const committed: boolean[] = [];
  let alertCount = 0;

  requestOneClickPreferenceChange({
    nextEnabled: true,
    translate,
    commit: (enabled) => committed.push(enabled),
    showAlert: () => { alertCount += 1; },
  });

  assert.deepEqual(committed, [true]);
  assert.equal(alertCount, 0);
});

test('disabling One-Click Trading waits for OK and Cancel leaves it enabled', () => {
  const committed: boolean[] = [];
  let capturedTitle = '';
  let capturedMessage = '';
  let capturedButtons: OneClickDisableAlertButton[] = [];

  requestOneClickPreferenceChange({
    nextEnabled: false,
    translate,
    commit: (enabled) => committed.push(enabled),
    showAlert: (title, message, buttons) => {
      capturedTitle = title;
      capturedMessage = message;
      capturedButtons = buttons;
    },
  });

  assert.equal(capturedTitle, ONE_CLICK_DISABLE_TITLE);
  assert.equal(capturedMessage, ONE_CLICK_DISABLE_MESSAGE);
  assert.deepEqual(capturedButtons.map(({ text, style }) => ({ text, style })), [
    { text: 'Cancel', style: 'cancel' },
    { text: 'OK', style: undefined },
  ]);
  assert.deepEqual(committed, []);

  capturedButtons[0]?.onPress?.();
  assert.deepEqual(committed, []);

  capturedButtons[1]?.onPress?.();
  assert.deepEqual(committed, [false]);
});

test('both One-Click preference switches use the guarded disable flow', () => {
  for (const path of [
    'src/features/settings/SettingsScreen/SettingsScreen.tsx',
    'src/features/trade/OneClickTermsScreen.tsx',
  ]) {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    assert.match(source, /requestOneClickPreferenceChange\(\{/);
    assert.match(source, /onValueChange=\{handleOneClickPreferenceChange\}/);
    assert.doesNotMatch(source, /onValueChange=\{setOneClickAccepted\}/);
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(__dirname, '../../..');

test('repository npm entry points start the actual mobile project with Expo Go', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(scripts.start, 'node ./rtx5-app/scripts/android/start-dev-client-usb.js --go --tunnel');
  assert.match(scripts.android, /rtx5-app\/scripts\/android\/start-dev-client-usb\.js --go --android/);
  assert.match(scripts['start:lan'], /--go --lan$/);
  assert.match(scripts['open:android'], /--go --reuse-only/);
});

test('Windows launcher supports Wi-Fi without forcing an attached Android device', () => {
  const batch = readFileSync(path.join(repositoryRoot, 'START.bat'), 'utf8');
  assert.ok(batch.includes('cd /d "%~dp0rtx5-app"'));
  assert.ok(batch.includes('node scripts\\android\\start-dev-client-usb.js --go %*'));
  assert.ok(batch.includes('node scripts\\android\\start-dev-client-usb.js --go --tunnel'));
  assert.doesNotMatch(batch, /expo start|c:\\Users/i);
});

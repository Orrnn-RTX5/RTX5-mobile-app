import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

const { getPlainExpoStartArgs } = require('../../scripts/android/plainExpoStart');
const { patchExpoCli } = require('../../scripts/patch-expo-start');
const projectRoot = path.resolve(__dirname, '../..');

test('plain npx expo start shows an Expo Go tunnel QR and preserves explicit hosts', () => {
  assert.deepEqual(getPlainExpoStartArgs(['start'], projectRoot, projectRoot), ['--go', '--tunnel']);
  assert.deepEqual(getPlainExpoStartArgs(['start', '--clear', '--port', '8082'], projectRoot, projectRoot),
    ['--go', '--tunnel', '--clear', '--port', '8082']);
  assert.deepEqual(getPlainExpoStartArgs(['start', '--tunnel'], projectRoot, projectRoot), ['--go', '--tunnel']);
  assert.deepEqual(getPlainExpoStartArgs(['start', '--lan'], projectRoot, projectRoot), ['--go', '--lan']);
  assert.deepEqual(getPlainExpoStartArgs(['start', '-p', '8082', '-m', 'localhost', '-a'], projectRoot, projectRoot),
    ['--go', '--port', '8082', '--host', 'localhost', '--android']);
});

test('explicit runtimes prevent recursive launches and preserve native development', () => {
  for (const flag of ['--go', '-g', '--dev-client', '-d', '--web', '-w', '--ios', '-i', '--help', '-h']) {
    assert.equal(getPlainExpoStartArgs(['start', flag], projectRoot, projectRoot), null);
  }
});

test('builds, exports, updates, other projects and positional paths never route to USB', () => {
  for (const command of ['export', 'prebuild', 'run:android', 'config']) {
    assert.equal(getPlainExpoStartArgs([command], projectRoot, projectRoot), null);
  }
  assert.equal(getPlainExpoStartArgs(['start'], path.dirname(projectRoot), projectRoot), null);
  assert.equal(getPlainExpoStartArgs(['start', '../another-project'], projectRoot, projectRoot), null);
});

test('CLI entry patch applies once and preserves its shebang and fallback', () => {
  const source = "#!/usr/bin/env node\nrequire('@expo/cli');\n";
  const patched = patchExpoCli(source);
  assert.ok(patched.startsWith('#!/usr/bin/env node\n'));
  assert.match(patched, /routePlainExpoStart\(rtx5ProjectRoot\)/);
  assert.ok(patched.includes("require('@expo/cli');"));
  assert.equal(patchExpoCli(patched), patched);
  assert.throws(() => patchExpoCli('unknown CLI shape'), /entry changed/);
});

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

const { getPlainExpoStartArgs, configureExpoGoStartEnvironment } = require('../../scripts/android/plainExpoStart');
const { patchExpoCli } = require('../../scripts/patch-expo-start');
const projectRoot = path.resolve(__dirname, '../..');

test('explicit Expo Go startup uses the SDK runtime without native fingerprint computation', () => {
  for (const flag of ['--go', '-g']) {
    const env: Record<string, string> = {};
    configureExpoGoStartEnvironment(['start', flag, '--tunnel'], projectRoot, projectRoot, env, '54.0.0');
    assert.equal(env.RTX5_FORCE_RUNTIME_VERSION, 'exposdk:54.0.0');
  }
  const overridden = { RTX5_FORCE_RUNTIME_VERSION: 'explicit-runtime' };
  configureExpoGoStartEnvironment(['start', '--go'], projectRoot, projectRoot, overridden, '54.0.0');
  assert.equal(overridden.RTX5_FORCE_RUNTIME_VERSION, 'explicit-runtime');
});

test('Expo Go startup override never affects builds, updates, native clients or other projects', () => {
  for (const args of [['export', '--go'], ['start', '--dev-client'], ['start', '--web'], ['prebuild'], ['start']]) {
    const env = {};
    configureExpoGoStartEnvironment(args, projectRoot, projectRoot, env, '54.0.0');
    assert.deepEqual(env, {});
  }
  const env = {};
  configureExpoGoStartEnvironment(['start', '--go'], path.dirname(projectRoot), projectRoot, env, '54.0.0');
  assert.deepEqual(env, {});
});

test('plain npx expo start shows an Expo Go LAN QR and preserves explicit hosts', () => {
  assert.deepEqual(getPlainExpoStartArgs(['start'], projectRoot, projectRoot), ['--go', '--lan']);
  assert.deepEqual(getPlainExpoStartArgs(['start', '--clear', '--port', '8082'], projectRoot, projectRoot),
    ['--go', '--lan', '--clear', '--port', '8082']);
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

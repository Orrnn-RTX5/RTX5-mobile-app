import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const { watchStartupQr } = require('../../scripts/android/terminalQr');

const manifest = (hostUri: string, runtimeVersion = 'exposdk:54.0.0') => ({
  runtimeVersion,
  extra: { expoClient: { hostUri, _internal: { projectRoot: process.cwd() } } },
});

test('fresh startup waits through unavailable/local addresses and prints the final tunnel QR once', async () => {
  let requests = 0;
  let prepared = false;
  const urls: string[] = [];
  const samples = [null, manifest('127.0.0.1:8081'), manifest('192.168.0.101:8081'),
    manifest('example.exp.direct', 'native-fingerprint'), manifest('example.exp.direct')];
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => { stop(); reject(new Error('QR never appeared')); }, 2000);
    const stop = watchStartupQr({ port: 8081, hostType: 'tunnel', useExpoGo: true,
      projectRoot: process.cwd(), sdkVersion: 'exposdk:54.0.0', intervalMs: 2,
      readManifest: async () => {
        const value = samples[requests++];
        if (!value) throw new Error('Metro is not ready');
        return value;
      },
      prepare: async () => { prepared = true; },
      print: (url: string) => {
        assert.equal(prepared, true, 'bundle must be prepared before presenting the QR');
        urls.push(url); clearTimeout(deadline); resolve();
      },
    });
  });
  assert.deepEqual(urls, ['exp://example.exp.direct']);
  assert.equal(requests, 5);
});

test('QR is present in redirected terminal output, where Expo suppresses its own QR', () => {
  const result = spawnSync(process.execPath, ['-e',
    "require('./scripts/android/terminalQr').printProjectQr('exp://example.exp.direct')"],
  { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Scan this QR in Expo Go/);
  assert.match(result.stdout, /[█▀▄]/);
  assert.match(result.stdout, /Project URL: exp:\/\/example\.exp\.direct/);
});

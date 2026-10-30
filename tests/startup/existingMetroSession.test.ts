import assert from 'node:assert/strict';
import test from 'node:test';

const { androidProjectIntent, reuseMetroSession, readMetroManifest } = require('../../scripts/android/existingMetroSession');

const lanManifest = (hostUri = '192.168.0.101:8081') => ({
  runtimeVersion: 'exposdk:54.0.0',
  extra: { expoClient: { hostUri, _internal: { projectRoot: process.cwd() } } },
});

test('a busy Metro manifest retries timeouts and still reuses the verified project', async () => {
  let requests = 0;
  let retries = 0;
  let url = '';
  const readManifest = (port: number) => readMetroManifest(port, {
    fetchManifest: async (address: string, options: { signal: AbortSignal }) => {
      assert.equal(address, 'http://127.0.0.1:8081/');
      assert.ok(options.signal);
      requests += 1;
      if (requests < 3) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return { ok: true, json: async () => lanManifest() };
    },
    onRetry: () => { retries += 1; },
  });
  assert.equal(await reuseMetroSession({
    port: 8081, useExpoGo: true, lan: true, projectRoot: process.cwd(),
    sdkVersion: 'exposdk:54.0.0', probe: async () => true, readManifest,
    onLanReuse: (value: string) => { url = value; },
  }), true);
  assert.equal(requests, 3);
  assert.equal(retries, 2);
  assert.equal(url, 'exp://192.168.0.101:8081');
});

test('persistent manifest timeouts report the Metro port and recovery command', async () => {
  let requests = 0;
  await assert.rejects(readMetroManifest(8082, {
    fetchManifest: async () => {
      requests += 1;
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    },
  }), /port 8082.*3 attempts.*Ctrl\+C.*npx expo start/);
  assert.equal(requests, 3);
});

test('manifest HTTP and JSON failures are reported without retrying unrelated errors', async () => {
  let requests = 0;
  await assert.rejects(readMetroManifest(8081, {
    fetchManifest: async () => { requests += 1; return { ok: false, status: 500 }; },
  }), /manifest \(500\)/);
  assert.equal(requests, 1);
  await assert.rejects(readMetroManifest(8081, {
    fetchManifest: async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid manifest'); } }),
  }), /invalid manifest/);
});

test('local manifest checks use the advertised LAN address instead of the loopback request host', async () => {
  const requests: string[] = [];
  const manifest = await readMetroManifest(8081, {
    fetchManifest: async (url: string, options: { redirect?: string }) => {
      requests.push(url);
      if (url.endsWith('/')) return { ok: true, json: async () => lanManifest('127.0.0.1:8081') };
      assert.equal(options.redirect, 'manual', 'never follow the Expo Go deep link');
      return { status: 307, headers: new Headers({ location: 'exp://192.168.0.101:8081' }) };
    },
  });
  assert.equal(manifest.extra.expoClient.hostUri, '192.168.0.101:8081');
  assert.equal(manifest.extra.expoClient._internal.projectRoot, process.cwd());
  assert.deepEqual(requests, ['http://127.0.0.1:8081/',
    'http://127.0.0.1:8081/_expo/link?platform=android&choice=expo-go']);
});

test('Wi-Fi reuses its Expo Go server without requiring ADB or USB forwarding', async () => {
  let url = '';
  assert.equal(await reuseMetroSession({
    port: 8081, useExpoGo: true, reverseSucceeded: false, lan: true,
    projectRoot: process.cwd(), sdkVersion: 'exposdk:54.0.0', lanHost: '192.168.0.101',
    probe: async () => true, readManifest: async () => lanManifest(),
    open: () => assert.fail('Wi-Fi must not require an Android USB intent'),
    onLanReuse: (value: string) => { url = value; },
  }), true);
  assert.equal(url, 'exp://192.168.0.101:8081');
});

test('Wi-Fi rejects stale localhost, wrong adapter, project and native runtime manifests', async () => {
  const options = { port: 8081, lan: true, projectRoot: process.cwd(),
    sdkVersion: 'exposdk:54.0.0', lanHost: '192.168.0.101', probe: async () => true };
  for (const host of ['127.0.0.1:8081', 'localhost:8081', '192.168.1.19:8081']) {
    await assert.rejects(reuseMetroSession({ ...options,
      readManifest: async () => lanManifest(host) }), /selected Wi-Fi address/);
  }
  await assert.rejects(reuseMetroSession({ ...options,
    readManifest: async () => ({ ...lanManifest(), runtimeVersion: 'native-fingerprint' }) }), /native runtime/);
  await assert.rejects(reuseMetroSession({ ...options,
    readManifest: async () => ({ extra: { expoClient: { _internal: { projectRoot: '/another-project' } } } }) }), /does not belong/);
});

test('disconnecting Wi-Fi cannot reuse a QR for its old address when Ethernet stays connected', async () => {
  const options = { port: 8081, lan: true, useExpoGo: true, projectRoot: process.cwd(),
    sdkVersion: 'exposdk:54.0.0', lanAddresses: ['192.168.1.19'], probe: async () => true };
  await assert.rejects(reuseMetroSession({ ...options,
    readManifest: async () => lanManifest('192.168.0.101:8081'),
    onLanReuse: () => assert.fail('must not print an unreachable QR'),
  }), /network address is no longer active/);
  let url = '';
  assert.equal(await reuseMetroSession({ ...options,
    readManifest: async () => lanManifest('192.168.1.19:8081'),
    onLanReuse: (value: string) => { url = value; },
  }), true);
  assert.equal(url, 'exp://192.168.1.19:8081');
});

test('tunnel startup reuses a tunnel without USB and rejects an existing LAN server', async () => {
  const options = { port: 8082, tunnel: true, useExpoGo: true, projectRoot: process.cwd(),
    sdkVersion: 'exposdk:54.0.0', probe: async () => true };
  let url = '';
  assert.equal(await reuseMetroSession({ ...options,
    readManifest: async () => lanManifest('example.exp.direct'),
    onLanReuse: (value: string) => { url = value; },
  }), true);
  assert.equal(url, 'exp://example.exp.direct');
  await assert.rejects(reuseMetroSession({ ...options,
    readManifest: async () => lanManifest() }), /not using a tunnel/);
});

test('reuses Metro and opens Expo Go at the forwarded USB address', async () => {
  let opened: string[] | null = null;
  assert.equal(await reuseMetroSession({
    port: 8082, useExpoGo: true, reverseSucceeded: true,
    probe: async (port: number) => { assert.equal(port, 8082); return true; },
    open: (args: string[]) => { opened = args; return { status: 0 }; },
  }), true);
  assert.deepEqual(opened, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
    '-d', 'exp://127.0.0.1:8082', '-p', 'host.exp.exponent']);
});

test('absent Metro never opens an old project URL', async () => {
  assert.equal(await reuseMetroSession({
    port: 8081, probe: async () => false,
    open: () => assert.fail('must not open an app without Metro'),
  }), false);
});

test('occupied/unresponsive ports and failed USB forwarding do not reuse an unsafe session', async () => {
  const open = () => assert.fail('must not open an unreachable project');
  await assert.rejects(reuseMetroSession({ port: 8081, open,
    probe: async () => { throw new Error('not Metro'); },
  }), /not Metro/);
  await assert.rejects(reuseMetroSession({ port: 8081, open,
    probe: async () => true, reverseSucceeded: false,
  }), /USB forwarding failed/);
});

test('Android intent failures are reported even when am exits with status zero', async () => {
  await assert.rejects(reuseMetroSession({ port: 8081,
    probe: async () => true, reverseSucceeded: true,
    open: () => ({ status: 0, stdout: 'Error: Activity not started, unable to resolve Intent' }),
  }), /unable to resolve Intent/);
});

test('development clients receive the encoded manifest URL and correct package', () => {
  const intent = androidProjectIntent(8081, false);
  assert.equal(intent[6], 'rtx5://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
  assert.equal(intent.at(-1), 'com.rtx5.app');
});

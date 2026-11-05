import assert from 'node:assert/strict';
import test from 'node:test';

const { createExpoStartOptions, selectConnectionOptions } = require('../../scripts/expoStartOptions');

test('Wi-Fi startup uses LAN without a connected USB device and avoids VPN/Ethernet addresses', () => {
  const interfaces = {
    Tailscale: [{ family: 'IPv4', internal: false, address: '169.254.83.107' }],
    Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.1.19' }],
    WiFi: [{ family: 'IPv4', internal: false, address: '192.168.0.101' }],
  };
  const options = selectConnectionOptions(createExpoStartOptions(['--go'], {}, '54.0.0'), false, interfaces);
  assert.equal(options.hostArg, '--lan');
  assert.equal(options.env.REACT_NATIVE_PACKAGER_HOSTNAME, '192.168.0.101');
  assert.equal(selectConnectionOptions(createExpoStartOptions(['--go'], {}, '54.0.0'), true, interfaces).hostArg, '--localhost');
});

test('explicit LAN, localhost, tunnel and hostname settings win over automatic detection', () => {
  for (const args of [['--lan'], ['--localhost'], ['--tunnel'], ['--host', 'lan'], ['--host=tunnel']]) {
    const options = selectConnectionOptions(createExpoStartOptions(['--go', ...args],
      { REACT_NATIVE_PACKAGER_HOSTNAME: '192.168.1.20' }, '54.0.0'), true, {});
    assert.equal(options.hostArg, null);
    assert.equal(options.env.REACT_NATIVE_PACKAGER_HOSTNAME, '192.168.1.20');
  }
});

test('Expo Go starts with an SDK runtime and offline local metadata', () => {
  const options = createExpoStartOptions(['--go'], {}, '54.0.0');
  assert.equal(options.env.RTX5_FORCE_RUNTIME_VERSION, 'exposdk:54.0.0');
  assert.equal(options.env.EXPO_OFFLINE, '1');
  assert.equal(options.port, 8081);
  assert.deepEqual(options.args, ['start', '--go']);
});

test('native development clients retain the native fingerprint configuration', () => {
  const options = createExpoStartOptions(['--dev-client'], {}, '54.0.0');
  assert.equal(options.env.RTX5_FORCE_RUNTIME_VERSION, undefined);
  assert.equal(options.env.EXPO_OFFLINE, undefined);
  assert.deepEqual(options.args, ['start', '--dev-client']);
});

test('explicit runtime and network settings are preserved without mutating the input', () => {
  const env = { RTX5_FORCE_RUNTIME_VERSION: 'custom-dev-runtime', EXPO_OFFLINE: '0' };
  const options = createExpoStartOptions(['--go'], env, '54.0.0');
  assert.deepEqual(options.env, env);
  assert.notEqual(options.env, env);
});

test('tunnels can use online services, while offline USB can select localhost', () => {
  assert.equal(createExpoStartOptions(['--go', '--tunnel'], {}, '54.0.0').env.EXPO_OFFLINE, '0');
  assert.equal(createExpoStartOptions(['--go', '--host', 'tunnel'], {}, '54.0.0').env.EXPO_OFFLINE, '0');
  assert.equal(createExpoStartOptions(['--go', '--host=tunnel'], {}, '54.0.0').env.EXPO_OFFLINE, '0');
  const local = createExpoStartOptions(['--go', '--localhost', '--offline'], {}, '54.0.0');
  assert.equal(local.env.EXPO_OFFLINE, '1');
  assert.equal(local.hasExplicitHost, true);
  assert.deepEqual(local.args, ['start', '--go', '--localhost']);
  assert.throws(() => createExpoStartOptions(['--go', '--offline', '--tunnel'], {}, '54.0.0'));
});

test('ADB uses the chosen Metro port and invalid startup arguments are rejected', () => {
  assert.equal(createExpoStartOptions(['--go', '--port', '8082'], {}, '54.0.0').port, 8082);
  assert.equal(createExpoStartOptions(['--go', '--port=8082'], {}, '54.0.0').port, 8082);
  assert.equal(createExpoStartOptions(['--go'], { RCT_METRO_PORT: '8083' }, '54.0.0').port, 8083);
  assert.throws(() => createExpoStartOptions(['--go', '--port', 'not-a-port'], {}, '54.0.0'));
  assert.throws(() => createExpoStartOptions(['--go', '--port', '0'], {}, '54.0.0'));
  assert.throws(() => createExpoStartOptions(['--go', '--dev-client'], {}, '54.0.0'));
});

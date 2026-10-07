import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActiveBrokerSessionManifest,
  parseActiveBrokerSessionManifest,
} from './activeBrokerSessionStorage';

const validInput = {
  brokerId: 'Broker-A',
  accountLogin: '10001',
  apiBase: 'https://services.broker-a.example/api/v2',
  feedWsBase: 'wss://services.broker-a.example/ws/feed',
  tradeWsBase: 'wss://services.broker-a.example/ws/v2',
  feedStatusUrl: 'https://services.broker-a.example/ws/feed/status',
  servicesDomain: 'services.broker-a.example',
  configVersion: 'cfg-1',
};

test('manifest contains routing identity but no credential values', () => {
  const manifest = createActiveBrokerSessionManifest(validInput);
  const serialized = JSON.stringify(manifest);

  assert.equal(manifest.brokerId, 'Broker-A');
  assert.equal(manifest.accountLogin, '10001');
  assert.equal(manifest.version, 2);
  assert.equal(manifest.servicesDomain, 'services.broker-a.example');
  assert.doesNotMatch(serialized, /accessToken|refreshToken|feedToken|feedAuthContext/i);
});

test('manifest never stores feed auth, even when a caller still passes it', () => {
  const manifest = createActiveBrokerSessionManifest({
    ...validInput,
    feedAuthContext: {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token',
      brokerIdQueryParam: 'broker_id',
    },
  } as typeof validInput);
  assert.equal('feedAuthContext' in manifest, false);
});

test('manifest parser rejects legacy/incomplete versions', () => {
  assert.equal(parseActiveBrokerSessionManifest('{"version":1}'), null);
  assert.equal(parseActiveBrokerSessionManifest('{"version":2}'), null);
});

test('pre-v3 manifests with persisted feed auth still restore and drop the field', () => {
  const manifest = createActiveBrokerSessionManifest(validInput);
  for (const legacyFeedAuthContext of [
    { mode: 'query', credential: 'feed_token', tokenQueryParam: 'token', brokerIdQueryParam: 'broker_id' },
    { mode: 'query', credential: 'feed_token', tokenQueryParam: 'token&broker_id' },
    { mode: 'disabled_unconfigured', reason: 'missing_credential' },
    'garbage',
  ]) {
    const restored = parseActiveBrokerSessionManifest(JSON.stringify({
      ...manifest,
      feedAuthContext: legacyFeedAuthContext,
    }));
    assert.deepEqual(restored, manifest);
  }
});

test('manifest parser revalidates every exact endpoint against persisted services domain', () => {
  const manifest = createActiveBrokerSessionManifest(validInput);
  assert.equal(parseActiveBrokerSessionManifest(JSON.stringify({
    ...manifest,
    feedWsBase: 'wss://feed.attacker.example/ws/feed',
  })), null);
  assert.equal(parseActiveBrokerSessionManifest(JSON.stringify({
    ...manifest,
    configVersion: '',
  })), null);
});

test('manifest round trip preserves the exact endpoint set', () => {
  const manifest = createActiveBrokerSessionManifest(validInput);
  assert.deepEqual(
    parseActiveBrokerSessionManifest(JSON.stringify(manifest)),
    manifest,
  );
});


import assert from 'node:assert/strict';
import test from 'node:test';
import { createActiveBrokerSessionManifest, parseActiveBrokerSessionManifest } from '../state/activeBrokerSessionStorage';
import { AUTH_CREDENTIAL_BUNDLE_KEY, SecureCredentialBundleStore } from '../state/secureCredentialBundle';
import { resolveBrokerSessionRestoreWrites } from './brokerSessionRestorePlan';

const input = {
  brokerId: 'Broker-A', accountLogin: '10001',
  apiBase: 'https://services.broker-a.example/api/v2',
  feedWsBase: 'wss://services.broker-a.example/ws/feed',
  tradeWsBase: 'wss://services.broker-a.example/ws/v2',
  feedStatusUrl: 'https://services.broker-a.example/ws/feed/status',
  servicesDomain: 'services.broker-a.example', configVersion: 'cfg-1',
};
const bundle = { version: 1, brokerId: 'Broker-A', accountLogin: '10001', accessToken: 'access', refreshToken: '', expiresAt: '' };
async function readBundle(extra: Record<string, unknown> = {}) {
  const store = new SecureCredentialBundleStore({
    getItem: async key => key === AUTH_CREDENTIAL_BUNDLE_KEY ? JSON.stringify({ ...bundle, ...extra }) : null,
    setItem: async () => assert.fail('reading current credentials must not write storage'),
    removeItem: async () => assert.fail('reading current credentials must not delete storage'),
  });
  return (await store.get())!;
}

test('current exact records restore without redundant credential or manifest writes', async () => {
  const next = createActiveBrokerSessionManifest(input);
  const manifest = parseActiveBrokerSessionManifest(JSON.stringify(next))!;
  const credentials = await readBundle();
  assert.deepEqual(resolveBrokerSessionRestoreWrites(manifest, credentials, next), { rewriteCredentials: false, rewriteManifest: false });
});

test('legacy fields and noncanonical values still require secure rewrite', async () => {
  const next = createActiveBrokerSessionManifest(input);
  const manifest = parseActiveBrokerSessionManifest(JSON.stringify({ ...next, feedAuthContext: { token: 'old' } }))!;
  const credentials = await readBundle({ feedToken: 'old' });
  assert.deepEqual(resolveBrokerSessionRestoreWrites(manifest, credentials, next), { rewriteCredentials: true, rewriteManifest: true });
  const normalizedCredentials = await readBundle({ refreshToken: '   ' });
  assert.equal(resolveBrokerSessionRestoreWrites(manifest, normalizedCredentials, next).rewriteCredentials, true);
});

test('directory configuration and exact-ID migrations rewrite only affected authority records', async () => {
  const manifest = parseActiveBrokerSessionManifest(JSON.stringify(createActiveBrokerSessionManifest(input)))!;
  const credentials = await readBundle();
  const newConfiguration = createActiveBrokerSessionManifest({ ...input, configVersion: 'cfg-2' });
  assert.deepEqual(resolveBrokerSessionRestoreWrites(manifest, credentials, newConfiguration), { rewriteCredentials: false, rewriteManifest: true });
  const newIdentity = createActiveBrokerSessionManifest({ ...input, brokerId: 'broker-a' });
  assert.deepEqual(resolveBrokerSessionRestoreWrites(manifest, credentials, newIdentity), { rewriteCredentials: true, rewriteManifest: true });
  assert.deepEqual(resolveBrokerSessionRestoreWrites(manifest, { ...credentials }, newConfiguration), { rewriteCredentials: true, rewriteManifest: true }, 'cloned values have no secure-read canonicality proof');
});

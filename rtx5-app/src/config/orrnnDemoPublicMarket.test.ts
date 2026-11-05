import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBrokerConnectionWithPublicDemoDefault, ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE, ORRNN_DEMO_PUBLIC_BROKER_ID } from './orrnnDemoPublicMarket';
import { setPublicBrokerContext, createPublicBrokerContext } from '../state/publicBrokerContext';
import { publicBrokerFixture } from '../testFixtures/publicBroker';
test('fresh install and legacy synthetic guest identities require broker selection', () => {
  assert.deepEqual(resolveBrokerConnectionWithPublicDemoDefault({ brokerId: '', serverUrl: '', isLoggedIn: false }), { brokerId: '', serverUrl: '' });
  assert.deepEqual(resolveBrokerConnectionWithPublicDemoDefault({ brokerId: 'orrnn-demo', serverUrl: 'https://service.orrnn.com', isLoggedIn: false }), { brokerId: '', serverUrl: '' });
});
test('verified context preserves exact ID, configured origins and fallback identity', () => {
  const context = setPublicBrokerContext(publicBrokerFixture('Nexa'))!;
  assert.equal(context.brokerId, 'Nexa'); assert.equal(ORRNN_DEMO_PUBLIC_BROKER_ID, 'Nexa');
  assert.equal(context.extendedApiBase, context.apiBase); assert.equal(context.feedBrokerId, 'Nexa');
  assert.equal(context.protocolMode, 'gateway-v2'); assert.equal(Object.isFrozen(context), true);
  const firstNamespace = ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE;
  setPublicBrokerContext(publicBrokerFixture('Other')); assert.notEqual(ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE, firstNamespace);
  setPublicBrokerContext(null);
});
test('insecure, opaque and unverified bridge routing fails closed', () => {
  assert.throws(() => createPublicBrokerContext(publicBrokerFixture('Nexa', { extended_api_url: 'http://example.com' })));
  assert.throws(() => createPublicBrokerContext(publicBrokerFixture('Nexa', { protocol_mode: 'bridge' })));
  assert.throws(() => createPublicBrokerContext(publicBrokerFixture('Nexa', { enabled: false })));
});


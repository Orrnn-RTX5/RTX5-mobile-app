import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrokerServerHealth } from './broker';
import { confirmBrokerSignInAvailability } from './brokerSignInAvailability';
import { probeSelectedBrokerHealth } from '../features/settings/BrokersScreen/selectedBrokerHealthGate';

const root = 'https://trivanta.orrnn.com';
const degraded = () => Response.json({
  status: 'degraded', reasons: ['accounts_fenced: engine_owned_unserved=8, router_quarantined=9'],
}, { status: 503 });
const activeConfig = { broker_id: 'trivanta-markets', status: 'active', registration_enabled: false };

test('healthy broker health does not require another request', async () => {
  assert.equal(await confirmBrokerSignInAvailability(root, Response.json({ status: 'ok' }), async () => {
    assert.fail('healthy broker must not pay for a second availability request');
  }), true);
});

test('Trivanta account fencing does not hide an active, reachable broker from sign-in', async () => {
  for (const serverUrl of [root, `${root}/api/v2`]) {
    const requests: string[] = [];
    assert.equal(await confirmBrokerSignInAvailability(serverUrl, degraded(), async url => {
      requests.push(url);
      return Response.json(activeConfig);
    }), true);
    assert.deepEqual(requests, [`${root}/api/v2/broker/config`]);
  }
});

test('a degraded broker must still have a successful active configuration', async () => {
  for (const config of [
    {}, { ...activeConfig, status: 'inactive' }, { ...activeConfig, broker_id: '' },
    { ...activeConfig, enabled: false }, { ...activeConfig, active: false },
    { ...activeConfig, license_active: false },
  ]) {
    assert.equal(await confirmBrokerSignInAvailability(root, degraded(), async () => Response.json(config)), false);
  }
  assert.equal(await confirmBrokerSignInAvailability(root, degraded(), async () => Response.json(activeConfig, { status: 503 })), false);
  assert.equal(await confirmBrokerSignInAvailability(root, degraded(), async () => { throw new Error('offline'); }), false);
});

test('unavailable, malformed and non-HTTPS health cannot gain availability through a fallback', async () => {
  for (const health of [
    Response.json({ status: 'down' }, { status: 503 }),
    Response.json({ status: 'degraded' }, { status: 500 }),
    new Response('<html>Bad gateway</html>', { status: 503 }),
  ]) {
    let configRequests = 0;
    assert.equal(await confirmBrokerSignInAvailability(root, health, async () => {
      configRequests++;
      return Response.json(activeConfig);
    }), false);
    assert.equal(configRequests, 0, 'only an explicit degraded response may request active configuration');
  }
  let configRequests = 0;
  assert.equal(await confirmBrokerSignInAvailability('http://trivanta.orrnn.com', degraded(), async () => {
    configRequests++;
    return Response.json(activeConfig);
  }), false);
  assert.equal(configRequests, 0, 'invalid routing must not issue a config request');
});

test('broker picker and login/saved-account health checks agree for the live degraded response', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requested: string[] = [];
  globalThis.fetch = (async input => {
    const url = String(input);
    requested.push(url);
    if (url === `${root}/health`) return degraded();
    assert.equal(url, `${root}/api/v2/broker/config`);
    return Response.json(activeConfig);
  }) as typeof fetch;
  assert.equal(await probeSelectedBrokerHealth(root), true);
  await assert.doesNotReject(checkBrokerServerHealth(root));
  assert.deepEqual(requested, [
    `${root}/health`, `${root}/api/v2/broker/config`,
    `${root}/health`, `${root}/api/v2/broker/config`,
  ]);
});

test('the degraded sign-in check works for other brokers without changing server authority', async () => {
  const server = 'https://another-broker.example.com';
  assert.equal(await confirmBrokerSignInAvailability(server, degraded(), async url => {
    assert.equal(url, `${server}/api/v2/broker/config`);
    return Response.json({ broker_id: 'another-broker', status: 'active' });
  }), true);
});

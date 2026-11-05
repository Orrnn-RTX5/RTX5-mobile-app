import assert from 'node:assert/strict';
import test from 'node:test';

// The directory base URL is read when brokerRouting loads, so set it first and
// import the modules dynamically inside the tests.
process.env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL = 'https://superadmin-prod.orrnn.com/api/v2';
process.env.EXPO_PUBLIC_ADDITIONAL_BROKER_DIRECTORY_BASE_URL =
  'https://nexa-terminal.orrnn.com/discovery-api/api/v2';
process.env.EXPO_PUBLIC_ADDITIONAL_BROKER_IDS = 'Nexa';

let originalFetch: typeof globalThis.fetch;

test.beforeEach(() => {
  originalFetch = globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('directory is requested from superadmin-prod /broker/servers without auth or X-Broker-ID', async () => {
  const { getBrokerDirectory } = await import('./broker');
  const requestedUrls: string[] = [];
  let requestHeaders = new Headers();
  globalThis.fetch = (async (input, init) => {
    requestedUrls.push(String(input));
    requestHeaders = new Headers(init?.headers);
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof globalThis.fetch;

  await getBrokerDirectory();

  assert.deepEqual(requestedUrls, [
    'https://superadmin-prod.orrnn.com/api/v2/broker/servers',
    'https://nexa-terminal.orrnn.com/discovery-api/api/v2/broker/servers',
  ]);
  assert.equal(requestHeaders.get('Authorization'), null);
  assert.equal(requestHeaders.get('X-Broker-ID'), null);
});

test('a non-JSON (HTML) directory response is a "broker list unavailable" error, not an empty list', async () => {
  const { getBrokerDirectory, BrokerDirectoryContractError, BROKER_LIST_UNAVAILABLE_MESSAGE } =
    await import('./broker');
  globalThis.fetch = (async () => new Response(
    '<!doctype html><html><body>superbackend</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )) as typeof globalThis.fetch;

  await assert.rejects(
    () => getBrokerDirectory(),
    (error: unknown) => {
      assert.ok(error instanceof BrokerDirectoryContractError);
      assert.equal(error.code, 'invalid_json');
      assert.equal(error.message, BROKER_LIST_UNAVAILABLE_MESSAGE);
      assert.match(error.message, /broker list unavailable/i);
      return true;
    },
  );
});

test('the contract v3 directory response yields exactly Trivanta and Orrnn', async () => {
  const { getBrokerServers } = await import('./broker');
  globalThis.fetch = (async () => new Response(JSON.stringify([
    {
      id: 3, broker_id: 'trivanta-markets', broker_name: 'Trivanta Markets', created_at: 1_789_633_122,
      protocol: 'https', server: 'trivanta.orrnn.com:443', server_ip: '<unchanged>', server_port: 443,
      server_url: 'https://trivanta.orrnn.com', market_api_url: 'https://trivanta.orrnn.com',
      services_domain: 'trivanta.orrnn.com', feed_wss_url: 'wss://trivanta.orrnn.com/ws/feed',
      feed_status_https_url: 'https://trivanta.orrnn.com/ws/feed/status',
    },
    {
      id: 4, broker_id: 'Orrnn', broker_name: 'ORRNN', created_at: 1_789_643_254,
      protocol: 'https', server: 'service.orrnn.com:443', server_ip: '<unchanged>', server_port: 443,
      server_url: 'https://service.orrnn.com', market_api_url: 'https://service.orrnn.com',
      services_domain: 'service.orrnn.com', feed_wss_url: 'wss://service.orrnn.com/ws/feed',
      feed_status_https_url: 'https://service.orrnn.com/ws/feed/status',
    },
  ]), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof globalThis.fetch;

  const servers = await getBrokerServers();
  assert.deepEqual(servers.map((server) => server.broker_id), ['trivanta-markets', 'Orrnn']);
});

test('the allowlisted additional directory contributes Nexa but excludes its local/test rows', async () => {
  const { getBrokerDirectory } = await import('./broker');
  globalThis.fetch = (async (input) => {
    const isAdditional = String(input).includes('nexa-terminal.orrnn.com');
    const rows = isAdditional
      ? [
          {
            id: 1, broker_id: 'local_demo_01', broker_name: 'Local Demo Broker 01', created_at: 1,
            protocol: 'https', server: 'demo01.local.test:443', server_ip: '192.0.2.101', server_port: 443,
            server_url: 'https://demo01.local.test', market_api_url: 'https://demo01.local.test',
            services_domain: 'demo01.local.test', feed_wss_url: 'wss://demo01.local.test/ws/feed',
            feed_status_https_url: 'https://demo01.local.test/ws/feed/status',
          },
          {
            id: 21, broker_id: 'Nexa', broker_name: 'Nexa', created_at: 2,
            protocol: 'https', server: 'nexa.orrnn.com:443', server_ip: '100.119.182.26', server_port: 443,
            server_url: 'https://nexa.orrnn.com', market_api_url: 'https://nexa.orrnn.com',
            services_domain: 'nexa.orrnn.com', feed_wss_url: 'wss://nexa.orrnn.com/ws/feed',
            feed_status_https_url: 'https://nexa.orrnn.com/ws/feed/status',
          },
          {
            id: 18, broker_id: 'TEST', broker_name: 'TEST', created_at: 3,
            protocol: 'https', server: 'fxtrustbrokerbackend.orrnn.com:443', server_ip: '51.195.188.172', server_port: 443,
            server_url: 'https://fxtrustbrokerbackend.orrnn.com',
            market_api_url: 'https://fxtrustbrokerbackend.orrnn.com',
            services_domain: 'fxtrustbrokerbackend.orrnn.com',
            feed_wss_url: 'wss://fxtrustbrokerbackend.orrnn.com/ws/feed',
            feed_status_https_url: 'https://fxtrustbrokerbackend.orrnn.com/ws/feed/status',
          },
        ]
      : [{
          id: 5, broker_id: 'achiever', broker_name: 'Achiever', created_at: 1,
          protocol: 'https', server: 'service.achiever.orrnn.com:443', server_ip: '66.23.232.22', server_port: 443,
          server_url: 'https://service.achiever.orrnn.com',
          market_api_url: 'https://service.achiever.orrnn.com',
          services_domain: 'service.achiever.orrnn.com',
          feed_wss_url: 'wss://service.achiever.orrnn.com/ws/feed',
          feed_status_https_url: 'https://service.achiever.orrnn.com/ws/feed/status',
        }];
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;

  const directory = await getBrokerDirectory();
  const servers = directory.selectableServers;
  assert.deepEqual(servers.map((server) => server.broker_id), ['achiever', 'Nexa']);
  const nexa = servers.find((server) => server.broker_id === 'Nexa');
  assert.equal(nexa?.server_url, 'https://nexa.orrnn.com');
  assert.equal(nexa?.trade_wss_url, 'wss://nexa.orrnn.com/ws/v2');
  assert.deepEqual(directory.reportedBrokers?.map(broker => broker.brokerId), ['achiever']);
  assert.deepEqual(directory.primarySelectableServers?.map(broker => broker.broker_id), ['achiever']);
});

test('sign-up availability follows /broker/config registration flags', async () => {
  const { resolveBrokerSignUpAvailability } = await import('./broker');
  const liveConfig = { registration_enabled: false, demo_registration_enabled: false };
  assert.equal(resolveBrokerSignUpAvailability(liveConfig), 'disabled');
  assert.equal(resolveBrokerSignUpAvailability(liveConfig, 'real'), 'disabled');
  assert.equal(resolveBrokerSignUpAvailability(liveConfig, 'demo'), 'disabled');
  assert.equal(
    resolveBrokerSignUpAvailability({ registration_enabled: true, demo_registration_enabled: false }),
    'enabled',
  );
  assert.equal(
    resolveBrokerSignUpAvailability({ registration_enabled: true, demo_registration_enabled: false }, 'demo'),
    'disabled',
  );
  assert.equal(resolveBrokerSignUpAvailability({}), 'unknown');
  assert.equal(resolveBrokerSignUpAvailability(null), 'unknown');
});

test('public broker config is read unauthenticated from {server_url}/api/v2/broker/config', async () => {
  const { getPublicBrokerConfig } = await import('./broker');
  let requestedUrl = '';
  let authorization: string | null = 'unset';
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify({
      broker_name: 'Trivanta Markets',
      server_name: 'RTX5-Live',
      registration_enabled: false,
      demo_registration_enabled: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof globalThis.fetch;

  const config = await getPublicBrokerConfig('https://trivanta.orrnn.com');
  assert.equal(requestedUrl, 'https://trivanta.orrnn.com/api/v2/broker/config');
  assert.equal(authorization, null);
  assert.equal(config.registration_enabled, false);
});

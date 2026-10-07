import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import type { CreateOrrnnDemoAccountRequest } from './publicDemo';

const TEST_PUBLIC_DEMO_API_BASE_URL = 'https://demo-api.example.com/api/v1';
let configuredPublicDemoModule: Promise<typeof import('./publicDemo')> | null = null;

const loadConfiguredPublicDemo = () => {
  process.env.EXPO_PUBLIC_DEMO_API_BASE_URL = TEST_PUBLIC_DEMO_API_BASE_URL;
  process.env.EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID = 'orrnn-demo';
  process.env.EXPO_PUBLIC_ORRNN_DEMO_INITIAL_BALANCE = '10000';
  process.env.EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER = 'orrnn-demo-mobile';
  configuredPublicDemoModule ??= import('./publicDemo');
  return configuredPublicDemoModule;
};

const demoRequest: CreateOrrnnDemoAccountRequest = {
  group: 'demo\\RTX5-Demo',
  email: 'trader@example.com',
  master_pass: 'Strong-Pass-123',
  first_name: 'Jane',
  last_name: 'Doe',
  initial_balance: 10000,
  origin_broker: 'orrnn-demo-mobile',
};

function mockFetch(t: { after: (fn: () => void) => void }, implementation: typeof fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('createOrrnnDemoAccount posts compact body to /api/v1/public/demo-account', async (t) => {
  const { createOrrnnDemoAccount, PUBLIC_DEMO_API_BASE_URL } = await loadConfiguredPublicDemo();
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};

  mockFetch(t, (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? '{}'));

    return new Response(
      JSON.stringify({
        login: 900000001,
        broker_id: 'orrnn-demo',
        group: 'orrnn-demo/demo-std',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch);

  const requestWithUncontractedFields = {
    ...demoRequest,
    phone: '+1-555-0100',
    // Runtime-only fields must not escape the explicit public creation DTO.
    tenant_id: 'must-not-be-sent',
    investor_pass: 'must-not-be-sent',
    country: 'US',
    currency: 'USD',
    leverage: 100,
  } as CreateOrrnnDemoAccountRequest;
  const response = await createOrrnnDemoAccount(requestWithUncontractedFields);

  assert.match(capturedUrl, /\/api\/v1\/public\/demo-account$/);
  assert.equal(capturedUrl, `${PUBLIC_DEMO_API_BASE_URL}/public/demo-account`);
  assert.equal(capturedBody.group, 'demo\\RTX5-Demo');
  assert.equal(capturedBody.email, 'trader@example.com');
  assert.equal(capturedBody.last_name, 'Doe');
  assert.equal(capturedBody.phone, '+1-555-0100');
  assert.equal(capturedBody.initial_balance, 10000);
  assert.equal(capturedBody.origin_broker, 'orrnn-demo-mobile');
  assert.deepEqual(Object.keys(capturedBody).sort(), [
    'email',
    'first_name',
    'group',
    'initial_balance',
    'last_name',
    'master_pass',
    'origin_broker',
    'phone',
  ]);
  assert.equal(response.login, 900000001);
  assert.equal(response.broker_id, 'orrnn-demo');
  assert.equal(response.group, 'orrnn-demo/demo-std');
});

test('demo broker identities are explicit environment contracts with fixed creation metadata', () => {
  const source = readSource('src/api/publicDemo.ts');
  const registerSource = readSource('app/register.tsx');
  const envCheckSource = readSource('scripts/ota/check-eas-env.js');

  assert.match(source, /export const ORRNN_DEMO_BROKER_ID = process\.env\.EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID \|\| ''/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER \|\| ''/);
  assert.match(source, /ORRNN_DEMO_CANONICAL_GROUP = 'orrnn-demo\/demo-std'/);
  assert.match(registerSource, /const trimmedOriginBroker = ORRNN_DEMO_ORIGIN_BROKER\.trim\(\)/);
  assert.match(registerSource, /origin_broker: trimmedOriginBroker/);
  assert.doesNotMatch(registerSource, /originBrokerPickerOpen|DEMO_ORIGIN_BROKER_OPTIONS/);
  for (const expected of [
    'https://demomanager.orrnn.com/api/v1',
    'orrnn-demo',
    '10000',
    'orrnn-demo-mobile',
  ]) {
    assert.match(envCheckSource, new RegExp(expected.replace(/[./-]/g, '\\$&')));
  }
});

test('resolveOrrnnDemoBrokerAuthRoute accepts the live-shaped orrnn-demo directory route', async () => {
  const { resolveOrrnnDemoBrokerAuthRoute } = await loadConfiguredPublicDemo();
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn-demo', [{
    directory_source: 'v2_raw',
    broker_id: 'orrnn-demo',
    broker_name: 'Orrnn Broker demo',
    enabled: true,
    active: true,
    config_version: 'v2:80:1784199260',
    server_url: 'https://demobackend.orrnn.com',
    feed_wss_url: 'wss://demobackend.orrnn.com/ws/feed',
    feed_status_https_url: 'https://demobackend.orrnn.com/ws/feed/status',
    server: 'demobackend.orrnn.com:443',
    server_ip: '69.197.178.27',
    logo_url: ' https://superbackend.orrnn.com/api/v1/brokers/orrnn-demo/logo ',
  }]);

  assert.equal(route.serverUrl, 'https://demobackend.orrnn.com/api/v2');
  assert.equal(route.logoUrl, 'https://superbackend.orrnn.com/api/v1/brokers/orrnn-demo/logo');
  assert.equal(route.source, 'broker-directory');
  assert.deepEqual(route.endpoints, {
    brokerId: 'orrnn-demo',
    apiBase: 'https://demobackend.orrnn.com/api/v2',
    feedWsBase: 'wss://demobackend.orrnn.com/ws/feed',
    feedStatusUrl: 'https://demobackend.orrnn.com/ws/feed/status',
    tradeWsBase: 'wss://demobackend.orrnn.com/ws/v2',
    servicesDomain: 'demobackend.orrnn.com',
    configVersion: 'v2:80:1784199260',
  });
});

test('resolveOrrnnDemoBrokerAuthRoute rejects non-exact broker identifiers', async () => {
  const { resolveOrrnnDemoBrokerAuthRoute } = await loadConfiguredPublicDemo();
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn-demo', [{
    id: 9,
    broker_id: 'ORRNN-DEMO',
    broker_name: 'Orrnn Broker demo',
    server_url: 'https://demobackend.orrnn.com',
    services_domain: 'demobackend.orrnn.com',
    server: 'demo-gateway',
    server_ip: '203.0.113.20',
    protocol: 'https',
  }]);

  assert.equal(route.source, 'missing');
  assert.equal(route.serverUrl, '');
});

test('resolveOrrnnDemoBrokerAuthRoute rejects opaque unapproved broker records', async () => {
  const { resolveOrrnnDemoBrokerAuthRoute } = await loadConfiguredPublicDemo();
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn-demo', [{
    broker_id: 'orrnn-demo',
    broker_name: 'Orrnn',
    server: 'Orrnn-Demo',
    server_ip: '69.197.178.27',
  }]);

  assert.equal(route.serverUrl, '');
  assert.equal(route.source, 'missing');
});

test('resolveOrrnnDemoBrokerAuthRoute requires a broker directory services domain for Orrnn login', async () => {
  const { resolveOrrnnDemoBrokerAuthRoute } = await loadConfiguredPublicDemo();
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn-demo', []);

  assert.equal(route.serverUrl, '');
  assert.equal(route.source, 'missing');
});

test('register preflights the approved route and uses numeric demo login through the atomic session coordinator', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /resolveOrrnnDemoBrokerAuthRoute\(ORRNN_DEMO_BROKER_ID, brokerServers\)/);
  assert.match(source, /demoAuthRoute\.source !== 'broker-directory'/);
  assert.match(source, /refetchBrokerServers\(\)/);
  assert.match(source, /const commitAuthorization = authorizeBrokerSessionCommit\(\)/);
  assert.match(source, /const isRegisterAttemptCancelled = \(\) =>/);
  assert.match(source, /if \(isRegisterAttemptCancelled\(\)\) return;/);
  assert.match(
    source,
    /loginAPI\(\{[\s\S]*login: response\.login,[\s\S]*broker_id: canonicalBrokerId,[\s\S]*\}, \{[\s\S]*serverUrl: demoAuthRoute\.serverUrl,[\s\S]*signal: loginAbortController\.signal,[\s\S]*\}\)/,
  );
  assert.doesNotMatch(source, /username: createdAccountLogin|response\.api_key/);
  assert.match(
    source,
    /await commitBrokerSession\(\{[\s\S]*brokerId: demoAuthRoute\.endpoints\.brokerId,[\s\S]*apiBase: demoAuthRoute\.endpoints\.apiBase,[\s\S]*feedWsBase: demoAuthRoute\.endpoints\.feedWsBase,[\s\S]*feedStatusUrl: demoAuthRoute\.endpoints\.feedStatusUrl,[\s\S]*servicesDomain: demoAuthRoute\.endpoints\.servicesDomain,[\s\S]*configVersion: demoAuthRoute\.endpoints\.configVersion/,
  );
  assert.match(
    source,
    /credentials: \{[\s\S]*accessToken: sessionToken,[\s\S]*refreshToken: sessionRefreshToken,[\s\S]*expiresAt: sessionExpiresAt/,
  );
  assert.match(source, /\}, commitAuthorization\)/);
  assert.match(source, /isStaleBrokerSessionCommitError\(error\)/);
  assert.match(source, /cancelBrokerSessionCommitAuthorization\(commitAuthorization\)/);
  assert.doesNotMatch(source, /persistSelectedBrokerSession|persistAuthSessionTokens/);
});

test('public demo status and groups use the dedicated public demo API base URL', async (t) => {
  const {
    PUBLIC_DEMO_API_BASE_URL,
    getOrrnnDemoGroups,
    getOrrnnDemoStatus,
    isOrrnnDemoHealthy,
  } = await loadConfiguredPublicDemo();
  const capturedUrls: string[] = [];

  mockFetch(t, (async (input) => {
    capturedUrls.push(String(input));
    const body = capturedUrls.length === 1
      ? {
        service: 'orrnn-demo',
        status: 'ok',
        broker: 'active',
        broker_id: 'orrnn-demo',
        demo_groups_available: 1,
        total_demo_accounts: 28,
        database: 'connected',
      }
      : {
        count: 1,
        groups: [{
          name: 'demo\\RTX5-Demo',
          description: 'RTX5 Demo',
          currency: 'USD',
          leverage: 100,
        }],
      };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch);

  const status = await getOrrnnDemoStatus();
  const groups = await getOrrnnDemoGroups();

  assert.deepEqual(capturedUrls, [
    `${PUBLIC_DEMO_API_BASE_URL}/public/demo-status`,
    `${PUBLIC_DEMO_API_BASE_URL}/public/demo-groups`,
  ]);
  assert.equal(isOrrnnDemoHealthy(status), true);
  assert.equal(groups.groups[0]?.name, 'demo\\RTX5-Demo');
  assert.equal(isOrrnnDemoHealthy({ ...status, broker_id: 'orrnn' }), false);
});

test('public demo setup failures use user-safe temporary unavailable copy', async (t) => {
  const {
    OrrnnDemoApiError,
    getOrrnnDemoGroups,
    getOrrnnDemoStatus,
  } = await loadConfiguredPublicDemo();
  const temporaryUnavailableCopy =
    'Demo account service is temporarily unavailable. Please try again in a moment.';
  let requestCount = 0;

  mockFetch(t, (async () => {
    requestCount += 1;
    return new Response('The origin web server returned an invalid response.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });
  }) as typeof fetch);

  const assertFriendlyGatewayError = (error: unknown) => {
    assert.ok(error instanceof OrrnnDemoApiError);
    assert.equal(error.statusCode, 502);
    assert.equal(error.message, temporaryUnavailableCopy);
    assert.doesNotMatch(error.message, /HTTP 502|origin web server/i);
    return true;
  };

  await assert.rejects(() => getOrrnnDemoStatus(), assertFriendlyGatewayError);
  await assert.rejects(() => getOrrnnDemoGroups(), assertFriendlyGatewayError);
  assert.equal(requestCount, 2);
});

test('createOrrnnDemoAccount omits blank optional strings from its allowlisted body', async (t) => {
  const { createOrrnnDemoAccount } = await loadConfiguredPublicDemo();
  let capturedBody: Record<string, unknown> = {};

  mockFetch(t, (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}'));

    return new Response(
      JSON.stringify({
        login: 900000002,
        broker_id: 'orrnn-demo',
        group: 'orrnn-demo/demo-std',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch);

  await createOrrnnDemoAccount({
    ...demoRequest,
    last_name: '   ',
    phone: '',
    comment: '',
  } as CreateOrrnnDemoAccountRequest);

  assert.equal(capturedBody.first_name, 'Jane');
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'last_name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'phone'), false);
  assert.equal(capturedBody.origin_broker, 'orrnn-demo-mobile');
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'comment'), false);
});

test('createOrrnnDemoAccount treats documented 201 ExceptionResult as an error', async (t) => {
  const { createOrrnnDemoAccount, OrrnnDemoApiError } = await loadConfiguredPublicDemo();
  mockFetch(t, (async () => new Response(
    JSON.stringify({
      code: 'MT_RET_ERR_PERMISSIONS',
      message: 'Only demo groups are accepted.',
    }),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    },
  )) as typeof fetch);

  await assert.rejects(
    () => createOrrnnDemoAccount(demoRequest),
    (error) => {
      assert.ok(error instanceof OrrnnDemoApiError);
      assert.equal(error.statusCode, 201);
      assert.match(error.message, /MT_RET_ERR_PERMISSIONS/);
      return true;
    },
  );
});

test('createOrrnnDemoAccount rejects missing or mismatched success identity fields', async (t) => {
  const { createOrrnnDemoAccount, OrrnnDemoApiError } = await loadConfiguredPublicDemo();
  let responseBody: Record<string, unknown> = {};
  mockFetch(t, (async () => new Response(
    JSON.stringify(responseBody),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )) as typeof fetch);

  const invalidResponses = [
    { login: '200107', broker_id: 'orrnn-demo', group: 'orrnn-demo/demo-std' },
    { login: 200107, broker_id: 'orrnn', group: 'orrnn-demo/demo-std' },
    { login: 200107, broker_id: 'orrnn-demo', group: 'demo\\RTX5-Demo' },
  ];

  for (const invalidResponse of invalidResponses) {
    responseBody = invalidResponse;
    await assert.rejects(
      () => createOrrnnDemoAccount(demoRequest),
      OrrnnDemoApiError,
    );
  }
});

test('createOrrnnDemoAccount surfaces duplicate-email conflict without retrying', async (t) => {
  const { createOrrnnDemoAccount, OrrnnDemoApiError } = await loadConfiguredPublicDemo();
  let requestCount = 0;
  mockFetch(t, (async () => {
    requestCount += 1;
    return new Response(
      JSON.stringify({ code: 'EMAIL_CONFLICT', message: 'A demo account already exists for this email.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch);

  await assert.rejects(
    () => createOrrnnDemoAccount(demoRequest),
    (error) => {
      assert.ok(error instanceof OrrnnDemoApiError);
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /EMAIL_CONFLICT/);
      return true;
    },
  );
  assert.equal(requestCount, 1);
});

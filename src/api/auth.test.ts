import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createBackendAuthError,
  extractBackendErrorCode,
  extractBackendErrorMessage,
  isLoginRequestAbortedError,
  loginAPI,
  type BackendAuthError,
} from './auth';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('loginAPI requires a broker service domain and does not use shared proxy fallback', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /isBrokerServiceBaseUrl\(options\.serverUrl\)/);
  assert.match(source, /getBrokerBackendDomainUnavailableMessage\(credentials\.broker_id\)/);
  assert.match(source, /const apiBaseUrl = buildBrokerApiBaseUrl\(options\.serverUrl\)/);
  assert.match(source, /loginRequestBody\(String\(credentials\.login\)/);
  assert.match(source, /JSON\.stringify\(credentials\)/);
  assert.doesNotMatch(source, /AUTH_PROXY_API_BASE_URL/);
  assert.doesNotMatch(source, /normalizeBrokerProxyServerAddress\(options\.proxyServer\)/);
  assert.doesNotMatch(source, /server: proxyServer/);
});

test('loginAPI sends numeric demo login to the exact demobackend V2 route', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
      account_login: 200107,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await loginAPI(
      { login: 200107, password: 'secret', broker_id: 'orrnn-demo' },
      { serverUrl: 'https://demobackend.orrnn.com' },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedUrl, 'https://demobackend.orrnn.com/api/v2/auth/login');
  assert.deepEqual(capturedBody, {
    login: 200107,
    password: 'secret',
    broker_id: 'orrnn-demo',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'username'), false);
});

test('active login routes use the root form and preserve numeric precision for every broker', () => {
  assert.match(readSource('app/login.tsx'), /return <AuthEntryScreen form="login"/);
  assert.match(readSource('app/settings/broker-detail.tsx'), /return <AuthEntryScreen form="login"/);
  assert.match(readSource('src/api/guestAuthentication.ts'), /BigInt\(value\)\.toString\(\)/);
});

test('loginAPI surfaces caller cancellation separately from its timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const rejectAbort = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (init?.signal?.aborted) {
        rejectAbort();
        return;
      }
      init?.signal?.addEventListener('abort', rejectAbort, { once: true });
    })) as typeof fetch;

  try {
    const controller = new AbortController();
    const request = loginAPI(
      { username: '1001', password: 'secret', broker_id: 'broker-a' },
      { serverUrl: 'https://services.broker-a.example/api/v2', signal: controller.signal },
    );
    controller.abort();

    await assert.rejects(request, isLoginRequestAbortedError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('gateway errors show the message and keep the {"error":"<CODE>"} code', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: 'INVALID_BROKER',
    message: "Broker 'TRIVANTA-MARKETS' not found",
  }), { status: 401, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    await assert.rejects(
      () => loginAPI(
        { username: '200074', password: 'secret', broker_id: 'TRIVANTA-MARKETS' },
        { serverUrl: 'https://trivanta.orrnn.com' },
      ),
      (error: unknown) => {
        const authError = error as BackendAuthError;
        assert.equal(authError.message, "Broker 'TRIVANTA-MARKETS' not found");
        assert.equal(authError.code, 'INVALID_BROKER');
        assert.equal(authError.statusCode, 401);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('backend error parsing prefers message, falls back to the code, keeps the code', () => {
  assert.equal(
    extractBackendErrorMessage({ error: 'RATE_LIMITED', message: 'Too many requests' }, 'x'),
    'Too many requests',
  );
  assert.equal(extractBackendErrorMessage({ error: 'UNAUTHORIZED' }, 'x'), 'UNAUTHORIZED');
  assert.equal(extractBackendErrorMessage({}, 'Login failed'), 'Login failed');
  assert.equal(extractBackendErrorCode({ error: 'ACCOUNT_DISABLED', message: 'm' }), 'ACCOUNT_DISABLED');
  assert.equal(extractBackendErrorCode({ error: 'Invalid credentials' }), undefined);
  const error = createBackendAuthError({ error: 'LICENSE_EXPIRED', message: 'License expired' }, 401, 'x');
  assert.equal(error.message, 'License expired');
  assert.equal(error.code, 'LICENSE_EXPIRED');
});

test('a non-JSON 200 login body fails with a readable message', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<html></html>', { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(
      () => loginAPI(
        { username: '200074', password: 'secret', broker_id: 'Orrnn' },
        { serverUrl: 'https://service.orrnn.com' },
      ),
      /invalid response/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('login screens send the exact directory broker_id and never resolve a feed token', () => {
  const loginScreen = readSource('app/login.tsx');
  const brokerDetail = readSource('src/features/settings/BrokerDetailScreen.tsx');

  for (const source of [loginScreen, brokerDetail]) {
    assert.match(source, /broker_id: selectedEndpoints\.brokerId,/);
    assert.match(source, /readLoginAccountLogin\(response,/);
    assert.match(source, /isSameBrokerId\(responseBrokerId, selectedEndpoints\.brokerId\)/);
    assert.match(source, /enrichSignedInAccountProfile\(\{/);
    assert.doesNotMatch(source, /feedToken|feed_token|feedAuthContext|resolveSessionFeedAuth/);
  }
  assert.doesNotMatch(readSource('src/api/auth.ts'), /X-Broker-ID/i);
});

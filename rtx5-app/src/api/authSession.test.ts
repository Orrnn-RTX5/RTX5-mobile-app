import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NO_TRADING_ACCOUNT_MESSAGE,
  SignInError,
  isSameBrokerId,
  readAccountDisplayName,
  readLoginAccountLogin,
  resolveLoginExpiresAtIso,
  resolveLoginServerName,
  signInWithCredentials,
} from './authSession';

/** Complete contract v3 login keys (no feed token, name, server or type). */
const contractV3LoginResponse = (overrides: Record<string, unknown> = {}) => ({
  access_token: 'jwt-access',
  refresh_token: 'rtx5_rt_1',
  token_type: 'Bearer',
  expires_in: 86_400,
  expires_at: 1_790_327_807,
  user_id: 42,
  username: 'trader42',
  role: 'trader',
  login_type: 'master',
  account_login: 200074,
  broker_id: 'Orrnn',
  ...overrides,
});

let originalFetch: typeof globalThis.fetch;
let lastBody: Record<string, unknown> = {};

const mockLogin = (body: unknown, status = 200) => {
  globalThis.fetch = (async (_input, init) => {
    lastBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
};

test.beforeEach(() => {
  originalFetch = globalThis.fetch;
  lastBody = {};
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('login succeeds without feed_token / feed_auth_context and returns no feed auth', async () => {
  mockLogin(contractV3LoginResponse());

  const result = await signInWithCredentials({
    username: '200074',
    password: 'secret',
    brokerId: 'Orrnn',
    brokerName: 'ORRNN',
    serverUrl: 'https://service.orrnn.com',
  });

  assert.equal(result.accessToken, 'jwt-access');
  assert.equal(result.refreshToken, 'rtx5_rt_1');
  assert.equal(result.accountLogin, '200074');
  assert.equal(result.expiresAtIso, new Date(1_790_327_807_000).toISOString());
  assert.equal('feedToken' in result, false);
  assert.equal('feedAuthContext' in result, false);
  assert.equal(result.investor, false);
  // server is not sent: the directory broker_name is the initial label.
  assert.equal(result.serverName, 'ORRNN');
  // account type is not sent: unknown until /account/{login} group arrives.
  assert.equal(result.accountType, 'unknown');
});

test('an investor login is flagged read-only', async () => {
  mockLogin(contractV3LoginResponse({ login_type: 'investor' }));

  const result = await signInWithCredentials({
    username: '200074',
    password: 'investor-secret',
    brokerId: 'Orrnn',
    serverUrl: 'https://service.orrnn.com',
  });

  assert.equal(result.investor, true);
});

test('broker_id is sent with its exact directory case and the response must match exactly', async () => {
  mockLogin(contractV3LoginResponse({ broker_id: 'Orrnn' }));

  const result = await signInWithCredentials({
    username: 'trader42',
    password: 'secret',
    brokerId: 'Orrnn',
    serverUrl: 'https://service.orrnn.com',
  });

  assert.equal(lastBody.broker_id, 'Orrnn');
  assert.equal(lastBody.username, 'trader42');
  assert.equal(Object.prototype.hasOwnProperty.call(lastBody, 'user'), false);
  assert.equal(result.brokerId, 'Orrnn');
});

test('a different broker_id in the response fails the login', async () => {
  mockLogin(contractV3LoginResponse({ broker_id: 'trivanta-markets' }));
  await assert.rejects(
    () => signInWithCredentials({
      username: '200074',
      password: 'secret',
      brokerId: 'Orrnn',
      serverUrl: 'https://service.orrnn.com',
    }),
    /did not match the selected broker/,
  );
});

test('account_login null stops the login with "No trading account linked to this user"', async () => {
  mockLogin(contractV3LoginResponse({ account_login: null }));
  await assert.rejects(
    () => signInWithCredentials({
      username: 'trader42',
      password: 'secret',
      brokerId: 'trivanta-markets',
      serverUrl: 'https://trivanta.orrnn.com',
    }),
    (error: unknown) => {
      assert.ok(error instanceof SignInError);
      assert.equal(error.message, NO_TRADING_ACCOUNT_MESSAGE);
      assert.equal(error.message, 'No trading account linked to this user');
      return true;
    },
  );
});

test('readLoginAccountLogin reads the numeric login and rejects null', () => {
  assert.equal(readLoginAccountLogin({ account_login: 200074 }), '200074');
  assert.equal(readLoginAccountLogin({ account_login: '200074' }), '200074');
  assert.throws(() => readLoginAccountLogin({ account_login: null }, '200074'), /No trading account/);
});

test('isSameBrokerId preserves case and ignores surrounding whitespace', () => {
  assert.equal(isSameBrokerId('TRIVANTA-MARKETS', 'trivanta-markets'), false);
  assert.equal(isSameBrokerId(' Orrnn ', 'orrnn'), false);
  assert.equal(isSameBrokerId('orrnn', 'trivanta-markets'), false);
  assert.equal(isSameBrokerId('', ''), false);
});

test('server name: /broker/config server_name, else directory broker_name, else broker id', () => {
  assert.equal(
    resolveLoginServerName({ brokerConfigServerName: 'RTX5-Live', directoryBrokerName: 'Trivanta Markets' }),
    'RTX5-Live',
  );
  assert.equal(
    resolveLoginServerName({ brokerConfigServerName: '', directoryBrokerName: 'Trivanta Markets' }),
    'Trivanta Markets',
  );
  assert.equal(resolveLoginServerName({ brokerId: 'trivanta-markets' }), 'trivanta-markets');
});

test('account name comes from /account/{login} name for the same login only', () => {
  const detail = { login: 200074, name: 'John Doe', group: 'real\\standard' };
  assert.equal(readAccountDisplayName(detail, '200074'), 'John Doe');
  assert.equal(readAccountDisplayName(detail, 200074), 'John Doe');
  assert.equal(readAccountDisplayName(detail, '999'), '');
  assert.equal(readAccountDisplayName({ login: 200074, name: '  ' }, '200074'), '');
  assert.equal(readAccountDisplayName(null, '200074'), '');
});

test('expires_at is epoch seconds; expires_in is the fallback', () => {
  assert.equal(
    resolveLoginExpiresAtIso({ expires_at: 1_790_327_807 }),
    new Date(1_790_327_807_000).toISOString(),
  );
  const before = Date.now();
  const fromExpiresIn = Date.parse(resolveLoginExpiresAtIso({ expires_in: 60 }));
  assert.ok(fromExpiresIn >= before + 59_000 && fromExpiresIn <= Date.now() + 61_000);
});


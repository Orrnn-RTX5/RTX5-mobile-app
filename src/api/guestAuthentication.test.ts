import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateGuest, authenticationError, demoRegistrationBody, GuestAuthError, loginRequestBody, normalizeGuestSession, validateDemoForm, isDemoRegistrationEnabled } from './guestAuthentication';
import { setPublicBrokerContext } from '../state/publicBrokerContext';
import { publicBrokerFixture } from '../testFixtures/publicBroker';
import { resolveDemoAccountPolicy } from '../features/auth/demoAccountPolicy';
const form = { name: '  Demo User  ', email: ' trader@example.com ', investorPassword: ' Investor123! ', password: ' Abcdefg1 ', confirmation: ' Abcdefg1 ' };

test('public capability flags disable only demo registration', () => {
  assert.equal(isDemoRegistrationEnabled(null), true);
  for (const config of [{ registration_enabled: false }, { demo_registration_enabled: false }, { capabilities: { demo_registration_enabled: false } }]) assert.equal(isDemoRegistrationEnabled(config), false);
});

test('existing login uses the same verified extended origin and retains non-JSON rate limits', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  const context = setPublicBrokerContext(publicBrokerFixture('Nexa', { extended_api_url: 'https://signup.example.com' }))!;
  globalThis.fetch = (async url => {
    assert.equal(String(url), 'https://signup.example.com/api/v2/auth/login');
    return new Response('Rate limited', { status: 429, headers: { 'Retry-After': '30' } });
  }) as typeof fetch;
  await assert.rejects(authenticateGuest(context, 'login', loginRequestBody('10001', 'password', 'Nexa'), new AbortController().signal), error => error instanceof Error && 'status' in error && error.status === 429 && 'retryAt' in error && Number(error.retryAt) > Date.now());
});
test('demo payload allowlists identity and password fields and preserves both passwords exactly', () => {
  assert.deepEqual(demoRegistrationBody({ ...form, group: 'tampered', initial_balance: 999, phone: '+919876543210', country_code: 'IN' } as any, 'Nexa'), {
    name: 'Demo User', email: 'trader@example.com', username: 'trader@example.com', investor_pass: ' Investor123! ', password: ' Abcdefg1 ', broker_id: 'Nexa',
  });
  for (const invalid of [{ name: ' ' }, { email: 'bad' }, { password: '12345678' }, { password: 'abcdefgh' }, { password: 'Abcd1' }, { confirmation: 'Abcdefg1' }, { investorPassword: '' }, { investorPassword: '12345678' }, { investorPassword: 'abcdefgh' }, { investorPassword: 'Abcd1' }]) {
    assert.ok(validateDemoForm({ ...form, ...invalid }));
    assert.throws(() => demoRegistrationBody({ ...form, ...invalid }, 'Nexa'));
  }
  assert.equal(validateDemoForm(form), null);
});
test('numeric and username login identities are exclusive and retain numeric precision', () => {
  assert.match(loginRequestBody('90071992547409930001', 'secret', 'Nexa'), /^\{"login":90071992547409930001,/);
  assert.deepEqual(JSON.parse(loginRequestBody('test@example.com', ' secret ', 'Nexa')), { username: 'test@example.com', password: ' secret ', broker_id: 'Nexa' });
});
test('login and registration aliases normalize separately and never substitute user identity', () => {
  const raw = { token: 'jwt', login: '20001', broker_id: 'Nexa', api_key: 'ignored', server: 'Display only', group: 'A' };
  const registered = normalizeGuestSession(raw, 'Nexa', 'register');
  assert.equal(registered.accountLogin, '20001'); assert.equal(registered.refreshToken, ''); assert.equal(registered.expiresAt, ''); assert.equal('api_key' in registered.metadata, false);
  assert.throws(() => normalizeGuestSession(raw, 'Nexa', 'login'));
  for (const bad of [{ account_login: null }, { account_login: -1 }, { account_login: Number.MAX_SAFE_INTEGER + 1 }, { broker_id: 'nexa' }, { broker_id: undefined }, { access_token: '' }]) {
    assert.throws(() => normalizeGuestSession({ access_token: 'jwt', account_login: 1, broker_id: 'Nexa', ...bad }, 'Nexa', 'login'));
  }
  assert.throws(() => normalizeGuestSession({ access_token: 'jwt', user_id: 1, username: '20001', broker_id: 'Nexa' }, 'Nexa', 'login'));
  assert.equal(normalizeGuestSession({ ...raw, account_login: 12, login_type: 'investor' }, 'Nexa', 'login').investor, true);
  for (const expiry of [1800000000, 1800000000000, '2027-01-15T08:00:00.000Z']) assert.equal(normalizeGuestSession({ ...raw, expires_at: expiry }, 'Nexa', 'register').expiresAt, '2027-01-15T08:00:00.000Z');
});
test('HTTP 201 is accepted directly and authentication produces zero order/deposit/account requests', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  const context = setPublicBrokerContext(publicBrokerFixture('Nexa', { extended_api_url: 'https://signup.example.com' }))!;
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => { requests.push({ url: String(url), init }); return new Response('{"token":"jwt","login":90071992547409930001,"broker_id":"Nexa","broker_name":"Backend Nexa","group":"demo/admin-selected-B","leverage":75,"api_key":"ignored"}', { status: 201 }); }) as typeof fetch;
  const session = await authenticateGuest(context, 'register', demoRegistrationBody(form, 'Nexa'), new AbortController().signal);
  assert.equal(session.accountLogin, '90071992547409930001'); assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://signup.example.com/api/v2/auth/register');
  assert.equal(requests[0].init?.credentials, 'omit'); assert.equal(new Headers(requests[0].init?.headers).has('Authorization'), false);
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), demoRegistrationBody(form, 'Nexa'));
  assert.deepEqual(resolveDemoAccountPolicy({ default_leverage: 100 }, 'Directory Nexa', session.metadata), {
    brokerName: 'Directory Nexa', group: 'demo/admin-selected-B', leverage: 75,
  });
  assert.equal('api_key' in session.metadata, false);
  assert.equal('investor_pass' in session.metadata, false);
});
test('late broker-switched and dismissed responses cannot return accepted sessions', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async () => { await gate; return new Response('{"token":"jwt","login":1,"broker_id":"Nexa"}', { status: 201 }); }) as typeof fetch;
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  const pending = authenticateGuest(context, 'register', demoRegistrationBody(form, 'Nexa'), new AbortController().signal);
  setPublicBrokerContext(publicBrokerFixture('Other')); release(); await assert.rejects(pending, /cancelled/);
});
test('documented status/code classes, rate limits and ambiguous errors remain distinct', () => {
  for (const [status, code] of [[400, 'INVALID_INPUT'], [400, 'WEAK_PASSWORD'], [403, 'DEMO_REGISTRATION_DISABLED'], [409, 'CONFLICT'], [409, 'CALCULATION_POLICY_UNSUPPORTED'], [413, 'PAYLOAD_TOO_LARGE'], [429, 'DEMO_REGISTRATION_RATE_LIMITED'], [503, 'DEMO_REGISTRATION_UNAVAILABLE'], [503, 'DEMO_THROTTLE_UNAVAILABLE'], [503, 'DEMO_POLICY_UNAVAILABLE']] as const) {
    const error = authenticationError(status, { error: code }, null, true); assert.equal(error.status, status); assert.equal(error.code, code); assert.equal(error.ambiguous, false); assert.ok(error.message);
  }
  assert.equal(authenticationError(429, {}, '60', true, 1000).retryAt, 61000);
  assert.equal(authenticationError(429, {}, 'Wed, 21 Oct 2026 07:28:00 GMT', true).retryAt, Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'));
  assert.equal(authenticationError(500, { error: 'INTERNAL_ERROR' }, null, true).ambiguous, true);
  assert.equal(authenticationError(0, {}, null, true).ambiguous, true);
  assert.notEqual(authenticationError(409, { error: 'CONFLICT' }, null, true).message, authenticationError(409, { error: 'CALCULATION_POLICY_UNSUPPORTED' }, null, true).message);
});

test('a native fetch connection failure is distinguished from a rejected password', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  globalThis.fetch = (async () => { throw new TypeError('Network request failed'); }) as typeof fetch;
  await assert.rejects(authenticateGuest(context, 'login', loginRequestBody('10001', 'secret', context.brokerId), new AbortController().signal), error => {
    assert.ok(error instanceof GuestAuthError); assert.equal(error.code, 'NETWORK_ERROR');
    assert.match(error.message, /connect to the broker/i); assert.doesNotMatch(error.message, /not accepted|password/i); return true;
  });
  assert.match(authenticationError(401, {}, null, false).message, /login or password was not accepted/i);
});

test('login displays the backend rejection message and code without exposing credential strings', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'ACCOUNT_DISABLED', message: 'Account disabled. Contact your broker. password=hidden-secret' }), { status: 403 })) as typeof fetch;
  await assert.rejects(authenticateGuest(context, 'login', loginRequestBody('10001', 'secret', context.brokerId), new AbortController().signal), error => {
    assert.ok(error instanceof GuestAuthError); assert.equal(error.status, 403); assert.equal(error.code, 'ACCOUNT_DISABLED');
    assert.match(error.message, /Account disabled/); assert.doesNotMatch(error.message, /hidden-secret/); return true;
  });
  assert.match(authenticationError(503, {}, null, false).message, /broker login service/i);
  assert.doesNotMatch(authenticationError(503, {}, null, false).message, /demo signup/i);
});

test('a successful non-JSON response is a backend response error, not bad credentials or a connection failure', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  globalThis.fetch = (async () => new Response('<html>Upstream error</html>', { status: 200 })) as typeof fetch;
  for (const operation of ['login', 'register'] as const) {
    await assert.rejects(authenticateGuest(context, operation, '{}', new AbortController().signal), error => {
      assert.ok(error instanceof GuestAuthError); assert.equal(error.code, 'INVALID_RESPONSE'); assert.equal(error.status, 200);
      assert.equal(error.ambiguous, operation === 'register'); return true;
    });
  }
});

test('a timed-out native request reports a timeout and registration keeps its uncertain result', async t => {
  const original = fetch; t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => { t.mock.timers.reset(); globalThis.fetch = original; setPublicBrokerContext(null); });
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  globalThis.fetch = ((_url, init) => new Promise<Response>((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
  })) as typeof fetch;
  for (const operation of ['login', 'register'] as const) {
    const request = authenticateGuest(context, operation, '{}', new AbortController().signal);
    const rejected = assert.rejects(request, error => {
      assert.ok(error instanceof GuestAuthError); assert.equal(error.code, 'AUTH_TIMEOUT'); assert.equal(error.ambiguous, operation === 'register');
      assert.match(error.message, operation === 'login' ? /timed out/i : /may have been created/i); return true;
    });
    t.mock.timers.tick(15000); await rejected;
  }
});

test('caller cancellation is separate from a timeout and already-cancelled login never contacts the broker', async t => {
  const original = fetch; t.after(() => { globalThis.fetch = original; setPublicBrokerContext(null); });
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  let requests = 0;
  globalThis.fetch = ((_url, init) => { requests++; return new Promise<Response>((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
  }); }) as typeof fetch;
  const controller = new AbortController(); const request = authenticateGuest(context, 'login', '{}', controller.signal);
  controller.abort();
  await assert.rejects(request, error => error instanceof GuestAuthError && error.code === 'AUTH_CANCELLED');
  await assert.rejects(authenticateGuest(context, 'login', '{}', controller.signal), error => error instanceof GuestAuthError && error.code === 'AUTH_CANCELLED');
  assert.equal(requests, 1);
});

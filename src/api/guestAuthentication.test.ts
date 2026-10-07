import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateGuest, authenticationError, demoRegistrationBody, loginRequestBody, normalizeGuestSession, validateDemoForm, isDemoRegistrationEnabled } from './guestAuthentication';
import { setPublicBrokerContext } from '../state/publicBrokerContext';
import { publicBrokerFixture } from '../testFixtures/publicBroker';
import { resolveDemoAccountPolicy } from '../features/auth/demoAccountPolicy';
const form = { name: '  Demo User  ', email: ' trader@example.com ', password: ' Abcdefg1 ', confirmation: ' Abcdefg1 ' };

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
test('demo payload contains only server-approved identity fields and preserves the password', () => {
  assert.deepEqual(demoRegistrationBody({ ...form, group: 'tampered', initial_balance: 999, phone: '+919876543210', country_code: 'IN' } as any, 'Nexa'), {
    name: 'Demo User', email: 'trader@example.com', username: 'trader@example.com', password: ' Abcdefg1 ', broker_id: 'Nexa',
  });
  for (const invalid of [{ name: ' ' }, { email: 'bad' }, { password: '12345678' }, { password: 'abcdefgh' }, { password: 'Abcd1' }, { confirmation: 'Abcdefg1' }]) assert.ok(validateDemoForm({ ...form, ...invalid }));
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

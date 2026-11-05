import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActivateBrokerSessionInput } from '../state/activeBrokerSession';
import {
  createPublicBrokerContext,
  setPublicBrokerContext,
  type PublicBrokerContext,
} from '../state/publicBrokerContext';
import { publicBrokerFixture } from '../testFixtures/publicBroker';
import { validateLoginBrokerContext } from './validatedLoginBrokerContext';

const sessionFor = (context: PublicBrokerContext): ActivateBrokerSessionInput => ({
  ...context.endpoints,
  accountLogin: '200003',
});

test.afterEach(() => setPublicBrokerContext(null));

test('the exact current directory context authorizes handoff without another network request', () => {
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => {
    requests += 1;
    throw new Error('Validation must not fetch the directory again.');
  }) as typeof fetch;
  try {
    assert.equal(validateLoginBrokerContext(context, sessionFor(context)), context);
    assert.equal(requests, 0);
    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isFrozen(context.endpoints), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cloned and independently constructed contexts cannot authorize the fast handoff', () => {
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  for (const supplied of [
    { ...context },
    Object.freeze({ ...context }),
    createPublicBrokerContext(publicBrokerFixture()),
  ]) {
    assert.throws(() => validateLoginBrokerContext(supplied, sessionFor(context)), /selection changed/);
  }
});

test('broker selection, configuration refresh, and clearing selection invalidate earlier login contexts', () => {
  for (const next of [
    publicBrokerFixture('Other'),
    publicBrokerFixture('Nexa', { config_version: 'test-2' }),
    publicBrokerFixture(),
    null,
  ]) {
    const context = setPublicBrokerContext(publicBrokerFixture())!;
    const session = sessionFor(context);
    setPublicBrokerContext(next);
    assert.throws(() => validateLoginBrokerContext(context, session), /selection changed/);
  }
});

test('broker identity and configuration must match exactly without case folding or numeric coercion', () => {
  const context = setPublicBrokerContext(publicBrokerFixture('Nexa', { config_version: '1' }))!;
  for (const change of [
    { brokerId: 'nexa' },
    { brokerId: 'NEXA' },
    { brokerId: 'Nexa ' },
    { configVersion: '2' },
    { configVersion: 1 },
  ]) {
    assert.throws(() => validateLoginBrokerContext(context, { ...sessionFor(context), ...change }), /configuration changed/);
  }
});

test('each session routing field must equal the authorized directory value', () => {
  const context = setPublicBrokerContext(publicBrokerFixture())!;
  const changes: Partial<ActivateBrokerSessionInput>[] = [
    { apiBase: 'https://other.example.com/api/v2' },
    { apiBase: `${context.apiBase}/` },
    { feedWsBase: 'wss://other.example.com/ws/feed' },
    { feedStatusUrl: 'https://other.example.com/ws/feed/status' },
    { tradeWsBase: 'wss://other.example.com/ws/v2' },
    { tradeWsBase: undefined },
    { servicesDomain: 'other.example.com' },
    { servicesDomain: 'SERVICES.EXAMPLE.COM' },
  ];
  for (const change of changes) {
    assert.throws(() => validateLoginBrokerContext(context, { ...sessionFor(context), ...change }), /endpoints do not match/);
  }
});

test('a directory-derived trade endpoint must also match when the record omits it', () => {
  const context = setPublicBrokerContext(publicBrokerFixture('Nexa', { trade_wss_url: undefined }))!;
  const session = sessionFor(context);
  assert.equal(context.endpoints.tradeWsBase, 'wss://services.example.com/ws/v2');
  assert.equal(validateLoginBrokerContext(context, session), context);
  for (const tradeWsBase of [null, undefined, '', 'wss://other.example.com/ws/v2']) {
    assert.throws(() => validateLoginBrokerContext(context, { ...session, tradeWsBase }), /endpoints do not match/);
  }
});

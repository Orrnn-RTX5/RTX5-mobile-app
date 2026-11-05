import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAccountEnvironmentRefreshOrder,
  readRawAccountLogin,
} from './accountEnvironmentRefreshCore';

test('a later refresh for the same owner and account makes the first stale', () => {
  const order = createAccountEnvironmentRefreshOrder();
  const first = order.begin('session:1', 'broker-a:200082');
  const second = order.begin('session:1', 'broker-a:200082');

  assert.equal(order.isCurrent(first, 'session:1', 'broker-a:200082'), false);
  assert.equal(order.isCurrent(second, 'session:1', 'broker-a:200082'), true);
  assert.ok(second.generation > first.generation);
});

test('an owner switch invalidates prior work', () => {
  const order = createAccountEnvironmentRefreshOrder();
  const ownerA = order.begin('session:a', 'broker-a:200082');
  const ownerB = order.begin('session:b', 'broker-b:200082');

  assert.equal(order.isCurrent(ownerA, 'session:a', 'broker-a:200082'), false);
  assert.equal(order.isCurrent(ownerB, 'session:b', 'broker-b:200082'), true);
});

test('switching back to an owner cannot revive its old token', () => {
  const order = createAccountEnvironmentRefreshOrder();
  const firstA = order.begin('session:a', 'broker-a:200082');
  order.begin('session:b', 'broker-b:200082');
  const secondA = order.begin('session:a', 'broker-a:200082');

  assert.equal(order.isCurrent(firstA, 'session:a', 'broker-a:200082'), false);
  assert.equal(order.isCurrent(secondA, 'session:a', 'broker-a:200082'), true);
  assert.ok(secondA.generation > firstA.generation);
});

test('repeated login numbers at different brokers remain independently scoped', () => {
  const order = createAccountEnvironmentRefreshOrder();
  const firstBroker = order.begin('broker:a:credential:1', 'broker-a:200082');
  const secondBroker = order.begin('broker:b:credential:1', 'broker-b:200082');

  assert.equal(
    order.isCurrent(firstBroker, 'broker:a:credential:1', 'broker-a:200082'),
    false,
  );
  assert.equal(
    order.isCurrent(secondBroker, 'broker:b:credential:1', 'broker-b:200082'),
    true,
  );
  assert.equal(
    order.isCurrent(secondBroker, 'broker:b:credential:1', 'broker-a:200082'),
    false,
  );
});

test('a token from another refresh-order instance is never accepted', () => {
  const firstOrder = createAccountEnvironmentRefreshOrder();
  const secondOrder = createAccountEnvironmentRefreshOrder();
  const foreignToken = firstOrder.begin('session:a', 'broker-a:200082');

  secondOrder.begin('session:a', 'broker-a:200082');

  assert.equal(
    secondOrder.isCurrent(foreignToken, 'session:a', 'broker-a:200082'),
    false,
  );
});

test('readRawAccountLogin follows root, account, then data alias priority', () => {
  assert.equal(
    readRawAccountLogin({
      accountLogin: 'root-camel',
      account: { login: 'nested-account' },
      data: { login: 'nested-data' },
    }),
    'root-camel',
  );
  assert.equal(
    readRawAccountLogin({
      account: { account_login: 'account-snake' },
      data: { login: 'nested-data' },
    }),
    'account-snake',
  );
  assert.equal(
    readRawAccountLogin({ data: { accountLogin: 'data-camel' } }),
    'data-camel',
  );
});

test('readRawAccountLogin preserves exact string identity without numeric coercion', () => {
  assert.equal(readRawAccountLogin({ login: '000200082' }), '000200082');
  assert.equal(readRawAccountLogin({ login: '200082.9' }), '200082.9');
  assert.equal(readRawAccountLogin({ login: '2e5' }), '2e5');
  assert.notEqual(readRawAccountLogin({ login: '200082.9' }), '200082');
});

test('readRawAccountLogin stringifies finite numeric values without truncation', () => {
  assert.equal(readRawAccountLogin({ account_login: 200082 }), '200082');
  assert.equal(readRawAccountLogin({ account_login: 200082.9 }), '200082.9');
});

test('readRawAccountLogin skips invalid and blank aliases', () => {
  assert.equal(
    readRawAccountLogin({
      login: { value: 'wrong' },
      account_login: ' ',
      account: { login: ['wrong'], accountLogin: '  exact-account  ' },
    }),
    'exact-account',
  );
  assert.equal(
    readRawAccountLogin({ login: Number.NaN, data: { login: 'data-login' } }),
    'data-login',
  );
  assert.equal(readRawAccountLogin(null), '');
  assert.equal(readRawAccountLogin([{ login: 'array-login' }]), '');
  assert.equal(readRawAccountLogin({ login: true }), '');

  const throwing = Object.defineProperty({}, 'login', {
    get() {
      throw new Error('malformed identity');
    },
  });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.doesNotThrow(() => readRawAccountLogin(throwing));
  assert.doesNotThrow(() => readRawAccountLogin(revoked.proxy));
  assert.equal(readRawAccountLogin(throwing), '');
  assert.equal(readRawAccountLogin(revoked.proxy), '');
});

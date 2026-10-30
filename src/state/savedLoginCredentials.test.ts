import assert from 'node:assert/strict';
import test from 'node:test';
import { clearSavedLoginPassword } from './savedLoginCredentials';

function storage(saved: unknown) {
  let value = JSON.stringify(saved);
  let writes = 0;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; writes += 1; },
    read: () => JSON.parse(value),
    writes: () => writes,
  };
}

test('forget password removes autofill secret and preserves account selection', async () => {
  const saved = storage({ broker: 'Broker-A', login: '123', pass: 'secret', server_url: 'https://broker.example' });
  await clearSavedLoginPassword('broker-a', '123', saved);
  assert.deepEqual(saved.read(), { broker: 'Broker-A', login: '123', server_url: 'https://broker.example' });
});

test('forget password leaves other brokers and accounts untouched', async () => {
  for (const [broker, login] of [['Broker-B', '123'], ['Broker-A', '456']]) {
    const saved = storage({ broker, login, pass: 'other account password' });
    await clearSavedLoginPassword('Broker-A', '123', saved);
    assert.equal(saved.writes(), 0);
  }
});

test('secure-storage write failures reach the UI instead of reporting false success', async () => {
  const saved = storage({ broker: 'A', login: '123', pass: 'secret' });
  await assert.rejects(clearSavedLoginPassword('A', '123', {
    ...saved, setItem: async () => { throw new Error('secure storage unavailable'); },
  }), /secure storage unavailable/);
  assert.equal(saved.read().pass, 'secret');
});

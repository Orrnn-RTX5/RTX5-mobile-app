import assert from 'node:assert/strict';
import test from 'node:test';
import { createSavedAccountCredentialQueue } from './savedAccountCredentialQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('forget waits for an earlier background save and leaves no saved password', async () => {
  const enqueue = createSavedAccountCredentialQueue();
  const saveReady = deferred<void>();
  const calls: string[] = [];
  let password: string | null = null;
  const save = enqueue('broker.account', async () => {
    calls.push('save');
    await saveReady.promise;
    password = 'first password';
  });
  const forget = enqueue('broker.account', async () => {
    calls.push('forget');
    password = null;
  });
  await Promise.resolve();
  assert.deepEqual(calls, ['save']);
  saveReady.resolve();
  await Promise.all([save, forget]);
  assert.deepEqual(calls, ['save', 'forget']);
  assert.equal(password, null);
});

test('replacement passwords cannot be overwritten by an older background save', async () => {
  const enqueue = createSavedAccountCredentialQueue();
  const firstReady = deferred<void>();
  let password: string | null = null;
  const first = enqueue('broker.account', async () => {
    await firstReady.promise;
    password = 'old password';
  });
  const replacement = enqueue('broker.account', async () => { password = 'new password'; });
  const read = enqueue('broker.account', async () => password);
  firstReady.resolve();
  await Promise.all([first, replacement]);
  assert.equal(await read, 'new password');
});

test('a saved-account read waits for a pending save without letting a later forget overtake it', async () => {
  const enqueue = createSavedAccountCredentialQueue();
  const saveReady = deferred<void>();
  const readReady = deferred<void>();
  const calls: string[] = [];
  let password: string | null = null;
  const save = enqueue('broker.account', async () => {
    await saveReady.promise;
    password = 'saved password';
  });
  const read = enqueue('broker.account', async () => {
    calls.push('read');
    await readReady.promise;
    return password;
  });
  const forget = enqueue('broker.account', async () => {
    calls.push('forget');
    password = null;
  });
  await Promise.resolve();
  assert.deepEqual(calls, []);
  saveReady.resolve();
  await save;
  await Promise.resolve();
  assert.deepEqual(calls, ['read']);
  readReady.resolve();
  assert.equal(await read, 'saved password');
  await forget;
  assert.equal(password, null);
});

test('different account keys run independently while a secure operation is pending', async () => {
  const enqueue = createSavedAccountCredentialQueue();
  const blocked = deferred<void>();
  const first = enqueue('broker-one.account', () => blocked.promise);
  assert.equal(await enqueue('broker-two.account', async () => 'other broker'), 'other broker');
  assert.equal(await enqueue('broker-one.other-account', async () => 'other account'), 'other account');
  blocked.resolve();
  await first;
});

test('a failed background save reaches its caller and does not block a queued forget or later save', async () => {
  const enqueue = createSavedAccountCredentialQueue();
  const failedWrite = deferred<void>();
  const save = assert.rejects(enqueue('broker.account', () => failedWrite.promise), /write failed/);
  let password: string | null = 'previous password';
  const forget = enqueue('broker.account', async () => { password = null; });
  failedWrite.reject(new Error('write failed'));
  await Promise.all([save, forget]);
  assert.equal(password, null);
  await enqueue('broker.account', async () => { password = 'retry password'; });
  assert.equal(await enqueue('broker.account', async () => password), 'retry password');
});

test('a synchronously thrown storage error also releases the account queue', async () => {
  const enqueue = createSavedAccountCredentialQueue();
  const failed = assert.rejects(enqueue('broker.account', () => { throw new Error('unavailable'); }), /unavailable/);
  const next = enqueue('broker.account', async () => 'recovered');
  await failed;
  assert.equal(await next, 'recovered');
});

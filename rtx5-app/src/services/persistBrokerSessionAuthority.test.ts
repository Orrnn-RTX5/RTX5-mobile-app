import assert from 'node:assert/strict';
import test from 'node:test';
import { persistBrokerSessionAuthority } from './persistBrokerSessionAuthority';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('secure writes start together and activation waits only for both authority records', async () => {
  const credentials = deferred<string>();
  const manifest = deferred();
  const started: string[] = [];
  let complete = false;
  const commit = persistBrokerSessionAuthority({
    writeCredentials: () => { started.push('credentials'); return credentials.promise; },
    writeManifest: () => { started.push('manifest'); return manifest.promise; },
  }).then(value => { complete = true; return value; });
  await Promise.resolve();
  assert.deepEqual(started, ['credentials', 'manifest']);
  credentials.resolve('secure-credentials');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(complete, false, 'both credential bundle and routing manifest must be durable');
  manifest.resolve();
  assert.equal(await commit, 'secure-credentials');
});

test('a failed write cannot trigger rollback while another secure writer is still running', async () => {
  const credentials = deferred<string>(); const manifest = deferred();
  const error = new Error('credential write failed');
  let rolledBack = false;
  const commit = persistBrokerSessionAuthority({
    writeCredentials: () => credentials.promise,
    writeManifest: () => manifest.promise,
  }).catch(reason => { rolledBack = true; assert.equal(reason, error); });
  credentials.reject(error);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rolledBack, false);
  manifest.resolve();
  await commit;
  assert.equal(rolledBack, true);
});

test('synchronous native-call failures still wait for the remaining tasks', async () => {
  const manifest = deferred();
  let settled = false;
  const error = new Error('native storage unavailable');
  const commit = persistBrokerSessionAuthority({
    writeCredentials: () => { throw error; },
    writeManifest: () => manifest.promise,
  }).catch(reason => { settled = true; assert.equal(reason, error); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  manifest.resolve(); await commit;
  assert.equal(settled, true);
});

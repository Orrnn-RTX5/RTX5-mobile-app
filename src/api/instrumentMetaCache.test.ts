import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  getCachedInstrumentMeta,
  primeInstrumentMetaCacheFromCatalogPayload,
  resetInstrumentMetaCache,
} from './instrumentMeta';

test.beforeEach(resetInstrumentMetaCache);

test('shared catalog consumers normalize each row once and keep metadata object identity', () => {
  let digitReads = 0;
  const payload = Array.from({ length: 3_000 }, (_, index) => ({
    symbol: `SYMBOL-${index}.pro`,
    get digits() { digitReads += 1; return 5; },
  }));
  primeInstrumentMetaCacheFromCatalogPayload(payload, 'session-a');
  const first = getCachedInstrumentMeta('SYMBOL-2999.pro', 'session-a');
  const firstPassReads = digitReads;
  assert.ok(firstPassReads >= payload.length);
  for (let consumer = 0; consumer < 20; consumer += 1) {
    primeInstrumentMetaCacheFromCatalogPayload(payload, 'session-a');
  }
  assert.equal(digitReads, firstPassReads, 'subsequent consumers must not inspect every raw row again');
  assert.strictEqual(getCachedInstrumentMeta('SYMBOL-2999.pro', 'session-a'), first);
  assert.equal(getCachedInstrumentMeta('SYMBOL-2999.pro', 'session-b'), undefined);
});

test('new catalog response objects are normalized immediately and remain scoped', () => {
  primeInstrumentMetaCacheFromCatalogPayload([{ symbol: 'EURUSD', digits: 5 }], 'session-a');
  const original = getCachedInstrumentMeta('EURUSD', 'session-a');
  primeInstrumentMetaCacheFromCatalogPayload([{ symbol: 'EURUSD', digits: 3 }], 'session-a');
  assert.equal(getCachedInstrumentMeta('EURUSD', 'session-a')?.digits, 3);
  assert.notStrictEqual(getCachedInstrumentMeta('EURUSD', 'session-a'), original);
  primeInstrumentMetaCacheFromCatalogPayload([{ symbol: 'EURUSD', digits: 2 }], 'session-b');
  assert.equal(getCachedInstrumentMeta('EURUSD', 'session-a')?.digits, 3);
  assert.equal(getCachedInstrumentMeta('EURUSD', 'session-b')?.digits, 2);
});

test('session teardown releases all historical catalog scopes and their normalization cache', () => {
  const payload = [{ symbol: 'EURUSD', digits: 5 }];
  for (let session = 0; session < 100; session += 1) {
    const namespace = `session-${session}`;
    primeInstrumentMetaCacheFromCatalogPayload(payload, namespace);
    assert.equal(getCachedInstrumentMeta('EURUSD', namespace)?.digits, 5);
    resetInstrumentMetaCache();
    assert.equal(getCachedInstrumentMeta('EURUSD', namespace), undefined);
  }
  // A retained response cannot resurrect a previously normalized value after
  // reset. It must be read again when a new owner explicitly primes it.
  payload[0].digits = 3;
  primeInstrumentMetaCacheFromCatalogPayload(payload, 'new-session');
  assert.equal(getCachedInstrumentMeta('EURUSD', 'new-session')?.digits, 3);
  const coordinator = readFileSync(resolve(process.cwd(), 'src/services/brokerSessionCoordinator.ts'), 'utf8');
  const teardown = coordinator.slice(coordinator.indexOf('export const teardownBrokerSessionRuntime'), coordinator.indexOf('const failClosed'));
  assert.match(teardown, /resetInstrumentMetaCache\(\)/);
});

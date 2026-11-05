import assert from 'node:assert/strict';
import test from 'node:test';

import { buildJournalSessionScopeKey, journalServerUrlFromApiBase } from './journalSessionScope';
import {
  ORDER_LATENCY_BUFFER_LIMIT,
  getOrderLatencySamples,
  recordOrderLatencySample,
  resetOrderLatencyTelemetryForTests,
  subscribeOrderLatencySamples,
} from './orderLatencyTelemetry';

test('buffer is capped at 200, assigns sequences and trace ids, and returns copies', () => {
  resetOrderLatencyTelemetryForTests();
  for (let index = 0; index < ORDER_LATENCY_BUFFER_LIMIT + 5; index += 1) {
    recordOrderLatencySample({ phase: 'placement_terminal', transport: 'rest', clientOrderId: `order-${index}-abcdefgh` });
  }
  const samples = getOrderLatencySamples();
  assert.equal(samples.length, ORDER_LATENCY_BUFFER_LIMIT);
  assert.equal(samples[0].sequence, 6, 'oldest samples are dropped first');
  assert.equal(samples.at(-1)?.traceId, 'abcdefgh');
  samples.pop();
  assert.equal(getOrderLatencySamples().length, ORDER_LATENCY_BUFFER_LIMIT);
  assert.equal(recordOrderLatencySample({ phase: 'x', transport: 'rest' }).traceId, 'unknown');
});

test('subscribers are notified on the next task, never synchronously', async () => {
  resetOrderLatencyTelemetryForTests();
  const seen: number[] = [];
  const unsubscribe = subscribeOrderLatencySamples((sample) => seen.push(sample.sequence));
  recordOrderLatencySample({ phase: 'placement_terminal', transport: 'rest' });
  assert.deepEqual(seen, []);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, [1]);
  unsubscribe();
});

test('session scope key: normalized, token-free, stable across token rotation', () => {
  const session = { accountLogin: 5001, brokerId: ' FXTrust/ ', apiBase: 'https://FXTrustBrokerBackend.orrnn.com/api/v2/' };
  assert.equal(
    buildJournalSessionScopeKey(session),
    'authenticated|5001|fxtrust|https://fxtrustbrokerbackend.orrnn.com',
  );
  assert.equal(buildJournalSessionScopeKey(null), 'anonymous|||');
  assert.equal(journalServerUrlFromApiBase('https://host/api/v2'), 'https://host');
  assert.equal(
    buildJournalSessionScopeKey({ ...session, accessToken: 'secret' } as typeof session),
    buildJournalSessionScopeKey(session),
  );
});

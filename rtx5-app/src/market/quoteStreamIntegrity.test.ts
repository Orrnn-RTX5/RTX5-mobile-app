import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateQuoteStreamTick } from './quoteStreamIntegrity';

const identity = { brokerId: 'broker-a', accountLogin: '10001', sessionEpoch: 3 };
const update = {
  symbol: 'EURUSD', rawSymbol: 'EURUSD', bid: 1.1, ask: 1.2,
  timestamp: 1_700_000_000, timestampSource: 'feed' as const, rawKeys: [],
  sequence: 10,
};

test('explicit wrong broker/account/epoch identities are rejected', () => {
  assert.equal(evaluateQuoteStreamTick({ broker_id: 'broker-b' }, update, identity).accepted, false);
  assert.equal(evaluateQuoteStreamTick({ session: { account_login: '20002' } }, update, identity).accepted, false);
  assert.equal(evaluateQuoteStreamTick({ data: { session_epoch: 2 } }, update, identity).accepted, false);
});

test('duplicate, backward-time, and lower-sequence ticks are rejected', () => {
  const first = evaluateQuoteStreamTick({}, update, identity);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;

  assert.deepEqual(evaluateQuoteStreamTick({}, update, identity, first.cursor), {
    accepted: false,
    reason: 'duplicate',
  });
  assert.deepEqual(evaluateQuoteStreamTick({}, {
    ...update,
    timestamp: 1_699_999_999,
    sequence: 11,
  }, identity, first.cursor), {
    accepted: false,
    reason: 'backward_time',
  });
  assert.deepEqual(evaluateQuoteStreamTick({}, {
    ...update,
    timestamp: 1_700_000_001,
    sequence: 9,
  }, identity, first.cursor), {
    accepted: false,
    reason: 'lower_sequence',
  });
});

test('identity-absent ticks are accepted on an already broker-bound socket', () => {
  const result = evaluateQuoteStreamTick({}, update, identity);
  assert.equal(result.accepted, true);
});


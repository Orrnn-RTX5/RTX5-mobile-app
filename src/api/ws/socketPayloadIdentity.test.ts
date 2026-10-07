import assert from 'node:assert/strict';
import test from 'node:test';

import { payloadMatchesSocketIdentity } from './socketPayloadIdentity';

const identity = { brokerId: 'broker-a', accountLogin: '1001', sessionEpoch: 7 } as const;

test('socket payload identity rejects explicit cross-session values', () => {
  assert.equal(payloadMatchesSocketIdentity({ broker_id: 'broker-b' }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({ data: { login: '1002' } }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({ payload: { session_epoch: 6 } }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({ channel: 'positions.1002' }, identity), false);
});

test('socket payload identity accepts matching or protocol-implicit identity', () => {
  assert.equal(payloadMatchesSocketIdentity({
    broker_id: 'BROKER-A',
    account_login: 1001,
    session_epoch: 7,
    channel: 'metrics.1001',
  }, identity), true);
  assert.equal(payloadMatchesSocketIdentity({ channel: 'candles.XAUUSD.1m' }, identity), true);
  assert.equal(payloadMatchesSocketIdentity({ channel: 'ticks.XAUUSD', data: { bid: 1 } }, identity), true);
});

test('contract v3 nested trade frames are identity-checked at the row level', () => {
  const trivanta = { brokerId: 'trivanta-markets', accountLogin: '200074', sessionEpoch: 3 } as const;
  const orrnn = { brokerId: 'Orrnn', accountLogin: '200074', sessionEpoch: 3 } as const;
  const opened = {
    channel: 'positions.200074',
    data: {
      event_id: 'evt-1',
      type: 'position_opened',
      data: { ticket: 2002, account_login: 200074, broker_id: 'trivanta-markets', symbol: 'EURUSD' },
    },
  };

  assert.equal(payloadMatchesSocketIdentity(opened, trivanta), true);
  assert.equal(payloadMatchesSocketIdentity(opened, orrnn), false);
  assert.equal(payloadMatchesSocketIdentity({
    channel: 'positions.200074',
    data: { type: 'position_opened', data: { ticket: 2002, account_login: 200075 } },
  }, trivanta), false);
  // broker_id is compared ignoring case.
  assert.equal(payloadMatchesSocketIdentity({
    channel: 'positions.200074',
    data: { type: 'position_opened', data: { ticket: 2002, broker_id: 'orrnn' } },
  }, orrnn), true);
});

test('contract v3 metrics and control frames match the captured session', () => {
  const identity = { brokerId: 'Orrnn', accountLogin: '200074', sessionEpoch: 1 } as const;
  assert.equal(payloadMatchesSocketIdentity({
    channel: 'metrics.200074',
    data: {
      type: 'metrics_update',
      publication_token: 'pub',
      data: { login: 200074, balance: 10000, used_margin: 11.37 },
    },
  }, identity), true);
  assert.equal(payloadMatchesSocketIdentity({
    channel: 'metrics.200074',
    data: { type: 'metrics_update', data: { login: 999 } },
  }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({ type: 'subscribed', channel: 'positions.200074' }, identity), true);
  assert.equal(payloadMatchesSocketIdentity({ type: 'subscribed', channel: 'positions.1' }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({
    request_id: null, action: 'pong', success: true, data: { time: 1790241500123 },
  }, identity), true);
  // position_update arrays are not records and do not break the check.
  assert.equal(payloadMatchesSocketIdentity({
    channel: 'positions.200074',
    data: { type: 'position_update', data: [{ ticket: 1 }] },
  }, identity), true);
});

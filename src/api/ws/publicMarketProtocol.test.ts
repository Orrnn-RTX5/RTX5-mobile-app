import assert from 'node:assert/strict';
import test from 'node:test';
import { candleChannel, acknowledgedChannels, quoteAcknowledgment } from './publicMarketProtocol';
test('complete candle channels preserve dots and require explicit acknowledgments', () => {
  assert.equal(candleChannel('EURUSD.pro.a', '1m'), 'candles.EURUSD.pro.a.M1');
  assert.deepEqual(acknowledgedChannels({ type: 'subscribed', channel: 'candles.EURUSD.pro.a.M1' }), ['candles.EURUSD.pro.a.M1']);
  assert.deepEqual(acknowledgedChannels({ type: 'error', channel: 'candles.EURUSD.M1' }), []);
  assert.deepEqual(acknowledgedChannels({ type: 'subscribed', success: false, channels: ['candles.EURUSD.M1'] }), []);
});
test('quote acknowledgments separate accepted and rejected symbols from data/pong frames', () => {
  assert.deepEqual(quoteAcknowledgment({ type: 'subscribed', symbols: ['EURUSD.pro'], rejected: ['BAD'] }), { accepted: ['EURUSD.pro'], rejected: ['BAD'] });
  assert.equal(quoteAcknowledgment({ type: 'pong', timestamp: 123 }), null);
});

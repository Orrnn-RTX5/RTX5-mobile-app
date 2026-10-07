import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureExactChartQuote,
  readExactChartQuoteForScope,
  selectNewestExactChartQuote,
} from './exactChartQuote';

test('preserves divergent backend Bid and Ask exactly', () => {
  const snapshot = captureExactChartQuote('broker-a:200002:XAUUSD', {
    bid: 4341.49,
    ask: 4341.66,
    timestamp: 1_785_000_000_000,
    receivedAt: 1_785_000_000_100,
    transport: 'websocket',
  });

  assert.equal(snapshot?.bid, 4341.49);
  assert.equal(snapshot?.ask, 4341.66);
  assert.equal(snapshot?.feedTickAt, 1_785_000_000_000);
});

test('rejects missing, invalid, crossed, or synthesized one-sided prices', () => {
  assert.equal(captureExactChartQuote('scope', { bid: 100 }), null);
  assert.equal(captureExactChartQuote('scope', { ask: 102 }), null);
  assert.equal(captureExactChartQuote('scope', { bid: 0, ask: 1 }), null);
  assert.equal(captureExactChartQuote('scope', { bid: 102, ask: 100 }), null);
});

test('never leaks retained prices between broker/account/symbol scopes', () => {
  const brokerA = captureExactChartQuote('broker-a:200002:BTCUSD', { bid: 100, ask: 102 });
  assert.equal(readExactChartQuoteForScope('broker-a:200002:BTCUSD', brokerA)?.bid, 100);
  assert.equal(readExactChartQuoteForScope('broker-b:200002:BTCUSD', brokerA), null);
  assert.equal(readExactChartQuoteForScope('broker-a:200002:XAUUSD', brokerA), null);
});

test('delayed observer snapshots cannot replace a newer direct websocket quote', () => {
  const scopeKey = 'future-broker-x:account-7:XAUUSD';
  const direct = captureExactChartQuote(scopeKey, {
    bid: 4400.8,
    ask: 4400.92,
    receivedAt: 1_785_000_000_200,
    feedTickAt: 1_785_000_000_180,
    receiptMonotonicAt: 10_200.5,
  });
  const delayedOlder = captureExactChartQuote(scopeKey, {
    bid: 4400.65,
    ask: 4400.77,
    receivedAt: 1_785_000_000_100,
    feedTickAt: 1_785_000_000_080,
    receiptMonotonicAt: 10_100.5,
  });

  assert.equal(selectNewestExactChartQuote(direct, delayedOlder), direct);
});

test('equal-order replay keeps current while a strictly newer quote advances', () => {
  const scopeKey = 'public:XAUUSD';
  const current = captureExactChartQuote(scopeKey, {
    bid: 100,
    ask: 101,
    receivedAt: 1_785_000_000_100,
  });
  const equalReplay = captureExactChartQuote(scopeKey, {
    bid: 99,
    ask: 100,
    receivedAt: 1_785_000_000_100,
  });
  const newer = captureExactChartQuote(scopeKey, {
    bid: 102,
    ask: 103,
    receivedAt: 1_785_000_000_101,
  });

  assert.equal(selectNewestExactChartQuote(current, equalReplay), current);
  assert.equal(selectNewestExactChartQuote(current, newer), newer);
});

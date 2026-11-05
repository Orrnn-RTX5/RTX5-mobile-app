import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyQuoteSubscriptionDelta,
  buildActiveQuoteSymbols,
  expandQuoteTransportSymbols,
  normalizeQuoteTransportSymbol,
  resolveQuoteTransportSymbols,
} from './quoteSubscriptionState';

test('quote subscription counts keep a symbol active until the last consumer unsubscribes', () => {
  let counts = applyQuoteSubscriptionDelta(new Map(), ['EURUSD'], 1);
  counts = applyQuoteSubscriptionDelta(counts, ['EURUSD'], 1);

  assert.deepEqual(buildActiveQuoteSymbols([], counts), ['EURUSD']);

  counts = applyQuoteSubscriptionDelta(counts, ['EURUSD'], -1);
  assert.deepEqual(buildActiveQuoteSymbols([], counts), ['EURUSD']);

  counts = applyQuoteSubscriptionDelta(counts, ['EURUSD'], -1);
  assert.deepEqual(buildActiveQuoteSymbols([], counts), []);
});

test('sticky quote subscriptions merge with additive consumers instead of overriding them', () => {
  const counts = applyQuoteSubscriptionDelta(new Map(), ['EURUSD'], 1);
  const active = buildActiveQuoteSymbols(['XAUUSD'], counts).sort();

  assert.deepEqual(active, ['EURUSD', 'XAUUSD']);
});

test('quote subscriptions preserve broker feed symbols before counting and sending', () => {
  let counts = applyQuoteSubscriptionDelta(new Map(), ['GBPUSD.c', 'XAUUSDm'], 1);
  counts = applyQuoteSubscriptionDelta(counts, ['GBPUSD'], 1);
  counts = applyQuoteSubscriptionDelta(counts, ['GBPUSD.c'], -1);

  const active = buildActiveQuoteSymbols(['BTCUSDm'], counts).sort();

  assert.deepEqual(active, ['BTCUSDm', 'GBPUSD', 'XAUUSDm']);
});

test('quote transport expansion never subscribes guessed base symbols for broker variants', () => {
  assert.deepEqual(resolveQuoteTransportSymbols('GBPUSD.c'), ['GBPUSD.c']);
  assert.deepEqual(resolveQuoteTransportSymbols('XAUUSDm'), ['XAUUSDm']);
  assert.deepEqual(resolveQuoteTransportSymbols('AUDCAD'), ['AUDCAD']);
  assert.deepEqual(resolveQuoteTransportSymbols('EURUSD.X1782'), ['EURUSD.X1782']);
  assert.deepEqual(
    expandQuoteTransportSymbols(['GBPUSD.c', 'GBPUSD', 'XAUUSDm']),
    ['GBPUSD.c', 'GBPUSD', 'XAUUSDm'],
  );
});

test('quote transport symbols are normalized to the uppercase backend contract', () => {
  assert.equal(normalizeQuoteTransportSymbol('xauusd'), 'XAUUSD');
  assert.equal(normalizeQuoteTransportSymbol('btcusd'), 'BTCUSD');
  assert.deepEqual(resolveQuoteTransportSymbols('gbpusd'), ['GBPUSD']);
  assert.deepEqual(
    expandQuoteTransportSymbols(['xauusd', 'btcusd', 'gbpusd']),
    ['XAUUSD', 'BTCUSD', 'GBPUSD'],
  );
});

test('empty or zero-count symbols are ignored when building active quote subscriptions', () => {
  const active = buildActiveQuoteSymbols(['', 'BTCUSDm'], new Map([['EURUSD', 0], ['GBPUSD.c', 2]])).sort();

  assert.deepEqual(active, ['BTCUSDm', 'GBPUSD.c']);
});

test('quote websocket service sends subscription diffs and tracks acknowledgements', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/api/ws/quotesSocket/QuotesWebSocketService.ts'), 'utf8');

  assert.match(source, /private sentSymbols: Set<string> = new Set\(\)/);
  assert.match(source, /private pendingSubscribeSymbols: Set<string> = new Set\(\)/);
  assert.match(source, /private pendingUnsubscribeSymbols: Set<string> = new Set\(\)/);
  assert.match(source, /private confirmedSymbols: Set<string> = new Set\(\)/);
  assert.match(source, /private sendSubscriptionDiff\(nextDesiredSymbols: Set<string>\): void/);
  assert.match(source, /this\.usesFeedProtocol\(\)[\s\S]*\{ type: 'unsubscribe', symbols: unsubscribeSymbols \}/);
  assert.match(source, /this\.usesFeedProtocol\(\)[\s\S]*\{ type: 'subscribe', symbols: subscribeSymbols \}/);
  assert.match(source, /const ack = extractSubscriptionAck\(payload\)/);
  assert.match(source, /this\.handleSubscriptionAckPayload\(payload\)/);
  assert.match(source, /this\.markSymbolsConfirmed\(\[symbol, tick\.symbol, tick\.rawSymbol \?\? ''\]\)/);
});

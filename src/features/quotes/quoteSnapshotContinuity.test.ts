import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveQuoteActionAvailability } from '../../market/quoteIntegrity';
import { applyLiveQuoteTickToSnapshot, type LiveQuoteSnapshot } from './liveQuoteSnapshot';
import { markQuoteSnapshotUnavailable, QuoteSnapshotContinuity } from './quoteSnapshotContinuity';

const now = 1_800_000_000_000;
const quote: LiveQuoteSnapshot = {
  symbol: 'EURUSD.PRO', bid: 1.12, ask: 1.1202, digits: 5,
  transport: 'websocket', stale: false, tradable: true, degraded: false,
  lastReceivedAt: now, lastTickAt: now, feedTickAt: now, updateSeq: 17,
};
const scope = { sessionKey: 'broker:account:activation-1', credentialKey: 'token-1' };

test('same-session token rotation retains actual prices but rejects execution until a new tick', () => {
  const cache = new QuoteSnapshotContinuity();
  cache.retain(scope, quote.symbol, quote);
  assert.equal(cache.read(scope, quote.symbol), quote);
  const rotated = { ...scope, credentialKey: 'token-2' };
  const retained = cache.read(rotated, quote.symbol)!;
  assert.equal(retained.bid, quote.bid);
  assert.equal(retained.ask, quote.ask);
  assert.equal(retained.lastReceivedAt, now);
  assert.equal(retained.feedTickAt, now);
  assert.equal(retained.updateSeq, 17);
  assert.equal(retained.stale, true);
  assert.equal(retained.tradable, false);
  assert.equal(retained.degraded, true);
  assert.equal(resolveQuoteActionAvailability(retained, now).allowed, false);
  const fresh = applyLiveQuoteTickToSnapshot(quote.symbol, retained, {
    symbol: quote.symbol, bid: 1.13, ask: 1.1302, transport: 'websocket',
    tradable: true, stale: false, degraded: false, timestamp: now + 1,
    feedTickAt: now + 1, receivedAt: now + 1,
  }, 18)!;
  cache.retain(rotated, quote.symbol, fresh);
  assert.equal(cache.read(rotated, quote.symbol), fresh);
  assert.equal(fresh.bid, 1.13);
  assert.equal(fresh.stale, false);
});

test('broker/account activation changes, logout, and explicit reset discard retained prices', () => {
  const cache = new QuoteSnapshotContinuity();
  cache.retain(scope, quote.symbol, quote);
  assert.equal(cache.read({ ...scope, sessionKey: 'another-activation' }, quote.symbol), undefined);
  assert.equal(cache.read(scope, quote.symbol), undefined);
  cache.retain(scope, quote.symbol, quote);
  assert.equal(cache.read({ sessionKey: '', credentialKey: '' }, quote.symbol), undefined);
  assert.equal(cache.read(scope, quote.symbol), undefined);
  cache.retain(scope, quote.symbol, quote);
  cache.clear();
  assert.equal(cache.read(scope, quote.symbol), undefined);
});

test('invalid quote values cannot replace the retained valid price and exact symbols remain separate', () => {
  const cache = new QuoteSnapshotContinuity();
  cache.retain(scope, quote.symbol, quote);
  for (const invalid of [undefined, { ...quote, bid: Number.NaN }, { ...quote, bid: 0 }, { ...quote, ask: 1 }]) {
    cache.retain(scope, quote.symbol, invalid);
    assert.equal(cache.read(scope, quote.symbol), quote);
  }
  assert.equal(cache.read(scope, 'EURUSD'), undefined);
  assert.equal(cache.read(scope, 'EURUSD.PRO.A'), undefined);
});

test('an unavailable update changes flags without manufacturing or erasing any price or timestamp', () => {
  assert.equal(markQuoteSnapshotUnavailable(undefined), undefined);
  const retained = markQuoteSnapshotUnavailable(quote)!;
  assert.deepEqual(retained, { ...quote, stale: true, tradable: false, degraded: true });
  assert.equal(resolveQuoteActionAvailability(retained, now).allowed, false);
  assert.equal(quote.stale, false);
});

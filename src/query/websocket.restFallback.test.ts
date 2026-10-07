import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildRestQuoteTickEvent } from './restQuoteTick';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('buildRestQuoteTickEvent marks a REST quote as display-only', () => {
  const receivedAt = 1_764_059_100_000;
  const tick = buildRestQuoteTickEvent(
    'BTCUSD',
    {
      symbol: 'BTCUSD',
      bid: 77522.17,
      ask: 77528.5,
      digits: 2,
      volume: 4407,
      updatedAt: '2026-05-25T10:40:00.000Z',
    },
    receivedAt,
  );

  assert.ok(tick);
  assert.equal(tick.symbol, 'BTCUSD');
  assert.equal(tick.bid, 77522.17);
  assert.equal(tick.ask, 77528.5);
  assert.equal(tick.digits, 2);
  assert.equal(tick.volume, 4407);
  assert.equal(tick.receivedAt, receivedAt);
  assert.equal(tick.feedTickAt, Date.parse('2026-05-25T10:40:00.000Z'));
  assert.equal(tick.transport, 'rest_snapshot');
  assert.equal(tick.tradable, false);
});

test('buildRestQuoteTickEvent rejects snapshots without a usable bid/ask pair', () => {
  assert.equal(
    buildRestQuoteTickEvent('BTCUSD', { symbol: 'BTCUSD', lastPrice: 77522.17 }, 1_764_059_100_000),
    null,
  );
});

test('live symbol REST repair retries transient failures but stops for an exact websocket quote', () => {
  const source = readSource('src/query/websocket.ts');

  assert.match(
    source,
    /const liveQuote = useTradingState\.getState\(\)\.quotes\[entry\.symbol\];[\s\S]*if \(isFreshLiveQuote\(liveQuote\) && hasExactQuotePair\(liveQuote\)\) \{\s*return 'resolved';\s*\}/,
  );
  assert.match(source, /LIVE_SYMBOL_REST_RETRY_DELAYS_MS = \[0, 750, 2_000, 4_000\] as const/);
  assert.match(source, /const scheduleRestQuoteSnapshotFallback = \(entry: RestQuoteFallbackEntry\): void =>/);
  assert.match(source, /if \(outcome !== 'retry'\) \{\s*entry\.completed = true;/);
  assert.match(source, /hasObservedDirectSymbolTick\(entry\)/);
  assert.match(
    source,
    /entry\.completed && !hasObservedDirectSymbolTick\(entry\)[\s\S]*entry\.attemptCount = 0;[\s\S]*entry\.completed = false;/,
  );
  assert.match(source, /clearTimeout\(activeEntry\.retryTimer\)/);
  assert.match(source, /clearTimeout\(entry\.retryTimer\)/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.doesNotMatch(source, /quotes as mockQuotes/);
});

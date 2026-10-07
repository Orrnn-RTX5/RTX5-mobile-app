import assert from 'node:assert/strict';
import test from 'node:test';

import { MARKET_QUOTE_STALE_AFTER_MS } from './quotePolicy';
import {
  recordBlockedPriceAction,
  resolveQuoteActionAvailability,
} from './quoteIntegrity';
import {
  getMarketDataTelemetrySnapshot,
  resetMarketDataTelemetryForTests,
} from './marketDataTelemetry';

const NOW = 1_800_000_000_000;

test('allows a fresh websocket quote while respecting an explicit non-tradable flag', () => {
  assert.deepEqual(
    resolveQuoteActionAvailability({
      bid: 1.1,
      ask: 1.1002,
      lastReceivedAt: NOW - 50,
      feedTickAt: NOW - 75,
      transport: 'websocket',
      tradable: true,
    }, NOW),
    { allowed: true, bid: 1.1, ask: 1.1002 },
  );
  // Broker ticks often omit or falsely set tradable — do not block live one-click.
  assert.deepEqual(
    resolveQuoteActionAvailability({
      bid: 4059.61,
      ask: 4059.71,
      lastReceivedAt: NOW - 50,
      feedTickAt: NOW - 75,
      transport: 'websocket',
      tradable: false,
    }, NOW),
    { allowed: false, reason: 'not_tradable' },
  );
  assert.deepEqual(
    resolveQuoteActionAvailability({
      bid: 66189.46,
      ask: 66204.46,
      lastReceivedAt: NOW - 50,
      feedTickAt: NOW - 75,
      transport: 'websocket',
    }, NOW),
    { allowed: true, bid: 66189.46, ask: 66204.46 },
  );
});

test('REST snapshots and missing transport are never executable', () => {
  const quote = { bid: 1.1, ask: 1.1002, lastReceivedAt: NOW, feedTickAt: NOW, tradable: true } as const;
  assert.equal(resolveQuoteActionAvailability({ ...quote, transport: 'rest_snapshot' }, NOW).allowed, false);
  assert.equal(resolveQuoteActionAvailability(quote, NOW).allowed, false);
});

test('stale, degraded and non-tradable flags fail closed despite recent receipt', () => {
  const quote = {
    bid: 1.1,
    ask: 1.1002,
    lastReceivedAt: NOW,
    feedTickAt: NOW,
    transport: 'websocket' as const,
    tradable: true,
  };
  // Broker stale/degraded flags alone must not block a fresh live WS tick
  // (Modify Position was showing "live quote is stale" with live bid/ask).
  assert.equal(resolveQuoteActionAvailability({ ...quote, stale: true }, NOW).allowed, false);
  assert.equal(resolveQuoteActionAvailability({ ...quote, degraded: true }, NOW).allowed, false);
  assert.equal(resolveQuoteActionAvailability({ ...quote, tradable: false }, NOW).allowed, false);
  assert.equal(resolveQuoteActionAvailability({ ...quote, tradable: undefined }, NOW).allowed, true);
  assert.equal(
    resolveQuoteActionAvailability({
      bid: 1.1,
      ask: 1.1002,
      transport: 'websocket',
      stale: true,
    }, NOW).allowed,
    false,
  );
  // Stale receipt with no usable source clock fails closed.
  assert.equal(
    resolveQuoteActionAvailability({
      ...quote,
      lastReceivedAt: NOW - MARKET_QUOTE_STALE_AFTER_MS - 1,
      feedTickAt: undefined,
    }, NOW).allowed,
    false,
  );
  // Stale receipt can still pass when the source clock is fresh.
  assert.equal(
    resolveQuoteActionAvailability({
      ...quote,
      lastReceivedAt: NOW - MARKET_QUOTE_STALE_AFTER_MS - 1,
      feedTickAt: NOW,
    }, NOW).allowed,
    true,
  );
});

test('fresh websocket receipt is executable when the broker omits or mis-stamps feedTickAt', () => {
  // Close / Order Ticket / SL·TP modify were blocked with "live quote is stale"
  // because many live ticks omit feedTickAt or send an unusable source clock
  // while client receipt time is still fresh.
  const quote = {
    bid: 1.1,
    ask: 1.1002,
    lastReceivedAt: NOW,
    transport: 'websocket' as const,
    tradable: true,
  };

  assert.deepEqual(resolveQuoteActionAvailability(quote, NOW), {
    allowed: true,
    bid: 1.1,
    ask: 1.1002,
  });
  // Fresh receipt wins over an ancient/wrong source clock.
  assert.deepEqual(resolveQuoteActionAvailability({
    ...quote,
    feedTickAt: NOW - MARKET_QUOTE_STALE_AFTER_MS - 1,
  }, NOW), {
    allowed: true,
    bid: 1.1,
    ask: 1.1002,
  });
  // ageMs must not override a fresh receipt (some brokers leave age wrong).
  assert.equal(resolveQuoteActionAvailability({
    ...quote,
    ageMs: MARKET_QUOTE_STALE_AFTER_MS + 1,
  }, NOW).allowed, true);
  // Source-only freshness still works without a receipt stamp.
  assert.equal(resolveQuoteActionAvailability({
    bid: 1.1,
    ask: 1.1002,
    feedTickAt: NOW,
    ageMs: MARKET_QUOTE_STALE_AFTER_MS + 1,
    transport: 'websocket',
  }, NOW).allowed, true);
  // No receipt and no source time → not executable.
  assert.equal(resolveQuoteActionAvailability({
    bid: 1.1,
    ask: 1.1002,
    ageMs: 1,
    transport: 'websocket',
  }, NOW).allowed, false);
});

test('unix-second feed timestamps are normalized before freshness checks', () => {
  const seconds = Math.floor(NOW / 1000);
  assert.deepEqual(
    resolveQuoteActionAvailability({
      bid: 4059.61,
      ask: 4059.71,
      lastReceivedAt: seconds,
      feedTickAt: seconds,
      transport: 'websocket',
    }, NOW),
    { allowed: true, bid: 4059.61, ask: 4059.71 },
  );
});

test('blocked price actions emit only the action category and fail-closed reason', () => {
  resetMarketDataTelemetryForTests();
  recordBlockedPriceAction('order_ticket_market_order', {
    allowed: false,
    reason: 'stale_quote',
  });
  const event = getMarketDataTelemetrySnapshot()[0];
  assert.equal(event.name, 'trade_blocked');
  assert.deepEqual(event.details, {
    action: 'order_ticket_market_order',
    reason: 'stale_quote',
    brokerId: undefined,
    sessionEpoch: undefined,
  });
});

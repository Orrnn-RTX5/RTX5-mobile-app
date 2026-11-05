import assert from 'node:assert/strict';
import test from 'node:test';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../../../market/quotePolicy';
import {
  resolveChartTradeActionDisabled,
  resolveChartTradeQuoteAvailability,
} from './tradeAvailability';

const NOW = 1_800_000_000_000;
const freshPublicQuote = {
  bid: 1.101,
  ask: 1.102,
  transport: 'websocket' as const,
  lastReceivedAt: NOW - 100,
  feedTickAt: NOW - 100,
};

test('one-click off still disables Buy and Sell when symbol data is stale', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: false,
    quoteActionAllowed: false,
  }), true);
});

test('one-click market disables Buy and Sell without an executable quote', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: true,
    quoteActionAllowed: false,
  }), true);
});

test('current symbol with a fresh executable quote stays enabled', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: true,
    quoteActionAllowed: true,
  }), false);
});

test('a stale rendered chart symbol cannot launch or execute a trade', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: false,
    oneClickAccepted: false,
    quoteActionAllowed: true,
  }), true);
});

test('fresh public chart quotes stay enabled so Buy/Sell can open the auth prompt', () => {
  assert.deepEqual(resolveChartTradeQuoteAvailability({
    quote: freshPublicQuote,
    isPublicDemoTradePrompt: true,
    now: NOW,
  }), { allowed: true, bid: 1.101, ask: 1.102 });
});

test('public and split chart controls reject explicit stale or degraded symbol payloads', () => {
  for (const quote of [
    { ...freshPublicQuote, stale: true },
    { ...freshPublicQuote, degraded: true },
    { ...freshPublicQuote, ageMs: MARKET_QUOTE_STALE_AFTER_MS + 1 },
    { ...freshPublicQuote, ageSec: MARKET_QUOTE_STALE_AFTER_MS / 1_000 + 1 },
  ]) {
    assert.equal(resolveChartTradeQuoteAvailability({
      quote,
      isPublicDemoTradePrompt: true,
      now: NOW,
    }).allowed, false);
  }
});

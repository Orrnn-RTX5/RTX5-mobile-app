import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  getQuoteRowFreshnessRefreshDelayMs,
  resolveQuoteRowFreshness,
} from './quoteRowFreshness';

const NOW = 1_800_000_000_000;

const freshQuote = {
  bid: 1.101,
  ask: 1.102,
  transport: 'websocket' as const,
  tradable: true,
  lastReceivedAt: NOW - 1_000,
  lastTickAt: NOW - 1_000,
  feedTickAt: NOW - 1_000,
};

test('fresh row is live only when both quote and active feed permit execution', () => {
  assert.deepEqual(
    resolveQuoteRowFreshness(freshQuote, { actionsAllowed: true }, NOW),
    { status: 'live', label: null, executable: true },
  );
  assert.deepEqual(
    resolveQuoteRowFreshness(freshQuote, {
      actionsAllowed: false,
      reasonCategory: 'provider_connectivity',
    }, NOW),
    { status: 'delayed', label: 'DELAYED', executable: false },
  );
});

test('old local/source timestamps and stale feed health remain stale and non-executable', () => {
  assert.deepEqual(
    resolveQuoteRowFreshness({
      ...freshQuote,
      lastReceivedAt: NOW - 16_000,
      lastTickAt: NOW - 16_000,
      feedTickAt: NOW - 16_000,
    }, { actionsAllowed: true }, NOW),
    { status: 'stale', label: 'STALE', executable: false },
  );
  assert.deepEqual(
    resolveQuoteRowFreshness(freshQuote, {
      actionsAllowed: false,
      reasonCategory: 'local_tick_stale',
    }, NOW),
    { status: 'stale', label: 'STALE', executable: false },
  );
});

test('snapshot prices are delayed and a fresh websocket row schedules one expiry repaint', () => {
  assert.deepEqual(
    resolveQuoteRowFreshness({
      ...freshQuote,
      transport: 'rest_snapshot',
      tradable: false,
    }, { actionsAllowed: true }, NOW),
    { status: 'delayed', label: 'DELAYED', executable: false },
  );
  assert.equal(getQuoteRowFreshnessRefreshDelayMs(freshQuote, NOW), 14_001);
  assert.equal(getQuoteRowFreshnessRefreshDelayMs({
    ...freshQuote,
    lastReceivedAt: NOW - 16_000,
    feedTickAt: NOW - 16_000,
  }, NOW), null);
});

test('QuotesScreen keeps freshness safety while showing percentage change beside the symbol', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/quotes/QuotesScreen.tsx'), 'utf8');

  assert.match(source, /resolveQuoteRowFreshness\(/);
  assert.match(source, /getQuoteRowFreshnessRefreshDelayMs\(/);
  assert.match(source, /setTimeout\(\(\) => setFreshnessEvaluationNow\(Date\.now\(\)\), refreshDelayMs\)/);
  assert.match(source, /const hasDelayedPrice = !noData && rowFreshness\.status !== 'live'/);
  assert.match(source, /const showBidCaret = !noData && !hasDelayedPrice/);
  assert.match(source, /\{!isSimpleMode \? \(/);
  assert.match(source, /sc\.changePill/);
  assert.match(source, /\{noData \? '--' : pct\}/);
  assert.doesNotMatch(source, /\{hasDelayedPrice \? \(/);
  assert.doesNotMatch(source, /rowFreshness\.label/);
  assert.doesNotMatch(source, /sc\.freshnessBadge/);
  // Card surface stays on the normal Quotes palette even when the quote is stale.
  assert.match(source, /borderColor: cardBorder/);
  assert.match(source, /\{ backgroundColor: cardBackground \}/);
  assert.doesNotMatch(source, /stalePriceOverlay/);
  assert.match(source, /feedHealthAllowsPriceActions\(scopedFeedHealth\)/);
});

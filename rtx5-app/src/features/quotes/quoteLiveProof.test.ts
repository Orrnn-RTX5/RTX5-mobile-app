import assert from 'node:assert/strict';
import test from 'node:test';

import type { QuoteTickEvent } from '../../api/ws/quoteTickNormalizer';
import {
  advanceQuoteLiveProof,
  createQuoteLiveProofState,
  hasFreshAcceptedQuoteLiveProof,
  hasFreshSustainedQuoteLiveProof,
} from './quoteLiveProof';

const REQUESTED = new Set(['EURUSD', 'XAUUSD']);
const STALE_AFTER_MS = 15_000;

const tick = (
  receivedAt: number,
  overrides: Partial<QuoteTickEvent> = {},
): QuoteTickEvent => ({
  symbol: 'EURUSD',
  rawSymbol: 'EURUSD',
  bid: 1.1,
  ask: 1.1002,
  transport: 'websocket',
  feedTickAt: receivedAt - 25,
  receivedAt,
  timestamp: receivedAt - 25,
  ...overrides,
});

test('only requested websocket bid/ask frames with a real server timestamp qualify', () => {
  const initial = createQuoteLiveProofState();
  for (const rejected of [
    tick(10_000, { transport: 'rest_snapshot' }),
    tick(10_000, { symbol: 'GBPUSD', rawSymbol: 'GBPUSD' }),
    tick(10_000, { bid: Number.NaN }),
    tick(10_000, { ask: 1.09 }),
    tick(10_000, { feedTickAt: undefined }),
    tick(10_000, { feedTickAt: Number.NaN }),
    tick(20_000, { feedTickAt: 4_999 }),
    tick(10_000, { feedTickAt: 15_001 }),
    tick(10_000, { stale: true }),
    tick(10_000, { degraded: true }),
  ]) {
    const result = advanceQuoteLiveProof(initial, rejected, REQUESTED, STALE_AFTER_MS);
    assert.equal(result.accepted, false);
    assert.equal(result.state, initial);
  }

  assert.equal(
    advanceQuoteLiveProof(initial, tick(10_000), REQUESTED, STALE_AFTER_MS).accepted,
    true,
  );
});

test('LIVE proof requires at least three qualifying ticks spanning three seconds', () => {
  let state = createQuoteLiveProofState();
  state = advanceQuoteLiveProof(state, tick(10_000), REQUESTED, STALE_AFTER_MS).state;
  state = advanceQuoteLiveProof(state, tick(11_500), REQUESTED, STALE_AFTER_MS).state;
  state = advanceQuoteLiveProof(state, tick(12_999), REQUESTED, STALE_AFTER_MS).state;
  assert.equal(state.sustained, false);

  state = advanceQuoteLiveProof(state, tick(13_000), REQUESTED, STALE_AFTER_MS).state;
  assert.equal(state.sustained, true);
  assert.equal(hasFreshSustainedQuoteLiveProof(state, 13_250, STALE_AFTER_MS), true);
});

test('one accepted tick proves a fresh display-only public feed without weakening sustained proof', () => {
  const state = advanceQuoteLiveProof(
    createQuoteLiveProofState(),
    tick(10_000),
    REQUESTED,
    STALE_AFTER_MS,
  ).state;

  assert.equal(hasFreshAcceptedQuoteLiveProof(state, 10_250, STALE_AFTER_MS), true);
  assert.equal(hasFreshSustainedQuoteLiveProof(state, 10_250, STALE_AFTER_MS), false);
  assert.equal(hasFreshAcceptedQuoteLiveProof(state, 25_001, STALE_AFTER_MS), false);
});

test('a stale gap starts a new proof window instead of reviving old LIVE state', () => {
  let state = createQuoteLiveProofState();
  state = advanceQuoteLiveProof(state, tick(10_000), REQUESTED, STALE_AFTER_MS).state;
  state = advanceQuoteLiveProof(state, tick(11_000), REQUESTED, STALE_AFTER_MS).state;
  state = advanceQuoteLiveProof(state, tick(13_000), REQUESTED, STALE_AFTER_MS).state;
  assert.equal(state.sustained, true);
  assert.equal(hasFreshSustainedQuoteLiveProof(state, 28_001, STALE_AFTER_MS), false);

  state = advanceQuoteLiveProof(state, tick(28_001), REQUESTED, STALE_AFTER_MS).state;
  assert.deepEqual(state, {
    qualifyingTickCount: 1,
    firstQualifyingTickAt: 28_001,
    lastQualifyingTickAt: 28_001,
    sustained: false,
  });
});

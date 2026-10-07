import assert from 'node:assert/strict';
import test from 'node:test';
import { isQuoteRowLive, reconcileVisibleQuoteSymbols, QUOTE_INITIAL_LIVE_ROW_COUNT } from './quoteRowActivity';

test('the first screenful receives ticks before the first viewability callback', () => {
  const visible = new Set<string>();
  for (let index = 0; index < QUOTE_INITIAL_LIVE_ROW_COUNT; index += 1) {
    assert.equal(isQuoteRowLive(true, `symbol.${index}`, index, visible), true);
  }
  assert.equal(isQuoteRowLive(true, 'offscreen', QUOTE_INITIAL_LIVE_ROW_COUNT, visible), false);
});

test('scrolling moves subscriptions to visible exact symbols without keeping the full render window live', () => {
  const first = reconcileVisibleQuoteSymbols(new Set(), ['EURUSD.pro', 'USDJPY']);
  assert.equal(isQuoteRowLive(true, 'EURUSD.pro', 30, first), true);
  assert.equal(isQuoteRowLive(true, 'EURUSD', 31, first), false);
  const next = reconcileVisibleQuoteSymbols(first, ['GBPUSD']);
  assert.equal(isQuoteRowLive(true, 'EURUSD.pro', 30, next), false);
  assert.equal(isQuoteRowLive(true, 'GBPUSD', 32, next), true);
  assert.equal(isQuoteRowLive(false, 'GBPUSD', 32, next), false);
  assert.equal(isQuoteRowLive(false, 'GBPUSD', 0, next), false);
});

test('rapid filtering and reorder activate a new first screenful with an old viewport snapshot', () => {
  const oldViewport = new Set(['old.symbol']);
  assert.equal(isQuoteRowLive(true, 'new.symbol', 0, oldViewport), true);
  assert.equal(isQuoteRowLive(true, 'old.symbol', 45, oldViewport), true);
});

test('equivalent viewability reports preserve state identity', () => {
  const previous = new Set(['EURUSD', 'USDJPY']);
  assert.equal(reconcileVisibleQuoteSymbols(previous, ['USDJPY', 'EURUSD', 'EURUSD']), previous);
  assert.notEqual(reconcileVisibleQuoteSymbols(previous, []), previous);
});

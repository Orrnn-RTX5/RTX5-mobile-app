import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldScrollTradingSummary } from './summaryViewport';

test('ordinary portrait and tall tablet windows keep their summaries pinned', () => {
  assert.equal(shouldScrollTradingSummary({ availableHeight: 780, fontScale: 1 }), false);
  assert.equal(shouldScrollTradingSummary({ availableHeight: 980, fontScale: 1.5 }), false);
});

test('landscape and split-screen heights scroll the complete summary with records', () => {
  assert.equal(shouldScrollTradingSummary({ availableHeight: 310, fontScale: 1 }), true);
  assert.equal(shouldScrollTradingSummary({ availableHeight: 480, fontScale: 1 }), true);
});

test('large accessibility text gets scrolling space without shrinking its font', () => {
  assert.equal(shouldScrollTradingSummary({ availableHeight: 780, fontScale: 2 }), true);
  assert.equal(shouldScrollTradingSummary({ availableHeight: 600, fontScale: 1.3 }), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveQuoteCardLayout } from './quoteCardLayout';

test('ordinary 320 to 430dp phones keep compact inline quote rows', () => {
  for (const width of [320, 360, 375, 390, 430]) {
    const layout = resolveQuoteCardLayout(width);
    assert.equal(layout.stacked, false, `${width}dp must not stack normal text`);
    const symbolSpace = layout.contentWidth - layout.priceColumnWidth * 2 - layout.priceGap - layout.columnGap;
    assert.ok(symbolSpace >= 100, `${width}dp must retain symbol space`);
    assert.ok(layout.priceColumnWidth >= 64, `${width}dp must retain both price columns`);
  }
});

test('small windows and enlarged text stack only when the columns cannot fit', () => {
  assert.equal(resolveQuoteCardLayout(280).stacked, true);
  assert.equal(resolveQuoteCardLayout(360, 1.2).stacked, false);
  assert.equal(resolveQuoteCardLayout(360, 1.5).stacked, true);
  assert.equal(resolveQuoteCardLayout(768, 1.5).stacked, false);
});

test('stacked price columns stay inside the card instead of widening it', () => {
  for (const width of [280, 320, 360]) {
    const layout = resolveQuoteCardLayout(width, 2);
    assert.equal(layout.stacked, true);
    assert.ok(layout.priceColumnWidth * 2 + layout.priceGap <= layout.contentWidth);
  }
});

test('rotation and safe-area reduced widths recalculate quote geometry', () => {
  assert.equal(resolveQuoteCardLayout(360).compact, false);
  assert.equal(resolveQuoteCardLayout(320).compact, true);
  assert.equal(resolveQuoteCardLayout(844 - 59 * 2).stacked, false);
});

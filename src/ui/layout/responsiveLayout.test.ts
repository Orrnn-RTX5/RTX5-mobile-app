import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveResponsiveLayout } from './responsiveLayout';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

test('small phone content fits inside the usable viewport', () => {
  const layout = resolveResponsiveLayout({ width: 320, height: 568 }, { ...noInsets, top: 20, bottom: 16 });
  assert.equal(layout.availableWidth, 320);
  assert.equal(layout.availableHeight, 532);
  assert.equal(layout.isCompact, true);
  assert.ok(layout.contentMaxWidth <= layout.availableWidth);
});

test('landscape cutouts and system navigation are excluded from usable space', () => {
  const layout = resolveResponsiveLayout({ width: 844, height: 390 }, { top: 0, bottom: 21, left: 59, right: 59 });
  assert.equal(layout.availableWidth, 726);
  assert.equal(layout.availableHeight, 369);
  assert.equal(layout.isLandscape, true);
  assert.equal(layout.isShort, true);
});

test('tablet split view follows app-window width rather than the device model', () => {
  const full = resolveResponsiveLayout({ width: 1024, height: 1366 }, noInsets);
  const split = resolveResponsiveLayout({ width: 375, height: 1366 }, noInsets);
  assert.equal(full.isWide, true);
  assert.equal(split.isWide, false);
  assert.ok(split.contentMaxWidth <= 375);
});

test('large text switches to compact layout without reducing font scale', () => {
  const layout = resolveResponsiveLayout({ width: 430, height: 932, fontScale: 1.5 }, noInsets);
  assert.equal(layout.isCompact, true);
  assert.equal(layout.fontScale, 1.5);
});

test('rotation and keyboard resize produce new usable dimensions', () => {
  const portrait = resolveResponsiveLayout({ width: 390, height: 844 }, noInsets);
  const rotated = resolveResponsiveLayout({ width: 844, height: 390 }, noInsets);
  const keyboard = resolveResponsiveLayout({ width: 390, height: 360 }, noInsets);
  assert.equal(portrait.isLandscape, false);
  assert.equal(rotated.isLandscape, true);
  assert.equal(keyboard.isShort, true);
});

test('temporary zero measurements and invalid insets never yield negative layout sizes', () => {
  const layout = resolveResponsiveLayout({ width: 0, height: NaN, fontScale: 0 }, { top: Infinity, bottom: 50, left: -10, right: 50 });
  assert.equal(layout.availableWidth, 1);
  assert.equal(layout.availableHeight, 1);
  assert.equal(layout.fontScale, 1);
});

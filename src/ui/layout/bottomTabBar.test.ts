import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBottomTabBarHeight, resolveBottomTabBarLayout } from './bottomTabBar';

test('tab bar preserves the bottom safe area on small phones and tablets', () => {
  for (const [width, height, bottom] of [
    [320, 568, 0],
    [390, 844, 34],
    [768, 1024, 20],
    [1024, 768, 20],
  ]) {
    const layout = resolveBottomTabBarLayout({
      availableWidth: width,
      viewportHeight: height,
      safeAreaBottom: bottom,
      isLandscape: width > height,
    });
    assert.ok(layout.paddingBottom >= bottom);
    assert.ok(layout.height - bottom >= 44, 'bar must retain a full touch target');
    assert.ok(layout.height < height / 4, 'navigation must leave room for screen content');
  }
});

test('short portrait windows use compact chrome without pretending to be landscape', () => {
  const layout = resolveBottomTabBarLayout({
    availableWidth: 320,
    viewportHeight: 480,
    safeAreaBottom: 0,
    isLandscape: false,
  });
  assert.equal(layout.height, 66);
  assert.equal(layout.paddingTop, 4);
  assert.equal(layout.useInlineLabels, false);
  assert.ok(layout.height < resolveBottomTabBarHeight({ safeAreaBottom: 0, viewportHeight: 800 }));
});

test('large text fits inside compact tab bars rather than clipping under system controls', () => {
  const layout = resolveBottomTabBarLayout({
    availableWidth: 568,
    viewportHeight: 320,
    safeAreaBottom: 21,
    isLandscape: true,
    fontScale: 2,
  });
  const renderedContentHeight = 28 + 16 * 1.6 + 4;
  assert.ok(layout.height - layout.paddingTop - layout.paddingBottom >= renderedContentHeight);
  assert.equal(layout.useInlineLabels, false);
});

test('inline tab labels require actual item width and account for larger text', () => {
  const layout = (availableWidth: number, fontScale: number) => resolveBottomTabBarLayout({
    availableWidth,
    viewportHeight: 360,
    safeAreaBottom: 0,
    isLandscape: true,
    fontScale,
  });
  assert.equal(layout(480, 1).useInlineLabels, false);
  assert.equal(layout(568, 1).useInlineLabels, true);
  assert.equal(layout(568 - 88, 1).useInlineLabels, false);
  assert.equal(layout(568, 1.6).useInlineLabels, false);
  assert.equal(layout(1024, 1.6).useInlineLabels, true);
});

test('chart dock and navigation can reserve exactly the same height after rotation', () => {
  const input = {
    availableWidth: 756,
    viewportHeight: 390,
    safeAreaBottom: 21,
    isLandscape: true,
    fontScale: 1.4,
  };
  assert.equal(resolveBottomTabBarLayout(input).height, resolveBottomTabBarHeight({ ...input, isChartTab: true }));
  assert.equal(resolveBottomTabBarHeight({ safeAreaBottom: -5 }), 86);
});

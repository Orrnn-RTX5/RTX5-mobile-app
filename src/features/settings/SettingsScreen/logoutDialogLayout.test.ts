import assert from 'node:assert/strict';
import test from 'node:test';
import { getLogoutDialogLayout } from './logoutDialogLayout';

const insets = { top: 48, bottom: 24, left: 0, right: 0 };

test('logout keeps stable safe bounds and balanced padding for a content-sized card', () => {
  const frame = getLogoutDialogLayout(360, 800, 1, insets);
  assert.equal(frame.width, 320);
  assert.equal(frame.maxHeight, 688);
  assert.equal(frame.contentPaddingVertical, 20);
  assert.equal(frame.contentPaddingHorizontal, 24);
  assert.ok(!('height' in frame), 'short content must not be stretched into a fixed-height card');
  assert.equal(frame.stackActions, false);
  assert.equal(frame.viewportHeight, 800);
  assert.ok(Object.isFrozen(frame));
  const nextInsets = { ...insets, bottom: 0 };
  getLogoutDialogLayout(360, 760, 1, nextInsets);
  assert.equal(frame.maxHeight, 688);
  assert.equal(frame.paddingBottom, 44, 'an opened frame does not share mutable inset state');
});

test('large fonts stack the actions while content can grow within safe scroll bounds', () => {
  const large = getLogoutDialogLayout(430, 900, 2, insets);
  assert.equal(large.width, 380);
  assert.equal(large.maxHeight, 788);
  assert.equal(large.stackActions, true);
  const short = getLogoutDialogLayout(320, 300, 2, insets);
  assert.equal(short.width, 280);
  assert.equal(short.maxHeight + short.paddingTop + short.paddingBottom, 300);
  assert.equal(short.contentPaddingHorizontal, 20);
});

test('landscape, side cutouts and constrained windows fit without negative card sizes', () => {
  const landscape = getLogoutDialogLayout(800, 360, 1, { top: 0, bottom: 24, left: 48, right: 48 });
  assert.equal(landscape.width, 380);
  assert.equal(landscape.maxHeight, 296);
  assert.equal(landscape.paddingLeft, 68);
  assert.equal(landscape.paddingRight, 68);
  assert.ok(landscape.maxHeight <= landscape.viewportHeight - landscape.paddingTop - landscape.paddingBottom);
  const constrained = getLogoutDialogLayout(30, 60, 1, insets);
  assert.equal(constrained.width, 0);
  assert.equal(constrained.maxHeight, 0);
});

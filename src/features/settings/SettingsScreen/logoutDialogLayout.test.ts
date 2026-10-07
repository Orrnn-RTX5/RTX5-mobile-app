import assert from 'node:assert/strict';
import test from 'node:test';
import { getLogoutDialogLayout } from './logoutDialogLayout';

const insets = { top: 48, bottom: 24, left: 0, right: 0 };

test('logout has a complete stable card frame before native content measurement', () => {
  const frame = getLogoutDialogLayout(360, 800, 1, insets);
  assert.equal(frame.width, 320);
  assert.equal(frame.height, 240);
  assert.equal(frame.viewportHeight, 800);
  assert.ok(Object.isFrozen(frame));
  const nextInsets = { ...insets, bottom: 0 };
  getLogoutDialogLayout(360, 760, 1, nextInsets);
  assert.equal(frame.height, 240);
  assert.equal(frame.paddingBottom, 44, 'an opened frame does not share mutable inset state');
});

test('large fonts receive more room while the scrollable card remains within safe bounds', () => {
  const large = getLogoutDialogLayout(430, 900, 2, insets);
  assert.equal(large.width, 360);
  assert.equal(large.height, 480);
  const short = getLogoutDialogLayout(320, 300, 2, insets);
  assert.equal(short.width, 280);
  assert.equal(short.height + short.paddingTop + short.paddingBottom, 300);
});

test('landscape, side cutouts and constrained windows fit without negative card sizes', () => {
  const landscape = getLogoutDialogLayout(800, 360, 1, { top: 0, bottom: 24, left: 48, right: 48 });
  assert.equal(landscape.width, 360);
  assert.equal(landscape.height, 240);
  assert.ok(landscape.height <= landscape.viewportHeight - landscape.paddingTop - landscape.paddingBottom);
  const constrained = getLogoutDialogLayout(30, 60, 1, insets);
  assert.equal(constrained.width, 0);
  assert.equal(constrained.height, 0);
});

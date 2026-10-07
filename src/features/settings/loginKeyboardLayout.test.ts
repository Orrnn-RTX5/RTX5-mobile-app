import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLoginFieldScrollOffset } from './loginKeyboardLayout';

const layout = {
  fieldTop: 480, fieldHeight: 90, viewportTop: 100,
  viewportHeight: 700, keyboardTop: 500, scrollOffset: 0,
};

test('a keyboard covering Password scrolls the entire field above it with a gap', () => {
  assert.equal(resolveLoginFieldScrollOffset(layout), 86);
});

test('native resize and overlay keyboard layouts produce the same scroll offset', () => {
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, viewportHeight: 400 }), 86);
});

test('a visible field stays in place and moving focus upward scrolls back only as needed', () => {
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, fieldTop: 200, scrollOffset: 180 }), 180);
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, fieldTop: 80, scrollOffset: 180 }), 144);
});

test('switching to a taller keyboard or a smaller landscape viewport keeps the input above it', () => {
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, keyboardTop: 420 }), 166);
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, viewportHeight: 280 }), 206);
});

test('scroll offsets never become negative and invalid measurements do not move the form', () => {
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, fieldTop: 80, scrollOffset: 10 }), 0);
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, fieldHeight: 0 }), 0);
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, viewportHeight: 0 }), 0);
  assert.equal(resolveLoginFieldScrollOffset({ ...layout, keyboardTop: NaN }), 0);
});

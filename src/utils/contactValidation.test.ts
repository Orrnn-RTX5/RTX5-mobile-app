import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidEmail, isValidPhoneNumber } from './contactValidation';

test('isValidEmail accepts normal addresses', () => {
  assert.equal(isValidEmail('trader@example.com'), true);
  assert.equal(isValidEmail('first.last+demo@sub.domain.co'), true);
  assert.equal(isValidEmail('  padded@example.org  '), true);
});

test('isValidEmail rejects malformed addresses', () => {
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('   '), false);
  assert.equal(isValidEmail('plainaddress'), false);
  assert.equal(isValidEmail('missing-at.example.com'), false);
  assert.equal(isValidEmail('no-tld@example'), false);
  assert.equal(isValidEmail('one-char-tld@example.c'), false);
  assert.equal(isValidEmail('two@ats@example.com'), false);
  assert.equal(isValidEmail('has space@example.com'), false);
  assert.equal(isValidEmail(`${'a'.repeat(250)}@example.com`), false);
});

test('isValidPhoneNumber accepts national and international formats', () => {
  assert.equal(isValidPhoneNumber('5551234567'), true);
  assert.equal(isValidPhoneNumber('+15551234567'), true);
  assert.equal(isValidPhoneNumber('(555) 123-4567'), true);
  assert.equal(isValidPhoneNumber('555.123.4567'), true);
  assert.equal(isValidPhoneNumber('+44 20 7946 0958'), true);
  assert.equal(isValidPhoneNumber('1234567'), true); // 7-digit minimum
  assert.equal(isValidPhoneNumber('123456789012345'), true); // 15-digit E.164 max
});

test('isValidPhoneNumber rejects junk input', () => {
  assert.equal(isValidPhoneNumber(''), false);
  assert.equal(isValidPhoneNumber('   '), false);
  assert.equal(isValidPhoneNumber('123456'), false); // too short
  assert.equal(isValidPhoneNumber('1234567890123456'), false); // too long
  assert.equal(isValidPhoneNumber('555-CALL-NOW'), false); // letters
  assert.equal(isValidPhoneNumber('++15551234567'), false); // double plus
  assert.equal(isValidPhoneNumber('555 1234 ext 9'), false); // extension text
  assert.equal(isValidPhoneNumber('+'), false);
});

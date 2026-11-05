import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DICTIONARIES,
  SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  translate,
  translateAccountCardName,
} from './translations.ts';

test('normalizeLanguageCode keeps supported languages', () => {
  assert.equal(normalizeLanguageCode('es'), 'es');
  assert.equal(normalizeLanguageCode('ar'), 'ar');
  assert.equal(normalizeLanguageCode('bn'), 'bn');
});

test('normalizeLanguageCode falls back to English for invalid persisted values', () => {
  assert.equal(normalizeLanguageCode('xx'), 'en');
  assert.equal(normalizeLanguageCode(null), 'en');
});

test('translate returns selected language labels and falls back to English keys', () => {
  assert.equal(translate('Settings', 'es'), 'Ajustes');
  assert.equal(translate('Today', 'es'), 'Hoy');
  assert.equal(translate('Loading positions...', 'de'), 'Positionen werden geladen...');
  assert.equal(translate('Language Preference', 'bn'), 'ভাষা পছন্দ');
  assert.equal(translate('Select language', 'bn'), 'ভাষা নির্বাচন করুন');
  assert.equal(translate('Standard', 'bn'), 'স্ট্যান্ডার্ড');
  assert.equal(translate('Other Accounts', 'bn'), 'অন্যান্য অ্যাকাউন্ট');
  assert.equal(translate('Closed Trade History', 'bn'), 'বন্ধ ট্রেড ইতিহাস');
  assert.equal(translate('Acc. Leverage', 'bn'), 'অ্যাকাউন্ট লিভারেজ');
  assert.equal(translate('Required Margin', 'bn'), 'প্রয়োজনীয় মার্জিন');
  assert.equal(translate('Updated', 'bn'), 'আপডেট');
  assert.equal(translate('Speed', 'bn'), 'গতি');
  assert.equal(translate('Status', 'bn'), 'স্থিতি');
  assert.equal(translate('Price', 'bn'), 'মূল্য');
  assert.equal(translate('Drawing Tools', 'bn'), 'ড্রয়িং টুলস');
  assert.equal(translate('Search symbol...', 'bn'), 'সিম্বল খুঁজুন...');
  assert.equal(translate('Leverage', 'hi'), 'लीवरेज');
  assert.equal(translate('Floating Profit/Loss', 'hi'), 'फ्लोटिंग P/L');
  assert.equal(translate('Demo Account', 'it'), 'Conto demo');
  assert.equal(translate('Open Demo Account', 'it'), 'Apri un conto demo');
  assert.equal(translate('Broker Login', 'bn'), 'ব্রোকার লগইন');
  assert.equal(translate('Login to an existing account', 'bn'), 'বিদ্যমান অ্যাকাউন্টে লগইন করুন');
  assert.equal(translate('Demo Account', 'bn'), 'ডেমো অ্যাকাউন্ট');
  assert.equal(translate('Enter company or server name', 'bn'), 'কোম্পানি বা সার্ভারের নাম লিখুন');
  assert.equal(translate('Connect Live Account', 'bn'), 'লাইভ অ্যাকাউন্ট কানেক্ট করুন');
  assert.equal(translate('Unmapped runtime label', 'es'), 'Unmapped runtime label');
});

test('translateAccountCardName localizes only built-in account-card names', () => {
  const tBn = (key: string) => translate(key, 'bn');

  assert.equal(translateAccountCardName('Standard', tBn), 'স্ট্যান্ডার্ড');
  assert.equal(translateAccountCardName('Account 123456', tBn), 'অ্যাকাউন্ট 123456');
  assert.equal(translateAccountCardName('Personal Alpha', tBn), 'Personal Alpha');
});

test('every supported language has a dictionary path for stable selection', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(DICTIONARIES[language.code], `${language.code} dictionary is registered`);
    assert.equal(normalizeLanguageCode(language.code), language.code);
    assert.ok(translate('Language Preference', language.code).length > 0);
    assert.ok(translate('Select language', language.code).length > 0);
    assert.ok(translate('Updated', language.code).length > 0);
    assert.ok(translate('Price', language.code).length > 0);
    assert.ok(translate('Drawing Tools', language.code).length > 0);
    assert.ok(translate('Broker Login', language.code).length > 0);
    assert.ok(translate('Demo Account', language.code).length > 0);
    assert.ok(translate('Connect Live Account', language.code).length > 0);
  }
});

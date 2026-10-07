import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, phoneCountrySearchDetails } from './phoneCountries';
import { filterActionSheetActions } from '../../ui/components/ActionSheet/search';

const actions = PHONE_COUNTRIES.map(country => ({
  country,
  label: `${country.flag} ${country.name}`,
  subtitle: phoneCountrySearchDetails(country),
}));
const search = (query: string) => filterActionSheetActions(actions, query, value => value).map(action => action.country.code);

test('the offline catalog covers all ISO countries and additional dialing regions with flags and valid prefixes', () => {
  assert.equal(PHONE_COUNTRIES.length, 252);
  assert.equal(new Set(PHONE_COUNTRIES.map(country => country.code)).size, 252);
  for (const country of PHONE_COUNTRIES) {
    assert.match(country.code, /^[A-Z]{2}$/);
    assert.ok(country.name.trim());
    assert.equal([...country.flag].length, 2);
    assert.ok([...country.flag].every(letter => letter.codePointAt(0)! >= 0x1F1E6 && letter.codePointAt(0)! <= 0x1F1FF));
    assert.ok(country.dialCodes.every(code => /^\+[1-9]\d{0,6}$/.test(code)));
  }
  assert.equal(DEFAULT_PHONE_COUNTRY.code, 'US');
  assert.equal(DEFAULT_PHONE_COUNTRY.flag, '🇺🇸');
  assert.deepEqual(DEFAULT_PHONE_COUNTRY.dialCodes, ['+1']);
  assert.ok(PHONE_COUNTRIES.some(country => country.code === 'XK'));
  assert.equal(PHONE_COUNTRIES.find(country => country.code === 'VA')?.dialCodes[0], '+39');
  assert.equal(PHONE_COUNTRIES.find(country => country.code === 'AC')?.dialCodes[0], '+247');
});

test('the picker filters country names, ISO codes and dialing codes with or without a plus', () => {
  assert.deepEqual(search(' united kingdom '), ['GB']);
  assert.ok(search(' aE ').includes('AE'));
  assert.deepEqual(search('+91'), ['IN']);
  assert.ok(search('91').includes('IN'));
  assert.ok(search('+1').includes('US'));
  assert.ok(search('+1').includes('CA'));
  assert.deepEqual(search('+1849'), ['DO']);
  assert.deepEqual(search('not-a-country-or-dialing-code'), []);
  assert.equal(search(' ').length, 252);
});

test('countries with no assigned dialing code never receive a fabricated prefix', () => {
  assert.deepEqual(PHONE_COUNTRIES.find(country => country.code === 'AQ')?.dialCodes, []);
  assert.equal(phoneCountrySearchDetails(PHONE_COUNTRIES.find(country => country.code === 'AQ')!), 'AQ · —');
});

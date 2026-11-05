import { PHONE_COUNTRY_DATA } from './data/phoneCountryData';

export type PhoneCountry = Readonly<{ code: string; name: string; flag: string; dialCodes: readonly string[] }>;

export const PHONE_COUNTRIES: readonly PhoneCountry[] = Object.freeze(PHONE_COUNTRY_DATA.map(country => Object.freeze({
  ...country,
  dialCodes: Object.freeze([...country.dialCodes]),
  flag: String.fromCodePoint(...[...country.code].map(letter => 0x1F1E6 + letter.charCodeAt(0) - 65)),
})));

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES.find(country => country.code === 'US')!;

/** Include the ISO identity and every shared/alternative dialing prefix in search. */
export function phoneCountrySearchDetails(country: PhoneCountry): string {
  return `${country.code} · ${country.dialCodes.join(', ') || '—'}`;
}

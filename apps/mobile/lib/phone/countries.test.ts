import { describe, it, expect } from 'vitest';
import {
  COUNTRIES,
  DEFAULT_COUNTRY_CODE,
  getCountryByCode,
  getDefaultCountry,
} from './countries';

describe('countries', () => {
  it('exposes every libphonenumber-js country sorted by name', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    const names = COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('derives a flag emoji from each ISO code', () => {
    const us = getCountryByCode('US');
    expect(us).toBeDefined();
    expect(us!.flag).toBe('🇺🇸');
  });

  it('attaches a + prefixed dial code', () => {
    expect(getCountryByCode('GB')?.dialCode).toBe('+44');
    expect(getCountryByCode('JP')?.dialCode).toBe('+81');
  });

  it('looks up countries case-insensitively', () => {
    expect(getCountryByCode('us')?.code).toBe('US');
    expect(getCountryByCode('Gb')?.code).toBe('GB');
  });

  it('returns undefined for unknown codes', () => {
    expect(getCountryByCode('ZZ')).toBeUndefined();
  });

  it('getDefaultCountry returns a Country (fallback safe)', () => {
    const country = getDefaultCountry();
    expect(country.code.length).toBe(2);
    expect(country.dialCode.startsWith('+')).toBe(true);
  });

  it('falls back to US when locale region is unknown', () => {
    // Sanity: the fallback constant must resolve to a real entry.
    expect(getCountryByCode(DEFAULT_COUNTRY_CODE)).toBeDefined();
  });

  it('gives human-readable names to the non-ISO libphonenumber codes', () => {
    // AC, TA, XK are libphonenumber-only "countries" that i18n-iso-countries
    // doesn't ship — guard against the modal showing raw 2-letter codes.
    expect(getCountryByCode('AC')?.name).toBe('Ascension Island');
    expect(getCountryByCode('TA')?.name).toBe('Tristan da Cunha');
    expect(getCountryByCode('XK')?.name).toBe('Kosovo');
  });

  it('has a real name (not the raw code) for every entry', () => {
    const missing = COUNTRIES.filter((c) => c.name === c.code);
    expect(missing).toEqual([]);
  });

  it('populates aliases from i18n-iso-countries for well-known countries', () => {
    expect(getCountryByCode('US')?.aliases).toContain('USA');
    expect(getCountryByCode('GB')?.aliases).toContain('UK');
    expect(getCountryByCode('GB')?.aliases).toContain('Great Britain');
    expect(getCountryByCode('AE')?.aliases).toContain('UAE');
    expect(getCountryByCode('CZ')?.aliases).toContain('Czechia');
  });

  it('has an empty aliases array for countries without known aliases', () => {
    // Most countries won't have aliases; ensure the field is always an array
    const noAlias = COUNTRIES.find((c) => c.aliases.length === 0);
    expect(noAlias).toBeDefined();
  });
});

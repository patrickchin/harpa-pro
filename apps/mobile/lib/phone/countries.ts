/**
 * Country data for the phone number country prefix selector.
 *
 * Built on top of `libphonenumber-js` (pure JS, no native deps):
 *   - ISO 3166-1 alpha-2 codes from `getCountries()`
 *   - Dial codes from `getCountryCallingCode()`
 *
 * Country display names come from `i18n-iso-countries` (English).
 * We previously tried `Intl.DisplayNames`, but Hermes' bundled ICU
 * data on iOS doesn't ship region names, so `dn.of('US')` just
 * returned `'US'` — the modal showed dial codes with no names.
 * `i18n-iso-countries` ships the names as a JSON map.
 *
 * Flag emojis are derived from the ISO code via regional-indicator
 * codepoints, so no flag image assets are needed.
 *
 * Default country detection uses `expo-localization`'s `getLocales()`
 * to read the device's region setting, falling back to parsing
 * `Intl.DateTimeFormat()` and finally to "US".
 */
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js';
import { getLocales } from 'expo-localization';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import { env } from '@/lib/config/env';

countries.registerLocale(enLocale as Parameters<typeof countries.registerLocale>[0]);

/**
 * libphonenumber-js includes a handful of dial-code "countries" that
 * are not real ISO 3166-1 alpha-2 codes and therefore aren't in the
 * `i18n-iso-countries` name table. Map them by hand so the picker
 * still shows a human-readable name instead of the raw 2-letter code.
 */
const NON_ISO_DISPLAY_NAMES: Record<string, string> = {
  AC: 'Ascension Island',
  TA: 'Tristan da Cunha',
  XK: 'Kosovo',
};

export interface Country {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
  /**
   * Alternative names / nicknames used for search matching. Sourced from
   * `i18n-iso-countries` `select: 'all'` (e.g. GB → ["UK", "Great Britain"],
   * US → ["United States", "USA", ...]).
   */
  aliases: readonly string[];
}

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 'A'.charCodeAt(0);

function flagEmoji(code: string): string {
  if (code.length !== 2) {
    return '🏳️';
  }
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    upper.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET,
    upper.charCodeAt(1) + REGIONAL_INDICATOR_OFFSET,
  );
}

/**
 * Returns all known English names for a country from `i18n-iso-countries`,
 * with the official name first followed by aliases. Falls back to the
 * hand-curated map for non-ISO libphonenumber codes.
 */
function getAllNames(code: string): string[] {
  const upper = code.toUpperCase();
  const all = countries.getName(code, 'en', { select: 'all' });
  if (Array.isArray(all) && all.length > 0) {
    return all;
  }
  const nonIso = NON_ISO_DISPLAY_NAMES[upper];
  return nonIso ? [nonIso] : [upper];
}

function buildCountries(): Country[] {
  return getCountries()
    .map((code) => {
      const allNames = getAllNames(code);
      const name = allNames[0] ?? code;
      const aliases = allNames.slice(1);
      return {
        code,
        name,
        dialCode: `+${getCountryCallingCode(code)}`,
        flag: flagEmoji(code),
        aliases,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const COUNTRIES: readonly Country[] = buildCountries();

const COUNTRIES_BY_CODE = new Map<string, Country>(
  COUNTRIES.map((country) => [country.code, country]),
);

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES_BY_CODE.get(code.toUpperCase());
}

export const DEFAULT_COUNTRY_CODE: CountryCode = 'US';

/**
 * Resolve the default country from the device locale.
 *
 * Primary source: `expo-localization`'s `getLocales()[0].regionCode`,
 * which reads the device's region setting (independent of language).
 * Falls back to parsing `Intl.DateTimeFormat().resolvedOptions().locale`
 * (e.g. "en-US" → "US"), and finally to {@link DEFAULT_COUNTRY_CODE}.
 */
export function getDefaultCountry(): Country {
  // In fixture/E2E mode, force US so Maestro flows can type +1 phone
  // numbers without driving the country picker (the picker's empty
  // TextInput is not exposed to iOS XCTest's accessibility tree,
  // which makes filtering by text impossible from Maestro on iOS).
  if (env.EXPO_PUBLIC_USE_FIXTURES) {
    const us = COUNTRIES_BY_CODE.get(DEFAULT_COUNTRY_CODE);
    if (us) return us;
  }

  try {
    const locales = getLocales();
    const regionCode = locales[0]?.regionCode;
    if (regionCode) {
      const country = getCountryByCode(regionCode);
      if (country) {
        return country;
      }
    }
  } catch {
    // fall through to Intl-based fallback
  }

  try {
    const locale = new Intl.Locale(
      Intl.DateTimeFormat().resolvedOptions().locale,
    );
    const region = locale.region;
    if (region) {
      const country = getCountryByCode(region);
      if (country) {
        return country;
      }
    }
  } catch {
    // fall through to default
  }
  return COUNTRIES_BY_CODE.get(DEFAULT_COUNTRY_CODE) ?? COUNTRIES[0]!;
}

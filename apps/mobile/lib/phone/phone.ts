import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { getCountryByCode, getDefaultCountry, type Country } from './countries';

export const INVALID_PHONE_NUMBER_MESSAGE =
  'Enter your phone number with country code, starting with +. For example, +1 555 123 4567.';

/**
 * Combine a selected {@link Country} with a user-entered national
 * number into an E.164 canonical string (e.g. "+15551234567").
 * Strips non-digits from the national portion and drops a leading 0
 * (some locales display trunk prefixes).
 */
export function combineCountryAndNational(
  country: Country,
  national: string,
): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 0) {
    return '';
  }
  return `${country.dialCode}${digits}`;
}

/**
 * Parse an E.164 phone number into a {@link Country} + national
 * digits pair. Returns null when the input can't be parsed.
 * Used when rehydrating a remembered phone into the picker UI.
 */
export function splitE164(value: string): { country: Country; national: string } | null {
  if (!value) {
    return null;
  }
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed || !parsed.country) {
    return null;
  }
  const country = getCountryByCode(parsed.country);
  if (!country) {
    return null;
  }
  return { country, national: parsed.nationalNumber.toString() };
}

/**
 * Initial picker state for a screen — splits a remembered E.164 string
 * back into country + national, or falls back to the device-locale
 * default country with an empty national part.
 */
export function getInitialPhoneState(
  rememberedE164?: string | null,
): { country: Country; national: string } {
  if (rememberedE164) {
    const split = splitE164(rememberedE164);
    if (split) {
      return split;
    }
  }
  return { country: getDefaultCountry(), national: '' };
}

export function normalizePhoneNumber(value: string): string {
  const trimmedValue = value.trim();
  const digits = value.trim().replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  if (trimmedValue.startsWith('+')) {
    return `+${digits}`;
  }

  return digits.length >= 11 ? `+${digits}` : digits;
}

export function isValidPhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function getCanonicalPhoneNumber(value: string): string | null {
  const normalized = normalizePhoneNumber(value);

  return isValidPhoneNumber(normalized) ? normalized : null;
}

export function requireCanonicalPhoneNumber(value: string): string {
  const canonicalPhoneNumber = getCanonicalPhoneNumber(value);

  if (!canonicalPhoneNumber) {
    throw new Error(INVALID_PHONE_NUMBER_MESSAGE);
  }

  return canonicalPhoneNumber;
}

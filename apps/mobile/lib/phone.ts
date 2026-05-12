export const INVALID_PHONE_NUMBER_MESSAGE =
  'Enter your phone number with country code, starting with +. For example, +1 555 123 4567.';

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

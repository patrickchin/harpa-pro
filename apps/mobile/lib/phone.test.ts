import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  isValidPhoneNumber,
  getCanonicalPhoneNumber,
  requireCanonicalPhoneNumber,
  INVALID_PHONE_NUMBER_MESSAGE,
} from './phone';

describe('phone utilities', () => {
  describe('normalizePhoneNumber', () => {
    it('returns empty string for empty input', () => {
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber('   ')).toBe('');
    });

    it('preserves + prefix and strips non-digits', () => {
      expect(normalizePhoneNumber('+1 555 123 4567')).toBe('+15551234567');
      expect(normalizePhoneNumber('+44 (20) 7946 0958')).toBe('+442079460958');
    });

    it('adds + prefix when input has 11+ digits without +', () => {
      expect(normalizePhoneNumber('15551234567')).toBe('+15551234567');
      expect(normalizePhoneNumber('442079460958')).toBe('+442079460958');
    });

    it('returns digits only when < 11 digits and no + prefix', () => {
      expect(normalizePhoneNumber('5551234567')).toBe('5551234567');
      expect(normalizePhoneNumber('123')).toBe('123');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('returns true for valid E.164 format', () => {
      expect(isValidPhoneNumber('+15551234567')).toBe(true);
      expect(isValidPhoneNumber('+442079460958')).toBe(true);
      expect(isValidPhoneNumber('+8612345678')).toBe(true);
    });

    it('returns false when missing + prefix', () => {
      expect(isValidPhoneNumber('15551234567')).toBe(false);
    });

    it('returns false when country code starts with 0', () => {
      expect(isValidPhoneNumber('+05551234567')).toBe(false);
    });

    it('returns false when too short', () => {
      expect(isValidPhoneNumber('+1555')).toBe(false);
      expect(isValidPhoneNumber('+123456')).toBe(false);
    });

    it('returns false when too long', () => {
      expect(isValidPhoneNumber('+123456789012345678')).toBe(false);
    });
  });

  describe('getCanonicalPhoneNumber', () => {
    it('returns normalized valid number', () => {
      expect(getCanonicalPhoneNumber('+1 555 123 4567')).toBe('+15551234567');
      expect(getCanonicalPhoneNumber('15551234567')).toBe('+15551234567');
    });

    it('returns null for invalid input', () => {
      expect(getCanonicalPhoneNumber('123')).toBeNull();
      expect(getCanonicalPhoneNumber('invalid')).toBeNull();
      expect(getCanonicalPhoneNumber('')).toBeNull();
    });
  });

  describe('requireCanonicalPhoneNumber', () => {
    it('returns normalized valid number', () => {
      expect(requireCanonicalPhoneNumber('+1 555 123 4567')).toBe('+15551234567');
    });

    it('throws with message for invalid input', () => {
      expect(() => requireCanonicalPhoneNumber('123')).toThrow(
        INVALID_PHONE_NUMBER_MESSAGE
      );
      expect(() => requireCanonicalPhoneNumber('invalid')).toThrow(
        INVALID_PHONE_NUMBER_MESSAGE
      );
    });
  });
});

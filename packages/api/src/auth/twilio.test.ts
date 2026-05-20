import { describe, it, expect } from 'vitest';
import { checkSmokeBackdoor, isSmokePhone } from './twilio.js';

const SP = '+15550000099';
const SC = 'abcdef-secret-99';

describe('twilio smoke backdoor', () => {
  describe('isSmokePhone', () => {
    it('returns false when SMOKE_TEST_PHONE is unset', () => {
      expect(isSmokePhone('+15551234567', undefined)).toBe(false);
    });
    it('returns true only when phone exactly matches', () => {
      expect(isSmokePhone(SP, SP)).toBe(true);
      expect(isSmokePhone('+15559999999', SP)).toBe(false);
    });
  });

  describe('checkSmokeBackdoor', () => {
    it('returns null (not a smoke request) when either secret is missing', () => {
      expect(checkSmokeBackdoor(SP, SC, undefined, SC)).toBeNull();
      expect(checkSmokeBackdoor(SP, SC, SP, undefined)).toBeNull();
      expect(checkSmokeBackdoor(SP, SC, undefined, undefined)).toBeNull();
    });

    it('returns null when phone is not the smoke phone (falls through to Twilio)', () => {
      expect(checkSmokeBackdoor('+15551234567', SC, SP, SC)).toBeNull();
    });

    it('returns true only for the exact (phone, code) pair', () => {
      expect(checkSmokeBackdoor(SP, SC, SP, SC)).toBe(true);
    });

    it('returns false (not null) for smoke phone with wrong code', () => {
      // Critical: must NOT fall back to Twilio for the smoke phone — the
      // smoke phone has exactly one valid code, full stop. Otherwise an
      // attacker who knows SMOKE_TEST_PHONE could brute-force via Twilio.
      expect(checkSmokeBackdoor(SP, 'wrong', SP, SC)).toBe(false);
    });
  });
});

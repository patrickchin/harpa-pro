import { describe, it, expect } from 'vitest';
import {
  waitlistSignupRequest,
  waitlistConfirmRequest,
  DISPOSABLE_EMAIL_DOMAINS,
} from './waitlist.js';

describe('waitlist schemas', () => {
  describe('waitlistSignupRequest', () => {
    it('accepts a valid signup', () => {
      const parsed = waitlistSignupRequest.parse({
        email: 'Jamie@BuildCo.com',
        company: 'BuildCo',
        role: 'Foreman',
        source: 'twitter',
        turnstileToken: 'tt-abc',
      });
      // email is lowercased + trimmed
      expect(parsed.email).toBe('jamie@buildco.com');
    });

    it('rejects missing turnstile token', () => {
      expect(() =>
        waitlistSignupRequest.parse({ email: 'a@b.co', turnstileToken: '' }),
      ).toThrow();
    });

    it('rejects malformed email', () => {
      expect(() =>
        waitlistSignupRequest.parse({ email: 'not-an-email', turnstileToken: 't' }),
      ).toThrow();
    });

    it('rejects email > 254 chars', () => {
      const long = 'a'.repeat(250) + '@b.co';
      expect(() =>
        waitlistSignupRequest.parse({ email: long, turnstileToken: 't' }),
      ).toThrow();
    });

    it('rejects oversized optional fields', () => {
      expect(() =>
        waitlistSignupRequest.parse({
          email: 'a@b.co',
          company: 'x'.repeat(201),
          turnstileToken: 't',
        }),
      ).toThrow();
    });

    it('strips unknown keys via .parse (zod default)', () => {
      const parsed = waitlistSignupRequest.parse({
        email: 'a@b.co',
        turnstileToken: 't',
        admin: true,
      } as unknown as { email: string; turnstileToken: string });
      expect('admin' in parsed).toBe(false);
    });
  });

  describe('waitlistConfirmRequest', () => {
    it('accepts a 64-char hex token', () => {
      const tok = 'a'.repeat(64);
      expect(waitlistConfirmRequest.parse({ token: tok }).token).toBe(tok);
    });

    it('rejects a short token', () => {
      expect(() => waitlistConfirmRequest.parse({ token: 'abc' })).toThrow();
    });

    it('rejects a non-hex token', () => {
      const bad = 'z'.repeat(64);
      expect(() => waitlistConfirmRequest.parse({ token: bad })).toThrow();
    });
  });

  describe('DISPOSABLE_EMAIL_DOMAINS', () => {
    it('is a non-empty static list', () => {
      expect(DISPOSABLE_EMAIL_DOMAINS.length).toBeGreaterThan(5);
      expect(DISPOSABLE_EMAIL_DOMAINS).toContain('mailinator.com');
    });
  });
});

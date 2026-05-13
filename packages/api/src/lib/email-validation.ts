/**
 * Server-side email validation for the marketing waitlist.
 * Zod `.email()` (in `waitlistSignupRequest`) handles syntactic
 * checks; this layer adds the disposable-domain blocklist defined
 * once in `@harpa/api-contract`.
 *
 * Returns a structured result so the route handler decides the
 * response (we keep responses enumeration-safe — see waitlist.ts).
 */
import { waitlist as waitlistSchemas } from '@harpa/api-contract';

const DISPOSABLE_EMAIL_DOMAINS = waitlistSchemas.DISPOSABLE_EMAIL_DOMAINS;

export type EmailRejectReason = 'disposable' | 'invalid';

export interface EmailValidationResult {
  ok: boolean;
  reason?: EmailRejectReason;
}

export function validateEmail(email: string): EmailValidationResult {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) {
    return { ok: false, reason: 'invalid' };
  }
  const domain = email.slice(at + 1).toLowerCase();
  if ((DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return { ok: false, reason: 'disposable' };
  }
  return { ok: true };
}

import { z } from 'zod';
import { isoDateTime, uuid } from './_shared.js';

/**
 * Marketing waitlist schemas (double opt-in).
 * See docs/marketing/plan-m1-waitlist.md §M1.2.
 */

/**
 * Disposable / throwaway email domains. Tiny static blocklist; the
 * point is to discourage casual signups from one-off addresses, not
 * to be a comprehensive filter. Server-side `email-validation.ts`
 * mirrors this list and rejects with a 400.
 */
export const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com',
  '10minutemail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'getnada.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'fakeinbox.com',
  'throwawaymail.com',
  'maildrop.cc',
  'dispostable.com',
] as const;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email();

export const waitlistSignupRequest = z.object({
  email: emailField,
  company: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(120).optional(),
  source: z.string().trim().max(200).optional(),
  turnstileToken: z.string().min(1).max(2048),
});
export type WaitlistSignupRequest = z.infer<typeof waitlistSignupRequest>;

export const waitlistSignupResponse = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type WaitlistSignupResponse = z.infer<typeof waitlistSignupResponse>;

export const waitlistConfirmRequest = z.object({
  // 32 bytes hex = 64 chars
  token: z.string().regex(/^[0-9a-f]{64}$/i, 'invalid confirm token'),
});
export type WaitlistConfirmRequest = z.infer<typeof waitlistConfirmRequest>;

export const waitlistConfirmResponse = z.object({
  success: z.literal(true),
  message: z.string(),
});
export type WaitlistConfirmResponse = z.infer<typeof waitlistConfirmResponse>;

/** Admin CSV row (one signup) — used for typing the export stream. */
export const waitlistAdminRow = z.object({
  id: uuid,
  email: z.string(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  source: z.string().nullable(),
  confirmedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type WaitlistAdminRow = z.infer<typeof waitlistAdminRow>;

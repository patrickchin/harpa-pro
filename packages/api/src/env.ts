/**
 * Centralised env access for @harpa/api.
 * Mirrors apps/mobile/lib/env.ts pattern. Pitfall 5.
 */
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')).optional(),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-only-secret-do-not-use-in-prod'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8787'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SID: z.string().optional(),
  TWILIO_LIVE: z.enum(['0', '1']).default('0'),
  TWILIO_VERIFY_FAKE_CODE: z.string().default('000000'),
  /**
   * Smoke-test backdoor. When BOTH `SMOKE_TEST_PHONE` (E.164) and
   * `SMOKE_TEST_CODE` are set, that single (phone, code) pair is
   * approved without calling Twilio — regardless of TWILIO_LIVE.
   * Lets the post-deploy smoke journey authenticate against a live
   * (TWILIO_LIVE=1) production API without sending real SMS or paying
   * Twilio per request. Both are treated as secrets.
   *
   * If either is unset, the backdoor is disabled and the request
   * follows the normal Twilio path (fake or live).
   */
  SMOKE_TEST_PHONE: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'must be E.164, e.g. +15551234567')
    .optional(),
  SMOKE_TEST_CODE: z.string().min(6).optional(),
  AI_FIXTURE_MODE: z.enum(['replay', 'record', 'live']).default('replay'),
  AI_LIVE: z.enum(['0', '1']).default('0'),
  R2_FIXTURE_MODE: z.enum(['replay', 'live']).default('replay'),
  // Cloudflare R2 (S3-compatible). Required when R2_FIXTURE_MODE=live.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('harpa-pro'),
  /**
   * Optional explicit endpoint override. Defaults to
   * `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` when absent.
   * Set this to point at a local S3-compatible mock (e.g. MinIO) in dev.
   */
  R2_ENDPOINT: z.string().url().optional(),
  /**
   * TTL (seconds) for presigned PUT/GET URLs. 5 min matches
   * arch-storage.md §Download flow.
   */
  R2_PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(300),
  REQUEST_LOG: z.enum(['true', 'false']).default('false'),
  // Marketing waitlist (M1).
  TURNSTILE_LIVE: z.enum(['0', '1']).default('0'),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  RESEND_LIVE: z.enum(['0', '1']).default('0'),
  RESEND_API_KEY: z.string().optional(),
  WAITLIST_FROM_EMAIL: z.string().default('Harpa Pro <hello@harpapro.com>'),
  WAITLIST_CONFIRM_BASE_URL: z.string().url().default('https://harpapro.com/confirm'),
  WAITLIST_IP_HASH_SALT: z.string().min(8).default('dev-only-waitlist-salt-do-not-use-in-prod'),
  /**
   * Comma-separated origins allowed to POST /waitlist (CORS allowlist).
   * Defaults cover prod (harpapro.com + www) and local dev (Astro on 3002).
   */
  WAITLIST_CORS_ORIGINS: z
    .string()
    .default('https://harpapro.com,https://www.harpapro.com,http://localhost:3002'),
  /**
   * Filename of the last migration this image expects to find applied in
   * `app._migrations`. Baked into the image at build time (see
   * infra/fly/Dockerfile ARG MIGRATIONS_REQUIRED_HEAD). Used by /readyz
   * to detect "code ahead of schema" — see docs/v4/arch-cicd-and-migrations.md.
   *
   * Format is intentionally permissive (`<digits>_<slug>.sql`) because the
   * project has two historical filename conventions in flight (`NNNN_*.sql`
   * on dev/v4 and `YYYYMMDDHHmm_*.sql` on the live main branch). The lexical
   * sort still produces the right "newest" answer for either.
   *
   * Optional in dev/test (so a local API can boot without setting it).
   * Required in production: enforced by the refinement below.
   */
  MIGRATIONS_REQUIRED_HEAD: z
    .string()
    .regex(/^[0-9]+_[a-z0-9_]+\.sql$/, 'must match <digits>_<slug>.sql')
    .optional(),
}).refine(
  (e) => e.NODE_ENV !== 'production' || !!e.MIGRATIONS_REQUIRED_HEAD,
  { path: ['MIGRATIONS_REQUIRED_HEAD'], message: 'required when NODE_ENV=production' },
).refine(
  // In production, refuse to boot with the Twilio fake-mode backdoor
  // enabled. Without this guard, any (phone, "000000") pair would mint
  // a JWT for any account — see PR notes on the prod-OTP-hole fix.
  (e) => e.NODE_ENV !== 'production' || e.TWILIO_LIVE === '1',
  { path: ['TWILIO_LIVE'], message: 'must be "1" when NODE_ENV=production' },
).refine(
  // Both halves of the smoke backdoor must be set together; a half-set
  // pair is almost always a misconfiguration (e.g. forgot to add one
  // of the two GH Actions secrets).
  (e) => !!e.SMOKE_TEST_PHONE === !!e.SMOKE_TEST_CODE,
  {
    path: ['SMOKE_TEST_PHONE'],
    message: 'SMOKE_TEST_PHONE and SMOKE_TEST_CODE must be set together',
  },
);

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;

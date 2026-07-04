/**
 * Centralised env access for @harpa/api.
 * Mirrors apps/mobile/lib/env.ts pattern. Pitfall 5.
 */
import { z } from 'zod';

const optionalUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().url().optional(),
);

const DEMO_ACCOUNT_EMAILS = new Set([
  'demo@harpapro.com',
  'demo2@harpapro.com',
  'demo3@harpapro.com',
]);

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')).optional(),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-only-secret-do-not-use-in-prod'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8787'),
  /**
   * Test-account password bypass — comma-separated allowlist of emails
   * permitted to sign in via better-auth's emailAndPassword endpoint.
   * Use stable public addresses: test@harpapro.com, test2@harpapro.com,
   * and test3@harpapro.com. The password, not the email address, is
   * the secret.
   * Set in both Doppler `dev` and `prd` (we keep test accounts on
   * production so smoke-test logins keep working there).
   * Replaces the legacy TEST_ACCOUNT_PHONES variable.
   */
  TEST_ACCOUNT_EMAILS: z.string().optional(),
  /**
   * Demo account password access. Demo emails are intentionally
   * stable/public; the strong server-side password is the secret.
   * Never bundle that password into mobile code.
   */
  DEMO_ACCOUNT_EMAILS: z
    .string()
    .refine(
      (value) => splitCsv(value).length > 0
        && splitCsv(value).every((email) => DEMO_ACCOUNT_EMAILS.has(email.toLowerCase())),
      'must contain only demo@harpapro.com, demo2@harpapro.com, or demo3@harpapro.com',
    )
    .optional(),
  DEMO_ACCOUNT_PASSWORD: z.string().min(16).optional(),
  /**
   * Email-OTP transport switch. `'1'` → real Resend send via better-auth's
   * `sendVerificationOTP` hook. Default `'0'` logs the OTP to stdout
   * (development/preview) and is a no-op under test.
   *
   * Production must set this to `'1'` (refine below); a missing Doppler
   * key would otherwise silently downgrade prod to fake mode.
   * PR preview deployments are exempt when HARPAPRO_PR_BUILD='1'.
   */
  EMAIL_OTP_LIVE: z.enum(['0', '1']).default('0'),
  /**
   * Set to `'1'` in per-PR Fly preview deployments (fly.preview.toml).
   * Relaxes production-only refines (e.g. EMAIL_OTP_LIVE) that don't
   * make sense for short-lived review environments.
   */
  HARPAPRO_PR_BUILD: z.enum(['0', '1']).default('0'),
  AI_FIXTURE_MODE: z.enum(['replay', 'record', 'live']).default('replay'),
  AI_LIVE: z.enum(['0', '1']).default('0'),
  // OpenAI is used for voice-note summarization. Required when AI_LIVE=1.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  // Groq hosts whisper-large-v3-turbo for transcription. Required when AI_LIVE=1.
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().optional(),
  REVENUECAT_LIVE: z.enum(['0', '1']).default('0'),
  REVENUECAT_SECRET_API_KEY: z.string().min(1).optional(),
  REVENUECAT_WEBHOOK_AUTH: z.string().min(16).optional(),
  REVENUECAT_BASE_URL: z.string().url().default('https://api.revenuecat.com/v1'),
  // Kimi (Moonshot) is used for report generation. Not validated at boot —
  // a missing key surfaces as a 502 on the affected request only.
  KIMI_API_KEY: z.string().optional(),
  KIMI_BASE_URL: z.string().url().optional(),
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
   * Optional public URL override for presigned PUT/GET URLs. When set,
   * the hostname/scheme prefix of `R2_ENDPOINT` is replaced with this
   * value in URLs returned to clients. Used in local dev with MinIO
   * where the API talks to `http://minio:9000` over the docker network
   * but the host-side CLI/browser needs `http://localhost:9000`.
   * Has no effect when unset or when running against real R2.
   */
  R2_PUBLIC_ENDPOINT: z.string().url().optional(),
  /**
   * TTL (seconds) for presigned PUT/GET URLs. 5 min matches
   * arch-storage.md §Download flow.
   */
  R2_PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(300),
  REQUEST_LOG: z.enum(['true', 'false']).default('false'),
  /**
   * Sentry crash reporting. DSN is optional so local/test boots stay
   * telemetry-free; prod/dev deploys set it through Doppler/Fly.
   */
  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  /**
   * Rate-limit backend selector. `memory` = per-process (dev/test default),
   * `postgres` = cross-machine via `app.rate_limit_buckets` (prod).
   * See docs/v4/arch-rate-limiting.md §3.5.
   */
  RATE_LIMIT_BACKEND: z.enum(['memory', 'postgres']).default('memory'),
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
  /**
   * Test-account password bypass for live deployments — see
   * docs/v4/arch-auth-and-rls.md §Test-account password bypass.
   *
   * Shared password for all emails in TEST_ACCOUNT_EMAILS. Min 16
   * chars to keep a leak less catastrophic. Both vars must be set
   * together (refine below).
   */
  TEST_ACCOUNT_PASSWORD: z.string().min(16).optional(),
  /**
   * Universal links — Apple App Site Association.
   *
   * Apple Team ID prefix used by the iOS apps (10-char alphanumeric,
   * e.g. `ABCDE12345`). When unset, `GET /.well-known/apple-app-site-association`
   * returns 404 so deep-link verification fails closed rather than
   * advertising an empty manifest. See docs/v4/plan-p4-hardening.md §P4.6.
   */
  IOS_APP_ID_PREFIX: z
    .string()
    .regex(/^[A-Z0-9]{10}$/, 'must be a 10-char Apple Team ID')
    .optional(),
  /**
   * Comma-separated iOS bundle identifiers permitted to handle
   * universal links (e.g. `com.harpa.pro,com.harpa.pro.dev`).
   */
  IOS_BUNDLE_IDS: z.string().optional(),
  /**
   * Universal links — Android Asset Links.
   *
   * Comma-separated Android package names (e.g. `com.harpa.pro,com.harpa.pro.dev`).
   * Empty disables `/.well-known/assetlinks.json` (404).
   */
  ANDROID_PACKAGE_NAMES: z.string().optional(),
  /**
   * Comma-separated SHA-256 cert fingerprints (uppercase, colon-separated
   * hex pairs) for each entry in `ANDROID_PACKAGE_NAMES`. Index-aligned;
   * length must match the package list or `/.well-known/assetlinks.json`
   * 404s and logs a config error.
   */
  ANDROID_CERT_FINGERPRINTS_SHA256: z.string().optional(),
}).refine(
  (e) => e.NODE_ENV !== 'production' || !!e.MIGRATIONS_REQUIRED_HEAD,
  { path: ['MIGRATIONS_REQUIRED_HEAD'], message: 'required when NODE_ENV=production' },
).refine(
  (e) => e.AI_LIVE !== '1' || !!e.OPENAI_API_KEY,
  { path: ['OPENAI_API_KEY'], message: 'required when AI_LIVE=1 (voice-note summarization)' },
).refine(
  (e) => e.AI_LIVE !== '1' || !!e.GROQ_API_KEY,
  { path: ['GROQ_API_KEY'], message: 'required when AI_LIVE=1 (transcription via whisper-large-v3-turbo)' },
).refine(
  (e) => e.REVENUECAT_LIVE !== '1' || !!e.REVENUECAT_SECRET_API_KEY,
  {
    path: ['REVENUECAT_SECRET_API_KEY'],
    message: 'required when REVENUECAT_LIVE=1',
  },
).refine(
  (e) => e.REVENUECAT_LIVE !== '1' || !!e.REVENUECAT_WEBHOOK_AUTH,
  {
    path: ['REVENUECAT_WEBHOOK_AUTH'],
    message: 'required when REVENUECAT_LIVE=1',
  },
).refine(
  (e) => !!e.TEST_ACCOUNT_EMAILS === !!e.TEST_ACCOUNT_PASSWORD,
  {
    path: ['TEST_ACCOUNT_PASSWORD'],
    message: 'TEST_ACCOUNT_EMAILS and TEST_ACCOUNT_PASSWORD must be set together',
  },
).refine(
  (e) => !!e.DEMO_ACCOUNT_EMAILS === !!e.DEMO_ACCOUNT_PASSWORD,
  {
    path: ['DEMO_ACCOUNT_PASSWORD'],
    message: 'DEMO_ACCOUNT_EMAILS and DEMO_ACCOUNT_PASSWORD must be set together',
  },
).refine(
  (e) => e.NODE_ENV !== 'production' || e.HARPAPRO_PR_BUILD === '1' || e.EMAIL_OTP_LIVE === '1',
  {
    path: ['EMAIL_OTP_LIVE'],
    message:
      "EMAIL_OTP_LIVE must be '1' on production (else OTP emails would not send). " +
      "Set HARPAPRO_PR_BUILD='1' to allow fake mode on per-PR preview deployments.",
  },
);

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;

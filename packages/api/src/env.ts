/**
 * Centralised env access for @harpa/api.
 * Mirrors apps/mobile/lib/env.ts pattern. Pitfall 5.
 */
import { z } from 'zod';
import { email as emailSchema, projectId as projectIdSchema } from '@harpa/api-contract';
import { isPostgresConnectionUrl, isSamePostgresEndpoint } from './db/admin-isolation.js';

const DEV_BETTER_AUTH_SECRET = 'dev-only-secret-do-not-use-in-prod';
const PRODUCTION_API_URL = 'https://api.harpapro.com';
const DEVELOPMENT_API_URL = 'https://harpa-pro-api-dev.fly.dev';
const PRODUCTION_ADMIN_ORIGIN = 'https://admin.harpapro.com';
const DEVELOPMENT_ADMIN_ORIGIN = 'https://dev.harpa-pro-admin.pages.dev';
const PREVIEW_API_URL = /^https:\/\/harpa-pro-api-pr-([1-9][0-9]*)\.fly\.dev$/;
const PREVIEW_ADMIN_ORIGIN = /^https:\/\/pr-[1-9][0-9]*\.harpa-pro-admin\.pages\.dev$/;

const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional());
const postgresConnectionUrl = z
  .string()
  .refine(isPostgresConnectionUrl, 'must be a valid postgres: or postgresql: connection URL');

const exactHttpOrigins = z.string().refine((value) => {
  const origins = splitCsv(value);
  return (
    origins.length > 0 &&
    origins.every((origin) => {
      try {
        const url = new URL(origin);
        return (
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          url.origin === origin &&
          !origin.includes('*')
        );
      } catch {
        return false;
      }
    })
  );
}, 'must be a comma-separated list of exact HTTP(S) origins');

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

export function isCrossSiteAdminOrigin(origin: string): boolean {
  return origin === DEVELOPMENT_ADMIN_ORIGIN || PREVIEW_ADMIN_ORIGIN.test(origin);
}

function expectedDeployedAdminOrigin(betterAuthUrl: string, isPrPreview: boolean): string | null {
  if (isPrPreview) {
    const preview = PREVIEW_API_URL.exec(betterAuthUrl);
    return preview ? `https://pr-${preview[1]}.harpa-pro-admin.pages.dev` : null;
  }

  if (betterAuthUrl === DEVELOPMENT_API_URL) return DEVELOPMENT_ADMIN_ORIGIN;
  if (betterAuthUrl === PRODUCTION_API_URL) return PRODUCTION_ADMIN_ORIGIN;
  return null;
}

const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8787),
    DATABASE_URL: postgresConnectionUrl.optional(),
    /**
     * Independent Neon database used only for administrator identities and
     * sessions. It must never point at the application database.
     */
    ADMIN_DATABASE_URL: postgresConnectionUrl.optional(),
    /**
     * Optional read-only Neon inventory observer for the admin operations page.
     * This dedicated personal key must belong to a Viewer and must never reuse
     * the branch-management NEON_API_KEY held by CI. Both values are paired by
     * the refinements below.
     */
    ADMIN_NEON_VIEWER_API_KEY: z.string().trim().min(1).optional(),
    ADMIN_NEON_ORG_ID: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,60}$/, 'must be a Neon organization ID')
      .optional(),
    /**
     * Optional read-only Cloudflare R2 observer for the admin operations page.
     * The account ID and token must be paired. The token must never reuse S3,
     * Pages, or CI write credentials.
     */
    ADMIN_CLOUDFLARE_ACCOUNT_ID: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{32}$/, 'must be a lowercase 32-character Cloudflare account ID')
      .optional(),
    ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN: z.string().trim().min(1).optional(),
    /**
     * Optional fixed synthetic target for the bounded admin report-generation
     * diagnostic. All three values must be absent or present together. The
     * email must also be an exact TEST_ACCOUNT_EMAILS member; the existing
     * server-only TEST_ACCOUNT_PASSWORD supplies its credential.
     */
    ADMIN_REPORT_DIAGNOSTIC_EMAIL: emailSchema.optional(),
    ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID: projectIdSchema.optional(),
    ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER: z.coerce.number().int().positive().optional(),
    BETTER_AUTH_SECRET: z.string().min(16).default(DEV_BETTER_AUTH_SECRET),
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
        (value) =>
          splitCsv(value).length > 0 &&
          splitCsv(value).every((email) => DEMO_ACCOUNT_EMAILS.has(email.toLowerCase())),
        'must contain only demo@harpapro.com, demo2@harpapro.com, or demo3@harpapro.com',
      )
      .optional(),
    DEMO_ACCOUNT_PASSWORD: z.string().min(16).optional(),
    /**
     * Email-OTP transport switch. `'1'` → real Resend send via better-auth's
     * `sendVerificationOTP` hook. Default `'0'` logs redacted delivery
     * metadata only (development/preview) and is a no-op under test.
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
    R2_PRESIGN_TTL_SEC: z.coerce.number().int().positive().max(300).default(300),
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
    /**
     * Idempotency response backend. Dev/test default to memory; production
     * always selects Postgres even when this override is omitted.
     */
    IDEMPOTENCY_BACKEND: z.enum(['memory', 'postgres']).default('memory'),
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
     * Comma-separated browser origins allowed to call authenticated dashboard
     * and Better Auth routes with credentials. `*` supports Cloudflare Pages
     * preview subdomains.
     */
    DASHBOARD_CORS_ORIGINS: z
      .string()
      .default(
        'https://app.harpapro.com,https://harpa-pro-dashboard.pages.dev,https://*.harpa-pro-dashboard.pages.dev,http://localhost:3003,http://127.0.0.1:3003',
      ),
    /**
     * Exact browser origins allowed to send credentialed `/admin/*` requests.
     * Better Auth is intentionally not exposed to the admin browser.
     */
    ADMIN_CORS_ORIGINS: exactHttpOrigins.default(
      process.env.NODE_ENV === 'production'
        ? 'https://admin.harpapro.com'
        : 'http://localhost:3102',
    ),
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
     * Independent admin database migration head expected by `/admin/readyz`.
     */
    ADMIN_MIGRATIONS_REQUIRED_HEAD: z
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
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.MIGRATIONS_REQUIRED_HEAD, {
    path: ['MIGRATIONS_REQUIRED_HEAD'],
    message: 'required when NODE_ENV=production',
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.ADMIN_MIGRATIONS_REQUIRED_HEAD, {
    path: ['ADMIN_MIGRATIONS_REQUIRED_HEAD'],
    message: 'required when NODE_ENV=production',
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.ADMIN_DATABASE_URL, {
    path: ['ADMIN_DATABASE_URL'],
    message: 'required when NODE_ENV=production',
  })
  .refine((e) => !isSamePostgresEndpoint(e.ADMIN_DATABASE_URL, e.DATABASE_URL), {
    path: ['ADMIN_DATABASE_URL'],
    message: 'must not identify the same Postgres endpoint as DATABASE_URL',
  })
  .refine((e) => e.AI_LIVE !== '1' || !!e.OPENAI_API_KEY, {
    path: ['OPENAI_API_KEY'],
    message: 'required when AI_LIVE=1 (voice-note summarization)',
  })
  .refine((e) => e.AI_LIVE !== '1' || !!e.GROQ_API_KEY, {
    path: ['GROQ_API_KEY'],
    message: 'required when AI_LIVE=1 (transcription via whisper-large-v3-turbo)',
  })
  .refine((e) => !!e.TEST_ACCOUNT_EMAILS === !!e.TEST_ACCOUNT_PASSWORD, {
    path: ['TEST_ACCOUNT_PASSWORD'],
    message: 'TEST_ACCOUNT_EMAILS and TEST_ACCOUNT_PASSWORD must be set together',
  })
  .refine((e) => !!e.DEMO_ACCOUNT_EMAILS === !!e.DEMO_ACCOUNT_PASSWORD, {
    path: ['DEMO_ACCOUNT_PASSWORD'],
    message: 'DEMO_ACCOUNT_EMAILS and DEMO_ACCOUNT_PASSWORD must be set together',
  })
  .refine((e) => !e.ADMIN_NEON_VIEWER_API_KEY || !!e.ADMIN_NEON_ORG_ID, {
    path: ['ADMIN_NEON_ORG_ID'],
    message: 'ADMIN_NEON_VIEWER_API_KEY and ADMIN_NEON_ORG_ID must be set together',
  })
  .refine((e) => !e.ADMIN_NEON_ORG_ID || !!e.ADMIN_NEON_VIEWER_API_KEY, {
    path: ['ADMIN_NEON_VIEWER_API_KEY'],
    message: 'ADMIN_NEON_VIEWER_API_KEY and ADMIN_NEON_ORG_ID must be set together',
  })
  .refine((e) => !e.ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN || !!e.ADMIN_CLOUDFLARE_ACCOUNT_ID, {
    path: ['ADMIN_CLOUDFLARE_ACCOUNT_ID'],
    message:
      'ADMIN_CLOUDFLARE_ACCOUNT_ID and ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN must be set together',
  })
  .refine((e) => !e.ADMIN_CLOUDFLARE_ACCOUNT_ID || !!e.ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN, {
    path: ['ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN'],
    message:
      'ADMIN_CLOUDFLARE_ACCOUNT_ID and ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN must be set together',
  })
  .refine(
    (e) => e.NODE_ENV !== 'production' || e.HARPAPRO_PR_BUILD === '1' || e.EMAIL_OTP_LIVE === '1',
    {
      path: ['EMAIL_OTP_LIVE'],
      message:
        "EMAIL_OTP_LIVE must be '1' on production (else OTP emails would not send). " +
        "Set HARPAPRO_PR_BUILD='1' to allow fake mode on per-PR preview deployments.",
    },
  )
  .superRefine((e, ctx) => {
    const reportDiagnosticTarget = [
      ['ADMIN_REPORT_DIAGNOSTIC_EMAIL', e.ADMIN_REPORT_DIAGNOSTIC_EMAIL],
      ['ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID', e.ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID],
      ['ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER', e.ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER],
    ] as const;
    const configuredReportDiagnosticFields = reportDiagnosticTarget.filter(
      ([, value]) => value !== undefined,
    );

    if (
      configuredReportDiagnosticFields.length > 0 &&
      configuredReportDiagnosticFields.length < reportDiagnosticTarget.length
    ) {
      for (const [path, value] of reportDiagnosticTarget) {
        if (value !== undefined) continue;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: 'all ADMIN_REPORT_DIAGNOSTIC target values must be set together',
        });
      }
    } else if (configuredReportDiagnosticFields.length === reportDiagnosticTarget.length) {
      const testAccountEmails = new Set(
        splitCsv(e.TEST_ACCOUNT_EMAILS ?? '').map((candidate) => candidate.toLowerCase()),
      );
      if (
        !e.ADMIN_REPORT_DIAGNOSTIC_EMAIL ||
        !testAccountEmails.has(e.ADMIN_REPORT_DIAGNOSTIC_EMAIL)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADMIN_REPORT_DIAGNOSTIC_EMAIL'],
          message: 'must be an exact member of TEST_ACCOUNT_EMAILS',
        });
      }
      if (!e.TEST_ACCOUNT_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TEST_ACCOUNT_PASSWORD'],
          message: 'required when the admin report diagnostic target is configured',
        });
      }
    }

    const isProduction = e.NODE_ENV === 'production';
    const isPrPreview = e.HARPAPRO_PR_BUILD === '1';
    const isLiveDeployment = isProduction && !isPrPreview;

    if (
      isProduction &&
      (e.BETTER_AUTH_SECRET === DEV_BETTER_AUTH_SECRET || e.BETTER_AUTH_SECRET.length < 32)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BETTER_AUTH_SECRET'],
        message: 'production requires an explicit secret of at least 32 characters',
      });
    }

    if (isProduction) {
      const expectedAdminOrigin = expectedDeployedAdminOrigin(e.BETTER_AUTH_URL, isPrPreview);
      const adminOrigins = splitCsv(e.ADMIN_CORS_ORIGINS);
      if (expectedAdminOrigin === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BETTER_AUTH_URL'],
          message: isPrPreview
            ? 'PR preview BETTER_AUTH_URL must identify its canonical Fly preview URL'
            : `deployed BETTER_AUTH_URL must be ${PRODUCTION_API_URL} or ${DEVELOPMENT_API_URL}`,
        });
      } else if (adminOrigins.length !== 1 || adminOrigins[0] !== expectedAdminOrigin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADMIN_CORS_ORIGINS'],
          message: `deployed API must trust only its dedicated admin origin: ${expectedAdminOrigin}`,
        });
      }
    }

    if (isLiveDeployment) {
      const requirements = [
        ['AI_FIXTURE_MODE', e.AI_FIXTURE_MODE, 'live'],
        ['AI_LIVE', e.AI_LIVE, '1'],
        ['R2_FIXTURE_MODE', e.R2_FIXTURE_MODE, 'live'],
        ['TURNSTILE_LIVE', e.TURNSTILE_LIVE, '1'],
        ['RESEND_LIVE', e.RESEND_LIVE, '1'],
        ['RATE_LIMIT_BACKEND', e.RATE_LIMIT_BACKEND, 'postgres'],
      ] as const;

      for (const [path, actual, expected] of requirements) {
        if (actual !== expected) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message: `must be '${expected}' on production`,
          });
        }
      }
    }

    if (e.R2_FIXTURE_MODE === 'live') {
      if (!e.R2_ACCOUNT_ID && !e.R2_ENDPOINT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['R2_ACCOUNT_ID'],
          message: 'R2_ACCOUNT_ID or R2_ENDPOINT is required when R2_FIXTURE_MODE=live',
        });
      }
      if (!e.R2_ACCESS_KEY_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['R2_ACCESS_KEY_ID'],
          message: 'required when R2_FIXTURE_MODE=live',
        });
      }
      if (!e.R2_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['R2_SECRET_ACCESS_KEY'],
          message: 'required when R2_FIXTURE_MODE=live',
        });
      }
    }

    if (e.TURNSTILE_LIVE === '1' && !e.TURNSTILE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TURNSTILE_SECRET_KEY'],
        message: 'required when TURNSTILE_LIVE=1',
      });
    }

    if (e.RESEND_LIVE === '1' && !e.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'required when RESEND_LIVE=1',
      });
    }
  });

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;

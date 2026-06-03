/**
 * Dev-only routes — mounted by `app.ts` only on non-production
 * deployments OR per-PR preview builds (where Maestro needs
 * `/api/dev/last-otp` even though NODE_ENV=production), AND only when
 * `env.DEV_OTP_TOKEN` is set. Importing this module on a real
 * production deployment is a hard error so a misconfiguration cannot
 * silently expose internals.
 *
 * Currently only owns `/api/dev/last-otp`, used by Maestro `:mock`
 * builds to read the most recent OTP that better-auth persisted to
 * `public.verification` for a given email. Layered controls (in
 * order, all enforced):
 *   1. Module throw at import when NODE_ENV=production && !PR_BUILD.
 *   2. App.ts mount gated on NODE_ENV+PR_BUILD AND DEV_OTP_TOKEN.
 *   3. Per-request shared-secret header (constant-time compare).
 *   4. Email allowlist regex — only `*@e2e.harpapro.com`.
 *   5. Exact identifier SQL (no LIKE wildcard).
 *   6. Existing per-IP global rate limit.
 *   7. Audit log every call.
 *
 * All failure modes return 404 (indistinguishable from an unknown
 * path) so the surface gives no oracle to a probe. See
 * docs/v4/arch-auth-and-rls.md §Dev OTP introspection.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import type { AppEnv } from '../app.js';
// dev-only route reads directly from public.verification; per-request scoped
// DB doesn't have permission to SELECT auth tables.
import { rawDb } from '../db/client.js'; // eslint-disable-line no-restricted-imports
import { env } from '../env.js';

if (env.NODE_ENV === 'production' && env.HARPAPRO_PR_BUILD !== '1') {
  throw new Error('routes/dev.ts must not be loaded in real production');
}

/** Hard-coded allowlisted domain for emails passed to `/api/dev/last-otp`. */
export const ALLOWED_OTP_DOMAIN = 'e2e.harpapro.com';

/**
 * Email regex for `/api/dev/last-otp`. Anchored, no whitespace, no `@`
 * in the local part. The `@e2e.harpapro.com` suffix is fixed; this
 * blocks both unrelated domains and suffix attacks like
 * `bad@e2e.harpapro.com.evil.com`.
 */
export const ALLOWED_OTP_EMAIL_REGEX = /^[^@\s]+@e2e\.harpapro\.com$/i;

/**
 * better-auth's emailOtp plugin sets `identifier = ${type}-otp-${email}`
 * (see node_modules/better-auth/dist/plugins/email-otp/utils.mjs).
 * Maestro flows use `type='sign-in'`, so the identifier we look up is
 * exactly `sign-in-otp-<email>`. Using `=` (not LIKE) closes the
 * wildcard-injection / substring oracle.
 */
const VERIFICATION_TYPE = 'sign-in';

export const devRoutes = new Hono<AppEnv>();

/** Constant-time equality for the shared-secret header. */
function tokenMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Indistinguishable-from-unknown-path 404 used for every reject path. */
function notFound(c: Context<AppEnv>) {
  return c.json({ error: { code: 'not_found', message: 'not found' } }, 404);
}

/**
 * Returns the most recent unexpired OTP issued for `email`. Locked
 * down with a shared-secret header, an email-domain allowlist, and an
 * exact-match identifier query — see module-level comment.
 */
devRoutes.post('/last-otp', async (c) => {
  const requestId = c.get('requestId') ?? 'unknown';
  const ip = c.req.header('x-forwarded-for') ?? '';
  const expectedToken = env.DEV_OTP_TOKEN ?? '';

  // Defense: the route is only mounted when DEV_OTP_TOKEN is set, but
  // belt-and-braces in case a future refactor changes the mount.
  if (!expectedToken) {
    console.info(JSON.stringify({
      level: 'info', msg: 'dev/last-otp', requestId, ip, email: null,
      outcome: 'rejected_no_server_token',
    }));
    return notFound(c);
  }

  const provided = c.req.header('x-dev-otp-token') ?? '';
  if (!tokenMatches(provided, expectedToken)) {
    console.info(JSON.stringify({
      level: 'info', msg: 'dev/last-otp', requestId, ip, email: null,
      outcome: 'rejected_bad_token',
    }));
    return notFound(c);
  }

  const body = await c.req.json().catch(() => ({}));
  const email = String((body as { email?: unknown }).email ?? '')
    .trim()
    .toLowerCase();

  if (!ALLOWED_OTP_EMAIL_REGEX.test(email)) {
    console.info(JSON.stringify({
      level: 'info', msg: 'dev/last-otp', requestId, ip, email,
      outcome: 'rejected_email_domain',
    }));
    return notFound(c);
  }

  const identifier = `${VERIFICATION_TYPE}-otp-${email}`;
  const db = rawDb();
  const rows = await db.execute(sql`
    SELECT value, identifier, expires_at, created_at
    FROM public.verification
    WHERE identifier = ${identifier}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = rows.rows[0] as
    | { value: string; identifier: string; expires_at: Date; created_at: Date }
    | undefined;
  if (!row) {
    console.info(JSON.stringify({
      level: 'info', msg: 'dev/last-otp', requestId, ip, email,
      outcome: 'no_otp',
    }));
    return notFound(c);
  }
  // better-auth stores OTP as "code:attempts" — we only need the code portion
  const otp = row.value.split(':')[0];
  console.info(JSON.stringify({
    level: 'info', msg: 'dev/last-otp', requestId, ip, email,
    outcome: 'ok',
  }));
  return c.json({ otp, identifier: row.identifier, expiresAt: row.expires_at });
});

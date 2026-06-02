/**
 * Dev-only routes — mounted by `app.ts` only when
 * `env.NODE_ENV !== 'production'`. Importing this module on a
 * production deployment is a hard error so a misconfiguration cannot
 * silently expose internals.
 *
 * Currently only owns `/api/dev/last-otp`, used by Maestro `:mock`
 * builds to read the most recent OTP that better-auth persisted to
 * `public.verification` for a given email. See
 * docs/v4/arch-auth-and-rls.md §Mock builds + Maestro E2E.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../app.js';
// dev-only route reads directly from public.verification; per-request scoped
// DB doesn't have permission to SELECT auth tables.
import { rawDb } from '../db/client.js'; // eslint-disable-line no-restricted-imports
import { env } from '../env.js';

if (env.NODE_ENV === 'production') {
  throw new Error('routes/dev.ts must not be loaded in production');
}

export const devRoutes = new Hono<AppEnv>();

/**
 * Returns the most recent unexpired OTP issued for `email` (the
 * `identifier` column in `public.verification` is set to
 * `email-otp:<email>` by better-auth's emailOTP plugin). The OTP is
 * stored in `value` as a 6-digit numeric string.
 */
devRoutes.post('/last-otp', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String((body as { email?: unknown }).email ?? '')
    .trim()
    .toLowerCase();
  if (!email) {
    return c.json({ error: { code: 'bad_request', message: 'email required' } }, 400);
  }
  const db = rawDb();
  const rows = await db.execute(sql`
    SELECT value, identifier, expires_at, created_at
    FROM public.verification
    WHERE identifier LIKE ${`%${email}%`}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = rows.rows[0] as
    | { value: string; identifier: string; expires_at: Date; created_at: Date }
    | undefined;
  if (!row) {
    return c.json({ error: { code: 'not_found', message: 'no otp issued' } }, 404);
  }
  // better-auth stores OTP as "code:attempts" — we only need the code portion
  const otp = row.value.split(':')[0];
  return c.json({ otp, identifier: row.identifier, expiresAt: row.expires_at });
});

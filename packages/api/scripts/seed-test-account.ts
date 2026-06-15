/**
 * One-shot script to ensure each email in `TEST_ACCOUNT_EMAILS`
 * exists as a better-auth user with `TEST_ACCOUNT_PASSWORD` set.
 *
 * Used by the dev deploy: production has both env vars unset so this
 * script no-ops.
 *
 * Truly bypasses the `disableSignUp` guard by going through
 * better-auth's internal adapter (`internalAdapter.createUser` +
 * `internalAdapter.linkAccount({ providerId: 'credential', password })`)
 * — the same path `auth.api.signUpEmail` takes after its public
 * checks pass. This works deploy-time because we have direct access
 * to `auth.$context`; it cannot be triggered over HTTP because no
 * route exposes the internal adapter. The before-hook in
 * `auth/auth.ts` still gates which emails can ever sign in over HTTP.
 *
 * NOTE: `auth.api.signUpEmail()` does NOT bypass `disableSignUp`
 * (better-auth's sign-up route checks the flag at the very top
 * regardless of whether the call originates over HTTP or in-process).
 * The earlier version of this script claimed to bypass the guard but
 * actually called signUpEmail and crashed on dev for weeks; see
 * docs/bugs/2026-06-06-test-accounts-never-seeded-on-dev.md.
 *
 * See docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md
 * §Test-account smoke-test path.
 */
import { sql } from 'drizzle-orm';
import { auth } from '../src/auth/auth.js';
import { rawDb } from '../src/db/client.js';
import { env } from '../src/env.js';

async function ensureCredentialAccount(
  ctx: Awaited<typeof auth.$context>,
  userId: string,
  passwordHash: string,
): Promise<'created' | 'updated'> {
  const db = rawDb();
  const updated = await db.execute(sql`
    UPDATE public."account"
    SET
      account_id = ${userId},
      password = ${passwordHash},
      updated_at = now()
    WHERE user_id = ${userId}
      AND provider_id = 'credential'
  `);

  if ((updated.rowCount ?? 0) > 0) {
    return 'updated';
  }

  await ctx.internalAdapter.linkAccount({
    userId,
    providerId: 'credential',
    accountId: userId,
    password: passwordHash,
  });
  return 'created';
}

async function main(): Promise<void> {
  if (!env.TEST_ACCOUNT_EMAILS || !env.TEST_ACCOUNT_PASSWORD) {
    console.log('[seed-test-account] no TEST_ACCOUNT_EMAILS configured; skipping');
    return;
  }

  const emails = env.TEST_ACCOUNT_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // `auth.$context` is a Promise<AuthContext> in better-auth >=1.6.
  // Resolve once; same context is reused for every email.
  const ctx = await auth.$context;

  for (const email of emails) {
    try {
      const existing = await ctx.internalAdapter.findUserByEmail(email);
      const passwordHash = await ctx.password.hash(env.TEST_ACCOUNT_PASSWORD);

      if (existing?.user) {
        const action = await ensureCredentialAccount(ctx, existing.user.id, passwordHash);
        console.log(`[seed-test-account] ${email} user exists; credential ${action}`);
        continue;
      }

      const created = await ctx.internalAdapter.createUser({
        email,
        name: email,
        emailVerified: false,
      });
      if (!created) {
        throw new Error('createUser returned no user');
      }
      await ensureCredentialAccount(ctx, created.id, passwordHash);
      console.log(`[seed-test-account] created ${email}; credential created`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[seed-test-account] ${email}: ${msg}`);
      throw err;
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
